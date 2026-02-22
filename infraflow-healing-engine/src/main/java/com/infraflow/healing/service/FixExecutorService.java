package com.infraflow.healing.service;

import com.infraflow.common.dto.FileChange;
import com.infraflow.common.dto.HealingPlanResponse;
import com.infraflow.common.model.HealingSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Instant;
import java.util.Base64;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class FixExecutorService {

    @Value("${infraflow.github.token}")
    private String githubToken;

    private final WebClient gitHubClient = WebClient.builder()
            .baseUrl("https://api.github.com")
            .build();

    public String createBranchAndApplyFix(HealingSession session, HealingPlanResponse plan) {
        String repoFullName = session.getPipelineEvent().getRepoName();
        String baseBranch = session.getPipelineEvent().getBranch();
        String branchName = "autofix/healing-" + session.getId() + "-" + Instant.now().getEpochSecond();

        log.info("Creating fix branch {} on {}", branchName, repoFullName);

        // 1. Get base branch SHA
        String baseSha = getRef(repoFullName, baseBranch);

        // 2. Create new branch
        createRef(repoFullName, branchName, baseSha);

        // 3. Apply each file change
        for (FileChange change : plan.filesToModify()) {
            applyFileChange(repoFullName, branchName, change, session.getId());
        }

        session.setFixBranch(branchName);
        log.info("Fix applied to branch {}", branchName);
        return branchName;
    }

    public void triggerPipelineRetry(HealingSession session) {
        String repoFullName = session.getPipelineEvent().getRepoName();
        String branch = session.getFixBranch();

        log.info("Triggering workflow dispatch on {} branch {}", repoFullName, branch);

        // Trigger via workflow dispatch API
        try {
            gitHubClient.post()
                    .uri("/repos/{repo}/actions/workflows/{workflow}/dispatches",
                            repoFullName, session.getPipelineEvent().getWorkflowName() + ".yml")
                    .header("Authorization", "Bearer " + githubToken)
                    .header("Accept", "application/vnd.github+json")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(Map.of("ref", branch))
                    .retrieve()
                    .toBodilessEntity()
                    .block();
        } catch (Exception e) {
            log.warn("Workflow dispatch failed, pipeline will trigger on push: {}", e.getMessage());
        }
    }

    private String getRef(String repo, String branch) {
        var response = gitHubClient.get()
                .uri("/repos/{repo}/git/ref/heads/{branch}", repo, branch)
                .header("Authorization", "Bearer " + githubToken)
                .header("Accept", "application/vnd.github+json")
                .retrieve()
                .bodyToMono(Map.class)
                .block();

        @SuppressWarnings("unchecked")
        Map<String, Object> object = (Map<String, Object>) response.get("object");
        return (String) object.get("sha");
    }

    private void createRef(String repo, String branch, String sha) {
        gitHubClient.post()
                .uri("/repos/{repo}/git/refs", repo)
                .header("Authorization", "Bearer " + githubToken)
                .header("Accept", "application/vnd.github+json")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of(
                        "ref", "refs/heads/" + branch,
                        "sha", sha
                ))
                .retrieve()
                .toBodilessEntity()
                .block();
    }

    private void applyFileChange(String repo, String branch, FileChange change, Long sessionId) {
        String path = change.filePath();
        log.info("Applying {} to {}", change.changeType(), path);

        String currentSha = null;
        if ("MODIFY".equals(change.changeType()) || "DELETE".equals(change.changeType())) {
            // Get current file SHA for update
            try {
                var fileResponse = gitHubClient.get()
                        .uri("/repos/{repo}/contents/{path}?ref={branch}", repo, path, branch)
                        .header("Authorization", "Bearer " + githubToken)
                        .header("Accept", "application/vnd.github+json")
                        .retrieve()
                        .bodyToMono(Map.class)
                        .block();
                currentSha = (String) fileResponse.get("sha");
            } catch (Exception e) {
                log.warn("Could not get current file SHA for {}: {}", path, e.getMessage());
            }
        }

        if ("DELETE".equals(change.changeType())) {
            gitHubClient.method(org.springframework.http.HttpMethod.DELETE)
                    .uri("/repos/{repo}/contents/{path}", repo, path)
                    .header("Authorization", "Bearer " + githubToken)
                    .header("Accept", "application/vnd.github+json")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(Map.of(
                            "message", "[InfraFlow] Delete " + path + " (session #" + sessionId + ")",
                            "sha", currentSha,
                            "branch", branch
                    ))
                    .retrieve()
                    .toBodilessEntity()
                    .block();
        } else {
            // CREATE or MODIFY
            String content = Base64.getEncoder().encodeToString(
                    change.newContent().getBytes());

            var body = new java.util.HashMap<>(Map.of(
                    "message", "[InfraFlow] Auto-fix " + path + " (session #" + sessionId + ")",
                    "content", content,
                    "branch", branch
            ));
            if (currentSha != null) {
                body.put("sha", currentSha);
            }

            gitHubClient.put()
                    .uri("/repos/{repo}/contents/{path}", repo, path)
                    .header("Authorization", "Bearer " + githubToken)
                    .header("Accept", "application/vnd.github+json")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .toBodilessEntity()
                    .block();
        }
    }
}
