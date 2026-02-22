package com.infraflow.dashboard.controller;

import com.infraflow.common.model.MonitoredRepo;
import com.infraflow.common.model.User;
import com.infraflow.dashboard.repository.MonitoredRepoRepository;
import com.infraflow.dashboard.service.GitHubRepoService;
import com.infraflow.dashboard.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserService userService;
    private final GitHubRepoService gitHubRepoService;
    private final MonitoredRepoRepository monitoredRepoRepository;

    /**
     * Get current user profile (from Gateway-injected headers).
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(
            @RequestHeader(value = "X-User-Login", defaultValue = "") String login,
            @RequestHeader(value = "X-User-Id", defaultValue = "") String githubId,
            @RequestHeader(value = "X-User-Avatar", defaultValue = "") String avatar,
            @RequestHeader(value = "X-User-Name", defaultValue = "") String name) {

        if (login.isBlank()) {
            return ResponseEntity.status(401).build();
        }

        User user = userService.findOrCreateUser(login, githubId, avatar, name);

        Map<String, Object> profile = new HashMap<>();
        profile.put("id", user.getId());
        profile.put("githubLogin", user.getGithubLogin());
        profile.put("githubId", user.getGithubId());
        profile.put("displayName", user.getDisplayName());
        profile.put("avatarUrl", user.getAvatarUrl());
        profile.put("createdAt", user.getCreatedAt() != null ? user.getCreatedAt().toString() : null);

        return ResponseEntity.ok(profile);
    }

    /**
     * Called by the API Gateway's OAuth2LoginSuccessHandler at login time.
     * Saves the user profile AND their OAuth access token to PostgreSQL.
     * This is the ONLY reliable way to capture the token because Redis
     * session deserialization of OAuth2AuthorizedClient is unreliable.
     */
    @PostMapping("/oauth-sync")
    public ResponseEntity<Map<String, String>> oauthSync(@RequestBody Map<String, String> body) {
        String login = body.getOrDefault("login", "");
        String githubId = body.getOrDefault("githubId", "");
        String avatar = body.getOrDefault("avatar", "");
        String name = body.getOrDefault("name", "");
        String accessToken = body.getOrDefault("accessToken", "");

        if (login.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "login is required"));
        }

        // Create or update user
        User user = userService.findOrCreateUser(login, githubId, avatar, name);

        // Save the OAuth access token
        if (!accessToken.isBlank()) {
            userService.updateAccessToken(login, accessToken);
            log.info("OAuth sync: saved access token for user {} (length={})", login, accessToken.length());
        }

        return ResponseEntity.ok(Map.of("status", "synced", "login", login));
    }

    /**
     * List all GitHub repos accessible to the user.
     * Token priority: gateway header → DB-stored OAuth token → system GITHUB_TOKEN.
     */
    @GetMapping("/repos")
    public ResponseEntity<List<Map<String, Object>>> listGitHubRepos(
            @RequestHeader(value = "X-User-Login", defaultValue = "") String login,
            @RequestHeader(value = "X-User-Access-Token", defaultValue = "") String accessToken) {

        log.info("/api/user/repos called — login='{}', accessToken length={}",
                login, accessToken != null ? accessToken.length() : 0);

        if (login.isBlank()) {
            log.info("No X-User-Login header — using system token");
            List<Map<String, Object>> repos = gitHubRepoService.listUserRepos(null);
            return ResponseEntity.ok(repos);
        }

        try {
            User user = userService.findByLogin(login);

            // Save fresh gateway token to DB if present
            if (!accessToken.isBlank() && !accessToken.equals(user.getAccessToken())) {
                userService.updateAccessToken(login, accessToken);
                log.info("Updated access token for user {} from gateway header", login);
            }

            // Token priority: gateway header → DB-stored → system token
            String token = !accessToken.isBlank() ? accessToken : user.getAccessToken();
            String source = !accessToken.isBlank() ? "gateway-header"
                    : (token != null && !token.isBlank()) ? "db-stored" : "system-token";

            log.info("GitHub API token source={}, hasToken={}", source, token != null && !token.isBlank());

            List<Map<String, Object>> repos = gitHubRepoService.listUserRepos(token);

            // Enrich with monitoring status
            List<MonitoredRepo> monitored = monitoredRepoRepository.findByUserId(user.getId());
            var monitoredNames = monitored.stream()
                    .map(MonitoredRepo::getRepoFullName)
                    .collect(Collectors.toSet());

            repos.forEach(repo -> repo.put("monitored", monitoredNames.contains(repo.get("fullName"))));

            return ResponseEntity.ok(repos);
        } catch (IllegalArgumentException e) {
            log.info("User {} not in DB, using system token for repo list", login);
            List<Map<String, Object>> repos = gitHubRepoService.listUserRepos(null);
            return ResponseEntity.ok(repos);
        } catch (Exception e) {
            log.error("Error fetching repos for user {}: {} — {}. Falling back to system token.",
                    login, e.getClass().getSimpleName(), e.getMessage());
            try {
                List<Map<String, Object>> repos = gitHubRepoService.listUserRepos(null);
                return ResponseEntity.ok(repos);
            } catch (Exception fallbackEx) {
                log.error("System token fallback also failed: {}", fallbackEx.getMessage());
                return ResponseEntity.ok(List.of());
            }
        }
    }

    /**
     * Start monitoring a repo.
     */
    @PostMapping("/repos/monitor")
    @Transactional
    public ResponseEntity<Map<String, String>> monitorRepo(
            @RequestHeader(value = "X-User-Login", defaultValue = "") String login,
            @RequestBody Map<String, String> body) {

        if (login.isBlank()) return ResponseEntity.status(401).build();

        User user = userService.findByLogin(login);
        String repoFullName = body.get("repoFullName");
        String repoUrl = body.get("repoUrl");

        if (repoFullName == null || repoFullName.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "repoFullName is required"));
        }

        if (monitoredRepoRepository.existsByUserIdAndRepoFullName(user.getId(), repoFullName)) {
            return ResponseEntity.ok(Map.of("status", "already_monitored"));
        }

        MonitoredRepo repo = MonitoredRepo.builder()
                .user(user)
                .repoFullName(repoFullName)
                .repoUrl(repoUrl != null ? repoUrl : "https://github.com/" + repoFullName)
                .build();

        monitoredRepoRepository.save(repo);
        log.info("User {} started monitoring repo: {}", login, repoFullName);

        return ResponseEntity.ok(Map.of("status", "monitoring", "repo", repoFullName));
    }

    /**
     * Stop monitoring a repo.
     */
    @DeleteMapping("/repos/monitor/{owner}/{repo}")
    @Transactional
    public ResponseEntity<Map<String, String>> unmonitorRepo(
            @RequestHeader(value = "X-User-Login", defaultValue = "") String login,
            @PathVariable String owner,
            @PathVariable String repo) {

        if (login.isBlank()) return ResponseEntity.status(401).build();

        User user = userService.findByLogin(login);
        String repoFullName = owner + "/" + repo;

        monitoredRepoRepository.deleteByUserIdAndRepoFullName(user.getId(), repoFullName);
        log.info("User {} stopped monitoring repo: {}", login, repoFullName);

        return ResponseEntity.ok(Map.of("status", "unmonitored", "repo", repoFullName));
    }

    /**
     * List all monitored repos for the current user.
     */
    @GetMapping("/repos/monitored")
    public ResponseEntity<List<Map<String, Object>>> listMonitoredRepos(
            @RequestHeader(value = "X-User-Login", defaultValue = "") String login) {

        if (login.isBlank()) return ResponseEntity.ok(List.of());

        try {
            User user = userService.findByLogin(login);
            List<MonitoredRepo> repos = monitoredRepoRepository.findByUserId(user.getId());

            List<Map<String, Object>> result = repos.stream().map(r -> {
                Map<String, Object> map = new HashMap<>();
                map.put("id", r.getId());
                map.put("repoFullName", r.getRepoFullName());
                map.put("repoUrl", r.getRepoUrl());
                map.put("defaultBranch", r.getDefaultBranch());
                map.put("webhookActive", r.getWebhookActive());
                map.put("createdAt", r.getCreatedAt() != null ? r.getCreatedAt().toString() : null);
                return map;
            }).collect(Collectors.toList());

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            log.debug("User {} not found in DB for monitored repos lookup", login);
            return ResponseEntity.ok(List.of());
        }
    }

    /**
     * Returns the current user's plan details.
     * Used by PlanEnforcementFilter in the gateway and by the frontend.
     * Returns a default FREE plan when user identity is not available.
     */
    @GetMapping("/plan")
    public ResponseEntity<Map<String, Object>> getUserPlan(
            @RequestHeader(value = "X-User-Login", defaultValue = "") String login) {

        if (login.isBlank()) {
            log.debug("No X-User-Login header — returning default FREE plan");
            return ResponseEntity.ok(Map.of(
                "planType", "FREE",
                "healCountMonth", 0,
                "healLimitMonth", 10,
                "healsRemaining", 10,
                "hasHealsRemaining", true,
                "planResetAt", ""
            ));
        }

        try {
            Map<String, Object> plan = userService.getPlanInfo(login);
            return ResponseEntity.ok(plan);
        } catch (IllegalArgumentException e) {
            // User not in DB yet (first request before /me was called)
            return ResponseEntity.ok(java.util.Map.of(
                "planType", "FREE",
                "healCountMonth", 0,
                "healLimitMonth", 10,
                "healsRemaining", 10,
                "hasHealsRemaining", true,
                "planResetAt", ""
            ));
        }
    }

    /**
     * Upgrade current user to PRO (mock endpoint – no real payment).
     * In production this would be replaced by a Stripe webhook.
     */
    @PostMapping("/upgrade")
    public ResponseEntity<Map<String, Object>> upgradeToPro(
            @RequestHeader(value = "X-User-Login", defaultValue = "") String login) {

        if (login.isBlank()) return ResponseEntity.status(401).build();

        userService.upgradeToPro(login);
        Map<String, Object> plan = userService.getPlanInfo(login);
        return ResponseEntity.ok(plan);
    }
}
