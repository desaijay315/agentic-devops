package com.infraflow.dashboard.controller;

import com.infraflow.dashboard.service.SecurityScanService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller exposing security scan findings and statistics.
 *
 * <p>All endpoints are read-only.  Security findings are written exclusively
 * by the healing-engine module during pipeline event processing.</p>
 *
 * <p>Base path: {@code /api/security}</p>
 */
@RestController
@RequestMapping("/api/security")
@RequiredArgsConstructor
public class SecurityScanController {

    private final SecurityScanService securityScanService;

    /**
     * Returns recent security scan findings.
     *
     * <p>Query parameters (all optional):</p>
     * <ul>
     *   <li>{@code repo}     – filter by repository full name, e.g. {@code acme/backend}</li>
     *   <li>{@code branch}   – filter by branch; only effective when {@code repo} is also set</li>
     *   <li>{@code severity} – filter by severity label: CRITICAL, HIGH, MEDIUM, LOW, INFO</li>
     * </ul>
     *
     * <p>When no filters are provided the 100 most recent findings are returned.</p>
     *
     * <pre>GET /api/security/scans
     * GET /api/security/scans?repo=acme/backend
     * GET /api/security/scans?repo=acme/backend&amp;branch=main
     * GET /api/security/scans?repo=acme/backend&amp;severity=CRITICAL</pre>
     *
     * @param repo     optional repository filter
     * @param branch   optional branch filter (used only with {@code repo})
     * @param severity optional severity filter
     * @return list of scan result maps
     */
    @GetMapping("/scans")
    public List<Map<String, Object>> getScans(
            @RequestParam(required = false) String repo,
            @RequestParam(required = false) String branch,
            @RequestParam(required = false) String severity) {
        return securityScanService.getScans(repo, branch, severity);
    }

    /**
     * Returns all security scan findings for a specific commit.
     *
     * <pre>GET /api/security/scans/commit/{sha}</pre>
     *
     * <p>The SHA may be a full 40-character hash or an abbreviated prefix.</p>
     *
     * @param sha commit SHA or prefix
     * @return list of scan result maps for that commit
     */
    @GetMapping("/scans/commit/{sha}")
    public List<Map<String, Object>> getScansByCommit(@PathVariable String sha) {
        return securityScanService.getScansByCommit(sha);
    }

    /**
     * Returns security scan findings for a specific repository identified by
     * owner and repo path variables, matching the GitHub naming convention.
     *
     * <pre>GET /api/security/scans/repo/{owner}/{repo}</pre>
     *
     * <p>This endpoint is equivalent to {@code GET /api/security/scans?repo=owner/repo}
     * and is provided for REST-style URL consistency.</p>
     *
     * @param owner repository owner / organisation
     * @param repo  repository name
     * @return list of scan result maps ordered by severity and then by createdAt descending
     */
    @GetMapping("/scans/repo/{owner}/{repo}")
    public List<Map<String, Object>> getScansByRepo(
            @PathVariable String owner,
            @PathVariable String repo) {
        String repoFullName = owner + "/" + repo;
        return securityScanService.getScans(repoFullName, null, null);
    }

    /**
     * Returns aggregated security statistics.
     *
     * <p>Query parameters (all optional):</p>
     * <ul>
     *   <li>{@code repo} – scope statistics to a specific repository;
     *       when omitted, global statistics across all recent findings are returned.</li>
     * </ul>
     *
     * <p>Response shape:</p>
     * <pre>
     * {
     *   "repo":            "acme/backend" | "ALL",
     *   "openTotal":       12,
     *   "openBySeverity":  { "CRITICAL": 2, "HIGH": 4, "MEDIUM": 5, "LOW": 1, "INFO": 0 },
     *   "suppressedTotal": 3,
     *   "fixedTotal":      7,
     *   "criticalOpen":    2,
     *   "highOpen":        4
     * }
     * </pre>
     *
     * <pre>GET /api/security/stats
     * GET /api/security/stats?repo=acme/backend</pre>
     *
     * @param repo optional repository filter
     * @return security statistics map
     */
    @GetMapping("/stats")
    public Map<String, Object> getSecurityStats(
            @RequestParam(required = false) String repo) {
        return securityScanService.getSecurityStats(repo);
    }
}
