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
14. [Troubleshooting](#14-troubleshooting)
15. [Environment Variables](#15-environment-variables)

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

**Without an API key:** The LLM call fails gracefully — the session is saved as `ESCALATED` with the error message. The pipeline event and healing session still appear on the dashboard.

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
curl -X POST http://localhost:8081/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: workflow_run" \
  -d '{
    "action": "completed",
    "workflow_run": {
      "id": 99999,
      "name": "CI Build",
      "head_branch": "main",
      "head_sha": "abc123def456",
      "status": "completed",
      "conclusion": "failure",
      "html_url": "https://github.com/your-org/your-repo/actions/runs/99999",
      "repository": {
        "full_name": "your-org/your-repo",
        "html_url": "https://github.com/your-org/your-repo"
      },
      "head_commit": { "message": "fix: broken build" }
    },
    "repository": {
      "full_name": "your-org/your-repo",
      "html_url": "https://github.com/your-org/your-repo"
    }
  }'
```

**Expected response:** `{"status":"accepted"}`

**What happens next:**
1. Event appears in Pipeline Feed within 1-2 seconds (via WebSocket)
2. Healing Engine classifies the failure and creates a healing session
3. If ANTHROPIC_API_KEY is set — Claude generates a fix with confidence score
4. Session appears in Healing Activity with AI diagnosis and proposed fix
5. Stats cards update on next refresh (every 10 seconds)

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

## 14. Troubleshooting

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

---

## 15. Environment Variables

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

# 6. Simulate a failure
curl -X POST http://localhost:8081/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: workflow_run" \
  -d '{"action":"completed","workflow_run":{"id":1,"name":"CI","head_branch":"main","head_sha":"abc123","status":"completed","conclusion":"failure","html_url":"https://github.com/org/repo/actions/runs/1","repository":{"full_name":"org/repo","html_url":"https://github.com/org/repo"},"head_commit":{"message":"test"}},"repository":{"full_name":"org/repo","html_url":"https://github.com/org/repo"}}'
```
