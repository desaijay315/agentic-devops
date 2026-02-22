'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWebSocket } from '@/lib/WebSocketProvider';
import {
  fetchDashboardStats,
  fetchPipelineEvents,
  fetchHealingSessions,
  fetchBranches,
  fetchSecurityScans,
} from '@/lib/api';
import StatsCards from '@/components/StatsCards';
import PipelineFeed from '@/components/PipelineFeed';
import HealingLog from '@/components/HealingLog';
import BranchTabs from '@/components/BranchTabs';
import CommitTimeline from '@/components/CommitTimeline';

// ── Types ──────────────────────────────────────────────────────────────────

interface SecurityScan {
  id: number;
  repoName: string;
  branch?: string;
  commitSha?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  ruleName?: string;
  description?: string;
  filePath?: string;
  createdAt: string;
}

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface SecuritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildSecuritySummary(scans: SecurityScan[]): SecuritySummary {
  return scans.reduce<SecuritySummary>(
    (acc, s) => {
      const sev = s.severity?.toUpperCase() as Severity;
      if (sev === 'CRITICAL') acc.critical += 1;
      else if (sev === 'HIGH') acc.high += 1;
      else if (sev === 'MEDIUM') acc.medium += 1;
      else if (sev === 'LOW') acc.low += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BackButton() {
  return (
    <Link
      href="/repos"
      className="inline-flex items-center gap-1.5 text-sm text-infraflow-text-secondary hover:text-infraflow-text transition-colors group"
    >
      <svg
        className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      All Repos
    </Link>
  );
}

function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={[
          'w-2 h-2 rounded-full',
          connected ? 'bg-emerald-400 animate-pulse' : 'bg-infraflow-text-muted',
        ].join(' ')}
      />
      <span className={connected ? 'text-emerald-400' : 'text-infraflow-text-muted'}>
        {connected ? 'Live' : 'Disconnected'}
      </span>
    </div>
  );
}

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; dotClass: string; textClass: string; bgClass: string }
> = {
  CRITICAL: {
    label: 'Critical',
    dotClass: 'bg-red-500',
    textClass: 'text-red-400',
    bgClass: 'bg-red-500/10 border-red-500/20',
  },
  HIGH: {
    label: 'High',
    dotClass: 'bg-orange-400',
    textClass: 'text-orange-400',
    bgClass: 'bg-orange-400/10 border-orange-400/20',
  },
  MEDIUM: {
    label: 'Medium',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-400/10 border-amber-400/20',
  },
  LOW: {
    label: 'Low',
    dotClass: 'bg-blue-400',
    textClass: 'text-blue-400',
    bgClass: 'bg-blue-400/10 border-blue-400/20',
  },
};

function SecuritySummarySection({
  scans,
  loading,
}: {
  scans: SecurityScan[];
  loading: boolean;
}) {
  const summary = useMemo(() => buildSecuritySummary(scans), [scans]);
  const total = summary.critical + summary.high + summary.medium + summary.low;

  return (
    <section className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-infraflow-text">
          Security Scan Summary
        </h2>
        {!loading && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-infraflow-bg border border-infraflow-border text-infraflow-text-muted">
            {total} {total === 1 ? 'issue' : 'issues'} found
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]).map((sev) => (
            <div
              key={sev}
              className="bg-infraflow-card border border-infraflow-border rounded-xl p-4 animate-pulse"
            >
              <div className="h-3 w-14 bg-infraflow-skeleton rounded mb-2" />
              <div className="h-8 w-8 bg-infraflow-skeleton rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]).map((sev) => {
            const cfg = SEVERITY_CONFIG[sev];
            const count = summary[sev.toLowerCase() as keyof SecuritySummary];
            return (
              <div
                key={sev}
                className={[
                  'rounded-xl border p-4 transition-opacity',
                  count === 0 ? 'opacity-50' : '',
                  cfg.bgClass,
                ].join(' ')}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                  <span className={`text-xs font-medium uppercase tracking-wider ${cfg.textClass}`}>
                    {cfg.label}
                  </span>
                </div>
                <p className={`text-3xl font-bold tabular-nums ${cfg.textClass}`}>
                  {count}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!loading && total === 0 && (
        <p className="text-sm text-infraflow-text-muted text-center mt-4 py-4">
          No security issues detected for this repository.
        </p>
      )}
    </section>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function RepoPage({
  params,
}: {
  params: { owner: string; repo: string };
}) {
  const repoFullName = `${params.owner}/${params.repo}`;

  const { connected, pipelineEvents: liveEvents, healingEvents: liveHealing } =
    useWebSocket();

  // ── State ────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [scans, setScans] = useState<SecurityScan[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingScans, setLoadingScans] = useState(true);

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingInitial(true);
    Promise.allSettled([
      fetchDashboardStats(repoFullName).then(setStats).catch(() => {}),
      fetchPipelineEvents(repoFullName, undefined).then(setEvents).catch(() => {}),
      fetchHealingSessions(repoFullName).then(setSessions).catch(() => {}),
    ]).finally(() => setLoadingInitial(false));
  }, [repoFullName]);

  // ── Branches load ────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingBranches(true);
    fetchBranches(repoFullName)
      .then((data: string[]) => setBranches(Array.isArray(data) ? data : []))
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }, [repoFullName]);

  // ── Security scans load ──────────────────────────────────────────────────
  useEffect(() => {
    setLoadingScans(true);
    fetchSecurityScans(repoFullName)
      .then((data: SecurityScan[]) => setScans(Array.isArray(data) ? data : []))
      .catch(() => setScans([]))
      .finally(() => setLoadingScans(false));
  }, [repoFullName]);

  // ── Branch change: reload events ─────────────────────────────────────────
  useEffect(() => {
    if (loadingInitial) return;
    setLoadingEvents(true);
    fetchPipelineEvents(repoFullName, selectedBranch ?? undefined)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoadingEvents(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

  // ── Periodic stats refresh ───────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDashboardStats(repoFullName).then(setStats).catch(() => {});
    }, 15_000);
    return () => clearInterval(interval);
  }, [repoFullName]);

  // ── Merge live WebSocket events filtered by repo ─────────────────────────
  const filteredLiveEvents = useMemo(
    () =>
      liveEvents.filter(
        (e) =>
          e.repoName === repoFullName ||
          e.repoName === params.repo,
      ),
    [liveEvents, repoFullName, params.repo],
  );

  const filteredLiveHealing = useMemo(
    () =>
      liveHealing.filter(
        (e) =>
          e.repoName === repoFullName ||
          e.repoName === params.repo,
      ),
    [liveHealing, repoFullName, params.repo],
  );

  const allEvents = useMemo(
    () =>
      [...filteredLiveEvents, ...events]
        .filter((e) =>
          selectedBranch ? e.branch === selectedBranch : true,
        )
        .slice(0, 50),
    [filteredLiveEvents, events, selectedBranch],
  );

  const allSessions = useMemo(
    () => [...filteredLiveHealing, ...sessions].slice(0, 50),
    [filteredLiveHealing, sessions],
  );

  const isEventsLoading = loadingInitial || loadingEvents;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <BackButton />
        <div className="flex items-start justify-between mt-3 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-infraflow-text break-all">
              {repoFullName}
            </h1>
            <p className="text-sm text-infraflow-text-muted mt-1">
              Repository-level CI/CD monitoring and AI healing
            </p>
          </div>
          <LiveIndicator connected={connected} />
        </div>
      </div>

      {/* ── Stats Cards ────────────────────────────────────────────────── */}
      <StatsCards stats={stats} />

      {/* ── Branch Selector ────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-medium text-infraflow-text-secondary uppercase tracking-wider">
            Branches
          </h2>
          {loadingBranches && (
            <span className="text-xs text-infraflow-text-muted">Loading…</span>
          )}
        </div>
        <BranchTabs
          branches={branches}
          selected={selectedBranch}
          onChange={setSelectedBranch}
          loading={loadingBranches}
        />
      </div>

      {/* ── Two-column main grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Pipeline Events Feed */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-infraflow-text">
              Pipeline Events
              {selectedBranch && (
                <span className="ml-2 text-sm font-normal text-infraflow-text-secondary">
                  — {selectedBranch}
                </span>
              )}
            </h2>
            <span className="text-xs text-infraflow-text-muted tabular-nums">
              {isEventsLoading ? '…' : `${allEvents.length} events`}
            </span>
          </div>

          {/* CommitTimeline for compact multi-event view */}
          <div className="bg-infraflow-card border border-infraflow-border rounded-xl p-4 mb-4">
            <h3 className="text-xs text-infraflow-text-muted uppercase tracking-wider mb-3">
              Commit Timeline
            </h3>
            <CommitTimeline events={allEvents} loading={isEventsLoading} />
          </div>

          {/* Full PipelineFeed cards below */}
          <PipelineFeed events={allEvents} loading={isEventsLoading} />
        </div>

        {/* Right: Healing Sessions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-infraflow-text">
              Healing Sessions
            </h2>
            <span className="text-xs text-infraflow-text-muted tabular-nums">
              {loadingInitial ? '…' : `${allSessions.length} sessions`}
            </span>
          </div>
          <HealingLog sessions={allSessions} loading={loadingInitial} />
        </div>
      </div>

      {/* ── Security Scan Summary ───────────────────────────────────────── */}
      <SecuritySummarySection scans={scans} loading={loadingScans} />
    </div>
  );
}
