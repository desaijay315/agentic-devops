package com.infraflow.common.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * JPA entity representing a single security vulnerability finding produced
 * by the InfraFlow security scanner.  Severity and status are stored as
 * plain strings so that this common-module class remains dependency-free
 * with respect to module-specific enums.
 *
 * <p>Valid severity values: CRITICAL, HIGH, MEDIUM, LOW, INFO</p>
 * <p>Valid status values:   OPEN, SUPPRESSED, FIXED, FALSE_POSITIVE</p>
 */
@Entity
@Table(name = "security_scan_results")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SecurityScanResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The pipeline event that triggered this scan (nullable – the finding
     * survives even if the pipeline event is later deleted).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pipeline_event_id")
    private PipelineEvent pipelineEvent;

    /**
     * Short repository identifier, e.g. "acme/backend".  Always present.
     */
    @Column(nullable = false)
    private String repoName;

    /** Git branch that was scanned, e.g. "main". */
    private String branch;

    /** Full or abbreviated commit SHA that was scanned. */
    @Column(length = 64)
    private String commitSha;

    /**
     * Name of the scanning provider / engine.
     * Defaults to "INFRAFLOW" for the built-in pattern-matching scanner.
     */
    @Column(nullable = false)
    @Builder.Default
    private String scanProvider = "INFRAFLOW";

    /**
     * Severity of the finding: CRITICAL | HIGH | MEDIUM | LOW | INFO.
     * Stored as a VARCHAR so that consumers can add new levels without a
     * schema migration.
     */
    @Column(nullable = false, length = 20)
    private String severity;

    /**
     * Canonical vulnerability identifier, e.g. "CVE-2021-44228".
     * Null for pattern-match findings that have no CVE assignment.
     */
    @Column(length = 100)
    private String vulnerabilityId;

    /**
     * Broad category of the finding, e.g. "HARDCODED_CREDENTIAL",
     * "SQL_INJECTION", "WEAK_CRYPTO".
     */
    @Column(length = 100)
    private String vulnerabilityType;

    /**
     * Human-readable title of the finding.  Required.
     */
    @Column(nullable = false, length = 500)
    private String title;

    /** Longer description of the vulnerability and its impact. */
    @Column(columnDefinition = "TEXT")
    private String description;

    /** Relative path of the affected file within the repository. */
    @Column(length = 500)
    private String filePath;

    /** Approximate line number of the affected code (best-effort). */
    private Integer lineNumber;

    /** Recommended remediation steps for developers. */
    @Column(columnDefinition = "TEXT")
    private String remediation;

    /**
     * Lifecycle status of the finding.
     * Defaults to "OPEN"; can be transitioned to SUPPRESSED, FIXED,
     * or FALSE_POSITIVE by a human reviewer.
     */
    @Column(nullable = false)
    @Builder.Default
    private String status = "OPEN";

    /**
     * Raw scanner output or matched snippet for audit purposes.
     */
    @Column(columnDefinition = "TEXT")
    private String rawFinding;

    @Column(updatable = false, nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
