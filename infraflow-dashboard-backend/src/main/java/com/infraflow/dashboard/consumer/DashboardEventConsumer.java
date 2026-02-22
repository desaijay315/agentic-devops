package com.infraflow.dashboard.consumer;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class DashboardEventConsumer {

    private final SimpMessagingTemplate messagingTemplate;

    @KafkaListener(topics = "${infraflow.kafka.topic.pipeline-events}", groupId = "dashboard-backend")
    public void consumePipelineEvent(Map<String, Object> event) {
        log.info("Dashboard received pipeline event: {}", event.get("repoName"));
        messagingTemplate.convertAndSend("/topic/pipeline-events", event);
    }

    @KafkaListener(topics = "${infraflow.kafka.topic.healing-events}", groupId = "dashboard-backend")
    public void consumeHealingEvent(Map<String, Object> event) {
        log.info("Dashboard received healing event: session={}, status={}",
                event.get("sessionId"), event.get("healingStatus"));
        messagingTemplate.convertAndSend("/topic/healing-events", event);
    }
}
