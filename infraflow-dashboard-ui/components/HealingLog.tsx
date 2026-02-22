'use client';

import { useState, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import DiffView from './DiffView';
import RecodeModal from './RecodeModal';
import {
  approveSession,
  rejectSession,
  regenerateSession,
  fetchFixPlan,
} from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface HealingSession {
  id: number;
  repoName: string;
  failureType: string;
  status: string;
  failureSummary: string;
  fixExplanation: string;
  confidenceScore: number;
  fixBranch: string | null;
  createdAt: string;
}

interface FileChange {
  filePath: string;
  action: string; // MODIFY | CREATE | DELETE
  newContent: string;
  oldContent?: string;
}

interface FixPlan {
  failureSummary: string;
  rootCause: string;
  fixExplanation: string;
  fixType: string;
  confidenceScore: number;
  fileChanges: FileChange[];
}

interface HealingLogProps {
  sessions: HealingSession[];
  loading?: boolean;
  onSessionUpdate?: () => void;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonSession() {
  return (
    <div className="bg-infraflow-card border border-infraflow-border rounded-xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-28 bg-infraflow-skeleton rounded" />
            <div className="h-5 w-20 bg-infraflow-skeleton rounded-full" />
          </div>
          <div className="h-3 w-40 bg-infraflow-skeleton-light rounded mt-2" />
        </div>
        <div className="text-right">
          <div className="h-3 w-16 bg-infraflow-skeleton-light rounded" />
          <div className="h-6 w-10 bg-infraflow-skeleton rounded mt-1" />
        </div>
      </div>
      <div className="bg-infraflow-bg rounded-lg p-3 mb-3">
        <div className="h-3 w-16 bg-infraflow-skeleton-light rounded mb-2" />
        <div className="h-3 w-full bg-infraflow-skeleton-light rounded mb-1" />
        <div className="h-3 w-3/4 bg-infraflow-skeleton-light rounded" />
      </div>
      <div className="flex gap-2 mt-3">
        <div className="h-8 w-24 bg-infraflow-skeleton rounded-lg" />
        <div className="h-8 w-20 bg-infraflow-skeleton rounded-lg" />
      </div>
    </div>
  );
}

// ── Diff panel skeleton ───────────────────────────────────────────────────────

function DiffSkeleton() {
  return (
    <div className="space-y-2 animate-pulse px-1">
      <div className="h-4 w-full bg-infraflow-skeleton-light rounded" />
      <div className="h-4 w-5/6 bg-infraflow-skeleton-light rounded" />
      <div className="h-4 w-4/5 bg-infraflow-skeleton-light rounded" />
    </div>
  );
}

// ── Action button icon helpers ────────────────────────────────────────────────

function IconCheck() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconRecode() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── File action badge ─────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    MODIFY: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    CREATE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  const label: Record<string, string> = { MODIFY: 'MOD', CREATE: 'ADD', DELETE: 'DEL' };
  const cls = styles[action] ?? 'bg-infraflow-skeleton text-infraflow-text-muted border-infraflow-border';
  return (
    <span className={`inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {label[action] ?? action}
    </span>
  );
}

// ── Confidence score display ──────────────────────────────────────────────────

function confidenceColor(score: number): string {
  if (score >= 0.75) return 'text-emerald-400';
  if (score >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

// ── Per-session card ──────────────────────────────────────────────────────────

interface SessionCardProps {
  session: HealingSession;
  onSessionUpdate?: () => void;
}

function SessionCard({ session, onSessionUpdate }: SessionCardProps) {
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [fixPlan, setFixPlan] = useState<FixPlan | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [showRecodeModal, setShowRecodeModal] = useState(false);

  const handleToggleDiff = useCallback(async () => {
    if (showDiff) {
      setShowDiff(false);
      return;
    }
    setShowDiff(true);
    if (fixPlan !== null) return; // already fetched

    setDiffLoading(true);
    setDiffError(null);
    try {
      const plan: FixPlan | null = await fetchFixPlan(session.id);
      setFixPlan(plan ?? { failureSummary: '', rootCause: '', fixExplanation: '', fixType: '', confidenceScore: 0, fileChanges: [] });
      setSelectedFileIdx(0);
    } catch (e) {
      setDiffError(e instanceof Error ? e.message : 'Failed to load fix plan');
    } finally {
      setDiffLoading(false);
    }
  }, [showDiff, fixPlan, session.id]);

  const handleApprove = async () => {
    setActionLoading('approve');
    try {
      await approveSession(session.id);
      onSessionUpdate?.();
    } catch (e) {
      console.error('Approve failed:', e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    setActionLoading('reject');
    try {
      await rejectSession(session.id);
      onSessionUpdate?.();
    } catch (e) {
      console.error('Reject failed:', e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecode = async (feedback: string) => {
    await regenerateSession(session.id, feedback);
    onSessionUpdate?.();
  };

  const fileChanges = fixPlan?.fileChanges ?? [];
  const selectedFile = fileChanges[selectedFileIdx];

  const isPendingApproval = session.status === 'PENDING_APPROVAL';
  const isFixGenerated = session.status === 'FIX_GENERATED';
  const isEscalated = session.status === 'ESCALATED';

  const showApplyReject = isPendingApproval;
  const showApplyOnly = isFixGenerated;
  const showRecode = isPendingApproval || isFixGenerated || isEscalated;

  return (
    <>
      <div className="bg-infraflow-card border border-infraflow-border rounded-xl p-5 transition-shadow hover:shadow-lg hover:shadow-black/20">
        {/* ── Header row ── */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-infraflow-text truncate">
                {session.repoName}
              </span>
              <StatusBadge status={session.status} />
              {session.fixBranch && (
                <code className="text-[11px] text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded font-mono truncate max-w-[180px]">
                  {session.fixBranch}
                </code>
              )}
            </div>
            <span className="text-xs text-infraflow-text-muted mt-1 block">
              {session.failureType?.replace(/_/g, ' ')} — Session #{session.id}
            </span>
          </div>

          {session.confidenceScore != null && (
            <div className="text-right ml-4 shrink-0">
              <span className="text-[10px] text-infraflow-text-muted uppercase tracking-wide">
                Confidence
              </span>
              <p className={`text-xl font-bold leading-tight ${confidenceColor(session.confidenceScore)}`}>
                {(session.confidenceScore * 100).toFixed(0)}%
              </p>
            </div>
          )}
        </div>

        {/* ── AI Diagnosis ── */}
        {session.failureSummary && (
          <div className="bg-infraflow-bg rounded-lg p-3 mb-2">
            <p className="text-[10px] text-infraflow-text-muted uppercase tracking-wider mb-1 font-semibold">
              AI Diagnosis
            </p>
            <p className="text-sm text-infraflow-text-secondary leading-relaxed">
              {session.failureSummary}
            </p>
          </div>
        )}

        {/* ── Proposed Fix ── */}
        {session.fixExplanation && (
          <div className="bg-infraflow-bg rounded-lg p-3 mb-3">
            <p className="text-[10px] text-infraflow-text-muted uppercase tracking-wider mb-1 font-semibold">
              Proposed Fix
            </p>
            <p className="text-sm text-infraflow-text-secondary leading-relaxed">
              {session.fixExplanation}
            </p>
          </div>
        )}

        {/* ── View Fix Diff toggle ── */}
        <button
          onClick={handleToggleDiff}
          className="flex items-center gap-1.5 text-xs font-medium text-infraflow-accent hover:text-infraflow-accent/80 transition-colors mb-2 group"
        >
          <span
            className="inline-block transition-transform duration-200"
            style={{ transform: showDiff ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▸
          </span>
          View Fix Diff
        </button>

        {/* ── Expandable diff panel ── */}
        {showDiff && (
          <div className="border border-infraflow-border rounded-lg overflow-hidden mb-3">
            {/* Panel inner content */}
            <div className="p-3">
              {diffLoading && <DiffSkeleton />}

              {diffError && (
                <p className="text-sm text-red-400 py-2 px-1">{diffError}</p>
              )}

              {!diffLoading && !diffError && fixPlan !== null && (
                <>
                  {fileChanges.length === 0 ? (
                    <p className="text-sm text-infraflow-text-muted py-2 px-1">
                      No code changes found.
                    </p>
                  ) : (
                    <>
                      {/* File tab pills (only if multiple files) */}
                      {fileChanges.length > 1 && (
                        <div className="flex gap-1 flex-wrap mb-3">
                          {fileChanges.map((fc, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedFileIdx(idx)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors ${
                                selectedFileIdx === idx
                                  ? 'bg-infraflow-accent text-white'
                                  : 'bg-infraflow-bg text-infraflow-text-secondary hover:text-infraflow-text border border-infraflow-border'
                              }`}
                            >
                              <ActionBadge action={fc.action} />
                              <span className="max-w-[140px] truncate">
                                {fc.filePath.split('/').pop() ?? fc.filePath}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Selected file header + DiffView */}
                      {selectedFile && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <ActionBadge action={selectedFile.action} />
                            <span className="text-xs font-mono text-infraflow-text-muted truncate">
                              {selectedFile.filePath}
                            </span>
                          </div>
                          <DiffView
                            oldContent={selectedFile.oldContent ?? ''}
                            newContent={selectedFile.newContent}
                            fileName={selectedFile.filePath}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Inline action buttons at bottom of diff panel (PENDING_APPROVAL only) */}
                  {isPendingApproval && fileChanges.length > 0 && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-infraflow-border">
                      <button
                        onClick={handleApprove}
                        disabled={actionLoading !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {actionLoading === 'approve' ? <IconSpinner /> : <IconCheck />}
                        Apply Fix
                      </button>
                      <button
                        onClick={handleReject}
                        disabled={actionLoading !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-infraflow-bg hover:bg-infraflow-border text-infraflow-text-secondary text-xs font-medium rounded-lg border border-infraflow-border transition-colors disabled:opacity-50"
                      >
                        {actionLoading === 'reject' ? <IconSpinner /> : <IconX />}
                        Reject
                      </button>
                      <button
                        onClick={() => setShowRecodeModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-xs font-medium rounded-lg border border-amber-500/30 transition-colors"
                      >
                        <IconRecode />
                        Re-code
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Bottom action bar ── */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {showApplyReject && (
            <>
              <button
                onClick={handleApprove}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === 'approve' ? <IconSpinner /> : <IconCheck />}
                {actionLoading === 'approve' ? 'Applying...' : 'Apply Fix'}
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-4 py-2 bg-infraflow-bg hover:bg-infraflow-border text-infraflow-text-secondary text-sm font-medium rounded-lg border border-infraflow-border transition-colors disabled:opacity-50"
              >
                {actionLoading === 'reject' ? <IconSpinner /> : <IconX />}
                {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
            </>
          )}

          {showApplyOnly && (
            <button
              onClick={handleApprove}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === 'approve' ? <IconSpinner /> : <IconCheck />}
              {actionLoading === 'approve' ? 'Applying...' : 'Apply Fix'}
            </button>
          )}

          {showRecode && (
            <button
              onClick={() => setShowRecodeModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-sm font-medium rounded-lg border border-amber-500/30 transition-colors"
            >
              <IconRecode />
              Re-code
            </button>
          )}
        </div>
      </div>

      {/* ── RecodeModal ── */}
      {showRecodeModal && (
        <RecodeModal
          sessionId={session.id}
          onSubmit={handleRecode}
          onClose={() => setShowRecodeModal(false)}
        />
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function HealingLog({ sessions, loading, onSessionUpdate }: HealingLogProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <SkeletonSession key={i} />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center text-infraflow-text-muted py-12">
        <p className="text-lg">No healing sessions yet</p>
        <p className="text-sm mt-1">
          Healing sessions appear when a pipeline failure is detected
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          onSessionUpdate={onSessionUpdate}
        />
      ))}
    </div>
  );
}
