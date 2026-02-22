'use client';

import { useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
type ScanStatus = 'OPEN' | 'FIXED' | 'IGNORED';

interface SecurityScan {
  id: number;
  repoName: string;
  branch: string;
  commitSha: string;
  scanProvider: string;
  severity: Severity;
  vulnerabilityId: string;
  vulnerabilityType: string;
  title: string;
  description: string;
  filePath: string;
  lineNumber: number;
  remediation: string;
  status: ScanStatus;
  createdAt: string;
}

interface SecurityScanReportProps {
  scans: SecurityScan[];
  loading?: boolean;
  compact?: boolean;
}

// ── Style maps ────────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<Severity, { pill: string; dot: string; label: string }> = {
  CRITICAL: {
    pill: 'bg-red-500/20 text-red-400 border border-red-500/30',
    dot: 'bg-red-500',
    label: 'Critical',
  },
  HIGH: {
    pill: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    dot: 'bg-orange-500',
    label: 'High',
  },
  MEDIUM: {
    pill: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    dot: 'bg-amber-500',
    label: 'Medium',
  },
  LOW: {
    pill: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    dot: 'bg-blue-500',
    label: 'Low',
  },
  INFO: {
    pill: 'bg-infraflow-skeleton text-infraflow-text-muted border border-infraflow-border',
    dot: 'bg-infraflow-text-muted',
    label: 'Info',
  },
};

const STATUS_STYLES: Record<ScanStatus, string> = {
  OPEN: 'bg-red-500/15 text-red-400 border border-red-500/25',
  FIXED: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  IGNORED: 'bg-infraflow-skeleton text-infraflow-text-muted border border-infraflow-border',
};

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

// ── Small reusable atoms ──────────────────────────────────────────────────────

function SeverityPill({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLES[severity];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function StatusPill({ status }: { status: ScanStatus }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function IconLightbulb() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SummaryRow({ scans }: { scans: SecurityScan[] }) {
  const counts = SEVERITY_ORDER.reduce<Record<Severity, number>>(
    (acc, sev) => {
      acc[sev] = scans.filter((s) => s.severity === sev).length;
      return acc;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
  );

  const badgeStyle: Record<Severity, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
    HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    INFO: 'bg-infraflow-skeleton text-infraflow-text-muted border-infraflow-border',
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {SEVERITY_ORDER.map((sev) => (
        <div
          key={sev}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold ${badgeStyle[sev]}`}
        >
          <span>{counts[sev]}</span>
          <span className="text-xs font-medium opacity-80">{SEVERITY_STYLES[sev].label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-infraflow-border bg-infraflow-bg text-infraflow-text-secondary text-sm">
        <span className="font-semibold">{scans.length}</span>
        <span className="text-xs opacity-80">Total</span>
      </div>
    </div>
  );
}

// ── Skeleton cards ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-infraflow-card border border-infraflow-border rounded-xl p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 bg-infraflow-skeleton rounded-full" />
          <div className="h-4 w-48 bg-infraflow-skeleton rounded" />
        </div>
        <div className="h-5 w-12 bg-infraflow-skeleton-light rounded-full" />
      </div>
      <div className="h-3 w-40 bg-infraflow-skeleton-light rounded mb-3" />
      <div className="space-y-1.5 mb-3">
        <div className="h-3 w-full bg-infraflow-skeleton-light rounded" />
        <div className="h-3 w-4/5 bg-infraflow-skeleton-light rounded" />
      </div>
      <div className="h-8 w-full bg-infraflow-skeleton rounded-lg" />
    </div>
  );
}

// ── Full scan card ────────────────────────────────────────────────────────────

interface ScanCardProps {
  scan: SecurityScan;
}

function ScanCard({ scan }: ScanCardProps) {
  const [descExpanded, setDescExpanded] = useState(false);

  const shortSha = scan.commitSha.slice(0, 7);
  const fileName = scan.filePath.split('/').pop() ?? scan.filePath;

  return (
    <div className="bg-infraflow-card border border-infraflow-border rounded-xl p-4 transition-shadow hover:shadow-lg hover:shadow-black/20">
      {/* ── Top row ── */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <SeverityPill severity={scan.severity} />
          <h3 className="text-sm font-semibold text-infraflow-text leading-tight min-w-0">
            {scan.title}
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={scan.status} />
        </div>
      </div>

      {/* ── Meta row: type + ID ── */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs text-infraflow-text-muted">
          {scan.vulnerabilityType}
        </span>
        <span className="text-infraflow-border">·</span>
        <code className="text-[11px] font-mono text-infraflow-text-muted">
          {scan.vulnerabilityId}
        </code>
        <span className="text-infraflow-border">·</span>
        <span className="text-[11px] text-infraflow-text-muted">
          via {scan.scanProvider}
        </span>
      </div>

      {/* ── File path + line ── */}
      <div className="flex items-center gap-1.5 mb-3">
        <svg className="w-3.5 h-3.5 text-infraflow-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <code className="text-xs font-mono text-infraflow-text-secondary truncate max-w-full">
          <span className="text-infraflow-text-muted">{scan.filePath.replace(fileName, '')}</span>
          <span className="text-infraflow-text">{fileName}</span>
          <span className="text-infraflow-accent">:{scan.lineNumber}</span>
        </code>
      </div>

      {/* ── Description (collapsible) ── */}
      <div className="mb-3">
        <button
          onClick={() => setDescExpanded((p) => !p)}
          className="w-full flex items-start justify-between gap-2 text-left group"
          aria-expanded={descExpanded}
        >
          <p
            className={`text-sm text-infraflow-text-secondary leading-relaxed ${
              descExpanded ? '' : 'line-clamp-3'
            }`}
          >
            {scan.description}
          </p>
          <span className="shrink-0 mt-0.5 text-infraflow-text-muted group-hover:text-infraflow-text transition-colors">
            <IconChevron open={descExpanded} />
          </span>
        </button>
      </div>

      {/* ── Remediation ── */}
      {scan.remediation && (
        <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-lg p-3 mb-3">
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">
              <IconLightbulb />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500 mb-1">
                Remediation
              </p>
              <p className="text-xs text-emerald-300/90 leading-relaxed">{scan.remediation}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer: repo + branch + commit ── */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <span className="text-xs text-infraflow-text-muted">{scan.repoName}</span>
        {scan.branch && (
          <>
            <span className="text-infraflow-border">·</span>
            <code className="text-xs text-purple-400 font-mono">{scan.branch}</code>
          </>
        )}
        <span className="text-infraflow-border">·</span>
        <code className="text-[11px] font-mono text-infraflow-text-muted">{shortSha}</code>
      </div>
    </div>
  );
}

// ── Compact row ───────────────────────────────────────────────────────────────

interface CompactRowProps {
  scan: SecurityScan;
}

function CompactRow({ scan }: CompactRowProps) {
  const fileName = scan.filePath.split('/').pop() ?? scan.filePath;
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-infraflow-bg transition-colors group">
      <SeverityPill severity={scan.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-infraflow-text truncate">{scan.title}</p>
      </div>
      <code className="hidden sm:block text-[11px] font-mono text-infraflow-text-muted shrink-0 max-w-[200px] truncate">
        {fileName}
        <span className="text-infraflow-accent">:{scan.lineNumber}</span>
      </code>
      <StatusPill status={scan.status} />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </div>
      <p className="text-base font-semibold text-infraflow-text mb-1">
        No vulnerabilities detected
      </p>
      <p className="text-sm text-infraflow-text-muted">
        Your code is clean. Security scans found no issues.
      </p>
    </div>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────

function LoadingState({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <div className="space-y-1 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2 px-3">
            <div className="h-5 w-16 bg-infraflow-skeleton rounded-full" />
            <div className="flex-1 h-4 bg-infraflow-skeleton-light rounded" />
            <div className="h-4 w-24 bg-infraflow-skeleton-light rounded hidden sm:block" />
            <div className="h-5 w-12 bg-infraflow-skeleton rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SecurityScanReport({
  scans,
  loading = false,
  compact = false,
}: SecurityScanReportProps) {
  if (loading) {
    return <LoadingState compact={compact} />;
  }

  if (scans.length === 0) {
    return <EmptyState />;
  }

  // Sort: by severity order, then by status (OPEN first)
  const sorted = [...scans].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (sevDiff !== 0) return sevDiff;
    const statusOrder: ScanStatus[] = ['OPEN', 'FIXED', 'IGNORED'];
    return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
  });

  if (compact) {
    return (
      <div className="bg-infraflow-card border border-infraflow-border rounded-xl overflow-hidden">
        <SummaryRow scans={scans} />
        <div className="divide-y divide-infraflow-border/50">
          {sorted.map((scan) => (
            <CompactRow key={scan.id} scan={scan} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SummaryRow scans={scans} />
      <div className="space-y-3">
        {sorted.map((scan) => (
          <ScanCard key={scan.id} scan={scan} />
        ))}
      </div>
    </div>
  );
}
