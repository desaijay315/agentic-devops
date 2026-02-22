package com.infraflow.dashboard.repository;

import com.infraflow.common.enums.PipelineStatus;
import com.infraflow.common.model.PipelineEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DashboardPipelineEventRepository extends JpaRepository<PipelineEvent, Long> {

    List<PipelineEvent> findTop20ByOrderByCreatedAtDesc();

    List<PipelineEvent> findTop50ByRepoNameOrderByCreatedAtDesc(String repoName);

    List<PipelineEvent> findTop50ByRepoNameAndBranchOrderByCreatedAtDesc(String repoName, String branch);

    long countByStatus(PipelineStatus status);

    long countByRepoName(String repoName);

    long countByRepoNameAndStatus(String repoName, PipelineStatus status);

    @Query("SELECT DISTINCT e.branch FROM PipelineEvent e WHERE e.repoName = ?1 AND e.branch IS NOT NULL ORDER BY e.branch")
    List<String> findDistinctBranchesByRepoName(String repoName);
}
