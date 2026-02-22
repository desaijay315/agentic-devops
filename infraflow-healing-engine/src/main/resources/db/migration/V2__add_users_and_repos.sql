-- =====================================================
-- V2: Add user management, repo monitoring, and
--     re-code support for healing sessions
-- =====================================================

-- Users table (populated from GitHub OAuth2 login)
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    github_id       BIGINT       NOT NULL UNIQUE,
    github_login    VARCHAR(255) NOT NULL UNIQUE,
    display_name    VARCHAR(255),
    avatar_url      VARCHAR(500),
    access_token    VARCHAR(500),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

-- Monitored repos (user selects which repos to track)
CREATE TABLE monitored_repos (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repo_full_name  VARCHAR(500) NOT NULL,
    repo_url        VARCHAR(500) NOT NULL,
    default_branch  VARCHAR(255) DEFAULT 'main',
    webhook_active  BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, repo_full_name)
);

-- Link pipeline events to users
ALTER TABLE pipeline_events ADD COLUMN user_id BIGINT REFERENCES users(id);

-- Re-code support: track fix attempts and developer feedback
ALTER TABLE healing_sessions ADD COLUMN attempt_number INT NOT NULL DEFAULT 1;
ALTER TABLE healing_sessions ADD COLUMN parent_session_id BIGINT REFERENCES healing_sessions(id);
ALTER TABLE healing_sessions ADD COLUMN user_feedback TEXT;

-- Indexes
CREATE INDEX idx_users_github_id ON users(github_id);
CREATE INDEX idx_users_github_login ON users(github_login);
CREATE INDEX idx_monitored_repos_user ON monitored_repos(user_id);
CREATE INDEX idx_monitored_repos_name ON monitored_repos(repo_full_name);
CREATE INDEX idx_pipeline_events_user ON pipeline_events(user_id);
CREATE INDEX idx_healing_sessions_parent ON healing_sessions(parent_session_id);
