package com.infraflow.healing.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infraflow.common.dto.HealingPlanResponse;
import com.infraflow.common.dto.HealingRequest;
import com.infraflow.common.enums.*;
import com.infraflow.common.model.FixAuditLog;
import com.infraflow.common.model.HealingSession;
import com.infraflow.common.model.PipelineEvent;
import com.infraflow.healing.classifier.FailureClassifier;
import com.infraflow.healing.knowledge.KnowledgeBaseService;
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
import java.util.Optional;

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
    private final SecurityScannerService securityScannerService;
    private final ObjectMapper objectMapper;
    private final KafkaTemplate<String, Map<String, Object>> kafkaTemplate;
    private final KnowledgeBaseService knowledgeBaseService;

    @Value("${infraflow.healing.confidence-threshold:0.75}")
    private double confidenceThreshold;

    @Value("${infraflow.healing.auto-apply:false}")
    private boolean autoApply;

    @Value("${infraflow.knowledge.enabled:true}")
    private boolean kbEnabled;

    @Value("${infraflow.kafka.topic.healing-events}")
    private String healingEventsTopic;

    @Transactional
    public PipelineEvent persistPipelineEvent(Map<String, Object> eventData) {
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
        return eventRepository.save(pipelineEvent);
    }

    public void initiateHealing(Map<String, Object> eventData) {
        // 1. Persist the pipeline event (separate transaction — always committed)
        PipelineEvent pipelineEvent = persistPipelineEvent(eventData);
        log.info("Persisted pipeline event: id={}, repo={}", pipelineEvent.getId(), pipelineEvent.getRepoName());

        // 2. Run security scan on the raw logs (best-effort – never blocks healing)
        String logs = (String) eventData.getOrDefault("rawLogs", "");
        try {
            securityScannerService.scanPipelineEvent(pipelineEvent, logs);
        } catch (Exception e) {
            log.warn("Security scan failed for event {}: {}", pipelineEvent.getId(), e.getMessage());
        }

        // 3. Classify the failure
        FailureType failureType = classifier.classify(logs);
        log.info("Classified failure as: {}", failureType);

        // 4. Create healing session
        HealingSession session = createHealingSession(pipelineEvent, failureType);

        // 5. Fast path: check Knowledge Base before calling LLM
        if (kbEnabled) {
            Optional<HealingPlanResponse> cached = knowledgeBaseService.findCachedFix(
                    failureType.name(), pipelineEvent.getRepoName(), logs);
            if (cached.isPresent()) {
                HealingPlanResponse plan = cached.get();
                log.info("Knowledge Base HIT — using cached fix for session {}, failureType={}",
                        session.getId(), failureType);
                updateSessionWithPlan(session, plan);
                audit(session, AuditAction.FIX_GENERATED, "KNOWLEDGE_BASE",
                        "Cached fix applied | Confidence: " + plan.confidenceScore());

                if ("ESCALATE".equals(plan.fixType()) || plan.confidenceScore() < confidenceThreshold) {
                    session.setStatus(HealingStatus.ESCALATED);
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
                return;  // Skip LLM call entirely
            }
        }

        // 6. Attempt LLM fix generation
        try {
            HealingRequest request = new HealingRequest(
                    logs,
                    "Java",
                    "Maven",
                    failureType.name(),
                    null, null, "ci",
                    null, null, null, null
            );

            HealingPlanResponse plan = healingLLM.generateFix(request);

            // 7. Update session with the fix plan
            updateSessionWithPlan(session, plan);

            audit(session, AuditAction.FIX_GENERATED, "AI",
                    "Confidence: " + plan.confidenceScore() + " | Type: " + plan.fixType());

            // Store fix in Knowledge Base for future fast-path hits
            if (kbEnabled) {
                try {
                    knowledgeBaseService.storeFix(session, plan, logs);
                } catch (Exception e) {
                    log.warn("Failed to store fix in Knowledge Base: {}", e.getMessage());
                }
            }

            // 8. Decision: auto-apply, require approval, or escalate
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
        } catch (Exception e) {
            log.error("LLM fix generation failed — escalating session {}", session.getId(), e);
            session.setStatus(HealingStatus.ESCALATED);
            session.setFailureSummary("AI analysis failed: " + e.getMessage());
            audit(session, AuditAction.ESCALATED, "AI", "LLM call failed: " + e.getMessage());
            pipelineEvent.setStatus(PipelineStatus.ESCALATED);
        }

        sessionRepository.save(session);
        eventRepository.save(pipelineEvent);
        publishHealingEvent(session, pipelineEvent);
    }

    @Transactional
    public HealingSession createHealingSession(PipelineEvent pipelineEvent, FailureType failureType) {
        HealingSession session = HealingSession.builder()
                .pipelineEvent(pipelineEvent)
                .failureType(failureType)
                .status(HealingStatus.ANALYZING)
                .build();
        session = sessionRepository.save(session);
        audit(session, AuditAction.FAILURE_DETECTED, "AI", "Pipeline failure detected");
        audit(session, AuditAction.CLASSIFIED, "AI", "Classified as " + failureType);
        return session;
    }

    private void updateSessionWithPlan(HealingSession session, HealingPlanResponse plan) {
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
            // Record positive outcome in Knowledge Base
            if (kbEnabled) {
                try { knowledgeBaseService.recordOutcome(sessionId, true); }
                catch (Exception e) { log.warn("KB outcome recording failed: {}", e.getMessage()); }
            }
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
        // Record negative outcome in Knowledge Base
        if (kbEnabled) {
            try { knowledgeBaseService.recordOutcome(sessionId, false); }
            catch (Exception e) { log.warn("KB outcome recording failed: {}", e.getMessage()); }
        }
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

    // ── Re-code / Fix Again ─────────────────────────────

    /**
     * Regenerate a fix: rejects the current session, creates a new one
     * linked via parent_session_id, and re-runs the LLM with feedback context.
     */
    @Transactional
    public HealingSession regenerateFix(Long sessionId, String feedback) {
        HealingSession original = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found: " + sessionId));

        if (original.getStatus() != HealingStatus.PENDING_APPROVAL
                && original.getStatus() != HealingStatus.FIX_GENERATED
                && original.getStatus() != HealingStatus.ESCALATED) {
            throw new IllegalStateException(
                    "Cannot regenerate session in status: " + original.getStatus());
        }

        // Mark original as rejected with feedback
        original.setStatus(HealingStatus.REJECTED);
        original.setUserFeedback(feedback);
        sessionRepository.save(original);
        audit(original, AuditAction.FIX_REJECTED, "HUMAN",
                "Re-code requested" + (feedback != null ? ": " + feedback : ""));

        // Create new session linked to same pipeline event
        HealingSession newSession = HealingSession.builder()
                .pipelineEvent(original.getPipelineEvent())
                .failureType(original.getFailureType())
                .status(HealingStatus.ANALYZING)
                .attemptNumber(original.getAttemptNumber() + 1)
                .parentSession(original)
                .build();
        newSession = sessionRepository.save(newSession);
        audit(newSession, AuditAction.FIX_REGENERATED, "HUMAN",
                "Attempt #" + newSession.getAttemptNumber());

        log.info("Regenerating fix for session {} → new session {} (attempt #{})",
                sessionId, newSession.getId(), newSession.getAttemptNumber());

        // Re-run LLM with feedback context (async-style but synchronous for now)
        try {
            PipelineEvent event = original.getPipelineEvent();
            String logs = event.getRawLogs() != null ? event.getRawLogs() : "";

            HealingRequest request = new HealingRequest(
                    logs, "Java", "Maven",
                    original.getFailureType().name(),
                    null, null, "ci",
                    null, null, null, null
            );

            HealingPlanResponse plan = healingLLM.regenerateFix(
                    request, original.getFixPlanJson(), feedback);

            updateSessionWithPlan(newSession, plan);
            audit(newSession, AuditAction.FIX_GENERATED, "AI",
                    "Re-code confidence: " + plan.confidenceScore());

            if ("ESCALATE".equals(plan.fixType()) || plan.confidenceScore() < confidenceThreshold) {
                newSession.setStatus(HealingStatus.ESCALATED);
            } else {
                newSession.setStatus(HealingStatus.PENDING_APPROVAL);
            }
        } catch (Exception e) {
            log.error("Re-code LLM call failed for session {}", newSession.getId(), e);
            newSession.setStatus(HealingStatus.ESCALATED);
            newSession.setFailureSummary("Re-code failed: " + e.getMessage());
        }

        sessionRepository.save(newSession);
        publishHealingEvent(newSession, newSession.getPipelineEvent());

        return newSession;
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
