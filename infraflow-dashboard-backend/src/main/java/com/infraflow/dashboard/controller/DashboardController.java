package com.infraflow.dashboard.controller;

import com.infraflow.dashboard.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/pipeline-events")
    public List<Map<String, Object>> getRecentPipelineEvents(
            @RequestParam(required = false) String repo,
            @RequestParam(required = false) String branch) {
        if (repo != null && !repo.isBlank()) {
            return dashboardService.getPipelineEventsByRepo(repo, branch);
        }
        return dashboardService.getRecentPipelineEvents();
    }

    @GetMapping("/healing-sessions")
    public List<Map<String, Object>> getRecentHealingSessions(
            @RequestParam(required = false) String repo) {
        if (repo != null && !repo.isBlank()) {
            return dashboardService.getHealingSessionsByRepo(repo);
        }
        return dashboardService.getRecentHealingSessions();
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats(
            @RequestParam(required = false) String repo) {
        if (repo != null && !repo.isBlank()) {
            return dashboardService.getStatsByRepo(repo);
        }
        return dashboardService.getStats();
    }

    @GetMapping("/repos/{owner}/{repo}/branches")
    public List<String> getBranches(@PathVariable String owner, @PathVariable String repo) {
        return dashboardService.getBranches(owner + "/" + repo);
    }
}
