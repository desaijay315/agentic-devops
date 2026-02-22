package com.infraflow.healing.classifier;

import com.infraflow.common.enums.FailureType;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Component
public class FailureClassifier {

    private record Rule(Pattern pattern, FailureType type) {}

    private static final List<Rule> RULES = List.of(
            // Build / Compile errors
            new Rule(Pattern.compile("(?i)compilation failure|cannot find symbol|error:\\s*\\[ERROR\\].*compil|javac.*error|COMPILATION ERROR"), FailureType.BUILD_COMPILE),
            new Rule(Pattern.compile("(?i)error:.*expected|incompatible types|unreported exception|method does not override"), FailureType.BUILD_COMPILE),

            // Test failures
            new Rule(Pattern.compile("(?i)tests? failed|assertion.*failed|expected.*but was|test.*error|surefire.*failure|failsafe.*failure"), FailureType.TEST_FAILURE),
            new Rule(Pattern.compile("(?i)junit.*fail|testng.*fail|AssertionError|ComparisonFailure"), FailureType.TEST_FAILURE),

            // Dependency conflicts
            new Rule(Pattern.compile("(?i)could not resolve dependencies|dependency.*conflict|version.*conflict|artifact.*not found|non-resolvable parent"), FailureType.DEPENDENCY_CONFLICT),
            new Rule(Pattern.compile("(?i)NoClassDefFoundError|ClassNotFoundException.*(?!Test)|missing artifact|dependency convergence"), FailureType.DEPENDENCY_CONFLICT),

            // Infrastructure failures
            new Rule(Pattern.compile("(?i)OutOfMemoryError|heap space|GC overhead|oom-kill|killed.*signal 9|timeout.*exceeded"), FailureType.INFRASTRUCTURE),
            new Rule(Pattern.compile("(?i)connection refused|connection timed out|network.*unreachable|disk.*full|no space left"), FailureType.INFRASTRUCTURE),

            // Docker failures
            new Rule(Pattern.compile("(?i)docker.*error|dockerfile.*error|COPY failed|pull access denied|image.*not found|container.*exit"), FailureType.DOCKER_FAILURE),
            new Rule(Pattern.compile("(?i)build.*stage|multi-stage|layer.*cache|health.*check.*fail"), FailureType.DOCKER_FAILURE)
    );

    public FailureType classify(String logs) {
        if (logs == null || logs.isBlank()) {
            return FailureType.UNKNOWN;
        }

        // Count matches per type to pick the strongest signal
        Map<FailureType, Integer> scores = new java.util.EnumMap<>(FailureType.class);

        for (Rule rule : RULES) {
            if (rule.pattern().matcher(logs).find()) {
                scores.merge(rule.type(), 1, Integer::sum);
            }
        }

        return scores.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(FailureType.UNKNOWN);
    }
}
