# InfraFlow AI — Complete Runbook

> Step-by-step guide to run, test, and understand every component of the Autonomous CI/CD Healing Agent.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Architecture Overview](#2-architecture-overview)
3. [Step 1: Start Infrastructure (Docker)](#3-step-1-start-infrastructure)
4. [Step 2: Start Eureka Server](#4-step-2-start-eureka-server)
5. [Step 3: Start API Gateway](#5-step-3-start-api-gateway)
6. [Step 4: Start Event Normalizer](#6-step-4-start-event-normalizer)
7. [Step 5: Start Healing Engine](#7-step-5-start-healing-engine)
8. [Step 6: Start Dashboard Backend](#8-step-6-start-dashboard-backend)
9. [Step 7: Start Frontend](#9-step-7-start-frontend)
10. [Step 8: Trigger a Pipeline Failure](#10-step-8-trigger-a-pipeline-failure)
11. [Step 9: Connect Real GitHub Webhooks](#11-step-9-connect-real-github-webhooks)
12. [API Reference](#12-api-reference)
13. [Admin UIs](#13-admin-uis)
14. [**Production Operations — Where to Look & How to Resolve**](#14-production-operations--where-to-look--how-to-resolve)
    - [14.1 Data Flow Tracing](#141-data-flow-tracing--how-a-webhook-becomes-a-healing-session)
    - [14.2 Key Database Queries](#142-key-database-queries-via-pgadmin-or-psql)
    - [14.3 Service Health Checks](#143-service-health-checks)
    - [14.4 Common Production Issues & Resolution](#144-common-production-issues--resolution)
    - [14.5 Log Locations](#145-log-locations)
    - [14.6 Key Log Messages to Search For](#146-key-log-messages-to-search-for)
15. [Troubleshooting (Quick Reference)](#15-troubleshooting)
16. [Environment Variables](#16-environment-variables)

---

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Java (JDK) | 17+ | All backend microservices |
| Maven | 3.9+ | Build tool |
| Node.js | 18+ | Next.js frontend |
| Docker Desktop | Latest | PostgreSQL, Kafka, Redis |
| Git | Latest | Version control |

**Optional (for full AI healing):**
| Tool | Purpose |
|------|---------|
| Anthropic API Key | Claude AI generates fixes ([Get it here](https://console.anthropic.com/settings/keys)) |
| GitHub Personal Access Token | Push fixes to repos ([Create one here](https://github.com/settings/tokens)) |
| ngrok | Expose localhost to receive real GitHub webhooks |

---

## 2. Architecture Overview

```
GitHub Actions (failure)
    |
    v  (webhook POST)
[Event Normalizer :8081]  -- Parses GitHub webhook JSON, validates HMAC signature,
    |                         maps to internal PipelineEvent format
    v  (Kafka: pipeline.events.raw)
[Healing Engine :8082]    -- Consumes event, classifies failure type using regex,
    |                         calls Claude API for fix generation, decides:
    |                         confidence >= 0.75 -> auto-apply or pending approval
    |                         confidence <  0.75 -> escalate to human
    v  (Kafka: pipeline.events.healed)
[Dashboard Backend :8083] -- Consumes healing events, forwards to WebSocket,
    |                         serves REST APIs for stats/sessions/events
    v  (WebSocket STOMP)
[Next.js Frontend :3000]  -- Real-time dashboard with live updates
```

**Service Discovery:**
```
All services register with Eureka Server (:8761)
API Gateway (:8080) routes requests using Eureka discovery
```

---

## 3. Step 1: Start Infrastructure

**What this does:** Starts PostgreSQL (database), Kafka (event streaming), Redis (caching), Zookeeper (Kafka coordination), Kafka UI (admin), and PgAdmin (DB admin).

```bash
cd infraflow
docker compose up -d
```

**Verify everything is running:**
```bash
docker compose ps
```

You should see 6 containers all with status "Up":
- `infraflow-postgres` — Stores pipeline events, healing sessions, audit logs
- `infraflow-kafka` — Message broker for event streaming between services
- `infraflow-zookeeper` — Kafka's distributed coordination service
- `infraflow-redis` — Cache layer (used for future features)
- `infraflow-kafka-ui` — Web UI to inspect Kafka topics and messages
- `infraflow-pgadmin` — Web UI to inspect PostgreSQL tables

**Wait for PostgreSQL to be ready:**
```bash
docker exec infraflow-postgres pg_isready -U infraflow
# Expected: /var/run/postgresql:5432 - accepting connections
```

**Why Kafka?** Services communicate asynchronously through Kafka topics. When the normalizer receives a webhook, it publishes to `pipeline.events.raw`. The healing engine consumes from this topic. This decouples the services — if the healing engine is down, events queue in Kafka and get processed when it comes back up.

---

## 4. Step 2: Start Eureka Server

**What this does:** Starts the Netflix Eureka service discovery server. All microservices register themselves here, and the API Gateway uses Eureka to find service locations dynamically.

```bash
cd infraflow-eureka-server
mvn spring-boot:run
```

**Verify:** Open http://localhost:8761 — you should see the Eureka dashboard. As you start each service, it will appear in the "Instances currently registered" table.

**Why Eureka?** Without service discovery, the API Gateway would need hardcoded service URLs. With Eureka, services register on startup and the gateway discovers them automatically. If a service restarts on a different port, Eureka handles it.

---

## 5. Step 3: Start API Gateway

**What this does:** Starts the Spring Cloud Gateway on port 8080. It acts as a single entry point — the frontend only talks to `:8080`, and the gateway routes requests to the correct backend service.

```bash
cd infraflow-api-gateway
mvn spring-boot:run
```

**Routing rules:**
| Request Path | Routes To |
|---|---|
| `/api/webhooks/**` | Event Normalizer (:8081) |
| `/api/healing/**` | Healing Engine (:8082) |
| `/api/dashboard/**` | Dashboard Backend (:8083) |

**Why a Gateway?** CORS is configured here (allows `localhost:3000`). Rate limiting, authentication, and logging can be added in one place instead of every service.

---

## 6. Step 4: Start Event Normalizer

**What this does:** Starts the webhook receiver on port 8081. It listens for GitHub webhook POST requests, validates the HMAC-SHA256 signature (if configured), parses the JSON payload, maps it to a normalized `PipelineEvent`, and publishes to Kafka.

```bash
cd infraflow-event-normalizer
mvn spring-boot:run
```

**What happens when a webhook arrives:**
1. `WebhookController` receives POST at `/api/webhooks/github`
2. Checks `X-GitHub-Event` header — only processes `workflow_run` and `check_run`
3. `GitHubNormalizerService` parses the JSON:
   - Extracts: repo name, branch, commit SHA, workflow name, status, conclusion
   - Maps GitHub's `conclusion` to internal `PipelineStatus` enum (SUCCESS, FAILED, RUNNING, QUEUED)
4. Publishes normalized event to Kafka topic `pipeline.events.raw`
5. Returns `{"status": "accepted"}` to GitHub

**Why normalize?** GitHub sends complex nested JSON. The normalizer flattens it into a clean event format that the rest of the system understands. This also makes it easy to add GitLab, Bitbucket, or Jenkins normalizers later.

---

## 7. Step 5: Start Healing Engine

**What this does:** The core of InfraFlow AI. Consumes pipeline failure events from Kafka, classifies the failure type, calls Claude AI to generate a fix, and decides whether to auto-apply, require approval, or escalate.

```bash
# Optional: Set API keys for full AI healing
# Windows:
set ANTHROPIC_API_KEY=sk-ant-your-key-here
set GITHUB_TOKEN=ghp_your-token-here

# Mac/Linux:
export ANTHROPIC_API_KEY=sk-ant-your-key-here
export GITHUB_TOKEN=ghp_your-token-here

cd infraflow-healing-engine
mvn spring-boot:run
```

**What happens when a FAILED event arrives from Kafka:**

1. **`PipelineEventConsumer`** picks up the event from Kafka topic `pipeline.events.raw`
2. Checks if status is `FAILED` — non-failure events are skipped
3. Calls `HealingService.initiateHealing()`:

   **Step A — Persist:** Saves the `PipelineEvent` to PostgreSQL (separate transaction so it's never lost)

   **Step B — Classify:** `FailureClassifier` uses weighted regex patterns to categorize into one of:
   | Failure Type | Example Patterns |
   |---|---|
   | `BUILD_COMPILE` | "compilation failed", "cannot find symbol", "syntax error" |
   | `TEST_FAILURE` | "test failed", "assertion error", "expected.*but was" |
   | `DEPENDENCY_CONFLICT` | "could not resolve", "version conflict", "incompatible" |
   | `INFRASTRUCTURE` | "connection refused", "timeout", "out of memory" |
   | `DOCKER_FAILURE` | "docker build failed", "image not found", "dockerfile error" |
   | `UNKNOWN` | No patterns matched |

   **Step C — Create Session:** Creates a `HealingSession` in DB with status `ANALYZING`

   **Step D — Call Claude AI:** `HealingPromptRouter` selects a failure-type-specific prompt. `ClaudeHealingAdapter` calls the Anthropic API with:
   - System prompt (role: CI/CD healing expert, JSON-only output)
   - User prompt (failure type, build logs, context)
   - Claude returns: `failureSummary`, `rootCause`, `fixExplanation`, `fileChanges`, `confidenceScore`

   **Step E — Decide:**
   - Confidence >= 0.75 AND auto-apply enabled → Create branch, commit fix, retrigger pipeline
   - Confidence >= 0.75 AND auto-apply disabled → Set status `PENDING_APPROVAL` (user decides on dashboard)
   - Confidence < 0.75 OR fix type is `ESCALATE` → Set status `ESCALATED` (needs human)

   **Step F — Publish:** Sends healing event to Kafka topic `pipeline.events.healed` for dashboard

**Without an API key (or no credits):** The healing engine has a built-in **smart analysis fallback** that uses regex-based log analysis to produce realistic AI-quality fix recommendations. This kicks in automatically when:
- No API key is configured
- The API key has no credits
- The Anthropic API is unreachable

**Demo Mode:** You can also force the smart analysis by setting `HEALING_DEMO_MODE=true`:
```bash
# Windows:
set HEALING_DEMO_MODE=true
# Mac/Linux:
export HEALING_DEMO_MODE=true
```
Demo mode analyzes build logs using pattern matching and produces categorized responses with confidence scores, just like the real Claude API would. Perfect for hackathon demos and development.

**Flyway migrations:** On first startup, Flyway runs `V1__init_schema.sql` which creates 3 tables:
- `pipeline_events` — Every webhook event received
- `healing_sessions` — Every healing attempt (linked to pipeline event)
- `fix_audit_log` — Audit trail of every action taken

---

## 8. Step 6: Start Dashboard Backend

**What this does:** Serves REST APIs for the frontend and forwards real-time events via WebSocket.

```bash
cd infraflow-dashboard-backend
mvn spring-boot:run
```

**Two communication channels:**

1. **REST APIs** — Frontend polls these for initial data load and stats refresh
   - `GET /api/dashboard/stats` — Aggregate counts (total pipelines, failed, healed, MTTR)
   - `GET /api/dashboard/pipeline-events` — Recent 20 pipeline events
   - `GET /api/dashboard/healing-sessions` — Recent 20 healing sessions

2. **WebSocket (STOMP over SockJS)** — Real-time push for live updates
   - `DashboardEventConsumer` listens to Kafka topics
   - When a new event arrives, it forwards to WebSocket:
     - `/topic/pipeline-events` — New pipeline events
     - `/topic/healing-events` — Healing session updates
   - Frontend subscribes to these topics and updates the UI instantly

**Why both REST and WebSocket?** REST loads historical data on page load. WebSocket pushes new events in real-time without polling.

---

## 9. Step 7: Start Frontend

**What this does:** Starts the Next.js 14 dashboard on port 3000 with live updates.

```bash
cd infraflow-dashboard-ui
npm install    # First time only
npm run dev
```

**Open:** http://localhost:3000

**Dashboard features:**
- **Stats Cards** — Total pipelines, failed, healed by AI, pending approval, avg MTTR
- **Pipeline Feed** — Live stream of webhook events with repo, branch, commit, status badges
- **Healing Activity** — AI diagnosis, proposed fix, confidence score, approve/reject buttons
- **Connection Indicator** — Shows "Live" (green) when WebSocket is connected
- **Theme Toggle** — Dark/light mode switcher (sun/moon icon in nav)
- **Skeleton Loading** — Amazon-style shimmer placeholders while data loads

---

## 10. Step 8: Trigger a Pipeline Failure

**Simulate a webhook** (no real GitHub needed):

```bash
# Compilation failure example
curl -X POST http://localhost:8080/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: workflow_run" \
  -d '{
    "action": "completed",
    "workflow_run": {
      "id": 99999,
      "name": "CI Build & Test",
      "status": "completed",
      "conclusion": "failure",
      "head_branch": "feature/user-auth",
      "head_sha": "abc123def456",
      "created_at": "2026-01-01T10:00:00Z",
      "updated_at": "2026-01-01T10:05:00Z",
      "repository": {
        "full_name": "your-org/your-repo",
        "html_url": "https://github.com/your-org/your-repo"
      }
    },
    "repository": {
      "full_name": "your-org/your-repo",
      "html_url": "https://github.com/your-org/your-repo"
    },
    "rawLogs": "[ERROR] COMPILATION ERROR\n[ERROR] /src/main/java/com/example/UserService.java:[45,32] error: cannot find symbol\n  symbol:   method getUserById(Long id)\n  location: class UserRepository\n[ERROR] /src/main/java/com/example/UserController.java:[28,15] error: incompatible types: Optional<User> cannot be converted to User\n[INFO] BUILD FAILURE"
  }'
```

> **Important:** The `workflow_run` object MUST include `"status": "completed"` — without it, the normalizer maps the event as `QUEUED` and the healing engine skips it. The `rawLogs` field contains the CI build output for AI analysis.

**Expected response:** `{"status":"accepted"}`

**What happens next:**
1. Event Normalizer parses the webhook, extracts rawLogs, publishes to Kafka
2. Healing Engine consumes event, classifies as `BUILD_COMPILE`
3. Claude AI (or demo fallback) generates a fix plan with confidence score
4. Event appears in Pipeline Feed within 1-2 seconds (via WebSocket)
5. Session appears in Healing Activity with AI diagnosis and proposed fix
6. Stats cards update on next refresh (every 10 seconds)

**More simulated failure types:**

```bash
# Test failure
curl -X POST http://localhost:8080/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: workflow_run" \
  -d '{"action":"completed","workflow_run":{"id":100,"name":"Tests","status":"completed","conclusion":"failure","head_branch":"develop","head_sha":"def456","created_at":"2026-01-01T10:00:00Z","updated_at":"2026-01-01T10:05:00Z","repository":{"full_name":"org/payment-svc","html_url":"https://github.com/org/payment-svc"}},"repository":{"full_name":"org/payment-svc","html_url":"https://github.com/org/payment-svc"},"rawLogs":"[ERROR] Tests run: 15, Failures: 3, Errors: 1, Skipped: 0\n[INFO] BUILD FAILURE"}'

# Docker build failure
curl -X POST http://localhost:8080/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: workflow_run" \
  -d '{"action":"completed","workflow_run":{"id":200,"name":"Docker Build","status":"completed","conclusion":"failure","head_branch":"release/v2","head_sha":"789abc","created_at":"2026-01-01T10:00:00Z","updated_at":"2026-01-01T10:05:00Z","repository":{"full_name":"org/api-gw","html_url":"https://github.com/org/api-gw"}},"repository":{"full_name":"org/api-gw","html_url":"https://github.com/org/api-gw"},"rawLogs":"COPY failed: no source files were specified\nDockerfile error at line 5"}'
```

---

## 11. Step 9: Connect Real GitHub Webhooks

To receive real pipeline failures from GitHub Actions:

**A. Expose localhost with ngrok:**
```bash
ngrok http 8080
# Gives you: https://abc123.ngrok-free.app
```

**B. Add webhook in GitHub:**
1. Go to your repo → Settings → Webhooks → Add webhook
2. **Payload URL:** `https://abc123.ngrok-free.app/api/webhooks/github`
3. **Content type:** `application/json`
4. **Secret:** (optional, set `GITHUB_WEBHOOK_SECRET` env var to match)
5. **Events:** Select "Workflow runs" and "Check runs"
6. Click "Add webhook"

**C. Break something and push:**
```java
// Main.java — deliberately broken
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello"  // missing closing paren
    }
}
```

Push this to your repo → GitHub Actions fails → Webhook fires → InfraFlow catches it → Dashboard shows the failure and AI-generated fix.

---

## 12. API Reference

### Event Normalizer (port 8081)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/github` | Receive GitHub webhook |

### Healing Engine (port 8082)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/healing/sessions` | List all healing sessions |
| POST | `/api/healing/sessions/{id}/approve` | Approve and apply a fix |
| POST | `/api/healing/sessions/{id}/reject` | Reject a proposed fix |
| GET | `/api/healing/stats` | Healing statistics |

### Dashboard Backend (port 8083)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Aggregate dashboard stats |
| GET | `/api/dashboard/pipeline-events` | Recent pipeline events |
| GET | `/api/dashboard/healing-sessions` | Recent healing sessions |

### WebSocket
| Protocol | Endpoint | Topics |
|----------|----------|--------|
| STOMP over SockJS | `ws://localhost:8083/ws` | `/topic/pipeline-events`, `/topic/healing-events` |

---

## 13. Admin UIs

| UI | URL | Credentials | Purpose |
|----|-----|-------------|---------|
| Eureka Dashboard | http://localhost:8761 | None | See registered services |
| Kafka UI | http://localhost:9080 | None | Browse topics, messages, consumers |
| PgAdmin | http://localhost:5050 | admin@infraflow.dev / admin123 | Browse PostgreSQL tables |
| InfraFlow Dashboard | http://localhost:3000 | None | Main application dashboard |

**PgAdmin setup:** After login, add server: Host=`host.docker.internal`, Port=`5432`, DB=`infraflow`, User=`infraflow`, Password=`infraflow123`

---

## 14. Production Operations — Where to Look & How to Resolve

### 14.1 Data Flow Tracing — How a Webhook Becomes a Healing Session

When something goes wrong, you need to trace the event through the system. Here's the exact path with **what to check at each step**:

```
WEBHOOK IN ──► NORMALIZER ──► KAFKA ──► HEALING ENGINE ──► DB ──► DASHBOARD ──► WEBSOCKET ──► UI
     1              2            3            4              5          6             7          8
```

**Step 1: Webhook received?**
```bash
# Check normalizer logs — look for "Published pipeline event"
curl http://localhost:8081/actuator/health
# Or check gateway logs if going through :8080
```
If webhook returns non-200: Check normalizer is registered in Eureka (http://localhost:8761).

**Step 2: Normalizer processing?**
| Symptom | Cause | Fix |
|---------|-------|-----|
| Returns 200 but no event in Kafka | Missing `status: "completed"` in webhook payload | Add `"status": "completed"` to `workflow_run` |
| Returns 200 but healing skipped | Status mapped to `QUEUED` not `FAILED` | Ensure `conclusion: "failure"` is in payload |
| Returns 500 | JSON parsing error | Check `workflow_run` node exists in payload |

**Step 3: Event in Kafka?**
```bash
# Open Kafka UI at http://localhost:9080
# Navigate to Topics → pipeline.events.raw → Messages
# You should see the normalized event JSON with repoName, status, rawLogs
```
If topic is empty: Normalizer couldn't publish. Check Kafka is running (`docker compose ps kafka`).

**Step 4: Healing Engine consumed the event?**
```bash
# Check healing engine logs for:
# "Consumed pipeline event: repo=xxx, status=FAILED"
# "FAILED pipeline detected — initiating healing"
# "Persisted pipeline event: id=xxx"
# "Classified failure as: BUILD_COMPILE"
# "Calling Claude API for BUILD_COMPILE failure with model=claude-3-5-sonnet-20241022"
```
| Log Message | Meaning |
|-------------|---------|
| `Consumed ... status=QUEUED` | Webhook missing `status: "completed"` — event is skipped |
| `Consumed ... status=FAILED` + `FAILED pipeline detected` | Working correctly — healing initiated |
| `Classified failure as: UNKNOWN` | Logs don't match any pattern — rawLogs may be empty |
| `Calling Claude API` | API call is being made |
| `Claude API call failed` | API error — check key/credits |
| `Demo mode enabled` | Using regex fallback instead of Claude |

**Step 5: Data persisted in PostgreSQL?**
```bash
# Quick check via API
curl http://localhost:8083/api/dashboard/pipeline-events
curl http://localhost:8083/api/dashboard/healing-sessions

# Or use PgAdmin (http://localhost:5050)
# Connect: host.docker.internal:5432, db=infraflow, user=infraflow, pass=infraflow123
# Key tables:
#   pipeline_events — every webhook event
#   healing_sessions — every healing attempt (linked to pipeline_event)
#   fix_audit_log — every action taken (FAILURE_DETECTED, CLASSIFIED, FIX_GENERATED, etc.)
```

**Step 6-8: Dashboard and WebSocket?**
```bash
# Test REST API directly
curl http://localhost:8083/api/dashboard/stats
# If returns 500: Check PostgreSQL connection, check DashboardService for LazyInitializationException

# Test WebSocket
# Open browser console on localhost:3000 and check for "Connected" in the UI
# If "Disconnected": Dashboard Backend (:8083) is down or not registered in Eureka
```

### 14.2 Key Database Queries (via PgAdmin or psql)

```sql
-- See all pipeline events with status
SELECT id, repo_name, branch, status, failure_type, workflow_name, created_at
FROM pipeline_events ORDER BY created_at DESC LIMIT 20;

-- See healing sessions with AI diagnosis
SELECT hs.id, pe.repo_name, hs.failure_type, hs.status, hs.confidence_score,
       hs.failure_summary, hs.fix_explanation, hs.created_at
FROM healing_sessions hs
JOIN pipeline_events pe ON hs.pipeline_event_id = pe.id
ORDER BY hs.created_at DESC LIMIT 20;

-- See audit trail for a specific session
SELECT action, actor, notes, created_at
FROM fix_audit_log
WHERE healing_session_id = <session_id>
ORDER BY created_at;

-- Count failures by type
SELECT failure_type, COUNT(*) as count
FROM healing_sessions
GROUP BY failure_type ORDER BY count DESC;

-- Average confidence by failure type
SELECT failure_type, AVG(confidence_score) as avg_confidence, COUNT(*) as total
FROM healing_sessions
WHERE confidence_score > 0
GROUP BY failure_type;
```

### 14.3 Service Health Checks

```bash
# Quick health check for all services
curl -s http://localhost:8761/eureka/apps | grep '<app>' # Eureka registered services
curl -s http://localhost:8080/actuator/health            # API Gateway
curl -s http://localhost:8081/actuator/health            # Event Normalizer
curl -s http://localhost:8082/actuator/health            # Healing Engine
curl -s http://localhost:8083/actuator/health            # Dashboard Backend

# Check all ports at once (Windows)
netstat -ano | findstr "8761 8080 8081 8082 8083 3000 5432 9092"

# Docker infrastructure
docker compose ps
docker exec infraflow-postgres pg_isready -U infraflow
docker exec infraflow-kafka kafka-topics --bootstrap-server localhost:9092 --list
```

### 14.4 Common Production Issues & Resolution

| Issue | Where to Look | Resolution |
|-------|---------------|------------|
| **Webhook accepted but no healing** | Normalizer logs, Kafka UI (pipeline.events.raw) | Ensure `status: "completed"` in webhook payload |
| **Healing session stuck on ANALYZING** | Healing engine logs | Claude API call may be hanging — check network/API key |
| **All sessions show ESCALATED with 0% confidence** | `.env` file, Anthropic billing | API key has no credits — use demo mode or add credits |
| **Dashboard returns 500** | Dashboard backend logs | Likely `LazyInitializationException` — ensure `@Transactional(readOnly=true)` on DashboardService |
| **WebSocket disconnects on page nav** | Browser console | Ensure using Next.js `<Link>` not `<a>` tags (avoids full reload) |
| **Kafka UI empty** | `docker compose ps kafka` | Restart with `docker compose up -d kafka kafka-ui --force-recreate` |
| **Events not appearing in real-time** | WebSocket connection indicator | Check Dashboard Backend is consuming from Kafka — look for `DashboardEventConsumer` in logs |
| **Port conflict on startup** | `netstat -ano \| findstr :PORT` | Kill the PID using `taskkill /F /PID <pid>` (Windows) or `kill -9 <pid>` (Mac/Linux) |
| **Flyway migration error** | Healing engine startup logs | DB schema was manually modified — run `DELETE FROM flyway_schema_history WHERE success=false` |
| **Gateway returns 503** | Eureka dashboard (http://localhost:8761) | Target service not registered yet — wait 30s for Eureka sync, or restart service |
| **rawLogs empty / generic analysis** | Kafka UI → check message content | Webhook payload missing `rawLogs` field — add CI build output to webhook body |

### 14.5 Log Locations

| Service | How to View Logs |
|---------|-----------------|
| Event Normalizer | Terminal where `mvn spring-boot:run` was started, or `java -jar` stdout |
| Healing Engine | Terminal stdout — look for `PipelineEventConsumer`, `HealingService`, `ClaudeHealingAdapter` |
| Dashboard Backend | Terminal stdout — look for `DashboardEventConsumer` |
| API Gateway | Terminal stdout — shows routing decisions |
| PostgreSQL | `docker logs infraflow-postgres` |
| Kafka | `docker logs infraflow-kafka` |
| Next.js Frontend | Terminal where `npm run dev` runs, plus browser console (F12) |

### 14.6 Key Log Messages to Search For

```bash
# Healing Engine — successful flow
"Consumed pipeline event"           # Event received from Kafka
"FAILED pipeline detected"          # Healing initiated
"Persisted pipeline event: id="     # Saved to DB
"Classified failure as:"            # Failure type detected
"Calling Claude API"                # LLM call starting
"Demo mode enabled"                 # Using fallback analysis
"Claude API call failed"            # LLM error — check API key/credits

# Dashboard Backend
"Forwarded to WebSocket"            # Event pushed to frontend
"DashboardEventConsumer"            # Kafka consumer processing

# Normalizer
"Published pipeline event"          # Successfully sent to Kafka
"Included * chars of raw logs"      # rawLogs being forwarded
"No workflow_run in payload"        # Invalid webhook format
```

---

## 15. Troubleshooting (Quick Reference)

### "Connection refused" on startup
Services depend on infrastructure. Start order matters:
1. Docker Compose (PostgreSQL, Kafka) must be UP first
2. Eureka Server must be running before other services
3. Wait 10-15 seconds between starting each service

### Port already in use
```bash
# Find what's using the port (Windows)
netstat -ano | findstr :8082

# Kill it
taskkill /F /PID <pid>
```

### Kafka UI shows no brokers
The Docker Compose uses dual listeners (INTERNAL for container-to-container, EXTERNAL for host access). If Kafka UI is empty, restart:
```bash
docker compose up -d kafka kafka-ui --force-recreate
```

### Healing sessions return 500
Check that PostgreSQL is running and accessible:
```bash
docker exec infraflow-postgres pg_isready -U infraflow
```

### Dashboard shows "Disconnected"
The WebSocket connects to `localhost:8083/ws`. Make sure the Dashboard Backend is running:
```bash
curl http://localhost:8083/api/dashboard/stats
```

### LLM returns "401 Unauthorized"
You need to set the Anthropic API key before starting the healing engine:
```bash
set ANTHROPIC_API_KEY=sk-ant-your-key-here   # Windows
export ANTHROPIC_API_KEY=sk-ant-your-key-here  # Mac/Linux
```

Get your API key at: https://console.anthropic.com/settings/keys

### LLM returns "400 Bad Request" / "credit balance too low"
Your Anthropic account needs credits. Go to https://console.anthropic.com/settings/billing to purchase credits. In the meantime, use demo mode:
```bash
set HEALING_DEMO_MODE=true   # Windows
export HEALING_DEMO_MODE=true  # Mac/Linux
```
Demo mode uses smart regex-based log analysis as a fallback — it still produces categorized failures, confidence scores, and fix recommendations.

---

## 16. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (none) | Claude API key for AI fix generation |
| `GITHUB_TOKEN` | (none) | GitHub PAT for creating branches and commits |
| `GITHUB_WEBHOOK_SECRET` | (none) | HMAC secret for webhook signature verification |
| `LLM_PROVIDER` | claude | LLM provider (currently only claude) |
| `POSTGRES_HOST` | localhost | PostgreSQL host |
| `POSTGRES_PORT` | 5432 | PostgreSQL port |
| `POSTGRES_DB` | infraflow | Database name |
| `POSTGRES_USER` | infraflow | Database user |
| `POSTGRES_PASSWORD` | infraflow123 | Database password |
| `KAFKA_BOOTSTRAP_SERVERS` | localhost:9092 | Kafka broker address |
| `HEALING_CONFIDENCE_THRESHOLD` | 0.75 | Minimum confidence to auto-apply/approve |
| `HEALING_AUTO_APPLY` | false | Auto-apply fixes without human approval |
| `HEALING_DEMO_MODE` | false | Use smart log analysis instead of Claude API |
| `ANTHROPIC_MODEL` | claude-3-5-sonnet-20241022 | Claude model to use for fix generation |

---

## Quick Start (TL;DR)

```bash
# 1. Infrastructure
docker compose up -d

# 2. Build all services
mvn clean install

# 3. Start services (each in a separate terminal)
cd infraflow-eureka-server && mvn spring-boot:run
cd infraflow-api-gateway && mvn spring-boot:run
cd infraflow-event-normalizer && mvn spring-boot:run
cd infraflow-healing-engine && mvn spring-boot:run
cd infraflow-dashboard-backend && mvn spring-boot:run

# 4. Start frontend
cd infraflow-dashboard-ui && npm install && npm run dev

# 5. Open dashboard
# http://localhost:3000

# 6. Simulate a compilation failure
curl -X POST http://localhost:8080/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: workflow_run" \
  -d '{"action":"completed","workflow_run":{"id":1,"name":"CI Build","status":"completed","conclusion":"failure","head_branch":"main","head_sha":"abc123","created_at":"2026-01-01T10:00:00Z","updated_at":"2026-01-01T10:05:00Z","repository":{"full_name":"org/repo","html_url":"https://github.com/org/repo"}},"repository":{"full_name":"org/repo","html_url":"https://github.com/org/repo"},"rawLogs":"[ERROR] COMPILATION ERROR\n[ERROR] error: cannot find symbol\n  symbol: method getUserById(Long id)\n  location: class UserRepository\n[INFO] BUILD FAILURE"}'
```
