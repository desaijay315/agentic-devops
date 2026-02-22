package com.infraflow.dashboard.repository;

import com.infraflow.common.model.SecurityScanResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SecurityScanRepository extends JpaRepository<SecurityScanResult, Long> {

    List<SecurityScanResult> findByRepoNameOrderByCreatedAtDesc(String repoName);

    List<SecurityScanResult> findByRepoNameAndBranchOrderByCreatedAtDesc(String repoName, String branch);

    List<SecurityScanResult> findByRepoNameAndCommitShaOrderByCreatedAtDesc(String repoName, String commitSha);

    List<SecurityScanResult> findTop100ByOrderByCreatedAtDesc();

    long countByRepoNameAndStatusAndSeverity(String repoName, String status, String severity);

    long countByRepoNameAndStatus(String repoName, String status);

    /**
     * Returns all OPEN findings for a given repo ordered by severity
     * (CRITICAL first) and then by creation date descending.
     */
    @Query("SELECT s FROM SecurityScanResult s " +
           "WHERE s.repoName = :repo AND s.status = 'OPEN' " +
           "ORDER BY CASE s.severity " +
           "  WHEN 'CRITICAL' THEN 1 " +
           "  WHEN 'HIGH'     THEN 2 " +
           "  WHEN 'MEDIUM'   THEN 3 " +
           "  WHEN 'LOW'      THEN 4 " +
           "  ELSE 5 " +
           "END, s.createdAt DESC")
    List<SecurityScanResult> findOpenByRepoOrderedBySeverity(@Param("repo") String repoName);
}
