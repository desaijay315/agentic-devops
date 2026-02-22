package com.infraflow.healing.repository;

import com.infraflow.common.enums.PipelineStatus;
import com.infraflow.common.model.PipelineEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PipelineEventRepository extends JpaRepository<PipelineEvent, Long> {

    Optional<PipelineEvent> findByWorkflowRunId(Long workflowRunId);

    List<PipelineEvent> findByRepoNameAndStatusOrderByCreatedAtDesc(String repoName, PipelineStatus status);

    List<PipelineEvent> findTop20ByOrderByCreatedAtDesc();
}
