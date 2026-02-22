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

export default function HealingLog({
  sessions,
}: {
  sessions: HealingSession[];
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

  if (sessions.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
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
                <span className="font-medium text-white">
                  {session.repoName}
                </span>
                <StatusBadge status={session.status} />
              </div>
              <span className="text-xs text-gray-500 mt-1 block">
                {session.failureType?.replace(/_/g, ' ')} — Session #{session.id}
              </span>
            </div>
            {session.confidenceScore != null && (
              <div className="text-right">
                <span className="text-xs text-gray-500">Confidence</span>
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
              <p className="text-xs text-gray-500 uppercase mb-1">
                AI Diagnosis
              </p>
              <p className="text-sm text-gray-300">{session.failureSummary}</p>
            </div>
          )}

          {session.fixExplanation && (
            <div className="bg-infraflow-bg rounded-lg p-3 mb-3">
              <p className="text-xs text-gray-500 uppercase mb-1">
                Proposed Fix
              </p>
              <p className="text-sm text-gray-300">{session.fixExplanation}</p>
            </div>
          )}

          {session.fixBranch && (
            <p className="text-xs text-gray-500 mb-3">
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
                className="px-4 py-2 bg-infraflow-bg hover:bg-gray-800 text-gray-400 text-sm rounded-lg border border-infraflow-border transition-colors disabled:opacity-50"
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
