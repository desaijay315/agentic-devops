-- =====================================================
-- V3: Security vulnerability scanning results
-- =====================================================

CREATE TABLE security_scan_results (
    id                  BIGSERIAL PRIMARY KEY,
    pipeline_event_id   BIGINT REFERENCES pipeline_events(id) ON DELETE SET NULL,
    repo_name           VARCHAR(255) NOT NULL,
    branch              VARCHAR(255),
    commit_sha          VARCHAR(64),
    scan_provider       VARCHAR(50)  NOT NULL DEFAULT 'INFRAFLOW',
    severity            VARCHAR(20)  NOT NULL, -- CRITICAL, HIGH, MEDIUM, LOW, INFO
    vulnerability_id    VARCHAR(100),
    vulnerability_type  VARCHAR(100),
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    file_path           VARCHAR(500),
    line_number         INT,
    remediation         TEXT,
    status              VARCHAR(50)  NOT NULL DEFAULT 'OPEN',
    raw_finding         TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_scans_repo ON security_scan_results(repo_name);
CREATE INDEX idx_security_scans_event ON security_scan_results(pipeline_event_id);
CREATE INDEX idx_security_scans_severity ON security_scan_results(severity);
CREATE INDEX idx_security_scans_status ON security_scan_results(status);
CREATE INDEX idx_security_scans_created ON security_scan_results(created_at DESC);
