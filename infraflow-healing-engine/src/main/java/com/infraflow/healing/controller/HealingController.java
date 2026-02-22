package com.infraflow.healing.controller;

import com.infraflow.common.model.HealingSession;
import com.infraflow.healing.repository.HealingSessionRepository;
import com.infraflow.healing.service.HealingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/healing")
@RequiredArgsConstructor
public class HealingController {

    private final HealingService healingService;
    private final HealingSessionRepository sessionRepository;

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
