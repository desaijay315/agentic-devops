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

export default function PipelineFeed({ events }: { events: PipelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
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
              <span className="font-medium text-white text-sm truncate">
                {event.repoName}
              </span>
              <span className="text-gray-500 text-xs">
                {event.branch}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs text-gray-500">
                {event.commitSha?.slice(0, 7)}
              </code>
              {event.workflowName && (
                <span className="text-xs text-gray-600">
                  {event.workflowName}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {event.failureType && (
              <span className="text-xs text-gray-500">
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
