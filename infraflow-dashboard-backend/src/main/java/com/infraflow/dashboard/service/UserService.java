package com.infraflow.dashboard.service;

import com.infraflow.common.model.User;
import com.infraflow.dashboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {

    private final UserRepository userRepository;

    /**
     * Find or create a user from GitHub OAuth2 header data.
     * Also resets monthly counter if the reset date has passed.
     */
    @Transactional
    public User findOrCreateUser(String githubLogin, String githubIdStr,
                                  String avatarUrl, String displayName) {
        Long githubId = parseGithubId(githubIdStr);

        return userRepository.findByGithubLogin(githubLogin)
                .map(existing -> {
                    existing.setLastLoginAt(Instant.now());
                    if (avatarUrl  != null && !avatarUrl.isBlank())  existing.setAvatarUrl(avatarUrl);
                    if (displayName != null && !displayName.isBlank()) existing.setDisplayName(displayName);
                    existing.resetCounterIfNeeded();
                    return userRepository.save(existing);
                })
                .orElseGet(() -> {
                    log.info("Creating new user: {} (GitHub ID: {})", githubLogin, githubId);
                    User user = User.builder()
                            .githubId(githubId)
                            .githubLogin(githubLogin)
                            .displayName(displayName != null ? displayName : githubLogin)
                            .avatarUrl(avatarUrl)
                            .planType("FREE")
                            .healCountMonth(0)
                            .healLimitMonth(10)
                            .lastLoginAt(Instant.now())
                            .build();
                    return userRepository.save(user);
                });
    }

    public User findByLogin(String githubLogin) {
        return userRepository.findByGithubLogin(githubLogin)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + githubLogin));
    }

    /**
     * Returns plan info map for /api/user/plan endpoint.
     */
    @Transactional
    public Map<String, Object> getPlanInfo(String githubLogin) {
        User user = findByLogin(githubLogin);
        user.resetCounterIfNeeded();
        userRepository.save(user);

        return Map.of(
            "planType",          user.getPlanType(),
            "healCountMonth",    user.getHealCountMonth(),
            "healLimitMonth",    user.isProPlan() ? -1 : user.getHealLimitMonth(),
            "healsRemaining",    user.isProPlan() ? 999999 : user.healsRemaining(),
            "hasHealsRemaining", user.hasHealsRemaining(),
            "planResetAt",       user.getPlanResetAt() != null ? user.getPlanResetAt().toString() : ""
        );
    }

    /**
     * Consume one heal quota unit. Called from HealingService after creating a session.
     * Returns false if the user has exhausted their free quota.
     */
    @Transactional
    public boolean consumeHeal(String githubLogin) {
        return userRepository.findByGithubLogin(githubLogin)
                .map(user -> {
                    user.resetCounterIfNeeded();
                    boolean ok = user.consumeHeal();
                    userRepository.save(user);
                    if (!ok) log.warn("User {} exceeded free heal limit", githubLogin);
                    return ok;
                })
                .orElse(true); // unknown user → allow (fail open)
    }

    /**
     * Upgrade user to PRO plan.
     */
    @Transactional
    public User upgradeToPro(String githubLogin) {
        User user = findByLogin(githubLogin);
        user.setPlanType("PRO");
        user.setHealLimitMonth(Integer.MAX_VALUE);
        user.setUpgradedAt(Instant.now());
        log.info("User {} upgraded to PRO", githubLogin);
        return userRepository.save(user);
    }

    /**
     * Update the user's GitHub access token (called when gateway forwards a fresh token).
     */
    @Transactional
    public void updateAccessToken(String githubLogin, String accessToken) {
        userRepository.findByGithubLogin(githubLogin).ifPresent(user -> {
            user.setAccessToken(accessToken);
            userRepository.save(user);
        });
    }

    private Long parseGithubId(String githubIdStr) {
        try { return Long.parseLong(githubIdStr); }
        catch (NumberFormatException e) { return 0L; }
    }
}
