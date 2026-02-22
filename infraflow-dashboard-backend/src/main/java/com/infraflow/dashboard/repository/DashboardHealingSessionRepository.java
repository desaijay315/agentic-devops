package com.infraflow.dashboard.repository;

import com.infraflow.common.enums.HealingStatus;
import com.infraflow.common.model.HealingSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DashboardHealingSessionRepository extends JpaRepository<HealingSession, Long> {

    List<HealingSession> findTop20ByOrderByCreatedAtDesc();

    @Query("SELECT s FROM HealingSession s JOIN s.pipelineEvent e WHERE e.repoName = ?1 ORDER BY s.createdAt DESC")
    List<HealingSession> findByRepoName(String repoName);

    long countByStatus(HealingStatus status);

    @Query(value = "SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FROM healing_sessions WHERE resolved_at IS NOT NULL", nativeQuery = true)
    Double findAverageMTTR();
}
