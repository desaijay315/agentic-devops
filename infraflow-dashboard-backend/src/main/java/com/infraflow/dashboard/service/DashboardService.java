package com.infraflow.dashboard.service;

import com.infraflow.common.enums.HealingStatus;
import com.infraflow.common.enums.PipelineStatus;
import com.infraflow.common.model.HealingSession;
import com.infraflow.common.model.PipelineEvent;
import com.infraflow.dashboard.repository.DashboardHealingSessionRepository;
import com.infraflow.dashboard.repository.DashboardPipelineEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final DashboardPipelineEventRepository eventRepository;
    private final DashboardHealingSessionRepository sessionRepository;

    public List<Map<String, Object>> getRecentPipelineEvents() {
        return eventRepository.findTop20ByOrderByCreatedAtDesc().stream()
                .map(this::toEventMap)
                .collect(Collectors.toList());
    }

    public List<Map<String, Object>> getRecentHealingSessions() {
        return sessionRepository.findTop20ByOrderByCreatedAtDesc().stream()
                .map(this::toSessionMap)
                .collect(Collectors.toList());
    }

    public Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalPipelines", eventRepository.count());
        stats.put("failedPipelines", eventRepository.countByStatus(PipelineStatus.FAILED));
        stats.put("healedPipelines", eventRepository.countByStatus(PipelineStatus.HEALED));
        stats.put("totalHealingSessions", sessionRepository.count());
        stats.put("pendingApproval", sessionRepository.countByStatus(HealingStatus.PENDING_APPROVAL));
        stats.put("successfulHeals", sessionRepository.countByStatus(HealingStatus.PIPELINE_PASSED));

        Double mttr = sessionRepository.findAverageMTTR();
        stats.put("averageMTTR", mttr != null ? mttr : 0.0);

        return stats;
    }

    private Map<String, Object> toEventMap(PipelineEvent e) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", e.getId());
        map.put("repoName", e.getRepoName());
        map.put("branch", e.getBranch());
        map.put("commitSha", e.getCommitSha());
        map.put("status", e.getStatus().name());
        map.put("failureType", e.getFailureType() != null ? e.getFailureType().name() : null);
        map.put("workflowName", e.getWorkflowName());
        map.put("createdAt", e.getCreatedAt() != null ? e.getCreatedAt().toString() : null);
        return map;
    }

    private Map<String, Object> toSessionMap(HealingSession s) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", s.getId());
        map.put("failureType", s.getFailureType().name());
        map.put("status", s.getStatus().name());
        map.put("failureSummary", s.getFailureSummary());
        map.put("fixExplanation", s.getFixExplanation());
        map.put("confidenceScore", s.getConfidenceScore());
        map.put("fixBranch", s.getFixBranch());
        map.put("createdAt", s.getCreatedAt() != null ? s.getCreatedAt().toString() : null);
        map.put("resolvedAt", s.getResolvedAt() != null ? s.getResolvedAt().toString() : null);
        if (s.getPipelineEvent() != null) {
            map.put("repoName", s.getPipelineEvent().getRepoName());
        }
        return map;
    }
}
