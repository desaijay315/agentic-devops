'use client';

import clsx from 'clsx';

const statusStyles: Record<string, string> = {
  QUEUED: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  RUNNING: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 animate-pulse',
  SUCCESS: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400',
  FAILED: 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400',
  HEALING: 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400 animate-pulse',
  HEALED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400',
  ESCALATED: 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400',
  ANALYZING: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 animate-pulse',
  FIX_GENERATED: 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400',
  APPROVED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400',
  APPLYING: 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400 animate-pulse',
  APPLIED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400',
  PIPELINE_RETRIED: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 animate-pulse',
  PIPELINE_PASSED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400',
  PIPELINE_FAILED_AGAIN: 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400',
  REJECTED: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

export default function StatusBadge({ status }: { status?: string | null }) {
  const label = status ?? 'UNKNOWN';
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        statusStyles[label] || 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      )}
    >
      {label.replace(/_/g, ' ')}
    </span>
  );
}
