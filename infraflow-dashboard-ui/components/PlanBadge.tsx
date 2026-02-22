'use client';

import { useAuth } from '@/lib/auth';

export default function PlanBadge() {
  const { user, plan, loading, openUpgradeModal } = useAuth();

  if (loading || !user || !plan) return null;

  if (plan.planType === 'PRO') {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
        ✦ PRO
      </span>
    );
  }

  const used = plan.healCountMonth;
  const limit = plan.healLimitMonth;
  const pct = Math.min(100, (used / limit) * 100);
  const isWarning = pct >= 70;
  const isExhausted = plan.healsRemaining === 0;

  return (
    <button
      onClick={openUpgradeModal}
      className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs border transition-colors ${
        isExhausted
          ? 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20'
          : isWarning
          ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/20'
          : 'bg-infraflow-bg border-infraflow-border text-infraflow-text-muted hover:border-infraflow-accent'
      }`}
      title="Click to upgrade to Pro"
    >
      <span className="font-medium">FREE</span>
      <span className="text-infraflow-text-muted">•</span>
      <span className={isExhausted ? 'text-red-400 font-semibold' : ''}>
        {used}/{limit}
      </span>
      {/* mini progress bar */}
      <span className="w-12 h-1.5 rounded-full bg-infraflow-border overflow-hidden">
        <span
          className={`block h-full rounded-full transition-all ${
            isExhausted ? 'bg-red-500' : isWarning ? 'bg-yellow-400' : 'bg-infraflow-accent'
          }`}
          style={{ width: `${pct}%` }}
        />
      </span>
      {isExhausted && <span className="font-semibold">Upgrade ↑</span>}
    </button>
  );
}
