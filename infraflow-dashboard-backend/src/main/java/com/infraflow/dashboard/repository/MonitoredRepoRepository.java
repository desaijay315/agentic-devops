package com.infraflow.dashboard.repository;

import com.infraflow.common.model.MonitoredRepo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MonitoredRepoRepository extends JpaRepository<MonitoredRepo, Long> {

    List<MonitoredRepo> findByUserId(Long userId);

    Optional<MonitoredRepo> findByUserIdAndRepoFullName(Long userId, String repoFullName);

    boolean existsByUserIdAndRepoFullName(Long userId, String repoFullName);

    Optional<MonitoredRepo> findByRepoFullName(String repoFullName);

    void deleteByUserIdAndRepoFullName(Long userId, String repoFullName);
}
