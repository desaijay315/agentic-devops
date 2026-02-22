package com.infraflow.dashboard.repository;

import com.infraflow.common.enums.HealingStatus;
import com.infraflow.common.model.HealingSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DashboardHealingSessionRepository extends JpaRepository<HealingSession, Long> {

    List<HealingSession> findTop20ByOrderByCreatedAtDesc();

    long countByStatus(HealingStatus status);

    @Query("SELECT AVG(EXTRACT(EPOCH FROM (h.resolvedAt - h.createdAt))) FROM HealingSession h WHERE h.resolvedAt IS NOT NULL")
    Double findAverageMTTR();
}
