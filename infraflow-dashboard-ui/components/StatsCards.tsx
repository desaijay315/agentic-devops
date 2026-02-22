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

export default function StatsCards({ stats }: { stats: Stats | null }) {
  if (!stats) return null;

  const cards = [
    {
      label: 'Total Pipelines',
      value: stats.totalPipelines,
      color: 'text-white',
    },
    {
      label: 'Failed',
      value: stats.failedPipelines,
      color: 'text-red-400',
    },
    {
      label: 'Healed by AI',
      value: stats.successfulHeals,
      color: 'text-emerald-400',
    },
    {
      label: 'Pending Approval',
      value: stats.pendingApproval,
      color: 'text-amber-400',
    },
    {
      label: 'Avg MTTR',
      value: stats.averageMTTR > 0 ? `${Math.round(stats.averageMTTR)}s` : '—',
      color: 'text-purple-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-infraflow-card border border-infraflow-border rounded-xl p-4"
        >
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            {card.label}
          </p>
          <p className={`text-2xl font-bold mt-1 ${card.color}`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
