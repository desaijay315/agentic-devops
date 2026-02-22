package com.infraflow.healing.port;

import com.infraflow.common.dto.HealingPlanResponse;
import com.infraflow.common.dto.HealingRequest;

public interface HealingLLMPort {

    HealingPlanResponse generateFix(HealingRequest request);

    /**
     * Generate a new fix considering the previous rejected fix and developer feedback.
     * Used by the re-code / fix-again feature.
     */
    default HealingPlanResponse regenerateFix(HealingRequest request, String previousFixJson, String feedback) {
        // Default implementation falls back to a fresh fix generation.
        // ClaudeHealingAdapter overrides this with context-aware prompt.
        return generateFix(request);
    }
}
