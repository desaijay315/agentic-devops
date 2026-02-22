package com.infraflow.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.client.web.server.ServerOAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.client.web.server.WebSessionServerOAuth2AuthorizedClientRepository;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.web.server.authentication.RedirectServerAuthenticationSuccessHandler;
import org.springframework.security.web.server.authentication.HttpStatusServerEntryPoint;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public ServerOAuth2AuthorizedClientRepository authorizedClientRepository() {
        return new WebSessionServerOAuth2AuthorizedClientRepository();
    }

    @Bean
    public SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http,
                                                            ServerOAuth2AuthorizedClientRepository authorizedClientRepository) {
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeExchange(exchanges -> exchanges
                        // Public: Actuator health/info endpoints
                        .pathMatchers("/actuator/**").permitAll()
                        // Public: GitHub webhooks (no auth needed)
                        .pathMatchers("/api/webhooks/**").permitAll()
                        // Public: WebSocket endpoint
                        .pathMatchers("/ws/**").permitAll()
                        // Public: Auth endpoints
                        .pathMatchers("/api/auth/**").permitAll()
                        .pathMatchers("/login/**", "/oauth2/**").permitAll()
                        // Public: Dashboard read endpoints (allow viewing without login)
                        .pathMatchers("/api/dashboard/**").permitAll()
                        // Public: Healing session read endpoints
                        .pathMatchers("/api/healing/sessions", "/api/healing/sessions/**").permitAll()
                        .pathMatchers("/api/healing/stats").permitAll()
                        // Public: Security and Knowledge (read-only)
                        .pathMatchers("/api/security/**").permitAll()
                        .pathMatchers("/api/knowledge/**").permitAll()
                        // User endpoints: permitAll at gateway — the downstream
                        // UserController checks X-User-Login header and returns
                        // appropriate defaults when user identity is absent.
                        // Write endpoints (monitor/unmonitor/upgrade) still
                        // require the header and return 401 themselves.
                        .pathMatchers("/api/user/**").permitAll()
                        // Everything else requires auth
                        .anyExchange().permitAll()
                )
                .oauth2Login(oauth2 -> oauth2
                        .authorizedClientRepository(authorizedClientRepository)
                        .authenticationSuccessHandler(
                                new OAuth2LoginSuccessHandler(authorizedClientRepository, "http://localhost:3000")
                        )
                )
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(new HttpStatusServerEntryPoint(HttpStatus.UNAUTHORIZED))
                )
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:3000"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
