package com.infraflow.healing.prompt;

import com.infraflow.common.dto.HealingRequest;
import org.springframework.stereotype.Component;

@Component
public class HealingPromptRouter {

    private static final String SYSTEM_PROMPT = """
            You are InfraFlow Healing Agent — an expert DevOps engineer specialized in:
            - Java/Spring Boot microservices
            - Maven and Gradle build systems
            - JUnit 5 and TestNG test frameworks
            - Docker containerization
            - CI/CD pipelines (GitHub Actions)
            - Dependency management and JVM internals

            STRICT RULES:
            1. Always reason step by step before suggesting any fix
            2. Never suggest fixes that modify business logic
            3. Never suggest fixes that remove tests or lower coverage
            4. Always prefer the minimal change that solves the problem
            5. If you are not confident (< 0.75), set fixType to ESCALATE
            6. Always explain your fix in plain English for the developer
            7. Return ONLY valid JSON — no prose, no markdown, no backticks
            8. If logs are insufficient to diagnose, say so explicitly

            CONFIDENCE SCORING:
            0.90 - 1.00 : Exact pattern match, fix is certain
            0.75 - 0.89 : Strong signal, highly likely to work
            0.50 - 0.74 : Possible fix but uncertain, recommend human review
            0.00 - 0.49 : Insufficient context, always ESCALATE
            """;

    public String getSystemPrompt() {
        return SYSTEM_PROMPT;
    }

    public String route(HealingRequest request) {
        return switch (request.failureType()) {
            case "BUILD_COMPILE" -> buildCompilePrompt(request);
            case "TEST_FAILURE" -> testFailurePrompt(request);
            case "DEPENDENCY_CONFLICT" -> dependencyPrompt(request);
            case "INFRASTRUCTURE" -> infraPrompt(request);
            case "DOCKER_FAILURE" -> dockerPrompt(request);
            default -> genericPrompt(request);
        };
    }

    private String buildCompilePrompt(HealingRequest req) {
        return """
                PIPELINE FAILURE REPORT
                =======================
                Failure Type : BUILD_COMPILE
                Build Tool   : %s
                Language     : %s

                FAILED BUILD LOGS:
                %s

                REPOSITORY STRUCTURE:
                %s

                TASK:
                Step 1 - DIAGNOSE: Identify the exact compilation error. Quote the specific error line.
                Step 2 - LOCATE: Which file(s) and line(s) need to change.
                Step 3 - FIX: Generate the minimal change. Do not refactor unrelated code.
                Step 4 - VERIFY: Does your fix introduce any risk?
                Step 5 - SCORE: Confidence 0.0 to 1.0

                Return ONLY this JSON:
                {
                  "failureSummary": "one sentence",
                  "rootCause": "technical explanation",
                  "fixExplanation": "plain english for developer",
                  "fixType": "CODE_CHANGE",
                  "filesToModify": [{"filePath":"...","changeType":"MODIFY","oldContent":"...","newContent":"...","lineNumber":0,"reason":"..."}],
                  "commands": [],
                  "confidenceScore": 0.85,
                  "humanReadableReason": "shown on dashboard",
                  "preventionTips": ["tip1"]
                }
                """.formatted(
                req.buildTool(),
                req.repoLanguage(),
                truncateLogs(req.failureLogs()),
                req.repoStructure()
        );
    }

    private String testFailurePrompt(HealingRequest req) {
        return """
                PIPELINE FAILURE REPORT
                =======================
                Failure Type : TEST_FAILURE
                Language     : %s

                FAILED TEST LOGS:
                %s

                IMPORTANT: Do NOT suggest removing, skipping, or weakening tests.
                Only fix production code OR the test if the assertion is genuinely wrong.

                Step 1 - IDENTIFY: Is this a code bug or a test bug?
                Step 2 - LOCATE: Exact class + method that needs fixing
                Step 3 - FIX: Minimal change, production code fix preferred
                Step 4 - SCORE: Confidence 0.0 to 1.0

                Return ONLY the same JSON structure as above.
                """.formatted(
                req.repoLanguage(),
                truncateLogs(req.failureLogs())
        );
    }

    private String dependencyPrompt(HealingRequest req) {
        return """
                PIPELINE FAILURE REPORT
                =======================
                Failure Type : DEPENDENCY_CONFLICT
                Build Tool   : %s

                BUILD FILE CONTENT:
                %s

                FAILED BUILD LOGS:
                %s

                Step 1 - IDENTIFY conflicting dependencies with their versions
                Step 2 - DETERMINE correct version (prefer BOM-managed)
                Step 3 - FIX: Add explicit version override
                Step 4 - RISK CHECK: Could this break other dependencies?

                Return ONLY the same JSON structure as above with fixType: "CONFIG_CHANGE".
                """.formatted(
                req.buildTool(),
                req.buildFileContent(),
                truncateLogs(req.failureLogs())
        );
    }

    private String infraPrompt(HealingRequest req) {
        return """
                PIPELINE FAILURE REPORT
                =======================
                Failure Type : INFRASTRUCTURE
                Environment  : %s

                CI/CD CONFIG:
                %s

                FAILED LOGS:
                %s

                Step 1 - CLASSIFY: OOM_HEAP | NETWORK_TIMEOUT | DISK_FULL | other
                Step 2 - ROOT CAUSE: Config issue or genuine resource constraint?
                Step 3 - FIX: Config change (safest) > Workflow change > ESCALATE

                Return ONLY the same JSON structure with fixType: "CONFIG_CHANGE" or "ESCALATE".
                """.formatted(
                req.environment(),
                req.workflowFileContent(),
                truncateLogs(req.failureLogs())
        );
    }

    private String dockerPrompt(HealingRequest req) {
        return """
                PIPELINE FAILURE REPORT
                =======================
                Failure Type : DOCKER_FAILURE

                DOCKERFILE:
                %s

                FAILED LOGS:
                %s

                Step 1 - IDENTIFY: BUILD_FAILED | BASE_IMAGE_PULL_FAILED | RUN_CMD_FAILED | other
                Step 2 - FIX the Dockerfile or compose file
                Step 3 - OPTIMIZE if possible (multi-stage, layer caching)

                Return ONLY the same JSON structure with fixType: "CONFIG_CHANGE".
                """.formatted(
                req.dockerfileContent(),
                truncateLogs(req.failureLogs())
        );
    }

    private String genericPrompt(HealingRequest req) {
        return """
                PIPELINE FAILURE REPORT
                =======================
                Failure Type : UNKNOWN
                Language     : %s
                Build Tool   : %s

                FAILED LOGS:
                %s

                Analyze the failure, diagnose the root cause, and suggest the minimal fix.
                If you cannot confidently diagnose, set fixType to "ESCALATE" and confidenceScore below 0.5.

                Return ONLY the standard JSON structure.
                """.formatted(
                req.repoLanguage(),
                req.buildTool(),
                truncateLogs(req.failureLogs())
        );
    }

    private String truncateLogs(String logs) {
        if (logs == null) return "[no logs available]";
        int max = 3000;
        if (logs.length() <= max) return logs;
        int headSize = max / 5;
        int tailSize = max - headSize;
        return logs.substring(0, headSize)
                + "\n\n[... logs truncated ...]\n\n"
                + logs.substring(logs.length() - tailSize);
    }
}
