package com.infraflow.common.dto;

import java.util.List;

public record HealingRequest(
        String failureLogs,
        String repoLanguage,
        String buildTool,
        String failureType,
        String repoStructure,
        List<String> recentCommits,
        String environment,
        String buildFileContent,
        String workflowFileContent,
        String dockerfileContent,
        String dockerComposeContent
) {}
