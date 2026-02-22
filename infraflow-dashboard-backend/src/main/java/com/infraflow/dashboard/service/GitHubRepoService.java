package com.infraflow.dashboard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Calls the GitHub API to list user repos using either
 * the user's OAuth token or the system-level GITHUB_TOKEN.
 *
 * Uses RestTemplate (not WebClient) because the dashboard-backend
 * is a Spring MVC (servlet) app without webflux on the classpath.
 */
@Service
@Slf4j
public class GitHubRepoService {

    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    @Value("${infraflow.github.token:}")
    private String systemGithubToken;

    public GitHubRepoService(ObjectMapper objectMapper, RestTemplateBuilder restTemplateBuilder) {
        this.objectMapper = objectMapper;
        this.restTemplate = restTemplateBuilder
                .setConnectTimeout(Duration.ofSeconds(10))
                .setReadTimeout(Duration.ofSeconds(30))
                .build();
    }

    /**
     * List all repos accessible to the user.
     * Uses the user's OAuth token if available, otherwise falls back to system token.
     */
    public List<Map<String, Object>> listUserRepos(String userAccessToken) {
        String token = (userAccessToken != null && !userAccessToken.isBlank())
                ? userAccessToken
                : systemGithubToken;

        if (token == null || token.isBlank()) {
            log.warn("No GitHub token available — returning empty repo list");
            return List.of();
        }

        log.info("Fetching GitHub repos with token: length={}, prefix={}...",
                token.length(), token.substring(0, Math.min(8, token.length())));

        List<Map<String, Object>> allRepos = new ArrayList<>();
        int page = 1;
        int perPage = 100;

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("Accept", "application/vnd.github+json");
        headers.set("User-Agent", "InfraFlow-AI");
        HttpEntity<Void> requestEntity = new HttpEntity<>(headers);

        try {
            while (page <= 5) { // Max 500 repos for safety
                String url = UriComponentsBuilder
                        .fromHttpUrl("https://api.github.com/user/repos")
                        .queryParam("per_page", perPage)
                        .queryParam("page", page)
                        .queryParam("sort", "updated")
                        .queryParam("direction", "desc")
                        .toUriString();

                ResponseEntity<String> response = restTemplate.exchange(
                        url, HttpMethod.GET, requestEntity, String.class);

                log.info("GitHub API response: status={}", response.getStatusCode());

                JsonNode repos = objectMapper.readTree(response.getBody());
                if (!repos.isArray() || repos.isEmpty()) {
                    break;
                }

                for (JsonNode repo : repos) {
                    Map<String, Object> repoMap = new HashMap<>();
                    repoMap.put("fullName", repo.path("full_name").asText());
                    repoMap.put("name", repo.path("name").asText());
                    repoMap.put("htmlUrl", repo.path("html_url").asText());
                    repoMap.put("description", repo.path("description").asText(""));
                    repoMap.put("language", repo.path("language").asText(""));
                    repoMap.put("private", repo.path("private").asBoolean());
                    repoMap.put("defaultBranch", repo.path("default_branch").asText("main"));
                    repoMap.put("updatedAt", repo.path("updated_at").asText());
                    repoMap.put("stargazersCount", repo.path("stargazers_count").asInt());
                    repoMap.put("forksCount", repo.path("forks_count").asInt());
                    allRepos.add(repoMap);
                }

                if (repos.size() < perPage) break;
                page++;
            }

            log.info("Fetched {} repos from GitHub", allRepos.size());
        } catch (Exception e) {
            log.error("Failed to fetch GitHub repos: {} — {}", e.getClass().getSimpleName(), e.getMessage());
        }

        return allRepos;
    }
}
