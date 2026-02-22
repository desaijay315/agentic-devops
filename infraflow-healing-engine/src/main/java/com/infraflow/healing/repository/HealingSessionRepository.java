package com.infraflow.healing.repository;

import com.infraflow.common.enums.HealingStatus;
import com.infraflow.common.model.HealingSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface HealingSessionRepository extends JpaRepository<HealingSession, Long> {

    List<HealingSession> findByStatusOrderByCreatedAtDesc(HealingStatus status);

    List<HealingSession> findTop20ByOrderByCreatedAtDesc();

    @Query(value = "SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FROM healing_sessions WHERE resolved_at IS NOT NULL", nativeQuery = true)
    Double findAverageMTTR();

    @Query("SELECT h.failureType, COUNT(h) FROM HealingSession h GROUP BY h.failureType")
    List<Object[]> countByFailureType();

    long countByStatus(HealingStatus status);
}
