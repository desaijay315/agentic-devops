'use client';

interface Stats {
  totalPipelines: number;
  failedPipelines: number;
  healedPipelines: number;
  totalHealingSessions: number;
  pendingApproval: number;
  successfulHeals: number;
  averageMTTR: number;
}

const CARD_LABELS = [
  { label: 'Total Pipelines', color: 'text-infraflow-text' },
  { label: 'Failed', color: 'text-red-400' },
  { label: 'Healed by AI', color: 'text-emerald-400' },
  { label: 'Pending Approval', color: 'text-amber-400' },
  { label: 'Avg MTTR', color: 'text-purple-400' },
];

function SkeletonCard({ label }: { label: string }) {
  return (
    <div className="bg-infraflow-card border border-infraflow-border rounded-xl p-4">
      <p className="text-xs text-infraflow-text-muted uppercase tracking-wider">
        {label}
      </p>
      <div className="h-8 mt-1 w-12 bg-infraflow-skeleton rounded animate-pulse" />
    </div>
  );
}

export default function StatsCards({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {CARD_LABELS.map((c) => (
          <SkeletonCard key={c.label} label={c.label} />
        ))}
      </div>
    );
  }

  const values = [
    stats.totalPipelines,
    stats.failedPipelines,
    stats.successfulHeals,
    stats.pendingApproval,
    stats.averageMTTR > 0 ? `${Math.round(stats.averageMTTR)}s` : '—',
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
      {CARD_LABELS.map((card, i) => (
        <div
          key={card.label}
          className="bg-infraflow-card border border-infraflow-border rounded-xl p-4"
        >
          <p className="text-xs text-infraflow-text-muted uppercase tracking-wider">
            {card.label}
          </p>
          <p className={`text-2xl font-bold mt-1 ${card.color}`}>
            {values[i]}
          </p>
        </div>
      ))}
    </div>
  );
}
