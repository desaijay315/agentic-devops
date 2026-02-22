package com.infraflow.gateway.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.web.server.ServerOAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.server.WebFilterExchange;
import org.springframework.security.web.server.authentication.ServerAuthenticationSuccessHandler;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;

/**
 * Custom OAuth2 login success handler that:
 * 1. Extracts the GitHub OAuth access token (available right after login)
 * 2. Saves the user + token to the dashboard-backend (PostgreSQL)
 * 3. Sets HttpOnly cookies with user identity + access token
 * 4. Redirects the user to the frontend
 *
 * Cookies are the reliable transport for subsequent requests because
 * Redis session deserialization of OAuth2AuthorizedClient is unreliable.
 * The UserHeaderFilter reads these cookies to forward headers downstream.
 */
@Slf4j
public class OAuth2LoginSuccessHandler implements ServerAuthenticationSuccessHandler {

    /** Cookie name for the GitHub access token (Base64-encoded) */
    public static final String TOKEN_COOKIE   = "INFRAFLOW_GH_TOKEN";
    /** Cookie name for the GitHub user login */
    public static final String LOGIN_COOKIE   = "INFRAFLOW_GH_LOGIN";
    /** Cookie name for the GitHub user id */
    public static final String ID_COOKIE      = "INFRAFLOW_GH_ID";
    /** Cookie name for the GitHub avatar URL (Base64-encoded) */
    public static final String AVATAR_COOKIE  = "INFRAFLOW_GH_AVATAR";
    /** Cookie name for the GitHub display name (Base64-encoded) */
    public static final String NAME_COOKIE    = "INFRAFLOW_GH_NAME";

    private final ServerOAuth2AuthorizedClientRepository authorizedClientRepository;
    private final WebClient webClient;
    private final String frontendRedirectUrl;

    public OAuth2LoginSuccessHandler(
            ServerOAuth2AuthorizedClientRepository authorizedClientRepository,
            String frontendRedirectUrl) {
        this.authorizedClientRepository = authorizedClientRepository;
        this.frontendRedirectUrl = frontendRedirectUrl;
        this.webClient = WebClient.builder()
                .baseUrl("http://localhost:8083")  // dashboard-backend direct
                .build();
    }

    @Override
    public Mono<Void> onAuthenticationSuccess(WebFilterExchange webFilterExchange,
                                               Authentication authentication) {
        if (!(authentication instanceof OAuth2AuthenticationToken authToken)) {
            log.warn("Authentication is not OAuth2AuthenticationToken, redirecting without token sync");
            return redirect(webFilterExchange);
        }

        OAuth2User user = authToken.getPrincipal();
        String login = getAttribute(user, "login");
        String githubId = getAttribute(user, "id");
        String avatar = getAttribute(user, "avatar_url");
        String name = getAttribute(user, "name");

        log.info("OAuth2 login success for user: {}", login);

        // Extract the access token from the authorized client, set cookies, save to DB, redirect.
        return authorizedClientRepository
                .loadAuthorizedClient(
                        authToken.getAuthorizedClientRegistrationId(),
                        authToken,
                        webFilterExchange.getExchange())
                .map(client -> client.getAccessToken().getTokenValue())
                .defaultIfEmpty("")
                .onErrorResume(ex -> {
                    log.error("Failed to load authorized client for {}: {}", login, ex.getMessage());
                    return Mono.just("");
                })
                .flatMap(accessToken -> {
                    // Always set identity cookies (even if token is empty)
                    setIdentityCookies(webFilterExchange, login, githubId, avatar, name, accessToken);

                    if (accessToken.isEmpty()) {
                        log.warn("No access token available for user {} — cookies set without token", login);
                        return redirect(webFilterExchange);
                    }
                    log.info("Got access token for {}: length={}, setting cookies + DB sync", login, accessToken.length());

                    // Save to PostgreSQL, then redirect. Failure is non-fatal.
                    return saveUserAndToken(login, githubId, avatar, name, accessToken)
                            .timeout(Duration.ofSeconds(5))
                            .onErrorResume(ex -> {
                                log.error("Token DB sync failed for {}: {} — redirecting anyway",
                                        login, ex.getMessage());
                                return Mono.empty();
                            })
                            .then(redirect(webFilterExchange));
                });
    }

    /**
     * Sets HttpOnly cookies containing user identity and GitHub access token.
     * These cookies are read by UserHeaderFilter on every subsequent request
     * to forward identity + token headers to downstream microservices.
     *
     * Token and avatar are Base64-encoded to avoid cookie value issues.
     */
    private void setIdentityCookies(WebFilterExchange webFilterExchange,
                                     String login, String githubId,
                                     String avatar, String name,
                                     String accessToken) {
        var response = webFilterExchange.getExchange().getResponse();
        Duration maxAge = Duration.ofDays(7);  // 7-day session

        // Login — plain text, safe for cookies
        response.addCookie(buildCookie(LOGIN_COOKIE, login, maxAge));

        // GitHub ID — plain text number
        response.addCookie(buildCookie(ID_COOKIE, githubId, maxAge));

        // Avatar URL — Base64 to avoid special chars
        response.addCookie(buildCookie(AVATAR_COOKIE, b64Encode(avatar), maxAge));

        // Display name — Base64 to avoid special chars
        response.addCookie(buildCookie(NAME_COOKIE, b64Encode(name), maxAge));

        // Access token — Base64 encoded, HttpOnly for security
        if (!accessToken.isEmpty()) {
            response.addCookie(buildCookie(TOKEN_COOKIE, b64Encode(accessToken), maxAge));
        }

        log.info("Set identity cookies for user {}: token={}", login, !accessToken.isEmpty());
    }

    /**
     * Build a secure HttpOnly cookie with SameSite=Lax for cross-origin safety.
     */
    private ResponseCookie buildCookie(String name, String value, Duration maxAge) {
        return ResponseCookie.from(name, value)
                .path("/")
                .httpOnly(true)
                .secure(false)        // set to true in production (HTTPS)
                .sameSite("Lax")
                .maxAge(maxAge)
                .build();
    }

    /**
     * Builds a set of cookies that clear/expire the identity cookies (for logout).
     */
    public static ResponseCookie[] buildClearCookies() {
        Duration zero = Duration.ZERO;
        return new ResponseCookie[]{
                ResponseCookie.from(LOGIN_COOKIE, "").path("/").httpOnly(true).maxAge(zero).build(),
                ResponseCookie.from(ID_COOKIE, "").path("/").httpOnly(true).maxAge(zero).build(),
                ResponseCookie.from(AVATAR_COOKIE, "").path("/").httpOnly(true).maxAge(zero).build(),
                ResponseCookie.from(NAME_COOKIE, "").path("/").httpOnly(true).maxAge(zero).build(),
                ResponseCookie.from(TOKEN_COOKIE, "").path("/").httpOnly(true).maxAge(zero).build(),
        };
    }

    private Mono<String> saveUserAndToken(String login, String githubId,
                                           String avatar, String name, String accessToken) {
        return webClient.post()
                .uri("/api/user/oauth-sync")
                .bodyValue(Map.of(
                        "login", login,
                        "githubId", githubId,
                        "avatar", avatar,
                        "name", name,
                        "accessToken", accessToken
                ))
                .retrieve()
                .bodyToMono(String.class)
                .doOnNext(resp -> log.info("Saved user {} and access token to DB: {}", login, resp))
                .onErrorResume(ex -> {
                    log.error("Failed to save user {} to dashboard-backend: {}", login, ex.getMessage());
                    return Mono.just("error");
                });
    }

    private Mono<Void> redirect(WebFilterExchange webFilterExchange) {
        webFilterExchange.getExchange().getResponse()
                .setStatusCode(org.springframework.http.HttpStatus.FOUND);
        webFilterExchange.getExchange().getResponse()
                .getHeaders().setLocation(URI.create(frontendRedirectUrl));
        return webFilterExchange.getExchange().getResponse().setComplete();
    }

    private String getAttribute(OAuth2User user, String key) {
        Object val = user.getAttribute(key);
        return val != null ? val.toString() : "";
    }

    private String b64Encode(String value) {
        if (value == null || value.isEmpty()) return "";
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}


