package com.infraflow.gateway.filter;

import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * Intercepts POST /api/healing/sessions (trigger a new heal).
 * Calls the dashboard-backend /api/user/plan endpoint (using injected headers)
 * and blocks FREE users who have exhausted their monthly quota (HTTP 402).
 */
@Component
@Slf4j
public class PlanEnforcementFilter implements GlobalFilter, Ordered {

    private static final String HEAL_TRIGGER_PATH = "/api/healing/sessions";
    private final WebClient webClient;

    public PlanEnforcementFilter(WebClient.Builder builder) {
        this.webClient = builder.baseUrl("http://localhost:8083").build();
    }

    @Override
    public int getOrder() {
        // Run after auth, before routing
        return -50;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        var request = exchange.getRequest();

        // Only gate POST to the heal-trigger endpoint
        boolean isHealTrigger = request.getMethod() == HttpMethod.POST
                && request.getPath().value().startsWith(HEAL_TRIGGER_PATH);

        if (!isHealTrigger) {
            return chain.filter(exchange);
        }

        String userLogin = request.getHeaders().getFirst("X-User-Login");
        if (userLogin == null || userLogin.isBlank()) {
            // Not authenticated – let SecurityConfig handle it
            return chain.filter(exchange);
        }

        // Check plan from dashboard-backend
        return webClient.get()
                .uri("/api/user/plan")
                .header("X-User-Login", userLogin)
                .retrieve()
                .bodyToMono(PlanDto.class)
                .flatMap(plan -> {
                    if (!plan.hasHealsRemaining()) {
                        log.warn("User {} hit free-tier heal limit ({}/{})",
                                userLogin, plan.healCountMonth(), plan.healLimitMonth());
                        return rejectWithUpgradeRequired(exchange, plan);
                    }
                    return chain.filter(exchange);
                })
                .onErrorResume(ex -> {
                    // Plan service unavailable → allow through (fail open)
                    log.error("Plan check failed for {}, allowing request: {}", userLogin, ex.getMessage());
                    return chain.filter(exchange);
                });
    }

    private Mono<Void> rejectWithUpgradeRequired(ServerWebExchange exchange, PlanDto plan) {
        var response = exchange.getResponse();
        response.setStatusCode(HttpStatus.PAYMENT_REQUIRED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        String body = String.format(
            "{\"error\":\"PLAN_LIMIT_REACHED\",\"message\":\"Free tier limit reached (%d/%d heals this month). Upgrade to Pro for unlimited healing.\",\"planType\":\"%s\",\"healCountMonth\":%d,\"healLimitMonth\":%d,\"upgradeUrl\":\"/upgrade\"}",
            plan.healCountMonth(), plan.healLimitMonth(),
            plan.planType(), plan.healCountMonth(), plan.healLimitMonth()
        );

        DataBuffer buffer = response.bufferFactory()
                .wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    /** Minimal DTO — matches /api/user/plan response */
    record PlanDto(
        String planType,
        int healCountMonth,
        int healLimitMonth,
        int healsRemaining,
        boolean hasHealsRemaining,
        String planResetAt
    ) {}
}
