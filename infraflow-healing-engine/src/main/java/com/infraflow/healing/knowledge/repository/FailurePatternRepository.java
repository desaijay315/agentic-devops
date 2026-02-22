package com.infraflow.healing.knowledge.repository;

import com.infraflow.healing.knowledge.node.FailurePatternNode;
import org.springframework.data.neo4j.repository.Neo4jRepository;
import org.springframework.data.neo4j.repository.query.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FailurePatternRepository extends Neo4jRepository<FailurePatternNode, Long> {

    Optional<FailurePatternNode> findByErrorSignature(String errorSignature);

    List<FailurePatternNode> findByFailureTypeOrderByHitCountDesc(String failureType);

    @Query("MATCH (p:FailurePattern {failureType: $type})-[r:HAS_FIX]->(f:Fix) " +
           "WHERE r.confidence >= $minConfidence " +
           "RETURN p, r, f ORDER BY r.confidence DESC, r.successCount DESC LIMIT $limit")
    List<FailurePatternNode> findPatternsWithConfidentFixes(
            @Param("type") String failureType,
            @Param("minConfidence") double minConfidence,
            @Param("limit") int limit
    );
}
