package com.infraflow.healing.consumer;

import com.infraflow.common.enums.PipelineStatus;
import com.infraflow.healing.service.HealingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class PipelineEventConsumer {

    private final HealingService healingService;

    @KafkaListener(topics = "${infraflow.kafka.topic.pipeline-events}", groupId = "healing-engine")
    public void consume(Map<String, Object> event) {
        String status = (String) event.get("status");
        String repoName = (String) event.get("repoName");
        String commitSha = (String) event.get("commitSha");

        log.info("Consumed pipeline event: repo={}, status={}", repoName, status);

        if (PipelineStatus.FAILED.name().equals(status)) {
            log.info("FAILED pipeline detected — initiating healing for {}", repoName);
            healingService.initiateHealing(event);
        } else {
            log.debug("Non-failure event ({}), skipping healing", status);
        }
    }
}
