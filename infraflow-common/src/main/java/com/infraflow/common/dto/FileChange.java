package com.infraflow.common.dto;

public record FileChange(
        String filePath,
        String changeType, // MODIFY, CREATE, DELETE
        String oldContent,
        String newContent,
        Integer lineNumber,
        String reason
) {}
