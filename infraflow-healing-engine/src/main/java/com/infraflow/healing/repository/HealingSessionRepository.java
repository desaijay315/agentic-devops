package com.infraflow.healing.repository;

import com.infraflow.common.enums.HealingStatus;
import com.infraflow.common.model.HealingSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface HealingSessionRepository extends JpaRepository<HealingSession, Long> {

    List<HealingSession> findByStatusOrderByCreatedAtDesc(HealingStatus status);

    List<HealingSession> findTop20ByOrderByCreatedAtDesc();

    @Query("SELECT AVG(EXTRACT(EPOCH FROM (h.resolvedAt - h.createdAt))) FROM HealingSession h WHERE h.resolvedAt IS NOT NULL")
    Double findAverageMTTR();

    @Query("SELECT h.failureType, COUNT(h) FROM HealingSession h GROUP BY h.failureType")
    List<Object[]> countByFailureType();

    long countByStatus(HealingStatus status);
}
