'use client';

import { useState, useEffect, useCallback } from 'react';
import DiffView from './DiffView';
import { fetchFixPlan } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

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

interface FixPreviewModalProps {
  sessionId: number;
  sessionStatus: string;
  repoName: string;
  branch: string;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
  onRecode: (feedback: string) => Promise<void>;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceColor(score: number): string {
  if (score >= 0.75) return 'text-emerald-400';
  if (score >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

function confidenceBg(score: number): string {
  if (score >= 0.75) return 'bg-emerald-500/15 border-emerald-500/30';
  if (score >= 0.5) return 'bg-amber-500/15 border-amber-500/30';
  return 'bg-red-500/15 border-red-500/30';
}

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    MODIFY: 'bg-amber-500/15 text-amber-400',
    CREATE: 'bg-emerald-500/15 text-emerald-400',
    DELETE: 'bg-red-500/15 text-red-400',
  };
  const label: Record<string, string> = { MODIFY: 'MOD', CREATE: 'ADD', DELETE: 'DEL' };
  const cls = styles[action] ?? 'bg-infraflow-skeleton text-infraflow-text-muted';
  return (
    <span className={`inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${cls}`}>
      {label[action] ?? action}
    </span>
  );
}

function IconCheck() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconRecode() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function IconSpinner({ size = 'w-4 h-4' }: { size?: string }) {
  return (
    <svg className={`${size} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Recode inline form ────────────────────────────────────────────────────────

interface RecodeFormProps {
  onSubmit: (feedback: string) => Promise<void>;
  onCancel: () => void;
}

function RecodeInlineForm({ onSubmit, onCancel }: RecodeFormProps) {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(feedback);
    } catch (e) {
      console.error('Recode failed:', e);
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 border-t border-infraflow-border bg-infraflow-bg/50">
      <label className="block text-sm font-medium text-infraflow-text mb-2">
        What should the AI do differently?
      </label>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="e.g. Use a different approach, avoid changing the API signature..."
        className="w-full h-24 px-3 py-2 bg-infraflow-bg border border-infraflow-border rounded-lg text-sm text-infraflow-text placeholder-infraflow-text-muted focus:outline-none focus:ring-2 focus:ring-infraflow-accent/50 focus:border-infraflow-accent resize-none"
        autoFocus
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? <IconSpinner /> : <IconRecode />}
          {submitting ? 'Regenerating...' : 'Re-generate Fix'}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm text-infraflow-text-secondary hover:text-infraflow-text transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FixPreviewModal({
  sessionId,
  sessionStatus,
  repoName,
  branch,
  onApprove,
  onReject,
  onRecode,
  onClose,
}: FixPreviewModalProps) {
  const [fixPlan, setFixPlan] = useState<FixPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null);
  const [showRecodeForm, setShowRecodeForm] = useState(false);

  const isPendingApproval = sessionStatus === 'PENDING_APPROVAL';

  // Load fix plan on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchFixPlan(sessionId)
      .then((plan) => {
        if (cancelled) return;
        setFixPlan(
          plan ?? {
            failureSummary: '',
            rootCause: '',
            fixExplanation: '',
            fixType: '',
            confidenceScore: 0,
            fileChanges: [],
          }
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load fix plan');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleApprove = useCallback(async () => {
    setActionLoading('approve');
    try {
      await onApprove();
      onClose();
    } catch (e) {
      console.error('Approve failed:', e);
    } finally {
      setActionLoading(null);
    }
  }, [onApprove, onClose]);

  const handleReject = useCallback(async () => {
    setActionLoading('reject');
    try {
      await onReject();
      onClose();
    } catch (e) {
      console.error('Reject failed:', e);
    } finally {
      setActionLoading(null);
    }
  }, [onReject, onClose]);

  const handleRecode = useCallback(
    async (feedback: string) => {
      await onRecode(feedback);
      onClose();
    },
    [onRecode, onClose]
  );

  const fileChanges = fixPlan?.fileChanges ?? [];
  const selectedFile = fileChanges[selectedFileIdx];
  const score = fixPlan?.confidenceScore ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal shell */}
      <div
        className="relative z-10 flex flex-col bg-infraflow-card border border-infraflow-border rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: '90vw', maxWidth: '1400px', height: '90vh', maxHeight: '900px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-infraflow-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-infraflow-accent/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-infraflow-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-infraflow-text truncate">
                Fix Preview — <span className="text-infraflow-accent">{repoName}</span>
              </h2>
              <p className="text-xs text-infraflow-text-muted">Session #{sessionId}</p>
            </div>
            {branch && (
              <code className="hidden sm:inline-block text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded font-mono border border-purple-400/20 shrink-0 max-w-[200px] truncate">
                {branch}
              </code>
            )}
            {!loading && fixPlan && (
              <span
                className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${confidenceBg(score)} ${confidenceColor(score)}`}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm.75 11.25a.75.75 0 01-1.5 0v-4.5a.75.75 0 011.5 0v4.5zm0-7.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                {(score * 100).toFixed(0)}% confidence
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="ml-4 shrink-0 p-1.5 rounded-lg text-infraflow-text-muted hover:text-infraflow-text hover:bg-infraflow-bg transition-colors"
            aria-label="Close modal"
          >
            <IconClose />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-infraflow-text-muted">
                <IconSpinner size="w-8 h-8" />
                <p className="text-sm">Loading fix plan...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-red-400 font-medium mb-1">Failed to load fix plan</p>
                <p className="text-sm text-infraflow-text-muted">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && fixPlan && fileChanges.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-12 h-12 text-emerald-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-infraflow-text-muted">No code changes found in this fix plan.</p>
              </div>
            </div>
          )}

          {!loading && !error && fixPlan && fileChanges.length > 0 && (
            <>
              {/* ── Sidebar: file list ── */}
              <div className="w-1/4 min-w-[180px] max-w-[280px] border-r border-infraflow-border flex flex-col overflow-hidden shrink-0">
                <div className="px-3 py-2.5 border-b border-infraflow-border shrink-0">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-infraflow-text-muted">
                    Changed Files ({fileChanges.length})
                  </p>
                </div>
                <ul className="flex-1 overflow-y-auto py-1">
                  {fileChanges.map((fc, idx) => {
                    const parts = fc.filePath.split('/');
                    const fileName = parts.pop() ?? fc.filePath;
                    const dir = parts.join('/');
                    const isSelected = idx === selectedFileIdx;
                    return (
                      <li key={idx}>
                        <button
                          onClick={() => setSelectedFileIdx(idx)}
                          className={`w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2 group ${
                            isSelected
                              ? 'bg-infraflow-accent/10 border-r-2 border-infraflow-accent'
                              : 'hover:bg-infraflow-bg'
                          }`}
                        >
                          <ActionBadge action={fc.action} />
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-xs font-medium truncate ${
                                isSelected ? 'text-infraflow-text' : 'text-infraflow-text-secondary group-hover:text-infraflow-text'
                              }`}
                            >
                              {fileName}
                            </p>
                            {dir && (
                              <p className="text-[10px] text-infraflow-text-muted truncate font-mono mt-0.5">
                                {dir}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {/* Confidence score in sidebar (mobile / fallback) */}
                {fixPlan.confidenceScore != null && (
                  <div className="px-3 py-3 border-t border-infraflow-border shrink-0">
                    <p className="text-[10px] text-infraflow-text-muted uppercase tracking-wide mb-1">
                      Confidence
                    </p>
                    <p className={`text-2xl font-bold ${confidenceColor(score)}`}>
                      {(score * 100).toFixed(0)}%
                    </p>
                  </div>
                )}
              </div>

              {/* ── Main panel: DiffView ── */}
              <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                {/* File path breadcrumb */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-infraflow-border shrink-0 bg-infraflow-bg/40">
                  <svg className="w-3.5 h-3.5 text-infraflow-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {selectedFile && (
                    <span className="text-xs font-mono text-infraflow-text-secondary truncate">
                      {selectedFile.filePath}
                    </span>
                  )}
                  {selectedFile && <ActionBadge action={selectedFile.action} />}
                </div>

                {/* Scrollable diff area */}
                <div className="flex-1 overflow-auto p-4">
                  {selectedFile && (
                    <DiffView
                      oldContent={selectedFile.oldContent ?? ''}
                      newContent={selectedFile.newContent}
                      fileName={selectedFile.filePath}
                    />
                  )}
                </div>

                {/* Recode inline form (shown when toggled) */}
                {showRecodeForm && (
                  <RecodeInlineForm
                    onSubmit={handleRecode}
                    onCancel={() => setShowRecodeForm(false)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-infraflow-border bg-infraflow-bg/30 shrink-0">
          <div className="text-xs text-infraflow-text-muted">
            {!loading && fileChanges.length > 0 && (
              <span>
                {fileChanges.length} file{fileChanges.length !== 1 ? 's' : ''} changed
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowRecodeForm((prev) => !prev);
              }}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-sm font-medium rounded-lg border border-amber-500/30 transition-colors disabled:opacity-50"
            >
              <IconRecode />
              Re-code
            </button>

            {isPendingApproval && (
              <>
                <button
                  onClick={handleReject}
                  disabled={actionLoading !== null || loading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-infraflow-bg hover:bg-infraflow-border text-infraflow-text-secondary text-sm font-medium rounded-lg border border-infraflow-border transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'reject' ? <IconSpinner /> : <IconX />}
                  {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
                </button>

                <button
                  onClick={handleApprove}
                  disabled={actionLoading !== null || loading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'approve' ? <IconSpinner /> : <IconCheck />}
                  {actionLoading === 'approve' ? 'Applying...' : 'Apply Fix'}
                </button>
              </>
            )}

            {!isPendingApproval && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-infraflow-text-secondary hover:text-infraflow-text transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
