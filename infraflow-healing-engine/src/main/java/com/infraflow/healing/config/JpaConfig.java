package com.infraflow.healing.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Explicitly scopes Spring Data JPA repository scanning to the JPA-backed
 * repository package so that Spring Boot does not attempt to create JPA
 * adapters for the Neo4j repository interfaces in the knowledge sub-package.
 *
 * Without this explicit scope, having both spring-boot-starter-data-jpa and
 * spring-boot-starter-data-neo4j on the classpath can cause each store's
 * auto-configuration to try to claim all repository interfaces, leading to
 * "No qualifying bean" or "Cannot determine target transaction manager" errors.
 */
@Configuration
@EnableJpaRepositories(
        basePackages = "com.infraflow.healing.repository",
        transactionManagerRef = "transactionManager",
        entityManagerFactoryRef = "entityManagerFactory"
)
public class JpaConfig {
    // All beans (EntityManagerFactory, transactionManager) are provided by
    // Spring Boot's JPA auto-configuration.  This class only carries the
    // annotation metadata needed to confine JPA repository scanning.
}
