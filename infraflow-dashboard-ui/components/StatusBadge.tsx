'use client';

import clsx from 'clsx';

const statusStyles: Record<string, string> = {
  QUEUED: 'bg-gray-700 text-gray-300',
  RUNNING: 'bg-blue-900/50 text-blue-400 animate-pulse',
  SUCCESS: 'bg-emerald-900/50 text-emerald-400',
  FAILED: 'bg-red-900/50 text-red-400',
  HEALING: 'bg-purple-900/50 text-purple-400 animate-pulse',
  HEALED: 'bg-emerald-900/50 text-emerald-400',
  ESCALATED: 'bg-amber-900/50 text-amber-400',
  ANALYZING: 'bg-blue-900/50 text-blue-400 animate-pulse',
  FIX_GENERATED: 'bg-purple-900/50 text-purple-400',
  PENDING_APPROVAL: 'bg-amber-900/50 text-amber-400',
  APPROVED: 'bg-emerald-900/50 text-emerald-400',
  APPLYING: 'bg-purple-900/50 text-purple-400 animate-pulse',
  APPLIED: 'bg-emerald-900/50 text-emerald-400',
  PIPELINE_RETRIED: 'bg-blue-900/50 text-blue-400 animate-pulse',
  PIPELINE_PASSED: 'bg-emerald-900/50 text-emerald-400',
  PIPELINE_FAILED_AGAIN: 'bg-red-900/50 text-red-400',
  REJECTED: 'bg-gray-700 text-gray-400',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        statusStyles[status] || 'bg-gray-700 text-gray-300'
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
