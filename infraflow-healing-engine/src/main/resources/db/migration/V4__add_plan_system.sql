-- =====================================================
-- V4: Freemium plan system
--     Free tier: 10 heals/month per user
--     Pro tier : unlimited + all features
-- =====================================================

-- Add plan columns to the existing users table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan_type          VARCHAR(20)  NOT NULL DEFAULT 'FREE',
    ADD COLUMN IF NOT EXISTS heal_count_month   INT          NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS heal_limit_month   INT          NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS plan_reset_at      TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('month', NOW()) + INTERVAL '1 month',
    ADD COLUMN IF NOT EXISTS upgraded_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email              VARCHAR(255),
    ADD COLUMN IF NOT EXISTS company            VARCHAR(255);

-- Subscriptions table – tracks upgrade history / future Stripe integration
CREATE TABLE IF NOT EXISTS subscriptions (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type        VARCHAR(20)  NOT NULL,  -- FREE, PRO
    status           VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, CANCELLED, EXPIRED
    stripe_customer  VARCHAR(255),
    stripe_sub_id    VARCHAR(255),
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ,
    cancelled_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plan usage events – audit trail of every heal counted
CREATE TABLE IF NOT EXISTS plan_usage_events (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    healing_session_id BIGINT       REFERENCES healing_sessions(id) ON DELETE SET NULL,
    event_type         VARCHAR(50)  NOT NULL,  -- HEAL_TRIGGERED, LIMIT_REACHED, PLAN_RESET
    plan_type          VARCHAR(20)  NOT NULL,
    heal_count_before  INT          NOT NULL,
    heal_count_after   INT          NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_plan_type       ON users(plan_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user    ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_plan_usage_user       ON plan_usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_usage_created    ON plan_usage_events(created_at DESC);
