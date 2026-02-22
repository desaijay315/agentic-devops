package com.infraflow.healing.knowledge;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infraflow.common.dto.FileChange;
import com.infraflow.common.dto.HealingPlanResponse;
import com.infraflow.common.model.HealingSession;
import com.infraflow.healing.knowledge.node.FailurePatternNode;
import com.infraflow.healing.knowledge.node.FixNode;
import com.infraflow.healing.knowledge.node.FixRelationship;
import com.infraflow.healing.knowledge.repository.FailurePatternRepository;
import com.infraflow.healing.knowledge.repository.FixNodeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class KnowledgeBaseService {

    private final FailurePatternRepository patternRepository;
    private final FixNodeRepository fixRepository;
    private final ObjectMapper objectMapper;

    @Value("${infraflow.knowledge.min-confidence:0.70}")
    private double minConfidence;

    @Value("${infraflow.knowledge.min-success-count:2}")
    private long minSuccessCount;

    /**
     * Looks up a cached fix for the given failure type and raw log content.
     *
     * Strategy:
     * 1. Compute error signature (MD5 of normalized first 500 chars) and look for exact match.
     *    If the matched pattern has a fix with sufficient confidence and success count, return it.
     * 2. Fall back to querying the best known fix for this failure type across all signatures.
     * 3. Return empty if no suitable cached fix exists.
     */
    public Optional<HealingPlanResponse> findCachedFix(String failureType, String repoName, String rawLogs) {
        String truncated = rawLogs.substring(0, Math.min(500, rawLogs.length()));
        String signature = md5(failureType + ":" + normalizeError(truncated));

        // --- Exact-signature lookup ---
        Optional<FailurePatternNode> exactMatch = patternRepository.findByErrorSignature(signature);
        if (exactMatch.isPresent()) {
            FailurePatternNode pattern = exactMatch.get();
            Optional<FixRelationship> bestRel = pattern.getFixes().stream()
                    .filter(r -> r.getConfidence() != null
                            && r.getConfidence() >= minConfidence
                            && r.getSuccessCount() != null
                            && r.getSuccessCount() >= minSuccessCount)
                    .max((a, b) -> {
                        int confCmp = Double.compare(a.getConfidence(), b.getConfidence());
                        if (confCmp != 0) return confCmp;
                        return Long.compare(
                                a.getSuccessCount() != null ? a.getSuccessCount() : 0L,
                                b.getSuccessCount() != null ? b.getSuccessCount() : 0L);
                    });

            if (bestRel.isPresent()) {
                FixNode fix = bestRel.get().getFix();
                Optional<HealingPlanResponse> response = deserializeToHealingPlan(fix, bestRel.get().getConfidence());
                if (response.isPresent()) {
                    log.info("Knowledge Base HIT (exact signature): failureType={}, confidence={}",
                            failureType, bestRel.get().getConfidence());
                    return response;
                }
            }
        }

        // --- Fallback: best fix for this failure type across all patterns ---
        Optional<FixNode> bestFix = fixRepository.findBestFixForFailureType(failureType, minConfidence);
        if (bestFix.isPresent()) {
            Optional<HealingPlanResponse> response = deserializeToHealingPlan(bestFix.get(), minConfidence);
            if (response.isPresent()) {
                log.info("Knowledge Base HIT (by failure type): failureType={}, confidence={}",
                        failureType, bestFix.get().getInitialConfidence());
                return response;
            }
        }

        log.info("Knowledge Base MISS: failureType={}", failureType);
        return Optional.empty();
    }

    /**
     * Persists a newly generated fix into the Neo4j knowledge base.
     *
     * - Creates or increments the FailurePatternNode for the error signature.
     * - Creates a new FixNode linked to the PostgreSQL session ID.
     * - Connects them via a FixRelationship with initial confidence from the LLM plan.
     */
    @Transactional("neo4jTransactionManager")
    public void storeFix(HealingSession session, HealingPlanResponse plan, String rawLogs) {
        String failureType = session.getFailureType().name();
        String truncated = rawLogs.substring(0, Math.min(500, rawLogs.length()));
        String normalized = normalizeError(truncated);
        String signature = md5(failureType + ":" + normalized);
        String now = Instant.now().toString();

        // Create or update the FailurePatternNode
        FailurePatternNode pattern = patternRepository.findByErrorSignature(signature)
                .orElseGet(() -> FailurePatternNode.builder()
                        .failureType(failureType)
                        .language("Java")
                        .buildTool("Maven")
                        .errorSignature(signature)
                        .sampleError(truncated)
                        .hitCount(0L)
                        .createdAt(now)
                        .fixes(new ArrayList<>())
                        .build());

        pattern.setHitCount(pattern.getHitCount() == null ? 1L : pattern.getHitCount() + 1L);
        pattern.setUpdatedAt(now);

        // Serialize the file changes list from the plan
        String fileChangesJson = serializeFileChanges(plan.filesToModify());

        // Build the FixNode
        FixNode fixNode = FixNode.builder()
                .fixType(plan.fixType())
                .explanation(plan.fixExplanation())
                .fileChangesJson(fileChangesJson)
                .initialConfidence(plan.confidenceScore())
                .language("Java")
                .buildTool("Maven")
                .healingSessionId(session.getId())
                .repoName(session.getPipelineEvent() != null
                        ? session.getPipelineEvent().getRepoName()
                        : null)
                .createdAt(now)
                .build();

        fixNode = fixRepository.save(fixNode);

        // Link pattern -> fix via relationship
        FixRelationship relationship = FixRelationship.builder()
                .fix(fixNode)
                .confidence(plan.confidenceScore())
                .appliedCount(0L)
                .successCount(0L)
                .failureCount(0L)
                .lastAppliedAt(now)
                .build();

        pattern.getFixes().add(relationship);
        patternRepository.save(pattern);

        log.info("Stored fix in Knowledge Base: sessionId={}, failureType={}, confidence={}",
                session.getId(), failureType, plan.confidenceScore());
    }

    /**
     * Records the outcome of an applied fix (pipeline passed or failed again).
     *
     * Updates the FixRelationship confidence using Laplace smoothing:
     *   confidence = (successCount + 1) / (appliedCount + 2)
     *
     * This prevents extreme 0.0 / 1.0 confidence values on small sample sizes.
     */
    @Transactional("neo4jTransactionManager")
    public void recordOutcome(Long healingSessionId, boolean success) {
        Optional<FixNode> fixOpt = fixRepository.findByHealingSessionId(healingSessionId);
        if (fixOpt.isEmpty()) {
            log.warn("recordOutcome: no FixNode found for healingSessionId={}", healingSessionId);
            return;
        }

        FixNode fixNode = fixOpt.get();
        String now = Instant.now().toString();

        // Find the parent pattern that holds the relationship to this fix
        List<FailurePatternNode> patterns = patternRepository
                .findByFailureTypeOrderByHitCountDesc(
                        // we need to locate the pattern by scanning its fix relationships
                        findFailureTypeForFix(fixNode));

        FailurePatternNode owningPattern = null;
        FixRelationship owningRelationship = null;

        for (FailurePatternNode candidate : patterns) {
            for (FixRelationship rel : candidate.getFixes()) {
                if (rel.getFix() != null && fixNode.getId().equals(rel.getFix().getId())) {
                    owningPattern = candidate;
                    owningRelationship = rel;
                    break;
                }
            }
            if (owningRelationship != null) break;
        }

        if (owningRelationship == null) {
            log.warn("recordOutcome: no FixRelationship found for fixNodeId={}, healingSessionId={}",
                    fixNode.getId(), healingSessionId);
            return;
        }

        long applied = owningRelationship.getAppliedCount() == null ? 0L : owningRelationship.getAppliedCount();
        long successes = owningRelationship.getSuccessCount() == null ? 0L : owningRelationship.getSuccessCount();
        long failures = owningRelationship.getFailureCount() == null ? 0L : owningRelationship.getFailureCount();

        if (success) {
            successes++;
        } else {
            failures++;
        }
        applied++;

        // Laplace smoothing: (successes + 1) / (total + 2)
        double newConfidence = (double) (successes + 1) / (double) (applied + 2);

        owningRelationship.setAppliedCount(applied);
        owningRelationship.setSuccessCount(successes);
        owningRelationship.setFailureCount(failures);
        owningRelationship.setConfidence(newConfidence);
        owningRelationship.setLastAppliedAt(now);

        patternRepository.save(owningPattern);

        log.info("Recorded outcome: sessionId={}, success={}, newConfidence={}",
                healingSessionId, success, String.format("%.4f", newConfidence));
    }

    /**
     * Returns aggregate statistics about the knowledge base contents.
     */
    public Map<String, Object> getStats() {
        long totalPatterns = patternRepository.count();
        long totalFixes = fixRepository.count();

        List<FailurePatternNode> allPatterns = patternRepository.findAll();

        // Compute overall average confidence across all fix relationships
        double totalConfidence = 0.0;
        long relationshipCount = 0;

        Map<String, Long> hitCountByType = new HashMap<>();
        Map<String, Double> confidenceSumByType = new HashMap<>();
        Map<String, Long> confidenceCountByType = new HashMap<>();

        for (FailurePatternNode pattern : allPatterns) {
            String type = pattern.getFailureType();
            hitCountByType.merge(type, pattern.getHitCount() != null ? pattern.getHitCount() : 0L, Long::sum);

            for (FixRelationship rel : pattern.getFixes()) {
                if (rel.getConfidence() != null) {
                    totalConfidence += rel.getConfidence();
                    relationshipCount++;
                    confidenceSumByType.merge(type, rel.getConfidence(), Double::sum);
                    confidenceCountByType.merge(type, 1L, Long::sum);
                }
            }
        }

        double averageConfidence = relationshipCount > 0
                ? totalConfidence / relationshipCount
                : 0.0;

        List<Map<String, Object>> topFailureTypes = new ArrayList<>();
        hitCountByType.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .limit(10)
                .forEach(entry -> {
                    String type = entry.getKey();
                    long count = confidenceCountByType.getOrDefault(type, 0L);
                    double avgConf = count > 0
                            ? confidenceSumByType.getOrDefault(type, 0.0) / count
                            : 0.0;
                    Map<String, Object> typeStats = new HashMap<>();
                    typeStats.put("type", type);
                    typeStats.put("hitCount", entry.getValue());
                    typeStats.put("avgConfidence", avgConf);
                    topFailureTypes.add(typeStats);
                });

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalPatterns", totalPatterns);
        stats.put("totalFixes", totalFixes);
        stats.put("averageConfidence", averageConfidence);
        stats.put("topFailureTypes", topFailureTypes);
        return stats;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Normalizes a raw error string to produce a stable signature input.
     *
     * Removes:
     * - ISO-8601 / common log timestamps
     * - Absolute file paths
     * - Line/column number references (e.g. "at line 42", ":42:", "(File.java:42)")
     * - Hex memory addresses
     *
     * Retains error class names and core message text so that the same logical
     * error produces the same signature even when line numbers shift.
     */
    String normalizeError(String raw) {
        if (raw == null || raw.isEmpty()) return "";

        String normalized = raw;

        // Remove ISO-8601 timestamps (e.g. 2024-01-15T10:30:00.000Z)
        normalized = normalized.replaceAll(
                "\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?", "");

        // Remove common log-line timestamps (e.g. [2024-01-15 10:30:00])
        normalized = normalized.replaceAll(
                "\\[?\\d{2,4}[/-]\\d{2}[/-]\\d{2,4}[T ]\\d{2}:\\d{2}:\\d{2}]?", "");

        // Remove absolute file paths (Unix and Windows style)
        normalized = normalized.replaceAll("/[\\w./\\-]+\\.\\w+", "<file>");
        normalized = normalized.replaceAll("[A-Za-z]:[\\\\\\w./\\-]+\\.\\w+", "<file>");

        // Remove Java stack frame line numbers: (SomeClass.java:123)
        normalized = normalized.replaceAll("\\(([A-Za-z]+\\.java):\\d+\\)", "($1)");

        // Remove standalone ":lineNumber" references
        normalized = normalized.replaceAll(":\\d{1,6}\\b", "");

        // Remove hex memory addresses (e.g. 0x7f3b4c5d)
        normalized = normalized.replaceAll("0x[0-9a-fA-F]+", "<addr>");

        // Collapse multiple whitespace
        normalized = normalized.replaceAll("\\s{2,}", " ").trim();

        return normalized;
    }

    /**
     * Computes the MD5 hex digest of the given input string (UTF-8).
     */
    String md5(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(32);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // MD5 is guaranteed to be available on all JVM implementations per the spec
            throw new IllegalStateException("MD5 algorithm not available", e);
        }
    }

    /**
     * Deserializes the fileChangesJson on a FixNode back into a HealingPlanResponse.
     * Returns empty if the JSON is missing or malformed.
     */
    private Optional<HealingPlanResponse> deserializeToHealingPlan(FixNode fix, double confidence) {
        try {
            List<FileChange> fileChanges = new ArrayList<>();
            if (fix.getFileChangesJson() != null && !fix.getFileChangesJson().isBlank()) {
                fileChanges = objectMapper.readValue(
                        fix.getFileChangesJson(),
                        new TypeReference<List<FileChange>>() {});
            }
            HealingPlanResponse response = new HealingPlanResponse(
                    null,
                    null,
                    fix.getExplanation(),
                    fix.getFixType(),
                    fileChanges,
                    null,
                    confidence,
                    "Retrieved from knowledge base",
                    null
            );
            return Optional.of(response);
        } catch (Exception e) {
            log.warn("Failed to deserialize FixNode id={} fileChangesJson: {}", fix.getId(), e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Serializes a list of FileChange objects to a JSON string.
     * Returns an empty JSON array string on failure.
     */
    private String serializeFileChanges(List<FileChange> fileChanges) {
        if (fileChanges == null || fileChanges.isEmpty()) return "[]";
        try {
            return objectMapper.writeValueAsString(fileChanges);
        } catch (Exception e) {
            log.warn("Failed to serialize file changes: {}", e.getMessage());
            return "[]";
        }
    }

    /**
     * Determines the failure type string for a given FixNode by scanning all
     * patterns that reference it. Used during outcome recording to re-locate
     * the owning pattern without an additional index.
     */
    private String findFailureTypeForFix(FixNode fixNode) {
        // We do a full scan via all patterns; for large graphs a direct Cypher
        // query would be preferable, but this keeps the service self-contained
        // and avoids coupling to a custom query for the relatively rare outcome path.
        return patternRepository.findAll().stream()
                .filter(p -> p.getFixes().stream()
                        .anyMatch(r -> r.getFix() != null
                                && fixNode.getId().equals(r.getFix().getId())))
                .map(FailurePatternNode::getFailureType)
                .findFirst()
                .orElse("UNKNOWN");
    }
}
