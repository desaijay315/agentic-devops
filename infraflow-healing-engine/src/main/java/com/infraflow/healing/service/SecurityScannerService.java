package com.infraflow.healing.service;

import com.infraflow.common.model.PipelineEvent;
import com.infraflow.common.model.SecurityScanResult;
import com.infraflow.healing.repository.SecurityScanResultRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pattern-matching security scanner that analyses raw pipeline logs for
 * common vulnerability signals and known-CVE dependency fingerprints.
 *
 * <p>This is an <em>in-process</em>, demo-quality scanner that uses regular
 * expressions as detection rules.  It is designed to be replaced or
 * supplemented by a dedicated SAST/SCA tool (e.g. Semgrep, Trivy, OWASP
 * Dependency-Check) by swapping out the detection rules or delegating to
 * an external API.</p>
 *
 * <p>Findings are persisted to the {@code security_scan_results} table.
 * If a scan for the same repo+commit pair already exists the method returns
 * early to avoid duplicate findings on webhook re-deliveries.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SecurityScannerService {

    private final SecurityScanResultRepository scanResultRepository;
    private final KafkaTemplate<String, Map<String, Object>> kafkaTemplate;

    @Value("${infraflow.kafka.topic.security-events:pipeline.events.security}")
    private String securityEventsTopic;

    // ── Rule definitions ─────────────────────────────────────────────────────

    /**
     * Immutable description of a single detection rule.
     *
     * @param pattern          compiled regex pattern
     * @param severity         finding severity: CRITICAL | HIGH | MEDIUM | LOW | INFO
     * @param vulnerabilityType broad category label stored on the finding
     * @param title            human-readable finding title
     * @param description      explanation of the vulnerability
     * @param remediation      recommended fix steps
     */
    private record ScanRule(
            Pattern pattern,
            String severity,
            String vulnerabilityType,
            String title,
            String description,
            String remediation
    ) {}

    /** Pattern-matching rules evaluated against raw logs / code snippets. */
    private static final List<ScanRule> CODE_RULES = List.of(

        new ScanRule(
            Pattern.compile("password\\s*=\\s*\"[^\"]{6,}\"", Pattern.CASE_INSENSITIVE),
            "CRITICAL",
            "HARDCODED_CREDENTIAL",
            "Hardcoded Password Detected",
            "A plaintext password was found hardcoded in the source code or logs. " +
            "Hardcoded credentials can be extracted by anyone with read access to the " +
            "repository or build artifacts, leading to full account compromise.",
            "Remove the hardcoded value and replace it with a secrets-manager reference " +
            "(e.g. HashiCorp Vault, AWS Secrets Manager, GitHub Actions Secrets). " +
            "Rotate the exposed credential immediately."
        ),

        new ScanRule(
            Pattern.compile("(SELECT\\s+.+\\s*\\+|executeQuery\\s*\\(.*\\+.*)", Pattern.CASE_INSENSITIVE | Pattern.DOTALL),
            "HIGH",
            "SQL_INJECTION",
            "Potential SQL Injection",
            "String concatenation was detected in what appears to be a SQL query construction " +
            "path. Concatenating user-supplied input directly into SQL statements allows " +
            "attackers to manipulate the query, bypass authentication, and exfiltrate data.",
            "Use parameterised queries or a prepared statement API (e.g. " +
            "PreparedStatement, JPA Criteria API, or a query builder). " +
            "Never concatenate untrusted input into a SQL string."
        ),

        new ScanRule(
            Pattern.compile("api[_\\-.]?key\\s*=\\s*\"[a-zA-Z0-9]{20,}\"", Pattern.CASE_INSENSITIVE),
            "CRITICAL",
            "HARDCODED_SECRET",
            "Hardcoded API Key",
            "A long alphanumeric string that resembles an API key was found assigned to an " +
            "api_key variable. Committing API keys to source control or including them in " +
            "build logs exposes them to anyone with repository access.",
            "Store API keys in environment variables or a secrets manager and reference them " +
            "at runtime. Rotate the exposed key immediately and audit access logs for " +
            "unauthorised usage."
        ),

        new ScanRule(
            Pattern.compile("new\\s+Random\\s*\\(\\s*\\)", Pattern.CASE_INSENSITIVE),
            "MEDIUM",
            "INSECURE_RANDOM",
            "Insecure Random Number Generator",
            "java.util.Random is not cryptographically secure. Its output can be predicted " +
            "from a small number of observed values, making it unsuitable for security-sensitive " +
            "operations such as token generation, session IDs, or password resets.",
            "Replace java.util.Random with java.security.SecureRandom for all security-" +
            "sensitive random number generation."
        ),

        new ScanRule(
            Pattern.compile("DocumentBuilderFactory", Pattern.CASE_INSENSITIVE),
            "HIGH",
            "XXE_VULNERABILITY",
            "XXE Vulnerability Risk",
            "DocumentBuilderFactory is present without an adjacent setFeature() call to " +
            "disable external entity processing. Unless external entities are explicitly " +
            "disabled, an attacker can supply a crafted XML document to read local files " +
            "or perform server-side request forgery (SSRF).",
            "Disable external entity processing by calling:\n" +
            "  factory.setFeature(\"http://apache.org/xml/features/disallow-doctype-decl\", true);\n" +
            "  factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);\n" +
            "Consider using a safer XML library such as the StAX API."
        ),

        new ScanRule(
            Pattern.compile("ObjectInputStream", Pattern.CASE_INSENSITIVE),
            "HIGH",
            "UNSAFE_DESERIALIZATION",
            "Unsafe Deserialization",
            "Java's native ObjectInputStream can deserialize arbitrary class graphs. " +
            "Deserializing untrusted data without validation allows attackers to exploit " +
            "gadget chains present in the classpath to achieve remote code execution.",
            "Avoid native Java serialization for untrusted data. If deserialization is " +
            "required, use a look-ahead ObjectInputStream or a serialization filter " +
            "(ObjectInputFilter, JEP 415). Prefer data formats such as JSON or Protocol " +
            "Buffers with explicit schema validation."
        ),

        new ScanRule(
            Pattern.compile("new\\s+File\\s*\\(.*request\\.getParameter", Pattern.CASE_INSENSITIVE | Pattern.DOTALL),
            "HIGH",
            "PATH_TRAVERSAL",
            "Path Traversal Risk",
            "A File object is being constructed using a value sourced directly from an HTTP " +
            "request parameter. Attackers can supply sequences such as '../../../etc/passwd' " +
            "to access files outside the intended directory.",
            "Canonicalise the resolved path and verify it falls within the expected base " +
            "directory before opening the file. Use Path.toRealPath() and compare against " +
            "the allowed base path."
        ),

        new ScanRule(
            Pattern.compile("log\\.(debug|info|warn|error)\\s*\\(.*\\b(password|secret|token|key)\\b.*=",
                            Pattern.CASE_INSENSITIVE),
            "MEDIUM",
            "SENSITIVE_DATA_LEAK",
            "Sensitive Data in Logs",
            "A log statement appears to record a value associated with a sensitive field " +
            "(password, secret, token, or key). Logging sensitive values writes them to " +
            "log files, monitoring systems, and SIEM platforms where they may be retained " +
            "for long periods and accessed by a wide audience.",
            "Remove the sensitive value from the log statement. If the presence of the field " +
            "must be logged, record only a redacted placeholder such as '[REDACTED]' or the " +
            "first/last two characters of the value."
        ),

        new ScanRule(
            Pattern.compile("http://", Pattern.CASE_INSENSITIVE),
            "LOW",
            "INSECURE_TRANSPORT",
            "Insecure HTTP Connection",
            "A plain HTTP URL was found. HTTP connections are unencrypted, allowing " +
            "man-in-the-middle attackers to intercept and modify traffic.",
            "Replace http:// with https:// and ensure the target server has a valid TLS " +
            "certificate. Where mutual TLS is required, configure client certificate " +
            "authentication."
        ),

        new ScanRule(
            Pattern.compile("\\b(MD5|SHA1|SHA-1)\\b", Pattern.CASE_INSENSITIVE),
            "MEDIUM",
            "WEAK_CRYPTO",
            "Weak Cryptographic Algorithm",
            "MD5 or SHA-1 was detected. Both algorithms are cryptographically broken for " +
            "collision resistance and should not be used for security-sensitive purposes " +
            "such as digital signatures, certificate fingerprints, or password hashing.",
            "Replace MD5/SHA-1 with SHA-256 or SHA-3 for general hashing. For password " +
            "hashing use a purpose-built algorithm such as bcrypt, scrypt, or Argon2."
        )
    );

    /**
     * CVE fingerprint rules keyed on dependency name fragments found in logs.
     * Each entry: [dependencyFragment, severity, cveId, title, description, remediation].
     */
    private static final List<String[]> CVE_RULES = List.of(
        new String[]{
            "log4j-core-2.14",
            "CRITICAL",
            "CVE-2021-44228",
            "Log4Shell – Remote Code Execution in Log4j",
            "Log4j 2.x before 2.15.0 is vulnerable to remote code execution via a " +
            "specially crafted JNDI lookup string logged by the library. CVSS 10.0.",
            "Upgrade log4j-core to 2.17.1 or later. As a temporary mitigation set " +
            "the JVM flag -Dlog4j2.formatMsgNoLookups=true or remove the JndiLookup " +
            "class from the classpath."
        },
        new String[]{
            "spring-webmvc-5.2",
            "HIGH",
            "CVE-2022-22965",
            "Spring4Shell – RCE in Spring Framework",
            "Spring MVC and Spring WebFlux applications running on JDK 9+ are vulnerable " +
            "to remote code execution via data binding when deployed on a Servlet container. " +
            "CVSS 9.8.",
            "Upgrade to Spring Framework 5.3.18+ or 5.2.20+. If upgrading is not " +
            "immediately possible apply the official Spring mitigation by setting " +
            "spring.mvc.pathmatch.use-suffix-pattern=false."
        },
        new String[]{
            "jackson-databind-2.9",
            "HIGH",
            "CVE-2019-14379",
            "Jackson Databind – Unsafe Deserialization",
            "jackson-databind 2.9.x before 2.9.9.3 allows deserialization of attacker-" +
            "controlled data via the SubTypeValidator, enabling remote code execution when " +
            "default typing is enabled. CVSS 9.8.",
            "Upgrade jackson-databind to 2.9.9.3 or later. Disable default typing unless " +
            "strictly required and apply a custom DeserializationConfig."
        }
    );

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Scans the raw pipeline logs associated with a pipeline event for
     * security vulnerability signals and persists any findings.
     *
     * <p>The scan is idempotent: if findings for the same repo+commit pair
     * already exist the method returns without writing additional rows.</p>
     *
     * @param event   the pipeline event that triggered the scan
     * @param rawLogs raw log text from the CI runner (may be null or empty)
     */
    @Transactional
    public void scanPipelineEvent(PipelineEvent event, String rawLogs) {
        if (event == null) {
            log.warn("SecurityScannerService.scanPipelineEvent called with null event – skipping");
            return;
        }

        String repoName  = event.getRepoName()  != null ? event.getRepoName()  : "unknown";
        String branch    = event.getBranch();
        String commitSha = event.getCommitSha();

        log.info("Starting security scan: repo={}, branch={}, commit={}, eventId={}",
                repoName, branch, commitSha, event.getId());

        // Idempotency guard: skip if we already have results for this commit
        if (commitSha != null && !commitSha.isBlank()
                && scanResultRepository.existsByRepoNameAndCommitSha(repoName, commitSha)) {
            log.info("Security scan already exists for repo={} commit={} – skipping duplicate scan",
                    repoName, commitSha);
            return;
        }

        String logs = rawLogs != null ? rawLogs : "";
        List<SecurityScanResult> findings = new ArrayList<>();

        // 1. Pattern-matching code rules
        for (ScanRule rule : CODE_RULES) {
            Matcher m = rule.pattern().matcher(logs);
            while (m.find()) {
                String matched = truncate(m.group(), 500);
                SecurityScanResult finding = SecurityScanResult.builder()
                        .pipelineEvent(event)
                        .repoName(repoName)
                        .branch(branch)
                        .commitSha(commitSha)
                        .scanProvider("INFRAFLOW")
                        .severity(rule.severity())
                        .vulnerabilityType(rule.vulnerabilityType())
                        .title(rule.title())
                        .description(rule.description())
                        .remediation(rule.remediation())
                        .status("OPEN")
                        .rawFinding(matched)
                        .build();
                findings.add(finding);
                log.debug("Pattern match [{}] {}: snippet='{}'",
                        rule.severity(), rule.title(), truncate(matched, 80));
            }
        }

        // 2. CVE dependency fingerprint rules
        for (String[] cve : CVE_RULES) {
            String fragment    = cve[0];
            String severity    = cve[1];
            String cveId       = cve[2];
            String title       = cve[3];
            String description = cve[4];
            String remediation = cve[5];

            if (logs.contains(fragment)) {
                SecurityScanResult finding = SecurityScanResult.builder()
                        .pipelineEvent(event)
                        .repoName(repoName)
                        .branch(branch)
                        .commitSha(commitSha)
                        .scanProvider("INFRAFLOW")
                        .severity(severity)
                        .vulnerabilityId(cveId)
                        .vulnerabilityType("VULNERABLE_DEPENDENCY")
                        .title(title)
                        .description(description)
                        .remediation(remediation)
                        .status("OPEN")
                        .rawFinding("Detected dependency fragment in logs: " + fragment)
                        .build();
                findings.add(finding);
                log.warn("CVE match [{}] {} ({}): dependency fragment '{}' found in logs",
                        severity, title, cveId, fragment);
            }
        }

        if (findings.isEmpty()) {
            log.info("Security scan complete – no findings for repo={} commit={}", repoName, commitSha);
            return;
        }

        scanResultRepository.saveAll(findings);
        log.info("Security scan complete – {} finding(s) persisted for repo={} commit={}",
                findings.size(), repoName, commitSha);

        long criticalCount = findings.stream().filter(f -> "CRITICAL".equals(f.getSeverity())).count();
        long highCount     = findings.stream().filter(f -> "HIGH".equals(f.getSeverity())).count();
        long mediumCount   = findings.stream().filter(f -> "MEDIUM".equals(f.getSeverity())).count();
        long lowCount      = findings.stream().filter(f -> "LOW".equals(f.getSeverity())).count();

        if (criticalCount > 0 || highCount > 0) {
            log.warn("SECURITY ALERT – repo={} commit={}: {} CRITICAL, {} HIGH findings detected",
                    repoName, commitSha, criticalCount, highCount);
        }

        // Publish summary event to Kafka so Dashboard can push real-time alerts via WebSocket
        try {
            Map<String, Object> securityEvent = Map.of(
                    "repoName",      repoName,
                    "branch",        branch != null ? branch : "",
                    "commitSha",     commitSha != null ? commitSha : "",
                    "totalFindings", findings.size(),
                    "critical",      criticalCount,
                    "high",          highCount,
                    "medium",        mediumCount,
                    "low",           lowCount,
                    "pipelineEventId", event.getId()
            );
            kafkaTemplate.send(securityEventsTopic, repoName, securityEvent);
        } catch (Exception e) {
            log.warn("Failed to publish security event to Kafka: {}", e.getMessage());
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Truncates a string to at most {@code maxLength} characters, appending
     * "..." when truncation occurs.
     */
    private static String truncate(String s, int maxLength) {
        if (s == null) {
            return null;
        }
        if (s.length() <= maxLength) {
            return s;
        }
        return s.substring(0, maxLength - 3) + "...";
    }
}
