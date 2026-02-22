package com.infraflow.dashboard.controller;

import com.infraflow.dashboard.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/pipeline-events")
    public List<Map<String, Object>> getRecentPipelineEvents() {
        return dashboardService.getRecentPipelineEvents();
    }

    @GetMapping("/healing-sessions")
    public List<Map<String, Object>> getRecentHealingSessions() {
        return dashboardService.getRecentHealingSessions();
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        return dashboardService.getStats();
    }
}
