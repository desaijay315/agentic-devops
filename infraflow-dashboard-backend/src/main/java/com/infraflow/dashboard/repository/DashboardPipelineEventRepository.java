package com.infraflow.dashboard.repository;

import com.infraflow.common.enums.PipelineStatus;
import com.infraflow.common.model.PipelineEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DashboardPipelineEventRepository extends JpaRepository<PipelineEvent, Long> {

    List<PipelineEvent> findTop20ByOrderByCreatedAtDesc();

    long countByStatus(PipelineStatus status);
}
