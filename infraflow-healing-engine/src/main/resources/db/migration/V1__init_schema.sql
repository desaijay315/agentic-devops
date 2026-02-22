-- InfraFlow MVP Schema

CREATE TABLE pipeline_events (
    id              BIGSERIAL PRIMARY KEY,
    repo_url        VARCHAR(500) NOT NULL,
    repo_name       VARCHAR(255),
    branch          VARCHAR(255),
    commit_sha      VARCHAR(64),
    provider        VARCHAR(50)  NOT NULL,
    status          VARCHAR(50)  NOT NULL,
    failure_type    VARCHAR(50),
    raw_logs        TEXT,
    workflow_run_id BIGINT,
    workflow_name   VARCHAR(255),
    triggered_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE healing_sessions (
    id                BIGSERIAL PRIMARY KEY,
    pipeline_event_id BIGINT       NOT NULL REFERENCES pipeline_events(id),
    failure_type      VARCHAR(50)  NOT NULL,
    failure_summary   TEXT,
    root_cause        TEXT,
    fix_type          VARCHAR(50),
    fix_plan_json     TEXT,
    fix_explanation   TEXT,
    confidence_score  DOUBLE PRECISION,
    status            VARCHAR(50)  NOT NULL,
    fix_branch        VARCHAR(255),
    fix_commit_sha    VARCHAR(64),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ
);

CREATE TABLE fix_audit_log (
    id                 BIGSERIAL PRIMARY KEY,
    healing_session_id BIGINT      NOT NULL REFERENCES healing_sessions(id),
    action             VARCHAR(50) NOT NULL,
    actor              VARCHAR(255),
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_pipeline_events_status ON pipeline_events(status);
CREATE INDEX idx_pipeline_events_repo ON pipeline_events(repo_name);
CREATE INDEX idx_pipeline_events_created ON pipeline_events(created_at DESC);
CREATE INDEX idx_healing_sessions_status ON healing_sessions(status);
CREATE INDEX idx_healing_sessions_created ON healing_sessions(created_at DESC);
CREATE INDEX idx_fix_audit_log_session ON fix_audit_log(healing_session_id);
