package com.infraflow.common.model;

import com.infraflow.common.enums.FailureType;
import com.infraflow.common.enums.PipelineStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "pipeline_events")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PipelineEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String repoUrl;

    private String repoName;

    private String branch;

    private String commitSha;

    @Column(nullable = false)
    private String provider; // GITHUB, GITLAB, etc.

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PipelineStatus status;

    @Enumerated(EnumType.STRING)
    private FailureType failureType;

    @Column(columnDefinition = "TEXT")
    private String rawLogs;

    private Long workflowRunId;

    private String workflowName;

    private Instant triggeredAt;

    private Instant completedAt;

    @Column(updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }
}
