package com.infraflow.healing.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.neo4j.repository.config.EnableNeo4jRepositories;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * Scopes Spring Data Neo4j repository scanning to the knowledge base package
 * and activates the Neo4j transaction manager under the name
 * "neo4jTransactionManager".
 *
 * Because this application also carries Spring Data JPA on the classpath,
 * the two stores must be partitioned so that each repository interface is
 * unambiguously associated with its backing technology.
 *
 * JPA repositories live in com.infraflow.healing.repository (and sub-packages),
 * Neo4j repositories live in com.infraflow.healing.knowledge.repository.
 *
 * The JPA TransactionManager is registered by Spring Boot auto-configuration
 * under the name "transactionManager".  The Neo4j TransactionManager is
 * registered under "neo4jTransactionManager" (also by auto-configuration).
 * KnowledgeBaseService references "transactionManager" explicitly to stay
 * compatible with the existing JPA-aware @Transactional methods on the same
 * service.  Any method that writes to Neo4j only should use
 * @Transactional("neo4jTransactionManager") instead.
 */
@Configuration
@EnableTransactionManagement
@EnableNeo4jRepositories(
        basePackages = "com.infraflow.healing.knowledge.repository",
        transactionManagerRef = "neo4jTransactionManager"
)
public class Neo4jConfig {
    // All beans are provided by Spring Boot's Neo4j auto-configuration.
    // This class only carries the annotation metadata needed to partition
    // repository scanning and name the transaction manager.
}
