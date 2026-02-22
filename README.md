# InfraFlow AI — Autonomous CI/CD Healing Agent

An intelligent DevOps platform that **automatically detects, diagnoses, and fixes** CI/CD pipeline failures using AI. When your GitHub Actions pipeline fails, InfraFlow classifies the failure, generates a fix using Claude, and pushes it — all while showing everything on a real-time dashboard.

## Architecture

```
GitHub Actions (webhook) → API Gateway → Event Normalizer → Kafka
                                                              ↓
          Next.js Dashboard ← WebSocket ← Dashboard Backend   ↓
                                                         Healing Engine
                                                           ↓       ↓
                                                     Classifier   Claude API
                                                           ↓
                                                     Fix Executor → GitHub API
                                                     (branch + commit + retry)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Java 17, Spring Boot 3.3, Spring Cloud |
| Service Discovery | Netflix Eureka |
| API Gateway | Spring Cloud Gateway |
| Messaging | Apache Kafka |
| Database | PostgreSQL + Flyway |
| AI/LLM | Anthropic Claude API |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Real-time | WebSocket (STOMP over SockJS) |
| Infrastructure | Docker Compose |

## Microservices

| Service | Port | Purpose |
|---------|------|---------|
| `infraflow-eureka-server` | 8761 | Service registry |
| `infraflow-api-gateway` | 8080 | Routing, CORS, webhook entry point |
| `infraflow-event-normalizer` | 8081 | GitHub webhook → unified PipelineEvent → Kafka |
| `infraflow-healing-engine` | 8082 | Failure classifier + LLM fix generation + GitHub fix executor |
| `infraflow-dashboard-backend` | 8083 | REST API + WebSocket push to frontend |
| `infraflow-dashboard-ui` | 3000 | Next.js real-time dashboard |

## Quick Start

### Prerequisites

- Java 17+
- Maven 3.9+
- Node.js 18+
- Docker & Docker Compose

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts: Kafka, Zookeeper, PostgreSQL, Redis, Kafka UI (port 9080), PgAdmin (port 5050).

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys:
#   GITHUB_TOKEN — GitHub Personal Access Token
#   ANTHROPIC_API_KEY — Claude API key
#   GITHUB_WEBHOOK_SECRET — secret for webhook verification
```

### 3. Build & Run Backend

```bash
# Build all modules
mvn clean install -DskipTests

# Start services (in order)
cd infraflow-eureka-server && mvn spring-boot:run &
cd infraflow-api-gateway && mvn spring-boot:run &
cd infraflow-event-normalizer && mvn spring-boot:run &
cd infraflow-healing-engine && mvn spring-boot:run &
cd infraflow-dashboard-backend && mvn spring-boot:run &
```

### 4. Start Frontend

```bash
cd infraflow-dashboard-ui
npm install
npm run dev
```

Open http://localhost:3000 to see the dashboard.

### 5. Connect GitHub Webhook

Use [ngrok](https://ngrok.com) to expose your local API Gateway:

```bash
ngrok http 8080
```

Then add a webhook in your GitHub repo settings:
- **URL**: `https://your-ngrok-url/api/webhooks/github`
- **Content type**: `application/json`
- **Events**: Workflow runs

## How It Works

1. **Push code** to your GitHub repo
2. **GitHub Actions** pipeline runs → if it **fails**, a webhook fires
3. **Event Normalizer** converts the GitHub payload into a unified `PipelineEvent`
4. **Healing Engine** consumes the event from Kafka:
   - **Classifies** the failure (BUILD_COMPILE, TEST_FAILURE, DEPENDENCY_CONFLICT, INFRASTRUCTURE, DOCKER_FAILURE)
   - **Generates a fix** using Claude with failure-type-specific prompts
   - If confidence >= 0.75 → **applies the fix** (creates branch, commits, retries pipeline)
   - If confidence < 0.75 → **escalates** for human review
5. **Dashboard** shows everything in real-time via WebSocket

## Failure Types Supported

| Type | Examples |
|------|----------|
| `BUILD_COMPILE` | Compilation errors, missing symbols, incompatible types |
| `TEST_FAILURE` | JUnit/TestNG assertion failures, test errors |
| `DEPENDENCY_CONFLICT` | Version conflicts, missing artifacts, unresolvable dependencies |
| `INFRASTRUCTURE` | OOM, timeouts, network failures, disk full |
| `DOCKER_FAILURE` | Dockerfile build errors, image pull failures, health check failures |

## Project Structure

```
infraflow/
├── pom.xml                          # Parent POM
├── docker-compose.yml               # Kafka + Postgres + Redis + tools
├── .env.example                     # Environment variables template
├── infraflow-common/                # Shared models, DTOs, enums
├── infraflow-eureka-server/         # Service discovery
├── infraflow-api-gateway/           # API routing + webhook receiver
├── infraflow-event-normalizer/      # GitHub → Kafka normalizer
├── infraflow-healing-engine/        # AI healing brain
│   ├── classifier/                  #   Rule-based failure classifier
│   ├── prompt/                      #   LLM prompt router (5 failure types)
│   ├── service/                     #   Healing orchestration + fix executor
│   └── db/migration/                #   Flyway SQL migrations
├── infraflow-dashboard-backend/     # REST + WebSocket server
└── infraflow-dashboard-ui/          # Next.js 14 dashboard
```

## License

MIT
