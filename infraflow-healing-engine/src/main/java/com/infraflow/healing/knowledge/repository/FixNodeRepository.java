package com.infraflow.healing.knowledge.repository;

import com.infraflow.healing.knowledge.node.FixNode;
import org.springframework.data.neo4j.repository.Neo4jRepository;
import org.springframework.data.neo4j.repository.query.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FixNodeRepository extends Neo4jRepository<FixNode, Long> {

    Optional<FixNode> findByHealingSessionId(Long sessionId);

    List<FixNode> findByRepoNameOrderByCreatedAtDesc(String repoName);

    @Query("MATCH (p:FailurePattern {failureType: $type})-[r:HAS_FIX]->(f:Fix) " +
           "WHERE r.confidence >= $minConfidence " +
           "RETURN f ORDER BY r.successCount DESC LIMIT 1")
    Optional<FixNode> findBestFixForFailureType(
            @Param("type") String failureType,
            @Param("minConfidence") double minConfidence
    );
}
