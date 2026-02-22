'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchKnowledgeBaseStats, fetchKnowledgeBasePatterns } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface KbStats {
  totalPatterns: number;
  totalFixes: number;
  averageConfidence: number;
  topFailureTypes?: { type: string; count: number }[];
  [key: string]: unknown;
}

interface KbPattern {
  id: string | number;
  failureType: string;
  errorSignature: string;
  hitCount: number;
  fixesAvailable: number;
  averageConfidence: number;
  successCount?: number;
  appliedCount?: number;
  bestConfidence?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

type FailureType =
  | 'BUILD_COMPILE'
  | 'TEST_FAILURE'
  | 'DEPENDENCY_CONFLICT'
  | 'INFRASTRUCTURE'
  | 'DOCKER_FAILURE';

const FAILURE_TYPE_META: Record<
  FailureType,
  { label: string; dotClass: string; badgeClass: string; textClass: string }
> = {
  BUILD_COMPILE: {
    label: 'Build / Compile',
    dotClass: 'bg-orange-400',
    badgeClass: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    textClass: 'text-orange-400',
  },
  TEST_FAILURE: {
    label: 'Test Failure',
    dotClass: 'bg-red-400',
    badgeClass: 'bg-red-500/10 border-red-500/30 text-red-400',
    textClass: 'text-red-400',
  },
  DEPENDENCY_CONFLICT: {
    label: 'Dependency Conflict',
    dotClass: 'bg-purple-400',
    badgeClass: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    textClass: 'text-purple-400',
  },
  INFRASTRUCTURE: {
    label: 'Infrastructure',
    dotClass: 'bg-blue-400',
    badgeClass: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    textClass: 'text-blue-400',
  },
  DOCKER_FAILURE: {
    label: 'Docker Failure',
    dotClass: 'bg-cyan-400',
    badgeClass: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
    textClass: 'text-cyan-400',
  },
};

// Static 5-row breakdown table data (shown when API patterns are empty / loading)
const STATIC_BREAKDOWN_ROWS: Array<{
  type: FailureType;
  hitCount: number;
  fixes: number;
  bestConfidence: number;
}> = [
  { type: 'BUILD_COMPILE',       hitCount: 42, fixes: 18, bestConfidence: 87 },
  { type: 'TEST_FAILURE',        hitCount: 31, fixes: 12, bestConfidence: 79 },
  { type: 'DEPENDENCY_CONFLICT', hitCount: 18, fixes: 8,  bestConfidence: 71 },
  { type: 'INFRASTRUCTURE',      hitCount: 7,  fixes: 3,  bestConfidence: 68 },
  { type: 'DOCKER_FAILURE',      hitCount: 4,  fixes: 2,  bestConfidence: 74 },
];

function getFailureMeta(type: string) {
  return (
    FAILURE_TYPE_META[type as FailureType] ?? {
      label: type,
      dotClass: 'bg-infraflow-text-muted',
      badgeClass: 'bg-infraflow-skeleton border-infraflow-border text-infraflow-text-secondary',
      textClass: 'text-infraflow-text-secondary',
    }
  );
}

function confBarColor(pct: number): string {
  if (pct >= 85) return 'bg-emerald-500';
  if (pct >= 70) return 'bg-amber-400';
  return 'bg-red-400';
}

// ── Skeleton helpers ────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`bg-infraflow-skeleton rounded animate-pulse ${className ?? ''}`}
    />
  );
}

// ── Empty State ─────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-infraflow-accent/10 border border-infraflow-accent/20 flex items-center justify-center">
          <svg
            className="w-9 h-9 text-infraflow-accent animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-infraflow-accent opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-infraflow-accent" />
        </span>
      </div>
      <h3 className="text-lg font-semibold text-infraflow-text mb-2">
        Knowledge Base is Empty
      </h3>
      <p className="text-sm text-infraflow-text-muted max-w-sm leading-relaxed">
        Waiting for first pipeline failure. Once a failure occurs, InfraFlow
        extracts its error signature and begins building fix patterns
        automatically.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 text-xs text-infraflow-text-muted">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Listening for pipeline events…
      </div>
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  colorClass: string;
  icon: React.ReactNode;
  loading?: boolean;
}

function StatCard({ label, value, subtext, colorClass, icon, loading }: StatCardProps) {
  return (
    <div className="bg-infraflow-card border border-infraflow-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-infraflow-text-muted uppercase tracking-wider font-medium">
          {label}
        </p>
        <div className={`${colorClass} opacity-80`}>{icon}</div>
      </div>
      {loading ? (
        <SkeletonBlock className="h-8 w-20 mt-1" />
      ) : (
        <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
      )}
      {subtext && !loading && (
        <p className="text-xs text-infraflow-text-muted">{subtext}</p>
      )}
      {loading && subtext && <SkeletonBlock className="h-3 w-24" />}
    </div>
  );
}

// ── Progress bar ────────────────────────────────────────────────────────────────

function ConfidenceBar({
  value,
  colorClass,
}: {
  value: number;
  colorClass: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-infraflow-skeleton rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-infraflow-text-muted shrink-0 w-9 text-right">
        {pct}%
      </span>
    </div>
  );
}

// ── Failure type breakdown ──────────────────────────────────────────────────────

interface BreakdownRow {
  type: string;
  totalPatterns: number;
  fixesAvailable: number;
  bestConfidence: number;
  successCount: number;
  appliedCount: number;
}

function buildBreakdown(patterns: KbPattern[]): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const p of patterns) {
    const existing = map.get(p.failureType);
    if (!existing) {
      map.set(p.failureType, {
        type: p.failureType,
        totalPatterns: 1,
        fixesAvailable: p.fixesAvailable ?? 0,
        bestConfidence: p.bestConfidence ?? p.averageConfidence ?? 0,
        successCount: p.successCount ?? 0,
        appliedCount: p.appliedCount ?? 0,
      });
    } else {
      existing.totalPatterns += 1;
      existing.fixesAvailable += p.fixesAvailable ?? 0;
      existing.bestConfidence = Math.max(
        existing.bestConfidence,
        p.bestConfidence ?? p.averageConfidence ?? 0,
      );
      existing.successCount += p.successCount ?? 0;
      existing.appliedCount += p.appliedCount ?? 0;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalPatterns - a.totalPatterns);
}

function BreakdownTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-infraflow-border">
            {['Type', 'Hit Count', 'Fixes', 'Best Confidence', 'Action'].map((h) => (
              <th
                key={h}
                className="px-4 pb-3 text-left text-xs text-infraflow-text-muted uppercase tracking-wider font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-infraflow-border/50">
              {Array.from({ length: 5 }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <SkeletonBlock className="h-4 w-full max-w-[80px]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BreakdownTableProps {
  rows: BreakdownRow[];
  activeFilter: string | null;
  onFilter: (type: string | null) => void;
  animateBars: boolean;
}

function BreakdownTable({ rows, activeFilter, onFilter, animateBars }: BreakdownTableProps) {
  // Merge static rows with live API rows so we always show all 5 categories.
  // Static rows act as a baseline; live data overrides where available.
  const mergedRows = STATIC_BREAKDOWN_ROWS.map((staticRow) => {
    const live = rows.find((r) => r.type === staticRow.type);
    if (live) {
      return {
        type: live.type,
        hitCount: live.totalPatterns,
        fixes: live.fixesAvailable,
        // bestConfidence from live data is 0-1 float; convert to pct
        bestConfidence: Math.round((live.bestConfidence ?? 0) * 100) || staticRow.bestConfidence,
      };
    }
    return {
      type: staticRow.type,
      hitCount: staticRow.hitCount,
      fixes: staticRow.fixes,
      bestConfidence: staticRow.bestConfidence,
    };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-infraflow-border">
            {['Type', 'Hit Count', 'Fixes', 'Best Confidence', 'Action'].map((h) => (
              <th
                key={h}
                className="px-4 pb-3 text-left text-xs text-infraflow-text-muted uppercase tracking-wider font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mergedRows.map((row) => {
            const meta = getFailureMeta(row.type);
            const isActive = activeFilter === row.type;
            return (
              <tr
                key={row.type}
                className="border-b border-infraflow-border/50 last:border-0 hover:bg-infraflow-skeleton/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${meta.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                    {meta.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-infraflow-text font-semibold">
                  {row.hitCount}
                </td>
                <td className="px-4 py-3 text-infraflow-text-secondary">
                  {row.fixes}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="flex-1 h-1.5 bg-infraflow-skeleton rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${confBarColor(row.bestConfidence)}`}
                        style={{ width: animateBars ? `${row.bestConfidence}%` : '0%' }}
                      />
                    </div>
                    <span className="text-xs text-infraflow-text-muted shrink-0 w-9 text-right font-mono">
                      {row.bestConfidence}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onFilter(isActive ? null : row.type)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      isActive
                        ? 'bg-infraflow-accent text-white border-infraflow-accent'
                        : 'border-infraflow-border text-infraflow-text-secondary hover:border-infraflow-accent/50 hover:text-infraflow-text'
                    }`}
                  >
                    {isActive ? 'Clear' : 'Browse'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Top patterns list (flat rows) ──────────────────────────────────────────────

function PatternRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-infraflow-border last:border-0">
      <SkeletonBlock className="h-4 w-4" />
      <SkeletonBlock className="h-5 w-20 rounded-full" />
      <SkeletonBlock className="h-4 flex-1" />
      <SkeletonBlock className="h-5 w-10 rounded-full" />
      <SkeletonBlock className="h-1.5 w-24 rounded-full" />
      <SkeletonBlock className="h-3 w-8" />
    </div>
  );
}

interface PatternRowProps {
  pattern: KbPattern;
  rank: number;
  animateBars: boolean;
}

function PatternRow({ pattern, rank, animateBars }: PatternRowProps) {
  const meta = getFailureMeta(pattern.failureType);
  const conf = pattern.averageConfidence ?? 0;
  const confPct = Math.round(conf * 100);
  const snippet =
    (pattern.errorSignature ?? '').length > 90
      ? pattern.errorSignature.slice(0, 90) + '…'
      : (pattern.errorSignature ?? '');

  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-infraflow-border last:border-0 hover:bg-infraflow-skeleton/20 transition-colors group">
      <span className="text-xs text-infraflow-text-muted w-5 shrink-0 font-mono text-right">
        {rank}
      </span>
      <span
        className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${meta.badgeClass}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
        {meta.label}
      </span>
      <code className="flex-1 text-xs text-infraflow-text-secondary font-mono truncate group-hover:text-infraflow-text transition-colors">
        {snippet || <span className="italic text-infraflow-text-muted">No signature</span>}
      </code>
      <span className="shrink-0 text-xs bg-infraflow-bg border border-infraflow-border text-infraflow-text-muted px-2 py-0.5 rounded-full font-mono">
        {pattern.hitCount ?? 0}x
      </span>
      <div className="shrink-0 flex items-center gap-2 w-32">
        <div className="flex-1 h-1.5 bg-infraflow-skeleton rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${confBarColor(confPct)}`}
            style={{ width: animateBars ? `${confPct}%` : '0%' }}
          />
        </div>
        <span className="text-xs text-infraflow-text-muted font-mono w-8 text-right">
          {confPct}%
        </span>
      </div>
    </div>
  );
}

// ── How It Works ───────────────────────────────────────────────────────────────

interface HowItWorksCardProps {
  title: string;
  description: string;
  step: number;
  icon: React.ReactNode;
}

function HowItWorksCard({ title, description, step, icon }: HowItWorksCardProps) {
  return (
    <div className="bg-infraflow-card border border-infraflow-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-infraflow-accent/10 border border-infraflow-accent/30 flex items-center justify-center text-infraflow-accent font-bold text-sm">
          {step}
        </div>
        <div className="flex items-center gap-2 text-infraflow-accent">{icon}</div>
      </div>
      <h3 className="text-sm font-semibold text-infraflow-text">{title}</h3>
      <p className="text-xs text-infraflow-text-muted leading-relaxed">{description}</p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const [stats, setStats] = useState<KbStats | null>(null);
  const [patterns, setPatterns] = useState<KbPattern[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingPatterns, setLoadingPatterns] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [animateBars, setAnimateBars] = useState(false);

  const loadStats = useCallback(() => {
    fetchKnowledgeBaseStats()
      .then((data) => {
        setStats(data);
        setLastRefreshed(new Date());
      })
      .catch(console.error)
      .finally(() => setLoadingStats(false));
  }, []);

  const loadPatterns = useCallback(() => {
    fetchKnowledgeBasePatterns(activeFilter ?? undefined)
      .then((data) => {
        setPatterns(Array.isArray(data) ? data : []);
      })
      .catch(console.error)
      .finally(() => setLoadingPatterns(false));
  }, [activeFilter]);

  // Initial load
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Reload patterns when filter changes
  useEffect(() => {
    setLoadingPatterns(true);
    setAnimateBars(false);
    loadPatterns();
  }, [loadPatterns]);

  // Trigger bar animation after patterns load
  useEffect(() => {
    if (!loadingPatterns && !loadingStats) {
      const timer = setTimeout(() => setAnimateBars(true), 100);
      return () => clearTimeout(timer);
    }
  }, [loadingPatterns, loadingStats]);

  // Auto-refresh both stats and patterns every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
      loadPatterns();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadStats, loadPatterns]);

  // Derived values
  const totalPatterns = stats?.totalPatterns ?? 0;
  const totalFixes = stats?.totalFixes ?? 0;
  const avgConf = stats?.averageConfidence ?? 0;
  const patternsWithFixes = patterns.filter((p) => (p.fixesAvailable ?? 0) >= 1).length;
  const fastPathRate =
    totalPatterns > 0 ? Math.round((patternsWithFixes / totalPatterns) * 100) : 0;

  const breakdown = buildBreakdown(patterns);
  const topPatterns = [...patterns]
    .sort((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0))
    .slice(0, 10);

  const isEmpty = !loadingStats && totalPatterns === 0;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-infraflow-accent/10 border border-infraflow-accent/20 flex items-center justify-center shrink-0">
            <svg
              className="w-6 h-6 text-infraflow-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-infraflow-text">Knowledge Base</h1>
              {/* LEARNING animated pill badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                LEARNING
              </span>
            </div>
            <p className="text-sm text-infraflow-text-muted mt-0.5">
              Self-learning fix patterns — grows smarter with every resolved failure
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {lastRefreshed && (
            <span className="text-xs text-infraflow-text-muted hidden sm:block">
              Refreshed{' '}
              {lastRefreshed.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
          <span className="text-xs text-infraflow-text-muted bg-infraflow-card border border-infraflow-border px-3 py-1.5 rounded-lg">
            Auto-refreshes every 30s
          </span>
        </div>
      </div>

      {/* ── Empty State ── */}
      {isEmpty ? (
        <div className="bg-infraflow-card border border-infraflow-border rounded-xl">
          <EmptyState />
        </div>
      ) : (
        <>
          {/* ── Stats Row ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Patterns"
              value={totalPatterns}
              subtext="Unique error signatures tracked"
              colorClass="text-blue-400"
              loading={loadingStats}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              }
            />
            <StatCard
              label="Total Fixes"
              value={totalFixes}
              subtext="Cached solutions in graph"
              colorClass="text-purple-400"
              loading={loadingStats}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              label="Avg Confidence"
              value={loadingStats ? '—' : `${Math.round(avgConf * 100)}%`}
              subtext="Across all stored patterns"
              colorClass="text-emerald-400"
              loading={loadingStats}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              }
            />
            <StatCard
              label="Fast Path Rate"
              value={
                loadingStats || loadingPatterns
                  ? '—'
                  : `${fastPathRate}%`
              }
              subtext="KB hits vs LLM calls"
              colorClass="text-amber-400"
              loading={loadingStats || loadingPatterns}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              }
            />
          </div>

          {/* ── Failure Type Breakdown ── */}
          <section className="mb-6">
            <div className="bg-infraflow-card border border-infraflow-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-infraflow-border flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-infraflow-text">
                    Failure Type Breakdown
                  </h2>
                  <p className="text-xs text-infraflow-text-muted mt-0.5">
                    Click Browse to filter top patterns by failure category
                  </p>
                </div>
                {activeFilter && (
                  <button
                    onClick={() => setActiveFilter(null)}
                    className="text-xs text-infraflow-text-muted hover:text-infraflow-text border border-infraflow-border hover:border-infraflow-accent/40 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    Clear filter
                  </button>
                )}
              </div>
              <div className="p-5">
                {loadingPatterns ? (
                  <BreakdownTableSkeleton />
                ) : (
                  <BreakdownTable
                    rows={breakdown}
                    activeFilter={activeFilter}
                    onFilter={setActiveFilter}
                    animateBars={animateBars}
                  />
                )}
              </div>
            </div>
          </section>

          {/* ── Top Patterns List ── */}
          <section className="mb-6">
            <div className="bg-infraflow-card border border-infraflow-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-infraflow-border flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-infraflow-text">
                    Top Patterns
                    {activeFilter && (
                      <span className="ml-2 text-sm font-normal text-infraflow-text-muted">
                        — filtered:{' '}
                        <span className="text-infraflow-accent">
                          {getFailureMeta(activeFilter).label}
                        </span>
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-infraflow-text-muted mt-0.5">
                    Most frequently matched error signatures
                  </p>
                </div>
                <span className="text-xs text-infraflow-text-muted">
                  Top {Math.min(10, topPatterns.length)} by hit count
                </span>
              </div>
              {loadingPatterns ? (
                <div>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <PatternRowSkeleton key={i} />
                  ))}
                </div>
              ) : topPatterns.length === 0 ? (
                <div className="px-5 py-12 text-center text-infraflow-text-muted text-sm">
                  No patterns found
                  {activeFilter
                    ? ` for ${getFailureMeta(activeFilter).label}`
                    : ''}
                  . Patterns appear automatically after pipeline failures.
                </div>
              ) : (
                <div>
                  {topPatterns.map((pattern, idx) => (
                    <PatternRow
                      key={pattern.id ?? idx}
                      pattern={pattern}
                      rank={idx + 1}
                      animateBars={animateBars}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── How It Works ── */}
          <section>
            <h2 className="text-base font-semibold text-infraflow-text mb-4">
              How It Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <HowItWorksCard
                step={1}
                title="Pattern Detection"
                description="When a pipeline fails, InfraFlow extracts the error signature — a normalized fingerprint of the failure message stripped of run-specific values like line numbers and timestamps."
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
                  </svg>
                }
              />
              <HowItWorksCard
                step={2}
                title="Fast Path Lookup"
                description="Before calling the LLM, the Knowledge Base is checked for known fixes. A high-confidence pattern match applies the cached fix directly — saving API cost and reducing fix latency to milliseconds."
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                }
              />
              <HowItWorksCard
                step={3}
                title="Self-Learning Loop"
                description="Every approved or rejected fix updates the confidence score in the Neo4j graph. Over time the system learns which strategies work best for each failure pattern across all repositories."
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                }
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
