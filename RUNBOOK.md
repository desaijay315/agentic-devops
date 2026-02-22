# InfraFlow AI — Operations Runbook

> Comprehensive operations guide for the Autonomous CI/CD Healing Agent.
> Covers architecture, setup, workflows, API reference, database schema, and troubleshooting.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Infrastructure Setup](#2-infrastructure-setup)
   - [2.1 Prerequisites](#21-prerequisites)
   - [2.2 Environment Variables](#22-environment-variables)
   - [2.3 Start Infrastructure (Docker)](#23-start-infrastructure-docker)
   - [2.4 Start All Backend Services](#24-start-all-backend-services-order-matters)
   - [2.5 Start Frontend](#25-start-frontend)
3. [GitHub Integration](#3-github-integration)
   - [3.1 OAuth2 Login Flow](#31-oauth2-login-flow)
   - [3.2 Webhook Setup](#32-webhook-setup)
   - [3.3 Repository Monitoring](#33-repository-monitoring)
4. [Healing Workflow](#4-healing-workflow)
   - [4.1 Normal Flow (LLM Path)](#41-normal-flow-llm-path)
   - [4.2 Fast Path (Knowledge Base Hit)](#42-fast-path-knowledge-base-hit)
   - [4.3 Re-code Flow](#43-re-code-flow)
   - [4.4 Security Scan Flow](#44-security-scan-flow)
5. [Dashboard Navigation](#5-dashboard-navigation)
6. [API Reference](#6-api-reference)
7. [Database Reference](#7-database-reference)
8. [Configuration Reference](#8-configuration-reference)
9. [Troubleshooting](#9-troubleshooting)
10. [Monitoring](#10-monitoring)
11. [Data Flow Tracing](#11-data-flow-tracing)
12. [Key Log Messages](#12-key-log-messages)

---

## 1. System Overview

### What InfraFlow Does

InfraFlow AI is an autonomous CI/CD healing agent. When a GitHub Actions pipeline fails, InfraFlow:

1. Receives the webhook from GitHub
2. Normalizes the raw event into an internal pipeline failure record
3. Classifies the failure type (build compile, test failure, dependency conflict, etc.)
4. Checks the Neo4j Knowledge Base for a cached fix pattern (fast path)
5. If no cache hit, calls the Anthropic Claude API to generate a targeted fix
6. Presents the fix diff to the developer for approval or re-code
7. On approval, commits the fix to an `auto-fix/` branch and re-triggers the pipeline
8. Records the outcome back to the Knowledge Base to improve future confidence scores

The system is entirely event-driven via Kafka and provides a real-time Next.js dashboard with WebSocket updates.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub                                   │
│  Actions Workflow  ──►  Webhook POST /api/webhooks/github       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              API Gateway  :8080                                  │
│  Spring Cloud Gateway  ──  Eureka Discovery  ──  OAuth2 Filter  │
└──────┬─────────────────────────┬──────────────────┬─────────────┘
       │ /api/webhooks/**        │ /api/healing/**  │ /api/dashboard/**
       ▼                         ▼                  ▼
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────────┐
│ Event Normalizer│   │  Healing Engine  │   │ Dashboard Backend   │
│    :8081        │   │     :8082        │   │      :8083          │
│                 │   │                  │   │                     │
│ HMAC validation │   │ Failure classify │   │ WebSocket STOMP     │
│ JSON → domain   │   │ KB lookup first  │   │ REST stats APIs     │
│ model           │   │ Claude API call  │   │ Healing session APIs│
│                 │   │ Git commit/push  │   │ Security scan APIs  │
└────────┬────────┘   └────────┬─────────┘   └──────────┬──────────┘
         │ Kafka                │ Kafka                   │
         │ pipeline.events.raw  │ pipeline.events.healed  │ WebSocket
         ▼                      ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Kafka  :9092                                  │
│  Topics: pipeline.events.raw, pipeline.events.healed            │
└─────────────────────────────────────────────────────────────────┘
         │                      │
         ▼                      ▼
┌──────────────┐    ┌────────────────┐    ┌─────────────────────┐
│  PostgreSQL  │    │     Neo4j      │    │       Redis         │
│   :5432      │    │    :7687       │    │      :6379          │
│              │    │                │    │                     │
│ pipeline_    │    │ (:Failure-     │    │ Session cache,      │
│ events       │    │  Pattern)      │    │ rate limiting       │
│ healing_     │    │ (:Fix)         │    │                     │
│ sessions     │    │ confidence     │    │                     │
│ audit_log    │    │ scores         │    │                     │
└──────────────┘    └────────────────┘    └─────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               Next.js Dashboard  :3000                          │
│  Dashboard / Healing Sessions / Repos / Security / Knowledge    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              Eureka Server  :8761                               │
│   Service registry — all 4 microservices register here          │
└─────────────────────────────────────────────────────────────────┘
```

### All 6 Services with Ports

| Service | Port | Role |
|---------|------|------|
| Eureka Server | 8761 | Service discovery registry |
| API Gateway | 8080 | Reverse proxy, OAuth2, routing |
| Event Normalizer | 8081 | Webhook ingestion, Kafka producer |
| Healing Engine | 8082 | AI fix generation, KB lookup |
| Dashboard Backend | 8083 | REST APIs, WebSocket broadcaster |
| Next.js Frontend | 3000 | Developer dashboard UI |

### External Dependencies

| Dependency | Purpose | Required |
|------------|---------|----------|
| Anthropic API | Claude LLM for fix generation | Yes (or use HEALING_DEMO_MODE=true) |
| GitHub OAuth App | Developer authentication | Yes |
| GitHub Personal Access Token | Push auto-fix commits to repos | Yes |
| ngrok (or public URL) | Receive real GitHub webhook calls on localhost | For real repos |

---

## 2. Infrastructure Setup

### 2.1 Prerequisites

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Java JDK | 17 | All Spring Boot microservices |
| Maven | 3.9 | Build tool |
| Node.js | 20 | Next.js dashboard |
| Docker Desktop | Latest | PostgreSQL, Kafka, Redis, Neo4j |
| Git | Latest | Version control |

**GitHub OAuth App Setup**

1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Application name: `InfraFlow AI`
3. Homepage URL: `http://localhost:3000`
4. Authorization callback URL: `http://localhost:8080/login/oauth2/code/github`
5. Save the Client ID and generate a Client Secret

**GitHub Personal Access Token**

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Required scopes: `repo` (full), `workflow`
3. Save the token as `GITHUB_TOKEN`

**Anthropic API Key**

1. Go to https://console.anthropic.com/settings/keys
2. Create a new API key and save it as `ANTHROPIC_API_KEY`

---

### 2.2 Environment Variables

These variables must be set before starting any backend service. Export them in your shell or configure them in each service's `application.properties`.

#### Authentication

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App Client ID | Yes | `abc123def456` |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App Client Secret | Yes | `secret...` |
| `GITHUB_TOKEN` | Personal Access Token for pushing fixes | Yes | `ghp_...` |
| `WEBHOOK_SECRET` | HMAC secret for GitHub webhook validation | Recommended | `mysecret` |

#### AI / LLM

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | Yes (unless demo mode) | — |
| `ANTHROPIC_MODEL` | Claude model ID | No | `claude-opus-4-6` |

#### PostgreSQL

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_HOST` | PostgreSQL hostname | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_DB` | Database name | `infraflow` |
| `POSTGRES_USER` | Database user | `infraflow` |
| `POSTGRES_PASSWORD` | Database password | `infraflow` |

#### Kafka

| Variable | Description | Default |
|----------|-------------|---------|
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker address | `localhost:9092` |

#### Redis

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |

#### Neo4j (Knowledge Base)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEO4J_URI` | Neo4j Bolt URI | `bolt://localhost:7687` |
| `NEO4J_USERNAME` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | `infraflow` |

#### Healing Engine Behavior

| Variable | Description | Default |
|----------|-------------|---------|
| `HEALING_CONFIDENCE_THRESHOLD` | Minimum confidence to auto-approve a fix (0.0–1.0) | `0.75` |
| `HEALING_AUTO_APPLY` | If true, apply fixes automatically without approval | `false` |
| `HEALING_DEMO_MODE` | If true, skip real LLM calls and return mock fixes | `false` |

#### Knowledge Base

| Variable | Description | Default |
|----------|-------------|---------|
| `KB_ENABLED` | Enable Knowledge Base fast-path lookups | `true` |
| `KB_MIN_CONFIDENCE` | Minimum confidence score to use a cached fix | `0.70` |
| `KB_MIN_SUCCESS_COUNT` | Minimum successful applications before a fix is trusted | `2` |

**Quick export for local development:**

```bash
export GITHUB_OAUTH_CLIENT_ID=your_client_id
export GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
export GITHUB_TOKEN=ghp_your_personal_access_token
export ANTHROPIC_API_KEY=sk-ant-your_key
export POSTGRES_PASSWORD=infraflow
export NEO4J_PASSWORD=infraflow
export HEALING_DEMO_MODE=false
export KB_ENABLED=true
```

---

### 2.3 Start Infrastructure (Docker)

The `docker-compose.yml` at the project root starts all required backing services.

```bash
cd infraflow
docker-compose up -d
```

Verify all containers are running:

```bash
docker-compose ps
```

Expected output — all 6 containers with status `Up`:

| Container | Service | Port(s) |
|-----------|---------|---------|
| `infraflow-postgres` | PostgreSQL database | 5432 |
| `infraflow-kafka` | Kafka message broker | 9092 |
| `infraflow-zookeeper` | Kafka coordination | 2181 |
| `infraflow-redis` | Redis cache | 6379 |
| `infraflow-neo4j` | Neo4j graph database | 7474, 7687 |
| `infraflow-kafka-ui` | Kafka admin web UI | 9080 |

Wait for Neo4j to be fully ready (it takes 20–30 seconds to initialize):

```bash
# Neo4j is ready when you see this in its logs:
docker-compose logs neo4j | grep "Started"
```

**Admin UIs available after startup:**

| UI | URL | Credentials |
|----|-----|-------------|
| Kafka UI | http://localhost:9080 | None |
| PgAdmin | http://localhost:5050 | admin@infraflow.dev / infraflow |
| Neo4j Browser | http://localhost:7474 | neo4j / infraflow |

---

### 2.4 Start All Backend Services (Order Matters)

Start each service from IntelliJ IDEA using the Spring Boot Run Configurations.
Eureka **must** be running before any other service attempts to register.

**Start order:**

| # | Service | IntelliJ Run Config | Port | Wait for log message |
|---|---------|---------------------|------|---------------------|
| 1 | Eureka Server | `EurekaServerApplication` | 8761 | `Started EurekaServerApplication` |
| 2 | API Gateway | `ApiGatewayApplication` | 8080 | `Started ApiGatewayApplication` |
| 3 | Event Normalizer | `EventNormalizerApplication` | 8081 | `Started EventNormalizerApplication` |
| 4 | Healing Engine | `HealingEngineApplication` | 8082 | `Started HealingEngineApplication` |
| 5 | Dashboard Backend | `DashboardApplication` | 8083 | `Started DashboardBackendApplication` |

> **Tip:** In IntelliJ, use **Run → Run...** (Alt+Shift+F10) and select each Application class.
> You can also use the **Services** tool window (Alt+8) to see all running Spring Boot services at a glance.

**Verify all services registered with Eureka:**

Open http://localhost:8761 — you should see all 4 microservices listed as `UP`.

**Actuator health endpoints (available on every service):**

| Service | Health URL |
|---------|-----------|
| Eureka Server | http://localhost:8761/actuator/health |
| API Gateway | http://localhost:8080/actuator/health |
| Event Normalizer | http://localhost:8081/actuator/health |
| Healing Engine | http://localhost:8082/actuator/health |
| Dashboard Backend | http://localhost:8083/actuator/health |

---

### 2.5 Start Frontend

**IntelliJ Terminal — Next.js Dashboard**

Open the IntelliJ terminal (Alt+F12) and run:

```bash
cd infraflow-dashboard-ui
npm run dev
```

Dashboard is available at: **http://localhost:3000**

> First time only: run `npm install` before `npm run dev`.

**Build for production:**

```bash
npm run build
npm start
```

---

## 3. GitHub Integration

### 3.1 OAuth2 Login Flow

1. User navigates to http://localhost:3000
2. User clicks "Sign in with GitHub" in the top navigation
3. Browser redirects to `http://localhost:8080/oauth2/authorization/github`
4. API Gateway redirects to GitHub's OAuth consent page
5. User authorizes the InfraFlow OAuth App on GitHub
6. GitHub calls back to `http://localhost:8080/login/oauth2/code/github`
7. API Gateway exchanges the code for an access token, creates session
8. API Gateway redirects browser to `http://localhost:3000`
9. Dashboard frontend calls `/api/auth/user` — returns the authenticated user object

**Troubleshooting OAuth:**
- Ensure `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` are set in the API Gateway environment
- Ensure the callback URL in your GitHub OAuth App settings exactly matches: `http://localhost:8080/login/oauth2/code/github`
- Check API Gateway logs: `Started ApiGatewayApplication` must appear before login attempts

---

### 3.2 Webhook Setup

GitHub must be able to reach your local InfraFlow instance to deliver webhook events.

**For local development, use ngrok:**

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 8080
# Note the https URL: e.g. https://abc123.ngrok.io
```

**Per-repository webhook configuration:**

| Setting | Value |
|---------|-------|
| Payload URL | `https://YOUR_NGROK_URL/api/webhooks/github` |
| Content type | `application/json` |
| Secret | Value of your `WEBHOOK_SECRET` env var |
| Events | `workflow_run`, `push` |
| Active | Checked |

**Steps to add webhook in GitHub:**

1. Go to your repository on GitHub
2. Settings → Webhooks → Add webhook
3. Fill in the table above
4. Click "Add webhook"
5. GitHub will send a ping event — verify it shows a green checkmark

---

### 3.3 Repository Monitoring

After signing in and configuring webhooks, tell InfraFlow which repositories to watch:

1. Navigate to http://localhost:3000/repos
2. Sign in with GitHub if not already authenticated
3. Your GitHub repositories are listed automatically (fetched via the GitHub API)
4. Click **Monitor** next to any repository you want InfraFlow to watch
5. Monitored repos appear in the "Monitored Repositories" section
6. Click **Stop Monitoring** to remove a repository from the watchlist

Once a repository is monitored and a webhook is configured, InfraFlow will process all failed pipeline events automatically.

---

## 4. Healing Workflow

### 4.1 Normal Flow (LLM Path)

This is the standard path when no Knowledge Base cached fix is available.

```
1. Developer pushes code to GitHub
2. GitHub Actions workflow runs and fails
3. GitHub sends webhook POST to /api/webhooks/github
4. Event Normalizer:
   - Validates HMAC signature against WEBHOOK_SECRET
   - Parses the GitHub workflow_run JSON payload
   - Creates a PipelineEvent record in PostgreSQL
   - Publishes event to Kafka topic: pipeline.events.raw
5. Healing Engine consumes from pipeline.events.raw:
   - Classifies failure type using regex patterns (BUILD_COMPILE, TEST_FAILURE, etc.)
   - Checks Knowledge Base — no confident match found
   - Calls Anthropic Claude API with failure context + repository code
   - Claude returns a fix plan with file changes and confidence score
   - Creates HealingSession in PostgreSQL with status PENDING_APPROVAL
   - Publishes to Kafka: pipeline.events.healed
6. Dashboard Backend:
   - Consumes the healed event
   - Broadcasts via WebSocket STOMP to all connected dashboard clients
7. Developer opens http://localhost:3000/healing
   - Sees new session with status PENDING_APPROVAL
   - Clicks on session to view the code diff
   - Reviews the proposed changes
8. Developer clicks "Apply Fix":
   - POST /api/healing/sessions/{id}/approve
   - Healing Engine commits changes to branch: auto-fix/{session-id}
   - Re-triggers the GitHub Actions workflow via GitHub API
   - Session status updated to APPLIED
9. If the fix worked:
   - Pipeline passes
   - Knowledge Base updated with success — confidence score increases
```

---

### 4.2 Fast Path (Knowledge Base Hit)

When a similar failure has been seen and fixed before, the LLM is bypassed entirely.

```
1. Developer pushes code → GitHub Actions fails → webhook received
2. Event Normalizer normalizes the event → Kafka: pipeline.events.raw
3. Healing Engine consumes the event:
   - Classifies failure type
   - Extracts normalized error signature (strips line numbers, timestamps)
   - Queries Neo4j: MATCH (p:FailurePattern)-[:HAS_FIX]->(f:Fix)
     WHERE p.signature = $sig AND f.confidence >= $threshold
   - MATCH FOUND with confidence >= KB_MIN_CONFIDENCE
   - Applies cached fix strategy directly (no Claude API call)
   - Session created with actor: KNOWLEDGE_BASE in audit log
4. Dashboard shows session — audit log includes "KNOWLEDGE_BASE" actor
5. Fix is committed and pipeline retried
6. Outcome recorded back to Neo4j — confidence adjusted
```

**Benefits of fast path:**
- Eliminates LLM API latency (typically 15–30 seconds) → milliseconds
- Zero Anthropic API cost for repeated failure patterns
- Grows more valuable the longer InfraFlow runs on a project

---

### 4.3 Re-code Flow

When a developer is not satisfied with the generated fix and wants the AI to try again with additional context.

```
1. Developer views a PENDING_APPROVAL healing session
2. Clicks "Re-code" button on the session detail page
3. A feedback modal appears
4. Developer types what should be different:
   e.g. "The fix should also update the test file" or "Use Optional instead of null check"
5. Dashboard calls: POST /api/healing/sessions/{id}/regenerate
   body: { "feedback": "..." }
6. Healing Engine creates a NEW HealingSession:
   - Same repository and failure context
   - attemptNumber incremented by 1
   - Feedback text included in the Claude prompt
7. Claude generates a new fix with the feedback as context
8. New diff is shown to the developer for review
9. Developer can approve, reject, or re-code again
```

---

### 4.4 Security Scan Flow

Every push event triggers a parallel security analysis (independent of healing).

```
1. Push event received by Event Normalizer
2. Security scanner runs pattern matching against the changed files:
   - OWASP Top 10 vulnerability patterns
   - CVE fingerprint detection:
     * Log4Shell (CVE-2021-44228)
     * Spring4Shell (CVE-2022-22965)
     * Other known CVEs in common dependency versions
   - Hardcoded secrets patterns (API keys, passwords in code)
   - SQL injection patterns
   - Path traversal patterns
3. Results stored in security_scan_results table in PostgreSQL
4. Results broadcast via WebSocket to connected dashboard clients
5. Developer views results at http://localhost:3000/security
```

---

## 5. Dashboard Navigation

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/` | Global overview, real-time pipeline feed, healing activity, Knowledge Base widget |
| Healing Sessions | `/healing` | Full history of all healing sessions with status, diffs, and audit logs |
| Repositories | `/repos` | GitHub repository management — monitor/unmonitor repos |
| Repo Detail | `/repos/:owner/:repo` | Per-repository view with branch selector, pipeline history, and healing timeline |
| Security | `/security` | Vulnerability scan results filtered by repo, branch, or severity |
| Knowledge Base | `/knowledge` | Self-learning fix patterns, failure type breakdown, confidence scores |

---

## 6. API Reference

All requests route through the **API Gateway at port 8080**.
Authentication uses HTTP-only session cookies set during OAuth2 login.

### Dashboard Endpoints

```
GET  /api/dashboard/stats
     ?repo=owner/repo          (optional — filter by repo)
     → { totalPipelines, failedPipelines, healedPipelines,
         totalHealingSessions, pendingApproval, successfulHeals, averageMTTR }

GET  /api/dashboard/pipeline-events
     ?repo=owner/repo          (optional)
     ?branch=main              (optional)
     → PipelineEvent[]

GET  /api/dashboard/healing-sessions
     ?repo=owner/repo          (optional)
     → HealingSession[] (summary list)

GET  /api/dashboard/repos/{owner}/{repo}/branches
     → string[]  (branch names)
```

### Healing Endpoints

```
GET  /api/healing/sessions
     → HealingSession[]

GET  /api/healing/sessions/{id}
     → HealingSession (full detail)

GET  /api/healing/sessions/{id}/fix-plan
     → FixPlan | null (204 if not yet generated)

GET  /api/healing/sessions/{id}/audit-log
     → AuditLogEntry[]

POST /api/healing/sessions/{id}/approve
     → HealingSession (updated status)

POST /api/healing/sessions/{id}/reject
     → HealingSession (updated status)

POST /api/healing/sessions/{id}/regenerate
     body: { "feedback": "optional developer feedback string" }
     → HealingSession (new session created, same failure context)
```

### Security Endpoints

```
GET  /api/security/scans
     ?repo=owner/repo          (optional)
     ?branch=main              (optional)
     ?severity=HIGH            (optional: CRITICAL, HIGH, MEDIUM, LOW)
     → SecurityScanResult[]

GET  /api/security/scans/commit/{sha}
     → SecurityScanResult[]  (all scans for a specific commit)

GET  /api/security/stats
     ?repo=owner/repo          (optional)
     → { totalScans, criticalCount, highCount, mediumCount, lowCount }
```

### Knowledge Base Endpoints

```
GET  /api/knowledge/stats
     → { totalPatterns, totalFixes, averageConfidence,
         topFailureTypes: [{ type, count }] }

GET  /api/knowledge/patterns
     ?failureType=BUILD_COMPILE  (optional filter)
     → KbPattern[]

GET  /api/knowledge/patterns/{id}/fixes
     → KbFix[]
```

### Authentication Endpoints

```
GET  /api/auth/user
     → { id, login, name, avatarUrl, email } | 401 if not authenticated

POST /api/auth/logout
     → 200 OK (clears session)

GET  /oauth2/authorization/github
     → 302 Redirect to GitHub OAuth consent page
```

### Webhook Endpoint

```
POST /api/webhooks/github
     Headers: X-Hub-Signature-256: sha256=...
     body: GitHub webhook JSON payload (workflow_run or push event)
     → 200 OK | 400 Bad Request | 401 Invalid signature
```

### Repository Management Endpoints

```
GET  /api/user/me
     → UserProfile

GET  /api/user/repos
     → GitHubRepo[]  (all repos accessible to the authenticated user)

GET  /api/user/repos/monitored
     → MonitoredRepo[]  (repos being watched by InfraFlow)

POST /api/user/repos/monitor
     body: { "repoFullName": "owner/repo", "repoUrl": "https://github.com/owner/repo" }
     → MonitoredRepo

DELETE /api/user/repos/monitor/{repoFullName}
     → 200 OK
```

### WebSocket

```
Connect: ws://localhost:8080/ws  (STOMP over WebSocket)
Subscribe: /topic/pipeline-events    → live PipelineEvent stream
Subscribe: /topic/healing-events     → live HealingSession updates
Subscribe: /topic/security-events    → live SecurityScanResult stream
```

---

## 7. Database Reference

### PostgreSQL Tables

#### `pipeline_events`

Stores all raw CI/CD pipeline run records received from GitHub webhooks.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `repo_full_name` | VARCHAR | e.g. `owner/repo` |
| `branch` | VARCHAR | e.g. `main` |
| `commit_sha` | VARCHAR | 40-char commit SHA |
| `workflow_name` | VARCHAR | GitHub Actions workflow name |
| `status` | VARCHAR | `success`, `failure`, `cancelled` |
| `conclusion` | VARCHAR | GitHub conclusion field |
| `run_id` | BIGINT | GitHub Actions run ID |
| `failure_type` | VARCHAR | Classified failure type |
| `error_message` | TEXT | Extracted error log snippet |
| `created_at` | TIMESTAMPTZ | When the event was received |

#### `healing_sessions`

Stores all AI healing attempts, one per pipeline failure.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `pipeline_event_id` | BIGINT | FK to pipeline_events |
| `repo_full_name` | VARCHAR | Repository identifier |
| `branch` | VARCHAR | Branch being healed |
| `commit_sha` | VARCHAR | Failing commit SHA |
| `failure_type` | VARCHAR | Classified failure category |
| `status` | VARCHAR | `ANALYZING`, `PENDING_APPROVAL`, `APPLIED`, `REJECTED`, `FAILED` |
| `fix_branch` | VARCHAR | Branch created for the fix |
| `confidence_score` | DECIMAL | LLM or KB confidence (0.0–1.0) |
| `attempt_number` | INT | Re-code attempt count (starts at 1) |
| `source` | VARCHAR | `LLM` or `KNOWLEDGE_BASE` |
| `created_at` | TIMESTAMPTZ | Session creation time |
| `updated_at` | TIMESTAMPTZ | Last status change time |

#### `fix_audit_log`

Immutable append-only record of all actions taken on healing sessions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `session_id` | BIGINT | FK to healing_sessions |
| `actor` | VARCHAR | `SYSTEM`, `USER`, `KNOWLEDGE_BASE`, `LLM` |
| `action` | VARCHAR | e.g. `APPROVED`, `REJECTED`, `FIX_GENERATED`, `COMMITTED` |
| `details` | TEXT | Human-readable description |
| `created_at` | TIMESTAMPTZ | Timestamp of the action |

#### `users`

GitHub OAuth user records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `github_id` | BIGINT | GitHub user ID |
| `login` | VARCHAR | GitHub username |
| `name` | VARCHAR | Display name |
| `avatar_url` | VARCHAR | Profile picture URL |
| `email` | VARCHAR | Email (if public) |
| `created_at` | TIMESTAMPTZ | First login timestamp |

#### `monitored_repos`

Repositories that users have opted to monitor with InfraFlow.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `user_id` | BIGINT | FK to users |
| `repo_full_name` | VARCHAR | e.g. `owner/repo` |
| `repo_url` | VARCHAR | GitHub repository HTML URL |
| `created_at` | TIMESTAMPTZ | When monitoring was enabled |

#### `security_scan_results`

Vulnerability scan findings for each push event.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `repo_full_name` | VARCHAR | Repository identifier |
| `commit_sha` | VARCHAR | Scanned commit SHA |
| `branch` | VARCHAR | Branch name |
| `severity` | VARCHAR | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| `vulnerability_type` | VARCHAR | e.g. `LOG4SHELL`, `SQL_INJECTION` |
| `file_path` | VARCHAR | Affected file path |
| `line_number` | INT | Affected line (if applicable) |
| `description` | TEXT | Vulnerability description |
| `cve_id` | VARCHAR | CVE identifier (if applicable) |
| `created_at` | TIMESTAMPTZ | When the scan result was recorded |

### Flyway Migrations

| Migration | Contents |
|-----------|----------|
| `V1__core_schema.sql` | `pipeline_events`, `healing_sessions`, `fix_audit_log` |
| `V2__users_and_repos.sql` | `users`, `monitored_repos`, re-code columns on `healing_sessions` |
| `V3__security_scans.sql` | `security_scan_results` |

Migration files are located in each service's `src/main/resources/db/migration/` directory.

### Neo4j Graph Schema

The Knowledge Base is stored as a property graph in Neo4j.

**Nodes:**

```cypher
(:FailurePattern {
  id:            STRING,  // UUID
  failureType:   STRING,  // BUILD_COMPILE, TEST_FAILURE, etc.
  signature:     STRING,  // normalized error fingerprint
  hitCount:      INT,     // how many times this pattern was matched
  firstSeenAt:   DATETIME,
  lastSeenAt:    DATETIME
})

(:Fix {
  id:             STRING,  // UUID
  strategy:       STRING,  // description of the fix approach
  fileDiffs:      STRING,  // JSON-encoded file changes
  confidence:     FLOAT,   // 0.0 to 1.0
  successCount:   INT,     // times this fix was approved and worked
  failureCount:   INT,     // times this fix was rejected or failed
  appliedCount:   INT,     // total times applied
  createdAt:      DATETIME,
  updatedAt:      DATETIME
})
```

**Relationships:**

```cypher
(:FailurePattern)-[:HAS_FIX { weight: FLOAT }]->(:Fix)
```

**Key queries:**

```cypher
-- Find cached fixes for a pattern
MATCH (p:FailurePattern)-[:HAS_FIX]->(f:Fix)
WHERE p.signature = $sig AND f.confidence >= $threshold
RETURN f ORDER BY f.confidence DESC LIMIT 1

-- Update confidence after approval
MATCH (f:Fix { id: $fixId })
SET f.successCount = f.successCount + 1,
    f.confidence = toFloat(f.successCount) / toFloat(f.appliedCount),
    f.updatedAt = datetime()

-- Get all patterns grouped by failure type
MATCH (p:FailurePattern)
RETURN p.failureType AS type, count(p) AS patterns
ORDER BY patterns DESC
```

---

## 8. Configuration Reference

### infraflow-healing-engine application.properties

| Property | Default | Description |
|----------|---------|-------------|
| `healing.confidence-threshold` | `0.75` | Minimum LLM confidence for PENDING_APPROVAL; below this escalates to human review |
| `healing.auto-apply` | `false` | If `true`, skip human approval step |
| `healing.demo-mode` | `false` | Return mock fixes; disables real Claude API calls |
| `healing.max-retries` | `3` | Maximum re-code attempts per failure |
| `healing.fix-branch-prefix` | `auto-fix/` | Prefix for fix branches created in GitHub |
| `kb.enabled` | `true` | Enable Knowledge Base fast-path lookups |
| `kb.min-confidence` | `0.70` | Minimum KB fix confidence to apply |
| `kb.min-success-count` | `2` | Minimum successful applications before trusting a fix |

### infraflow-event-normalizer application.properties

| Property | Default | Description |
|----------|---------|-------------|
| `webhook.secret` | — | HMAC secret for GitHub signature validation |
| `kafka.topic.pipeline-raw` | `pipeline.events.raw` | Output Kafka topic |

### infraflow-dashboard-backend application.properties

| Property | Default | Description |
|----------|---------|-------------|
| `kafka.topic.pipeline-healed` | `pipeline.events.healed` | Input Kafka topic |
| `websocket.allowed-origins` | `http://localhost:3000` | CORS origins for WebSocket |

### infraflow-api-gateway application.properties

| Property | Default | Description |
|----------|---------|-------------|
| `spring.security.oauth2.client.registration.github.client-id` | — | GitHub OAuth App client ID |
| `spring.security.oauth2.client.registration.github.client-secret` | — | GitHub OAuth App client secret |
| `spring.cloud.gateway.routes` | — | Route definitions to downstream services |

---

## 9. Troubleshooting

### OAuth Login Fails

**Symptoms:** Clicking "Sign in with GitHub" shows an error or loops back to login.

**Causes and fixes:**

1. `GITHUB_OAUTH_CLIENT_ID` or `GITHUB_OAUTH_CLIENT_SECRET` not set or incorrect
   - Verify values in the API Gateway environment
   - Check API Gateway logs for `Invalid OAuth credentials`

2. Callback URL mismatch
   - GitHub OAuth App must have exactly: `http://localhost:8080/login/oauth2/code/github`
   - Go to GitHub → Settings → Developer settings → OAuth Apps → your app → verify

3. API Gateway not running
   - Ensure `Started ApiGatewayApplication` in terminal

---

### Webhook Not Received

**Symptoms:** Pushing code produces no activity in the dashboard.

**Causes and fixes:**

1. ngrok not running or URL changed
   - Restart ngrok and update the webhook URL in GitHub repository settings
   - ngrok URLs change on every restart (use a fixed domain with a paid plan)

2. Incorrect payload URL
   - Must be: `https://YOUR_NGROK_URL/api/webhooks/github`
   - Test with GitHub's "Redeliver" button on the webhook page

3. Webhook secret mismatch
   - `WEBHOOK_SECRET` in Event Normalizer must match the secret configured in GitHub
   - Check Event Normalizer logs for `Invalid webhook signature`

4. Event types not selected
   - Webhook must have `workflow_run` and `push` events enabled

---

### LLM / Healing Engine Fails

**Symptoms:** Sessions stuck in `ANALYZING` status; healing engine logs show errors.

**Causes and fixes:**

1. `ANTHROPIC_API_KEY` not set or invalid
   - Check Healing Engine logs for `AuthenticationException` or `401`
   - Enable demo mode for testing: `HEALING_DEMO_MODE=true`

2. Anthropic API rate limit hit
   - Check logs for `429 Too Many Requests`
   - Add retry logic or increase delay between requests

3. Network connectivity issue
   - Healing Engine must reach `https://api.anthropic.com`
   - Test: `curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/models`

---

### Neo4j Connection Refused

**Symptoms:** Healing Engine startup fails; logs show `ServiceUnavailableException` or `Connection refused`.

**Causes and fixes:**

1. Neo4j container not started
   - Run: `docker-compose ps` and verify `infraflow-neo4j` is `Up`
   - Start it: `docker-compose up -d neo4j`

2. Neo4j still initializing
   - Wait 20–30 seconds after container starts
   - Check: `docker-compose logs neo4j | grep Started`

3. Wrong `NEO4J_URI`
   - Local default: `bolt://localhost:7687`
   - Ensure `NEO4J_USERNAME=neo4j` and `NEO4J_PASSWORD=infraflow`

4. Neo4j password not set
   - Check docker-compose.yml for `NEO4J_AUTH=neo4j/infraflow`

---

### Kafka Topic Not Found

**Symptoms:** Services fail to start or log `UnknownTopicOrPartitionException`.

**Causes and fixes:**

1. Kafka auto-creation disabled
   - Kafka in docker-compose.yml should have: `KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`
   - If topics must be pre-created:
     ```bash
     docker-compose exec kafka kafka-topics.sh \
       --create --topic pipeline.events.raw \
       --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
     ```

2. Kafka not ready yet
   - Wait 15–20 seconds after container startup before starting microservices

3. Wrong bootstrap address
   - Default: `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`
   - Inside Docker network the address is `kafka:29092` — only use `localhost:9092` from the host

---

### Sessions Stuck in ANALYZING

**Symptoms:** HealingSession created but never transitions from `ANALYZING`.

**Causes and fixes:**

1. Healing Engine not consuming from Kafka
   - Check Healing Engine logs for Kafka consumer group activity
   - Use Kafka UI at http://localhost:9080 to check consumer group lag on `pipeline.events.raw`

2. Claude API call hanging
   - Check Healing Engine logs for timeout after ~60 seconds
   - Increase timeout or enable `HEALING_DEMO_MODE=true` to bypass

3. GitHub token invalid
   - Healing Engine needs `GITHUB_TOKEN` to read repository files for context
   - Test: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user`

---

### Frontend Shows No Data

**Symptoms:** Dashboard shows loading skeletons indefinitely or "failed to fetch" errors.

**Causes and fixes:**

1. Dashboard Backend not running
   - Verify terminal 5 shows `Started DashboardBackendApplication`

2. API Gateway not routing correctly
   - Test directly: `curl http://localhost:8083/api/dashboard/stats`
   - Test via gateway: `curl http://localhost:8080/api/dashboard/stats`

3. CORS issue
   - Browser console shows CORS errors
   - Check `websocket.allowed-origins` includes `http://localhost:3000`

4. Session cookie not sent
   - User not authenticated — dashboard calls need session cookie
   - Sign in with GitHub and retry

---

## 10. Monitoring

### Service Health Checks

All Spring Boot services expose actuator health endpoints.

| Service | Health URL |
|---------|-----------|
| Eureka Server | http://localhost:8761/actuator/health |
| API Gateway | http://localhost:8080/actuator/health |
| Event Normalizer | http://localhost:8081/actuator/health |
| Healing Engine | http://localhost:8082/actuator/health |
| Dashboard Backend | http://localhost:8083/actuator/health |

Expected response: `{"status":"UP"}`

### Admin UIs

| Tool | URL | Purpose |
|------|-----|---------|
| Eureka Dashboard | http://localhost:8761 | View all registered services and their status |
| Kafka UI | http://localhost:9080 | Browse topics, messages, consumer groups, and lag |
| PgAdmin | http://localhost:5050 | Query PostgreSQL tables directly |
| Neo4j Browser | http://localhost:7474 | Explore the Knowledge Base graph interactively |

### Useful Kafka UI Operations

- **Check consumer lag:** Topics → pipeline.events.raw → Consumer Groups → infraflow-healing-engine
- **Browse messages:** Topics → pipeline.events.raw → Messages (see raw webhook payloads)
- **Replay a message:** Select a message → Produce to topic → Same topic (useful for testing)

### Key PostgreSQL Queries (via PgAdmin or psql)

**Recent healing sessions:**

```sql
SELECT id, repo_full_name, branch, failure_type, status, confidence_score, created_at
FROM healing_sessions
ORDER BY created_at DESC
LIMIT 20;
```

**Pending approvals:**

```sql
SELECT id, repo_full_name, failure_type, confidence_score, created_at
FROM healing_sessions
WHERE status = 'PENDING_APPROVAL'
ORDER BY created_at ASC;
```

**Failure type distribution:**

```sql
SELECT failure_type, COUNT(*) AS total,
       AVG(confidence_score) AS avg_confidence
FROM healing_sessions
GROUP BY failure_type
ORDER BY total DESC;
```

**Recent security findings:**

```sql
SELECT repo_full_name, severity, vulnerability_type, file_path, created_at
FROM security_scan_results
WHERE severity IN ('CRITICAL', 'HIGH')
ORDER BY created_at DESC
LIMIT 20;
```

**Audit log for a specific session:**

```sql
SELECT actor, action, details, created_at
FROM fix_audit_log
WHERE session_id = 42
ORDER BY created_at ASC;
```

### Neo4j Browser Queries

```cypher
-- All failure patterns
MATCH (p:FailurePattern) RETURN p ORDER BY p.hitCount DESC LIMIT 20

-- Patterns with their best fix confidence
MATCH (p:FailurePattern)-[:HAS_FIX]->(f:Fix)
RETURN p.failureType, p.signature, f.confidence, f.successCount
ORDER BY f.confidence DESC LIMIT 20

-- Pattern count by failure type
MATCH (p:FailurePattern)
RETURN p.failureType AS type, count(p) AS patterns
ORDER BY patterns DESC

-- Full graph visualization (small KBs only)
MATCH (p:FailurePattern)-[r:HAS_FIX]->(f:Fix)
RETURN p, r, f LIMIT 50
```

---

## 11. Data Flow Tracing

When something goes wrong, trace the event through the system step by step.

**Step 1 — Was the webhook received?**

```bash
# Check Event Normalizer logs
# Look for: "Received GitHub webhook for repo: owner/repo"
# Or: "Invalid webhook signature" (HMAC mismatch)
docker-compose logs infraflow-event-normalizer 2>&1 | grep -i webhook
```

**Step 2 — Was the event published to Kafka?**

Open Kafka UI → Topics → `pipeline.events.raw` → Messages
Find a message with `repoFullName` matching your repository.

**Step 3 — Did the Healing Engine consume it?**

```bash
# Check Healing Engine logs
# Look for: "Consumed pipeline event for repo: owner/repo"
# Or: "Knowledge Base HIT — applying cached fix"
# Or: "Calling Claude API for failure type: BUILD_COMPILE"
```

**Step 4 — Was the session created in PostgreSQL?**

```sql
SELECT * FROM healing_sessions
WHERE repo_full_name = 'owner/repo'
ORDER BY created_at DESC LIMIT 1;
```

**Step 5 — Was the healed event published?**

Open Kafka UI → Topics → `pipeline.events.healed` → Messages

**Step 6 — Did the Dashboard Backend receive it?**

```bash
# Check Dashboard Backend logs
# Look for: "Forwarding healing event to WebSocket"
```

**Step 7 — Is the dashboard showing it?**

Open http://localhost:3000/healing — the session should appear.
Open browser DevTools → Network → WS — verify WebSocket is connected.

---

## 12. Key Log Messages

### Event Normalizer

| Log Message | Meaning |
|-------------|---------|
| `Received GitHub webhook for repo: %s` | Webhook arrived and HMAC validated |
| `Invalid webhook signature` | HMAC mismatch — check WEBHOOK_SECRET |
| `Published pipeline event to Kafka: %s` | Event successfully forwarded |
| `Ignoring non-failure workflow_run event` | Pipeline succeeded — no healing needed |

### Healing Engine

| Log Message | Meaning |
|-------------|---------|
| `Consumed pipeline event for repo: %s` | Kafka message received |
| `Classified failure type: %s` | Regex classification succeeded |
| `Knowledge Base HIT — confidence: %.2f` | Fast path activated |
| `Knowledge Base MISS — calling Claude API` | LLM path activated |
| `Claude fix generated — confidence: %.2f` | LLM returned a fix |
| `Committed fix to branch: %s` | Fix pushed to GitHub |
| `Session %d approved by user` | Developer clicked Apply |
| `Session %d rejected by user` | Developer clicked Reject |
| `Updated KB confidence for pattern: %s` | Feedback loop completed |

### Dashboard Backend

| Log Message | Meaning |
|-------------|---------|
| `WebSocket client connected` | Dashboard browser connected |
| `Forwarding healing event to WebSocket` | Real-time update sent |
| `Consumed healed event from Kafka` | Event received from Healing Engine |

---

*Last updated: 2026-02-22*
*InfraFlow AI — Autonomous CI/CD Healing Platform*
