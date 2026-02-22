'use client';

import StatusBadge from './StatusBadge';

interface PipelineEvent {
  id: number;
  repoName: string;
  branch: string;
  commitSha: string;
  status: string;
  failureType: string | null;
  workflowName: string;
  createdAt: string;
}

function SkeletonRow() {
  return (
    <div className="bg-infraflow-card border border-infraflow-border rounded-lg p-4 flex items-center justify-between animate-pulse">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="h-4 w-32 bg-infraflow-skeleton rounded" />
          <div className="h-3 w-16 bg-infraflow-skeleton-light rounded" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-3 w-14 bg-infraflow-skeleton-light rounded" />
          <div className="h-3 w-20 bg-infraflow-skeleton-light rounded" />
        </div>
      </div>
      <div className="h-5 w-16 bg-infraflow-skeleton rounded-full" />
    </div>
  );
}

export default function PipelineFeed({
  events,
  loading,
}: {
  events: PipelineEvent[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center text-infraflow-text-muted py-12">
        <p className="text-lg">No pipeline events yet</p>
        <p className="text-sm mt-1">
          Connect a GitHub repo webhook to start monitoring
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div
          key={event.id || event.commitSha}
          className="bg-infraflow-card border border-infraflow-border rounded-lg p-4 flex items-center justify-between hover:border-infraflow-accent/30 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-infraflow-text text-sm truncate">
                {event.repoName}
              </span>
              <span className="text-infraflow-text-muted text-xs">
                {event.branch}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs text-infraflow-text-muted">
                {event.commitSha?.slice(0, 7)}
              </code>
              {event.workflowName && (
                <span className="text-xs text-infraflow-text-muted">
                  {event.workflowName}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {event.failureType && (
              <span className="text-xs text-infraflow-text-muted">
                {event.failureType.replace(/_/g, ' ')}
              </span>
            )}
            <StatusBadge status={event.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
