package com.infraflow.gateway.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Global filter that reads user identity + GitHub access token from
 * HttpOnly cookies (set by OAuth2LoginSuccessHandler at login time)
 * and forwards them as HTTP headers to downstream microservices.
 *
 * This replaces the previous approach that tried to load the OAuth2
 * authorized client from the Redis-backed web session — which broke
 * due to serialization/deserialization issues with OAuth2AuthorizedClient.
 *
 * Cookie → Header mapping:
 *   INFRAFLOW_GH_LOGIN  → X-User-Login
 *   INFRAFLOW_GH_ID     → X-User-Id
 *   INFRAFLOW_GH_AVATAR → X-User-Avatar   (Base64-decoded)
 *   INFRAFLOW_GH_NAME   → X-User-Name     (Base64-decoded)
 *   INFRAFLOW_GH_TOKEN  → X-User-Access-Token (Base64-decoded)
 */
@Component
@Slf4j
public class UserHeaderFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String login      = getCookieValue(exchange, OAuth2LoginSuccessHandler.LOGIN_COOKIE);
        String githubId   = getCookieValue(exchange, OAuth2LoginSuccessHandler.ID_COOKIE);
        String avatarB64  = getCookieValue(exchange, OAuth2LoginSuccessHandler.AVATAR_COOKIE);
        String nameB64    = getCookieValue(exchange, OAuth2LoginSuccessHandler.NAME_COOKIE);
        String tokenB64   = getCookieValue(exchange, OAuth2LoginSuccessHandler.TOKEN_COOKIE);

        String avatar = b64Decode(avatarB64);
        String name   = b64Decode(nameB64);
        String token  = b64Decode(tokenB64);

        if (login != null && !login.isEmpty()) {
            log.debug("UserHeaderFilter: cookies found for user={}, tokenPresent={}, path={}",
                    login, !token.isEmpty(), exchange.getRequest().getPath());

            ServerWebExchange mutated = exchange.mutate().request(
                    exchange.getRequest().mutate()
                            .header("X-User-Login", login)
                            .header("X-User-Id", githubId != null ? githubId : "")
                            .header("X-User-Avatar", avatar)
                            .header("X-User-Name", name)
                            .header("X-User-Access-Token", token)
                            .build()
            ).build();

            return chain.filter(mutated);
        }

        // No cookies — pass the request through without user headers
        log.debug("UserHeaderFilter: no identity cookies for path={}",
                exchange.getRequest().getPath());
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return -100; // Run before PlanEnforcementFilter (-50) and all other filters
    }

    private String getCookieValue(ServerWebExchange exchange, String cookieName) {
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst(cookieName);
        return cookie != null ? cookie.getValue() : null;
    }

    private String b64Decode(String encoded) {
        if (encoded == null || encoded.isEmpty()) return "";
        try {
            return new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            log.warn("Failed to Base64-decode cookie value: {}", e.getMessage());
            return "";
        }
    }
}
