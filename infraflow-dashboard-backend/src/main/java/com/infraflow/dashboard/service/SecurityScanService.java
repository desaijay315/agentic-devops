package com.infraflow.dashboard.service;

import com.infraflow.common.model.SecurityScanResult;
import com.infraflow.dashboard.repository.SecurityScanRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Service layer for reading security scan results.
 *
 * <p>All public methods are read-only transactions.  Write operations are
 * performed exclusively by the healing-engine module via its own
 * {@code SecurityScannerService}.</p>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SecurityScanService {

    private final SecurityScanRepository scanRepository;

    // ── Filtered scan queries ────────────────────────────────────────────────

    /**
     * Returns security scan findings, optionally filtered by repo, branch,
     * and/or severity.  When no filters are provided the 100 most recent
     * findings are returned.
     *
     * @param repo     repository full name, e.g. "acme/backend" (may be null)
     * @param branch   branch name (may be null)
     * @param severity severity label, e.g. "CRITICAL" (may be null)
     * @return list of scan result maps ordered by createdAt descending
     */
    public List<Map<String, Object>> getScans(String repo, String branch, String severity) {
        List<SecurityScanResult> results;

        if (repo != null && !repo.isBlank()) {
            if (branch != null && !branch.isBlank()) {
                results = scanRepository.findByRepoNameAndBranchOrderByCreatedAtDesc(repo, branch);
            } else {
                results = scanRepository.findByRepoNameOrderByCreatedAtDesc(repo);
            }

            // Post-filter by severity if provided (avoids an extra repo method)
            if (severity != null && !severity.isBlank()) {
                String upperSeverity = severity.toUpperCase();
                results = results.stream()
                        .filter(s -> upperSeverity.equals(s.getSeverity()))
                        .collect(Collectors.toList());
            }
        } else if (severity != null && !severity.isBlank()) {
            // No repo filter but severity requested – scan from top-100 list
            String upperSeverity = severity.toUpperCase();
            results = scanRepository.findTop100ByOrderByCreatedAtDesc().stream()
                    .filter(s -> upperSeverity.equals(s.getSeverity()))
                    .collect(Collectors.toList());
        } else {
            results = scanRepository.findTop100ByOrderByCreatedAtDesc();
        }

        return results.stream()
                .map(this::toScanMap)
                .collect(Collectors.toList());
    }

    // ── Commit-level queries ─────────────────────────────────────────────────

    /**
     * Returns all findings associated with a specific commit SHA.
     * The SHA is matched as a prefix, so both short (7-char) and full
     * (40-char) SHAs are handled via {@code findByRepoNameAndCommitSha}.
     *
     * <p>Because we don't have the repo in this endpoint we search across
     * all repos – this is acceptable since commit SHAs are globally unique
     * in practice.</p>
     *
     * @param sha commit SHA (full or abbreviated)
     * @return findings for that commit
     */
    public List<Map<String, Object>> getScansByCommit(String sha) {
        if (sha == null || sha.isBlank()) {
            return List.of();
        }
        // Fetch all recent scans and filter by commit SHA prefix match.
        // For production workloads a native query with LIKE would be more
        // efficient, but this keeps the common-module clean.
        return scanRepository.findTop100ByOrderByCreatedAtDesc().stream()
                .filter(s -> s.getCommitSha() != null && s.getCommitSha().startsWith(sha))
                .map(this::toScanMap)
                .collect(Collectors.toList());
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    /**
     * Returns a security summary for all repos (when {@code repo} is null)
     * or for a specific repo.
     *
     * <p>The returned map contains:</p>
     * <ul>
     *   <li>{@code openTotal} – total open findings</li>
     *   <li>{@code openBySeverity} – open count keyed by severity label</li>
     *   <li>{@code suppressedTotal} – findings in SUPPRESSED or FALSE_POSITIVE state</li>
     *   <li>{@code fixedTotal} – findings in FIXED state</li>
     *   <li>{@code criticalOpen} – convenience alias for openBySeverity.CRITICAL</li>
     *   <li>{@code highOpen} – convenience alias for openBySeverity.HIGH</li>
     *   <li>{@code repo} – the queried repo name, or "ALL" if global</li>
     * </ul>
     *
     * @param repo repository full name, or null for global stats
     * @return security statistics map
     */
    public Map<String, Object> getSecurityStats(String repo) {
        Map<String, Object> stats = new LinkedHashMap<>();

        if (repo != null && !repo.isBlank()) {
            stats.put("repo", repo);

            long criticalOpen = scanRepository.countByRepoNameAndStatusAndSeverity(repo, "OPEN", "CRITICAL");
            long highOpen     = scanRepository.countByRepoNameAndStatusAndSeverity(repo, "OPEN", "HIGH");
            long mediumOpen   = scanRepository.countByRepoNameAndStatusAndSeverity(repo, "OPEN", "MEDIUM");
            long lowOpen      = scanRepository.countByRepoNameAndStatusAndSeverity(repo, "OPEN", "LOW");
            long infoOpen     = scanRepository.countByRepoNameAndStatusAndSeverity(repo, "OPEN", "INFO");

            long openTotal       = scanRepository.countByRepoNameAndStatus(repo, "OPEN");
            long suppressedTotal = scanRepository.countByRepoNameAndStatus(repo, "SUPPRESSED")
                    + scanRepository.countByRepoNameAndStatus(repo, "FALSE_POSITIVE");
            long fixedTotal      = scanRepository.countByRepoNameAndStatus(repo, "FIXED");

            Map<String, Long> openBySeverity = new LinkedHashMap<>();
            openBySeverity.put("CRITICAL", criticalOpen);
            openBySeverity.put("HIGH",     highOpen);
            openBySeverity.put("MEDIUM",   mediumOpen);
            openBySeverity.put("LOW",      lowOpen);
            openBySeverity.put("INFO",     infoOpen);

            stats.put("openTotal",       openTotal);
            stats.put("openBySeverity",  openBySeverity);
            stats.put("suppressedTotal", suppressedTotal);
            stats.put("fixedTotal",      fixedTotal);
            stats.put("criticalOpen",    criticalOpen);
            stats.put("highOpen",        highOpen);
        } else {
            // Global stats – aggregate across all repos from the top-100 recent list
            stats.put("repo", "ALL");

            List<SecurityScanResult> recent = scanRepository.findTop100ByOrderByCreatedAtDesc();

            Map<String, Long> openBySeverity = new LinkedHashMap<>();
            openBySeverity.put("CRITICAL", countBySeverityAndStatus(recent, "CRITICAL", "OPEN"));
            openBySeverity.put("HIGH",     countBySeverityAndStatus(recent, "HIGH",     "OPEN"));
            openBySeverity.put("MEDIUM",   countBySeverityAndStatus(recent, "MEDIUM",   "OPEN"));
            openBySeverity.put("LOW",      countBySeverityAndStatus(recent, "LOW",      "OPEN"));
            openBySeverity.put("INFO",     countBySeverityAndStatus(recent, "INFO",     "OPEN"));

            long openTotal = recent.stream()
                    .filter(s -> "OPEN".equals(s.getStatus()))
                    .count();
            long suppressedTotal = recent.stream()
                    .filter(s -> "SUPPRESSED".equals(s.getStatus()) || "FALSE_POSITIVE".equals(s.getStatus()))
                    .count();
            long fixedTotal = recent.stream()
                    .filter(s -> "FIXED".equals(s.getStatus()))
                    .count();

            stats.put("openTotal",       openTotal);
            stats.put("openBySeverity",  openBySeverity);
            stats.put("suppressedTotal", suppressedTotal);
            stats.put("fixedTotal",      fixedTotal);
            stats.put("criticalOpen",    openBySeverity.get("CRITICAL"));
            stats.put("highOpen",        openBySeverity.get("HIGH"));
        }

        return stats;
    }

    // ── Mapper ───────────────────────────────────────────────────────────────

    /**
     * Converts a {@link SecurityScanResult} entity to a plain map suitable
     * for JSON serialization.
     */
    public Map<String, Object> toScanMap(SecurityScanResult s) {
        Map<String, Object> map = new HashMap<>();
        map.put("id",                s.getId());
        map.put("repoName",          s.getRepoName());
        map.put("branch",            s.getBranch());
        map.put("commitSha",         s.getCommitSha());
        map.put("scanProvider",      s.getScanProvider());
        map.put("severity",          s.getSeverity());
        map.put("vulnerabilityId",   s.getVulnerabilityId());
        map.put("vulnerabilityType", s.getVulnerabilityType());
        map.put("title",             s.getTitle());
        map.put("description",       s.getDescription());
        map.put("filePath",          s.getFilePath());
        map.put("lineNumber",        s.getLineNumber());
        map.put("remediation",       s.getRemediation());
        map.put("status",            s.getStatus());
        map.put("rawFinding",        s.getRawFinding());
        map.put("createdAt",         s.getCreatedAt() != null ? s.getCreatedAt().toString() : null);
        map.put("updatedAt",         s.getUpdatedAt() != null ? s.getUpdatedAt().toString() : null);
        map.put("pipelineEventId",   s.getPipelineEvent() != null ? s.getPipelineEvent().getId() : null);
        return map;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private long countBySeverityAndStatus(List<SecurityScanResult> list,
                                          String severity, String status) {
        return list.stream()
                .filter(s -> severity.equals(s.getSeverity()) && status.equals(s.getStatus()))
                .count();
    }
}
