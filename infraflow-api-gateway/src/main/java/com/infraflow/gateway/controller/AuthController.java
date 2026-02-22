package com.infraflow.gateway.controller;

import com.infraflow.gateway.config.OAuth2LoginSuccessHandler;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /**
     * Returns the current authenticated user's GitHub profile.
     * Reads from identity cookies (set during OAuth login).
     * Falls back to @AuthenticationPrincipal if cookies are absent.
     */
    @GetMapping("/user")
    public Mono<ResponseEntity<Map<String, Object>>> getCurrentUser(
            @AuthenticationPrincipal OAuth2User principal,
            ServerWebExchange exchange) {

        // Try cookies first (reliable after OAuth2LoginSuccessHandler)
        String login = getCookieValue(exchange, OAuth2LoginSuccessHandler.LOGIN_COOKIE);
        if (login != null && !login.isEmpty()) {
            String githubId = getCookieValue(exchange, OAuth2LoginSuccessHandler.ID_COOKIE);
            String avatar   = b64DecodeCookie(exchange, OAuth2LoginSuccessHandler.AVATAR_COOKIE);
            String name     = b64DecodeCookie(exchange, OAuth2LoginSuccessHandler.NAME_COOKIE);

            Map<String, Object> user = Map.of(
                    "login", login,
                    "id", githubId != null ? parseIdSafe(githubId) : 0,
                    "name", name,
                    "avatarUrl", avatar,
                    "email", "",
                    "bio", ""
            );
            return Mono.just(ResponseEntity.ok(user));
        }

        // Fall back to security context
        if (principal == null) {
            return Mono.just(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
        }

        Map<String, Object> user = Map.of(
                "login", attr(principal, "login"),
                "id", principal.getAttribute("id") != null ? principal.getAttribute("id") : 0,
                "name", attr(principal, "name"),
                "avatarUrl", attr(principal, "avatar_url"),
                "email", attr(principal, "email"),
                "bio", attr(principal, "bio")
        );

        return Mono.just(ResponseEntity.ok(user));
    }

    /**
     * Logout — invalidate the session AND clear identity cookies.
     */
    @PostMapping("/logout")
    public Mono<ResponseEntity<Map<String, String>>> logout(ServerWebExchange exchange) {
        // Clear identity cookies
        for (ResponseCookie cookie : OAuth2LoginSuccessHandler.buildClearCookies()) {
            exchange.getResponse().addCookie(cookie);
        }

        return exchange.getSession()
                .flatMap(session -> {
                    session.invalidate();
                    return Mono.just(ResponseEntity.ok(Map.of("status", "logged_out")));
                });
    }

    private String attr(OAuth2User principal, String key) {
        Object val = principal.getAttribute(key);
        return val != null ? val.toString() : "";
    }

    private String getCookieValue(ServerWebExchange exchange, String name) {
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst(name);
        return cookie != null ? cookie.getValue() : null;
    }

    private String b64DecodeCookie(ServerWebExchange exchange, String cookieName) {
        String val = getCookieValue(exchange, cookieName);
        if (val == null || val.isEmpty()) return "";
        try {
            return new String(Base64.getUrlDecoder().decode(val), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    private Object parseIdSafe(String id) {
        try { return Long.parseLong(id); } catch (NumberFormatException e) { return 0; }
    }
}
