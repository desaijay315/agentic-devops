package com.infraflow.healing.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infraflow.common.dto.HealingPlanResponse;
import com.infraflow.common.model.FixAuditLog;
import com.infraflow.common.model.HealingSession;
import com.infraflow.healing.repository.FixAuditLogRepository;
import com.infraflow.healing.repository.HealingSessionRepository;
import com.infraflow.healing.service.HealingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/healing")
@RequiredArgsConstructor
@Slf4j
public class HealingController {

    private final HealingService healingService;
    private final HealingSessionRepository sessionRepository;
    private final FixAuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    @GetMapping("/sessions")
    public List<HealingSession> listSessions() {
        return sessionRepository.findTop20ByOrderByCreatedAtDesc();
    }

    @GetMapping("/sessions/{id}")
    public ResponseEntity<HealingSession> getSession(@PathVariable Long id) {
        return sessionRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Returns the full parsed fix plan with file changes, root cause, etc.
     * This is the core data for the fix preview / diff view page.
     */
    @GetMapping("/sessions/{id}/fix-plan")
    public ResponseEntity<HealingPlanResponse> getFixPlan(@PathVariable Long id) {
        HealingSession session = sessionRepository.findById(id)
                .orElse(null);

        if (session == null) {
            return ResponseEntity.notFound().build();
        }
        if (session.getFixPlanJson() == null || session.getFixPlanJson().isBlank()) {
            return ResponseEntity.noContent().build();
        }

        try {
            HealingPlanResponse plan = objectMapper.readValue(
                    session.getFixPlanJson(), HealingPlanResponse.class);
            return ResponseEntity.ok(plan);
        } catch (Exception e) {
            log.error("Failed to deserialize fix plan for session {}", id, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Returns the audit trail for a healing session — every action
     * from FAILURE_DETECTED through to APPLIED or ESCALATED.
     */
    @GetMapping("/sessions/{id}/audit-log")
    public ResponseEntity<List<Map<String, Object>>> getAuditLog(@PathVariable Long id) {
        if (!sessionRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }

        List<FixAuditLog> logs = auditLogRepository.findByHealingSessionIdOrderByCreatedAtAsc(id);

        List<Map<String, Object>> result = logs.stream().map(a -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", a.getId());
            map.put("action", a.getAction().name());
            map.put("actor", a.getActor());
            map.put("notes", a.getNotes());
            map.put("createdAt", a.getCreatedAt() != null ? a.getCreatedAt().toString() : null);
            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    @PostMapping("/sessions/{id}/approve")
    public ResponseEntity<Map<String, String>> approve(@PathVariable Long id) {
        healingService.approveAndApply(id);
        return ResponseEntity.ok(Map.of("status", "approved", "sessionId", id.toString()));
    }

    @PostMapping("/sessions/{id}/reject")
    public ResponseEntity<Map<String, String>> reject(@PathVariable Long id) {
        healingService.reject(id);
        return ResponseEntity.ok(Map.of("status", "rejected", "sessionId", id.toString()));
    }

    /**
     * Re-code / Fix Again — rejects the current fix and triggers
     * the LLM to generate a new fix with optional developer feedback.
     */
    @PostMapping("/sessions/{id}/regenerate")
    public ResponseEntity<Map<String, Object>> regenerate(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body) {

        String feedback = body != null ? body.get("feedback") : null;

        try {
            HealingSession newSession = healingService.regenerateFix(id, feedback);
            Map<String, Object> response = new HashMap<>();
            response.put("status", "regenerating");
            response.put("newSessionId", newSession.getId());
            response.put("parentSessionId", id);
            response.put("attemptNumber", newSession.getAttemptNumber());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", (Object) e.getMessage()));
        }
    }

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        Double mttr = sessionRepository.findAverageMTTR();
        var failureBreakdown = sessionRepository.countByFailureType();
        return Map.of(
                "averageMTTR", mttr != null ? mttr : 0.0,
                "failureBreakdown", failureBreakdown,
                "totalSessions", sessionRepository.count()
        );
    }
}
