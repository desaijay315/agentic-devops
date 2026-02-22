package com.infraflow.healing.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infraflow.common.dto.HealingPlanResponse;
import com.infraflow.common.dto.HealingRequest;
import com.infraflow.common.enums.*;
import com.infraflow.common.model.FixAuditLog;
import com.infraflow.common.model.HealingSession;
import com.infraflow.common.model.PipelineEvent;
import com.infraflow.healing.classifier.FailureClassifier;
import com.infraflow.healing.port.HealingLLMPort;
import com.infraflow.healing.repository.FixAuditLogRepository;
import com.infraflow.healing.repository.HealingSessionRepository;
import com.infraflow.healing.repository.PipelineEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class HealingService {

    private final FailureClassifier classifier;
    private final HealingLLMPort healingLLM;
    private final PipelineEventRepository eventRepository;
    private final HealingSessionRepository sessionRepository;
    private final FixAuditLogRepository auditLogRepository;
    private final FixExecutorService fixExecutor;
    private final ObjectMapper objectMapper;
    private final KafkaTemplate<String, Map<String, Object>> kafkaTemplate;

    @Value("${infraflow.healing.confidence-threshold:0.75}")
    private double confidenceThreshold;

    @Value("${infraflow.healing.auto-apply:false}")
    private boolean autoApply;

    @Value("${infraflow.kafka.topic.healing-events}")
    private String healingEventsTopic;

    @Transactional
    public void initiateHealing(Map<String, Object> eventData) {
        // 1. Persist the pipeline event
        PipelineEvent pipelineEvent = PipelineEvent.builder()
                .repoUrl((String) eventData.get("repoUrl"))
                .repoName((String) eventData.get("repoName"))
                .branch((String) eventData.get("branch"))
                .commitSha((String) eventData.get("commitSha"))
                .provider((String) eventData.get("provider"))
                .status(PipelineStatus.FAILED)
                .workflowRunId(eventData.get("workflowRunId") != null
                        ? ((Number) eventData.get("workflowRunId")).longValue() : null)
                .workflowName((String) eventData.get("workflowName"))
                .build();
        pipelineEvent = eventRepository.save(pipelineEvent);

        // 2. Classify the failure
        String logs = (String) eventData.getOrDefault("rawLogs", "");
        FailureType failureType = classifier.classify(logs);
        log.info("Classified failure as: {}", failureType);

        // 3. Create healing session
        HealingSession session = HealingSession.builder()
                .pipelineEvent(pipelineEvent)
                .failureType(failureType)
                .status(HealingStatus.ANALYZING)
                .build();
        session = sessionRepository.save(session);
        audit(session, AuditAction.FAILURE_DETECTED, "AI", "Pipeline failure detected");
        audit(session, AuditAction.CLASSIFIED, "AI", "Classified as " + failureType);

        // 4. Call LLM for fix generation
        HealingRequest request = new HealingRequest(
                logs,
                "Java",
                "Maven",
                failureType.name(),
                null, null, "ci",
                null, null, null, null
        );

        HealingPlanResponse plan = healingLLM.generateFix(request);

        // 5. Update session with the fix plan
        try {
            session.setFailureSummary(plan.failureSummary());
            session.setRootCause(plan.rootCause());
            session.setFixExplanation(plan.fixExplanation());
            session.setFixType(FixType.valueOf(plan.fixType()));
            session.setFixPlanJson(objectMapper.writeValueAsString(plan));
            session.setConfidenceScore(plan.confidenceScore());
        } catch (Exception e) {
            log.error("Failed to serialize fix plan", e);
        }

        audit(session, AuditAction.FIX_GENERATED, "AI",
                "Confidence: " + plan.confidenceScore() + " | Type: " + plan.fixType());

        // 6. Decision: auto-apply, require approval, or escalate
        if ("ESCALATE".equals(plan.fixType()) || plan.confidenceScore() < confidenceThreshold) {
            session.setStatus(HealingStatus.ESCALATED);
            audit(session, AuditAction.ESCALATED, "AI",
                    "Confidence " + plan.confidenceScore() + " below threshold " + confidenceThreshold);
            pipelineEvent.setStatus(PipelineStatus.ESCALATED);
        } else if (autoApply) {
            session.setStatus(HealingStatus.APPLYING);
            sessionRepository.save(session);
            applyFix(session, plan);
            return;
        } else {
            session.setStatus(HealingStatus.PENDING_APPROVAL);
        }

        sessionRepository.save(session);
        eventRepository.save(pipelineEvent);
        publishHealingEvent(session, pipelineEvent);
    }

    @Transactional
    public void approveAndApply(Long sessionId) {
        HealingSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found: " + sessionId));

        if (session.getStatus() != HealingStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Session is not pending approval: " + session.getStatus());
        }

        audit(session, AuditAction.FIX_APPROVED, "HUMAN", "Fix approved by user");
        session.setStatus(HealingStatus.APPLYING);
        sessionRepository.save(session);

        try {
            HealingPlanResponse plan = objectMapper.readValue(
                    session.getFixPlanJson(), HealingPlanResponse.class);
            applyFix(session, plan);
        } catch (Exception e) {
            log.error("Failed to apply fix for session {}", sessionId, e);
            session.setStatus(HealingStatus.ESCALATED);
            sessionRepository.save(session);
        }
    }

    @Transactional
    public void reject(Long sessionId) {
        HealingSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found: " + sessionId));
        session.setStatus(HealingStatus.ESCALATED);
        audit(session, AuditAction.FIX_REJECTED, "HUMAN", "Fix rejected by user");
        sessionRepository.save(session);
        publishHealingEvent(session, session.getPipelineEvent());
    }

    private void applyFix(HealingSession session, HealingPlanResponse plan) {
        try {
            String branch = fixExecutor.createBranchAndApplyFix(session, plan);
            session.setFixBranch(branch);
            session.setStatus(HealingStatus.APPLIED);
            audit(session, AuditAction.FIX_COMMITTED, "AI", "Fix committed to branch: " + branch);

            fixExecutor.triggerPipelineRetry(session);
            session.setStatus(HealingStatus.PIPELINE_RETRIED);
            audit(session, AuditAction.PIPELINE_RETRIED, "AI", "Pipeline retry triggered");

            session.getPipelineEvent().setStatus(PipelineStatus.HEALING);
        } catch (Exception e) {
            log.error("Fix execution failed for session {}", session.getId(), e);
            session.setStatus(HealingStatus.ESCALATED);
            audit(session, AuditAction.ESCALATED, "AI", "Fix execution failed: " + e.getMessage());
        }

        sessionRepository.save(session);
        eventRepository.save(session.getPipelineEvent());
        publishHealingEvent(session, session.getPipelineEvent());
    }

    private void audit(HealingSession session, AuditAction action, String actor, String notes) {
        FixAuditLog log = FixAuditLog.builder()
                .healingSession(session)
                .action(action)
                .actor(actor)
                .notes(notes)
                .build();
        auditLogRepository.save(log);
    }

    private void publishHealingEvent(HealingSession session, PipelineEvent event) {
        Map<String, Object> healingEvent = Map.of(
                "sessionId", session.getId(),
                "pipelineEventId", event.getId(),
                "repoName", event.getRepoName() != null ? event.getRepoName() : "",
                "failureType", session.getFailureType().name(),
                "healingStatus", session.getStatus().name(),
                "confidence", session.getConfidenceScore() != null ? session.getConfidenceScore() : 0.0,
                "fixBranch", session.getFixBranch() != null ? session.getFixBranch() : "",
                "summary", session.getFailureSummary() != null ? session.getFailureSummary() : ""
        );
        kafkaTemplate.send(healingEventsTopic, event.getRepoName(), healingEvent);
    }
}
