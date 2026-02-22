package com.infraflow.healing.repository;

import com.infraflow.common.model.SecurityScanResult;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Repository used by the healing-engine module to persist security scan
 * findings produced by {@link com.infraflow.healing.service.SecurityScannerService}.
 *
 * <p>Read-heavy queries (for the dashboard) are served from the dashboard
 * module's own {@code SecurityScanRepository} so that each module owns
 * only the query surface it requires.</p>
 */
public interface SecurityScanResultRepository extends JpaRepository<SecurityScanResult, Long> {

    /**
     * Returns all findings for a given pipeline event, ordered by
     * severity priority (handled in application code) and creation time.
     */
    List<SecurityScanResult> findByPipelineEventIdOrderByCreatedAtDesc(Long pipelineEventId);

    /**
     * Checks whether findings have already been saved for a given commit so
     * that re-triggered webhooks do not produce duplicate scan results.
     */
    boolean existsByRepoNameAndCommitSha(String repoName, String commitSha);
}
