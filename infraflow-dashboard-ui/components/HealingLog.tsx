'use client';

import StatusBadge from './StatusBadge';
import { approveSession, rejectSession } from '@/lib/api';
import { useState } from 'react';

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
    </div>
  );
}

export default function HealingLog({
  sessions,
  loading,
}: {
  sessions: HealingSession[];
  loading?: boolean;
}) {
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await approveSession(id);
    } catch (e) {
      console.error('Approve failed:', e);
    }
    setActionLoading(null);
  };

  const handleReject = async (id: number) => {
    setActionLoading(id);
    try {
      await rejectSession(id);
    } catch (e) {
      console.error('Reject failed:', e);
    }
    setActionLoading(null);
  };

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
        <div
          key={session.id}
          className="bg-infraflow-card border border-infraflow-border rounded-xl p-5"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-infraflow-text">
                  {session.repoName}
                </span>
                <StatusBadge status={session.status} />
              </div>
              <span className="text-xs text-infraflow-text-muted mt-1 block">
                {session.failureType?.replace(/_/g, ' ')} — Session #{session.id}
              </span>
            </div>
            {session.confidenceScore != null && (
              <div className="text-right">
                <span className="text-xs text-infraflow-text-muted">Confidence</span>
                <p
                  className={`text-lg font-bold ${
                    session.confidenceScore >= 0.75
                      ? 'text-emerald-400'
                      : session.confidenceScore >= 0.5
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {(session.confidenceScore * 100).toFixed(0)}%
                </p>
              </div>
            )}
          </div>

          {session.failureSummary && (
            <div className="bg-infraflow-bg rounded-lg p-3 mb-3">
              <p className="text-xs text-infraflow-text-muted uppercase mb-1">
                AI Diagnosis
              </p>
              <p className="text-sm text-infraflow-text-secondary">{session.failureSummary}</p>
            </div>
          )}

          {session.fixExplanation && (
            <div className="bg-infraflow-bg rounded-lg p-3 mb-3">
              <p className="text-xs text-infraflow-text-muted uppercase mb-1">
                Proposed Fix
              </p>
              <p className="text-sm text-infraflow-text-secondary">{session.fixExplanation}</p>
            </div>
          )}

          {session.fixBranch && (
            <p className="text-xs text-infraflow-text-muted mb-3">
              Branch:{' '}
              <code className="text-purple-400">{session.fixBranch}</code>
            </p>
          )}

          {session.status === 'PENDING_APPROVAL' && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleApprove(session.id)}
                disabled={actionLoading === session.id}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === session.id ? 'Applying...' : 'Apply Fix'}
              </button>
              <button
                onClick={() => handleReject(session.id)}
                disabled={actionLoading === session.id}
                className="px-4 py-2 bg-infraflow-bg hover:bg-infraflow-border text-infraflow-text-secondary text-sm rounded-lg border border-infraflow-border transition-colors disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
