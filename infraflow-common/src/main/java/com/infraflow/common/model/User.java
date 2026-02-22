package com.infraflow.common.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "users")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private Long githubId;

    @Column(nullable = false, unique = true)
    private String githubLogin;

    private String displayName;

    private String avatarUrl;

    private String accessToken;

    private String email;

    private String company;

    // ── Plan / billing ──────────────────────────────────────────────────────────

    /** FREE or PRO */
    @Column(nullable = false)
    @Builder.Default
    private String planType = "FREE";

    /** Number of heals triggered in the current billing month */
    @Column(nullable = false)
    @Builder.Default
    private Integer healCountMonth = 0;

    /** Monthly heal ceiling (10 for FREE, Integer.MAX_VALUE for PRO stored as -1) */
    @Column(nullable = false)
    @Builder.Default
    private Integer healLimitMonth = 10;

    /** When the monthly counter next resets (first day of next month) */
    private Instant planResetAt;

    /** When the user upgraded to PRO */
    private Instant upgradedAt;

    // ── Timestamps ──────────────────────────────────────────────────────────────

    @Column(updatable = false)
    private Instant createdAt;

    private Instant lastLoginAt;

    @PrePersist
    void onCreate() {
        this.createdAt  = Instant.now();
        if (this.planResetAt == null) {
            this.planResetAt = nextMonthStart();
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    public boolean isProPlan() {
        return "PRO".equalsIgnoreCase(planType);
    }

    /** Returns true if the user has heals remaining this month (or is PRO). */
    public boolean hasHealsRemaining() {
        if (isProPlan()) return true;
        resetCounterIfNeeded();
        return healCountMonth < healLimitMonth;
    }

    public int healsRemaining() {
        if (isProPlan()) return Integer.MAX_VALUE;
        resetCounterIfNeeded();
        return Math.max(0, healLimitMonth - healCountMonth);
    }

    /** Increments counter; returns false if limit already reached. */
    public boolean consumeHeal() {
        if (isProPlan()) return true;
        resetCounterIfNeeded();
        if (healCountMonth >= healLimitMonth) return false;
        this.healCountMonth++;
        return true;
    }

    /** Reset the monthly counter if the reset date has passed. */
    public void resetCounterIfNeeded() {
        if (planResetAt != null && Instant.now().isAfter(planResetAt)) {
            this.healCountMonth = 0;
            this.planResetAt    = nextMonthStart();
        }
    }

    private static Instant nextMonthStart() {
        java.time.ZonedDateTime now = java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC);
        return now.withDayOfMonth(1)
                  .withHour(0).withMinute(0).withSecond(0).withNano(0)
                  .plusMonths(1)
                  .toInstant();
    }
}
