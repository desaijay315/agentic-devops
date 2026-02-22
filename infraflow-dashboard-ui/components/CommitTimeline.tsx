'use client';

import StatusBadge from './StatusBadge';

interface PipelineEvent {
  id: number;
  repoName: string;
  branch: string;
  commitSha: string;
  status: string;
  failureType: string | null;
  workflowName: string | null;
  createdAt: string;
}

type DotColor =
  | 'green'
  | 'red'
  | 'yellow'
  | 'purple'
  | 'blue'
  | 'gray';

const STATUS_DOT: Record<string, DotColor> = {
  SUCCESS: 'green',
  HEALED: 'green',
  APPLIED: 'green',
  PIPELINE_PASSED: 'green',
  APPROVED: 'green',
  FAILED: 'red',
  PIPELINE_FAILED_AGAIN: 'red',
  REJECTED: 'red',
  HEALING: 'purple',
  ANALYZING: 'purple',
  FIX_GENERATED: 'purple',
  APPLYING: 'purple',
  PENDING_APPROVAL: 'yellow',
  ESCALATED: 'yellow',
  RUNNING: 'blue',
  PIPELINE_RETRIED: 'blue',
  QUEUED: 'gray',
};

const DOT_CLASSES: Record<DotColor, string> = {
  green: 'bg-emerald-400 ring-emerald-400/30',
  red: 'bg-red-400 ring-red-400/30',
  yellow: 'bg-amber-400 ring-amber-400/30',
  purple: 'bg-purple-400 ring-purple-400/30',
  blue: 'bg-blue-400 ring-blue-400/30',
  gray: 'bg-gray-400 ring-gray-400/30',
};

const DOT_LINE_CLASSES: Record<DotColor, string> = {
  green: 'bg-emerald-400/20',
  red: 'bg-red-400/20',
  yellow: 'bg-amber-400/20',
  purple: 'bg-purple-400/20',
  blue: 'bg-blue-400/20',
  gray: 'bg-gray-400/20',
};

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function SkeletonTimelineItem() {
  return (
    <div className="flex gap-3 animate-pulse">
      <div className="flex flex-col items-center">
        <div className="w-3 h-3 rounded-full bg-infraflow-skeleton mt-1 shrink-0" />
        <div className="w-px flex-1 bg-infraflow-skeleton mt-1" />
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-3.5 w-12 bg-infraflow-skeleton rounded" />
          <div className="h-3.5 w-20 bg-infraflow-skeleton-light rounded" />
          <div className="h-5 w-16 bg-infraflow-skeleton rounded-full ml-auto" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-28 bg-infraflow-skeleton-light rounded" />
          <div className="h-3 w-16 bg-infraflow-skeleton-light rounded ml-auto" />
        </div>
      </div>
    </div>
  );
}

interface CommitTimelineProps {
  events: PipelineEvent[];
  loading?: boolean;
}

export default function CommitTimeline({ events, loading = false }: CommitTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-0">
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonTimelineItem key={i} />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-infraflow-text-muted">
        <svg
          className="w-10 h-10 mx-auto mb-3 opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6l4 2M12 2a10 10 0 100 20A10 10 0 0012 2z"
          />
        </svg>
        <p className="text-sm">No pipeline events</p>
        <p className="text-xs mt-1 opacity-70">
          Events will appear here as commits are pushed
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {events.map((event, idx) => {
        const dotColor: DotColor = STATUS_DOT[event.status] ?? 'gray';
        const isLast = idx === events.length - 1;
        const shortSha = event.commitSha?.slice(0, 7) ?? '-------';

        return (
          <div key={event.id ?? `${event.commitSha}-${idx}`} className="flex gap-3">
            {/* Timeline spine */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={[
                  'w-3 h-3 rounded-full mt-1 shrink-0 ring-4',
                  DOT_CLASSES[dotColor],
                ].join(' ')}
                aria-label={`Status: ${event.status}`}
              />
              {!isLast && (
                <div
                  className={['w-px flex-1 mt-1', DOT_LINE_CLASSES[dotColor]].join(' ')}
                  style={{ minHeight: '24px' }}
                />
              )}
            </div>

            {/* Content */}
            <div className={['flex-1 min-w-0', isLast ? 'pb-0' : 'pb-4'].join(' ')}>
              <div className="flex items-start gap-2 flex-wrap">
                {/* Commit SHA */}
                <code className="text-xs font-mono text-infraflow-accent bg-infraflow-accent/10 px-1.5 py-0.5 rounded shrink-0">
                  {shortSha}
                </code>

                {/* Branch */}
                <span className="inline-flex items-center gap-1 text-xs text-infraflow-text-secondary bg-infraflow-bg border border-infraflow-border px-1.5 py-0.5 rounded shrink-0 max-w-[140px]">
                  <svg
                    className="w-3 h-3 shrink-0"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H8.06a1 1 0 00-.94.647l-.333.876a1.75 1.75 0 01-1.643 1.127H5v1.5a.75.75 0 01-1.5 0v-5A2.25 2.25 0 116 9.25v.152a.25.25 0 00.235-.177l.333-.876A2.5 2.5 0 019.06 7H9a1 1 0 001-1V5.372A2.25 2.25 0 019.5 3.25zM4.25 7.5a.75.75 0 100 1.5.75.75 0 000-1.5z"
                    />
                  </svg>
                  <span className="truncate">{event.branch}</span>
                </span>

                {/* Status badge */}
                <div className="ml-auto shrink-0">
                  <StatusBadge status={event.status} />
                </div>
              </div>

              {/* Workflow name + relative time */}
              <div className="flex items-center gap-2 mt-1">
                {event.workflowName && (
                  <span className="text-xs text-infraflow-text-muted truncate max-w-[200px]">
                    {event.workflowName}
                  </span>
                )}
                {event.failureType && (
                  <span className="text-xs text-red-400 truncate max-w-[160px]">
                    {event.failureType.replace(/_/g, ' ')}
                  </span>
                )}
                <span className="text-xs text-infraflow-text-muted ml-auto shrink-0 tabular-nums">
                  {event.createdAt ? formatRelativeTime(event.createdAt) : '—'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
