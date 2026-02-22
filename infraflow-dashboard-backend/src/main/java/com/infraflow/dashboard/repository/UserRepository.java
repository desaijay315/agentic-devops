package com.infraflow.dashboard.repository;

import com.infraflow.common.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByGithubId(Long githubId);

    Optional<User> findByGithubLogin(String githubLogin);
}
