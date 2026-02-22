package com.infraflow.healing.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infraflow.common.dto.HealingPlanResponse;
import com.infraflow.common.dto.HealingRequest;
import com.infraflow.healing.port.HealingLLMPort;
import com.infraflow.healing.prompt.HealingPromptRouter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Service
@Profile("claude")
@RequiredArgsConstructor
@Slf4j
public class ClaudeHealingAdapter implements HealingLLMPort {

    private final HealingPromptRouter promptRouter;
    private final ObjectMapper objectMapper;

    @Value("${infraflow.anthropic.api-key}")
    private String apiKey;

    @Value("${infraflow.anthropic.model:claude-sonnet-4-20250514}")
    private String model;

    private final WebClient webClient = WebClient.builder()
            .baseUrl("https://api.anthropic.com")
            .build();

    @Override
    public HealingPlanResponse generateFix(HealingRequest request) {
        String userPrompt = promptRouter.route(request);
        String systemPrompt = promptRouter.getSystemPrompt();

        log.info("Calling Claude API for {} failure", request.failureType());

        try {
            Map<String, Object> body = Map.of(
                    "model", model,
                    "max_tokens", 4096,
                    "system", systemPrompt,
                    "messages", List.of(
                            Map.of("role", "user", "content", userPrompt)
                    )
            );

            String response = webClient.post()
                    .uri("/v1/messages")
                    .header("x-api-key", apiKey)
                    .header("anthropic-version", "2023-06-01")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            // Extract text content from Claude response
            var responseNode = objectMapper.readTree(response);
            String content = responseNode.path("content").get(0).path("text").asText();

            // Clean any markdown wrapping
            content = content.strip();
            if (content.startsWith("```json")) {
                content = content.substring(7);
            }
            if (content.startsWith("```")) {
                content = content.substring(3);
            }
            if (content.endsWith("```")) {
                content = content.substring(0, content.length() - 3);
            }

            return objectMapper.readValue(content.strip(), HealingPlanResponse.class);

        } catch (Exception e) {
            log.error("Claude API call failed", e);
            return new HealingPlanResponse(
                    "LLM call failed: " + e.getMessage(),
                    "Unable to reach Claude API",
                    "The AI healing agent could not generate a fix. Manual review needed.",
                    "ESCALATE",
                    List.of(),
                    List.of(),
                    0.0,
                    "AI analysis failed — escalating to human",
                    List.of("Check API key configuration", "Verify network connectivity")
            );
        }
    }
}
