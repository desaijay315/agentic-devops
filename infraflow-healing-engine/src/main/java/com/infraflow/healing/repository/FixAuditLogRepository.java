package com.infraflow.healing.repository;

import com.infraflow.common.model.FixAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FixAuditLogRepository extends JpaRepository<FixAuditLog, Long> {

    List<FixAuditLog> findByHealingSessionIdOrderByCreatedAtAsc(Long healingSessionId);
}
