package com.infraflow.common.model;

import com.infraflow.common.enums.FailureType;
import com.infraflow.common.enums.FixType;
import com.infraflow.common.enums.HealingStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "healing_sessions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class HealingSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pipeline_event_id", nullable = false)
    private PipelineEvent pipelineEvent;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FailureType failureType;

    @Column(columnDefinition = "TEXT")
    private String failureSummary;

    @Column(columnDefinition = "TEXT")
    private String rootCause;

    @Enumerated(EnumType.STRING)
    private FixType fixType;

    @Column(columnDefinition = "TEXT")
    private String fixPlanJson;

    @Column(columnDefinition = "TEXT")
    private String fixExplanation;

    private Double confidenceScore;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private HealingStatus status;

    private String fixBranch;

    private String fixCommitSha;

    @Builder.Default
    private Integer attemptNumber = 1;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_session_id")
    private HealingSession parentSession;

    @Column(columnDefinition = "TEXT")
    private String userFeedback;

    private Instant createdAt;

    private Instant resolvedAt;

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }
}
