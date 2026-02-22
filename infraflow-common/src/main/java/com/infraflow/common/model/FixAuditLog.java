package com.infraflow.common.model;

import com.infraflow.common.enums.AuditAction;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "fix_audit_log")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FixAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "healing_session_id", nullable = false)
    private HealingSession healingSession;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AuditAction action;

    private String actor; // "AI" or user email

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }
}
