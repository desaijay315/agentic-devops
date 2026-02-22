'use client';

interface AuditEntry {
  id?: number;
  action: string;
  details: string;
  performedBy: string;
  createdAt: string;
}

const actionIcons: Record<string, { icon: string; color: string }> = {
  SESSION_CREATED: { icon: '🔵', color: 'border-blue-500' },
  ANALYSIS_STARTED: { icon: '🔍', color: 'border-blue-400' },
  ANALYSIS_COMPLETED: { icon: '✅', color: 'border-emerald-500' },
  FIX_GENERATED: { icon: '🛠️', color: 'border-purple-500' },
  FIX_APPROVED: { icon: '👍', color: 'border-emerald-500' },
  FIX_REJECTED: { icon: '👎', color: 'border-red-500' },
  FIX_APPLIED: { icon: '🚀', color: 'border-emerald-500' },
  FIX_REGENERATED: { icon: '🔄', color: 'border-amber-500' },
  PIPELINE_RETRIED: { icon: '🔁', color: 'border-blue-500' },
  PIPELINE_PASSED: { icon: '🎉', color: 'border-emerald-500' },
  PIPELINE_FAILED: { icon: '❌', color: 'border-red-500' },
  ESCALATED: { icon: '⚠️', color: 'border-amber-500' },
  SECURITY_SCAN_COMPLETED: { icon: '🔒', color: 'border-cyan-500' },
};

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-center text-infraflow-text-muted py-8">
        <p className="text-sm">No audit trail yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-2 bottom-2 w-px bg-infraflow-border" />

      <div className="space-y-4">
        {entries.map((entry, idx) => {
          const meta = actionIcons[entry.action] || { icon: '📝', color: 'border-gray-500' };
          return (
            <div key={entry.id ?? idx} className="relative flex items-start gap-4 pl-1">
              {/* Timeline dot */}
              <div className={`relative z-10 w-8 h-8 rounded-full bg-infraflow-card border-2 ${meta.color} flex items-center justify-center text-sm shrink-0`}>
                {meta.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 bg-infraflow-card border border-infraflow-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-infraflow-text">
                    {entry.action.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-infraflow-text-muted">
                    {formatTimestamp(entry.createdAt)}
                  </span>
                </div>
                {entry.details && (
                  <p className="text-xs text-infraflow-text-secondary mt-1 break-words">
                    {entry.details}
                  </p>
                )}
                <p className="text-xs text-infraflow-text-muted mt-1">
                  by <span className="text-infraflow-accent">{entry.performedBy}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
