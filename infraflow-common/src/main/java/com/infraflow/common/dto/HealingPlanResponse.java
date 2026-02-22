package com.infraflow.common.dto;

import java.util.List;

public record HealingPlanResponse(
        String failureSummary,
        String rootCause,
        String fixExplanation,
        String fixType,
        List<FileChange> filesToModify,
        List<String> commands,
        double confidenceScore,
        String humanReadableReason,
        List<String> preventionTips
) {}
