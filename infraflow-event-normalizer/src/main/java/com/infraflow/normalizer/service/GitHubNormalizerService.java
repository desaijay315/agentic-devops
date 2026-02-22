package com.infraflow.normalizer.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infraflow.common.enums.PipelineStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class GitHubNormalizerService {

    private final KafkaTemplate<String, Map<String, Object>> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Value("${infraflow.kafka.topic.pipeline-events}")
    private String pipelineEventsTopic;

    @Value("${infraflow.github.webhook-secret:}")
    private String webhookSecret;

    public void normalizeAndPublish(String rawPayload, String signature) {
        if (!webhookSecret.isBlank()) {
            verifySignature(rawPayload, signature);
        }

        try {
            JsonNode root = objectMapper.readTree(rawPayload);
            JsonNode workflowRun = root.path("workflow_run");

            if (workflowRun.isMissingNode()) {
                log.warn("No workflow_run in payload, skipping");
                return;
            }

            String conclusion = workflowRun.path("conclusion").asText("");
            String status = workflowRun.path("status").asText("");

            PipelineStatus pipelineStatus = mapStatus(status, conclusion);

            Map<String, Object> event = Map.ofEntries(
                    Map.entry("repoUrl", workflowRun.path("repository").path("html_url").asText("")),
                    Map.entry("repoName", workflowRun.path("repository").path("full_name").asText("")),
                    Map.entry("branch", workflowRun.path("head_branch").asText("")),
                    Map.entry("commitSha", workflowRun.path("head_sha").asText("")),
                    Map.entry("provider", "GITHUB"),
                    Map.entry("status", pipelineStatus.name()),
                    Map.entry("workflowRunId", workflowRun.path("id").asLong()),
                    Map.entry("workflowName", workflowRun.path("name").asText("")),
                    Map.entry("triggeredAt", workflowRun.path("created_at").asText(Instant.now().toString())),
                    Map.entry("completedAt", workflowRun.path("updated_at").asText(Instant.now().toString()))
            );

            String key = event.get("repoName") + ":" + event.get("commitSha");
            kafkaTemplate.send(pipelineEventsTopic, key, event);

            log.info("Published pipeline event: repo={}, status={}, commit={}",
                    event.get("repoName"), pipelineStatus, event.get("commitSha"));

        } catch (Exception e) {
            log.error("Failed to normalize GitHub webhook payload", e);
            throw new RuntimeException("Normalization failed", e);
        }
    }

    private PipelineStatus mapStatus(String status, String conclusion) {
        if ("completed".equals(status)) {
            return switch (conclusion) {
                case "success" -> PipelineStatus.SUCCESS;
                case "failure" -> PipelineStatus.FAILED;
                default -> PipelineStatus.FAILED;
            };
        }
        if ("in_progress".equals(status)) {
            return PipelineStatus.RUNNING;
        }
        return PipelineStatus.QUEUED;
    }

    private void verifySignature(String payload, String signature) {
        if (signature == null || signature.isBlank()) {
            throw new SecurityException("Missing webhook signature");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            String expected = "sha256=" + HexFormat.of().formatHex(hash);
            if (!expected.equals(signature)) {
                throw new SecurityException("Invalid webhook signature");
            }
        } catch (SecurityException e) {
            throw e;
        } catch (Exception e) {
            throw new SecurityException("Signature verification failed", e);
        }
    }
}
