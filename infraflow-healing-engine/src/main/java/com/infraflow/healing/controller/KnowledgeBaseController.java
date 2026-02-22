package com.infraflow.healing.controller;

import com.infraflow.healing.knowledge.KnowledgeBaseService;
import com.infraflow.healing.knowledge.node.FailurePatternNode;
import com.infraflow.healing.knowledge.node.FixRelationship;
import com.infraflow.healing.knowledge.repository.FailurePatternRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/knowledge")
@RequiredArgsConstructor
@Slf4j
public class KnowledgeBaseController {

    private final KnowledgeBaseService knowledgeBaseService;
    private final FailurePatternRepository failurePatternRepository;

    /**
     * Returns aggregate statistics for the knowledge base:
     * total patterns, total fixes, average confidence, and top failure types.
     *
     * Returns safe defaults when Neo4j is unavailable.
     */
    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        try {
            return knowledgeBaseService.getStats();
        } catch (Exception e) {
            log.warn("Failed to fetch Knowledge Base stats (Neo4j may be unavailable): {}", e.getMessage());
            return Map.of(
                "totalPatterns", 0L,
                "totalFixes", 0L,
                "averageConfidence", 0.0,
                "topFailureTypes", List.of()
            );
        }
    }

    /**
     * Returns all known failure patterns, optionally filtered by failure type.
     * Results are ordered by hit count descending so the most-seen patterns appear first.
     *
     * Returns an empty list when Neo4j is unavailable.
     *
     * @param failureType optional filter (e.g. BUILD_COMPILE, TEST_FAILURE)
     */
    @GetMapping("/patterns")
    public List<FailurePatternNode> getPatterns(
            @RequestParam(required = false) String failureType) {
        try {
            if (failureType != null && !failureType.isBlank()) {
                return failurePatternRepository.findByFailureTypeOrderByHitCountDesc(failureType);
            }
            return failurePatternRepository.findAll();
        } catch (Exception e) {
            log.warn("Failed to fetch Knowledge Base patterns (Neo4j may be unavailable): {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Returns all fix relationships attached to a given FailurePatternNode.
     * Each relationship contains confidence score, applied/success/failure counts,
     * and a reference to the underlying FixNode.
     *
     * @param id the Neo4j node ID of the FailurePatternNode
     */
    @GetMapping("/patterns/{id}/fixes")
    public ResponseEntity<List<FixRelationship>> getFixesForPattern(@PathVariable Long id) {
        try {
            return failurePatternRepository.findById(id)
                    .map(pattern -> ResponseEntity.ok(pattern.getFixes()))
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            log.warn("Failed to fetch fixes for pattern {} (Neo4j may be unavailable): {}", id, e.getMessage());
            return ResponseEntity.ok(List.of());
        }
    }
}
