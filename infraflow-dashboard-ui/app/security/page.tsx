'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchSecurityScans } from '@/lib/api';
import { useWebSocket } from '@/lib/WebSocketProvider';

interface SecurityScan {
  id: number;
  repoName: string;
  branch: string;
  commitSha: string;
  scanProvider: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  vulnerabilityId: string;
  vulnerabilityType: string;
  title: string;
  description: string;
  filePath: string;
  lineNumber: number;
  remediation: string;
  status: 'OPEN' | 'FIXED' | 'IGNORED';
  createdAt: string;
}

const SEVERITY_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  CRITICAL: { label: 'Critical', bg: 'bg-red-900/20', text: 'text-red-400', border: 'border-red-800/50', dot: 'bg-red-500' },
  HIGH:     { label: 'High',     bg: 'bg-orange-900/20', text: 'text-orange-400', border: 'border-orange-800/50', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medium',   bg: 'bg-yellow-900/20', text: 'text-yellow-400', border: 'border-yellow-800/50', dot: 'bg-yellow-500' },
  LOW:      { label: 'Low',      bg: 'bg-blue-900/20', text: 'text-blue-400', border: 'border-blue-800/50', dot: 'bg-blue-500' },
  INFO:     { label: 'Info',     bg: 'bg-gray-800/30', text: 'text-gray-400', border: 'border-gray-700/50', dot: 'bg-gray-500' },
};

const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  OPEN:    { bg: 'bg-red-900/30', text: 'text-red-400' },
  FIXED:   { bg: 'bg-emerald-900/30', text: 'text-emerald-400' },
  IGNORED: { bg: 'bg-gray-700/30', text: 'text-gray-400' },
};

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.INFO;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SummaryBar({ scans }: { scans: SecurityScan[] }) {
  const openScans = scans.filter(s => s.status === 'OPEN');
  const counts = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(sev => ({
    sev,
    count: openScans.filter(s => s.severity === sev).length,
  }));

  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {counts.map(({ sev, count }) => {
        const cfg = SEVERITY_CONFIG[sev];
        return (
          <div key={sev} className={`rounded-xl border p-4 ${count > 0 ? cfg.bg : 'bg-infraflow-card'} ${count > 0 ? cfg.border : 'border-infraflow-border'}`}>
            <p className={`text-xs uppercase tracking-wider font-medium ${count > 0 ? cfg.text : 'text-infraflow-text-muted'}`}>{cfg.label}</p>
            <p className={`text-3xl font-bold mt-1 ${count > 0 ? cfg.text : 'text-infraflow-text-muted'}`}>{count}</p>
          </div>
        );
      })}
    </div>
  );
}

function ScanCard({ scan }: { scan: SecurityScan }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[scan.severity] ?? SEVERITY_CONFIG.INFO;
  const statusCfg = STATUS_CONFIG[scan.status] ?? STATUS_CONFIG.OPEN;

  return (
    <div className={`rounded-xl border p-5 transition-all ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <SeverityBadge severity={scan.severity} />
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.bg} ${statusCfg.text}`}>
              {scan.status}
            </span>
            {scan.vulnerabilityId && (
              <span className="text-xs font-mono text-infraflow-text-muted bg-infraflow-bg px-2 py-0.5 rounded">
                {scan.vulnerabilityId}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-infraflow-text mb-1">{scan.title}</h3>
          {scan.vulnerabilityType && (
            <p className="text-xs text-infraflow-text-muted mb-2">{scan.vulnerabilityType}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-infraflow-text-muted">{scan.repoName}</p>
          <p className="text-xs text-infraflow-text-muted mt-0.5">
            <span className="font-mono">{scan.branch}</span>
          </p>
          {scan.commitSha && (
            <code className="text-xs text-infraflow-accent">{scan.commitSha.slice(0, 7)}</code>
          )}
        </div>
      </div>

      {/* File & Line */}
      {scan.filePath && (
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-3.5 h-3.5 text-infraflow-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <code className="text-xs text-infraflow-text-secondary font-mono">
            {scan.filePath}{scan.lineNumber ? `:${scan.lineNumber}` : ''}
          </code>
        </div>
      )}

      {/* Description */}
      {scan.description && (
        <p className={`text-sm text-infraflow-text-secondary mb-3 ${!expanded ? 'line-clamp-2' : ''}`}>
          {scan.description}
        </p>
      )}

      {/* Remediation */}
      {scan.remediation && expanded && (
        <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Remediation</span>
          </div>
          <p className="text-sm text-emerald-300">{scan.remediation}</p>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-infraflow-accent hover:underline"
      >
        {expanded ? '▲ Show less' : '▼ Show details & remediation'}
      </button>
    </div>
  );
}

function SkeletonScanCard() {
  return (
    <div className="rounded-xl border border-infraflow-border bg-infraflow-card p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-16 bg-infraflow-skeleton rounded-full" />
          <div className="h-5 w-12 bg-infraflow-skeleton-light rounded-full" />
        </div>
        <div className="h-4 w-24 bg-infraflow-skeleton-light rounded" />
      </div>
      <div className="h-4 w-3/4 bg-infraflow-skeleton rounded mb-2" />
      <div className="h-3 w-1/2 bg-infraflow-skeleton-light rounded mb-3" />
      <div className="h-3 w-48 bg-infraflow-skeleton-light rounded" />
    </div>
  );
}

export default function SecurityPage() {
  const { securityEvents } = useWebSocket();
  const [scans, setScans] = useState<SecurityScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterRepo, setFilterRepo] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const loadScans = useCallback(async () => {
    try {
      const data = await fetchSecurityScans();
      setScans(data);
    } catch {
      setScans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadScans(); }, [loadScans]);

  // Merge live WebSocket security events
  const allScans = [...(securityEvents || []), ...scans]
    .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)
    .slice(0, 200);

  // Get unique repos for filter
  const repos = [...new Set(allScans.map(s => s.repoName).filter(Boolean))];

  const filtered = allScans
    .filter(s => filterSeverity === 'ALL' || s.severity === filterSeverity)
    .filter(s => filterStatus === 'ALL' || s.status === filterStatus)
    .filter(s => filterRepo === 'ALL' || s.repoName === filterRepo)
    .filter(s =>
      !search ||
      s.title?.toLowerCase().includes(search.toLowerCase()) ||
      s.repoName?.toLowerCase().includes(search.toLowerCase()) ||
      s.filePath?.toLowerCase().includes(search.toLowerCase()) ||
      s.vulnerabilityId?.toLowerCase().includes(search.toLowerCase())
    );

  const openCritical = allScans.filter(s => s.status === 'OPEN' && s.severity === 'CRITICAL').length;
  const openHigh = allScans.filter(s => s.status === 'OPEN' && s.severity === 'HIGH').length;
  const totalOpen = allScans.filter(s => s.status === 'OPEN').length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-infraflow-text flex items-center gap-2">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Security Vulnerabilities
          </h1>
          <p className="text-sm text-infraflow-text-muted mt-1">
            Automated security scanning across all monitored repositories
          </p>
        </div>
        {openCritical > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-900/20 border border-red-800/50">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-semibold text-red-400">
              {openCritical} Critical {openCritical === 1 ? 'Issue' : 'Issues'} Open
            </span>
          </div>
        )}
      </div>

      {/* Summary */}
      {!loading && <SummaryBar scans={allScans} />}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-xl bg-infraflow-card border border-infraflow-border">
        {/* Severity filter */}
        <div className="flex rounded-lg border border-infraflow-border overflow-hidden text-sm">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(sev => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-3 py-1.5 transition-colors ${
                filterSeverity === sev
                  ? 'bg-infraflow-accent text-white'
                  : 'bg-infraflow-bg text-infraflow-text-secondary hover:bg-infraflow-border'
              }`}
            >
              {sev === 'ALL' ? 'All Severity' : sev}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex rounded-lg border border-infraflow-border overflow-hidden text-sm">
          {['ALL', 'OPEN', 'FIXED', 'IGNORED'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 transition-colors ${
                filterStatus === st
                  ? 'bg-infraflow-accent text-white'
                  : 'bg-infraflow-bg text-infraflow-text-secondary hover:bg-infraflow-border'
              }`}
            >
              {st === 'ALL' ? 'All Status' : st}
            </button>
          ))}
        </div>

        {/* Repo filter */}
        {repos.length > 1 && (
          <select
            value={filterRepo}
            onChange={e => setFilterRepo(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-infraflow-border bg-infraflow-bg text-infraflow-text text-sm focus:outline-none focus:ring-2 focus:ring-infraflow-accent"
          >
            <option value="ALL">All Repos</option>
            {repos.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search vulnerabilities..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-1.5 rounded-lg border border-infraflow-border bg-infraflow-bg text-infraflow-text text-sm focus:outline-none focus:ring-2 focus:ring-infraflow-accent placeholder-infraflow-text-muted"
        />

        <span className="text-xs text-infraflow-text-muted ml-auto">
          {filtered.length} {filtered.length === 1 ? 'issue' : 'issues'}
        </span>
      </div>

      {/* Scan Results */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <SkeletonScanCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-emerald-900/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-infraflow-text mb-2">
            {allScans.length === 0 ? 'No Security Scans Yet' : 'No Issues Found'}
          </h2>
          <p className="text-infraflow-text-muted text-sm max-w-sm mx-auto">
            {allScans.length === 0
              ? 'Security scans run automatically when code is pushed to monitored repositories.'
              : 'No vulnerabilities match your current filters. Try adjusting the severity or status filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(scan => (
            <ScanCard key={scan.id} scan={scan} />
          ))}
        </div>
      )}

      {/* Scanner info footer */}
      {!loading && allScans.length > 0 && (
        <div className="mt-8 p-4 rounded-xl bg-infraflow-card border border-infraflow-border flex items-center gap-3">
          <svg className="w-5 h-5 text-infraflow-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-infraflow-text-muted">
            InfraFlow scans for OWASP Top 10, known CVEs, hardcoded secrets, insecure patterns, and dependency vulnerabilities.
            Scans trigger automatically on each commit push to monitored repositories.
          </p>
        </div>
      )}
    </div>
  );
}
