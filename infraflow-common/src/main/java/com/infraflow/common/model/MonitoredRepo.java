package com.infraflow.common.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "monitored_repos",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "repo_full_name"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MonitoredRepo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "repo_full_name", nullable = false)
    private String repoFullName;

    @Column(nullable = false)
    private String repoUrl;

    @Builder.Default
    private String defaultBranch = "main";

    @Builder.Default
    private Boolean webhookActive = false;

    @Column(updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }
}
