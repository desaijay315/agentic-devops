package com.infraflow.normalizer.controller;

import com.infraflow.normalizer.service.GitHubNormalizerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/webhooks")
@RequiredArgsConstructor
@Slf4j
public class WebhookController {

    private final GitHubNormalizerService gitHubNormalizerService;

    @PostMapping("/github")
    public ResponseEntity<Map<String, String>> handleGitHubWebhook(
            @RequestHeader(value = "X-GitHub-Event", required = false) String eventType,
            @RequestHeader(value = "X-Hub-Signature-256", required = false) String signature,
            @RequestBody String rawPayload) {

        log.info("Received GitHub webhook: event={}", eventType);

        if (!"workflow_run".equals(eventType) && !"check_run".equals(eventType)) {
            return ResponseEntity.ok(Map.of("status", "ignored", "reason", "event type not tracked"));
        }

        gitHubNormalizerService.normalizeAndPublish(rawPayload, signature);

        return ResponseEntity.ok(Map.of("status", "accepted"));
    }
}
