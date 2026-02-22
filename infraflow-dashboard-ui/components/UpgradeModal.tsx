'use client';

import { useAuth } from '@/lib/auth';

export default function UpgradeModal() {
  const { plan, planLoading, upgrade, closeUpgradeModal, showUpgradeModal } = useAuth();

  if (!showUpgradeModal) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeUpgradeModal}
      />

      {/* card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-infraflow-card border border-infraflow-border shadow-2xl p-8">
        {/* close */}
        <button
          onClick={closeUpgradeModal}
          className="absolute top-4 right-4 text-infraflow-text-muted hover:text-infraflow-text transition-colors"
        >
          ✕
        </button>

        {/* header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white text-2xl">
            ✦
          </div>
          <h2 className="text-2xl font-bold text-infraflow-text">Upgrade to Pro</h2>
          <p className="text-infraflow-text-muted mt-1 text-sm">
            Unlock unlimited healing and all advanced features
          </p>
        </div>

        {/* usage bar */}
        {plan && plan.planType === 'FREE' && (
          <div className="mb-6 p-4 rounded-xl bg-infraflow-bg border border-infraflow-border">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-infraflow-text-muted">Heals used this month</span>
              <span className="font-semibold text-infraflow-text">
                {plan.healCountMonth} / {plan.healLimitMonth}
              </span>
            </div>
            <div className="h-2 rounded-full bg-infraflow-border overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-red-500 transition-all"
                style={{ width: `${Math.min(100, (plan.healCountMonth / plan.healLimitMonth) * 100)}%` }}
              />
            </div>
            {plan.healsRemaining === 0 && (
              <p className="text-red-400 text-xs mt-2">
                ⚠ You've reached your free limit. Upgrade to continue healing.
              </p>
            )}
          </div>
        )}

        {/* feature comparison */}
        <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
          <div className="p-3 rounded-xl bg-infraflow-bg border border-infraflow-border">
            <p className="font-semibold text-infraflow-text-muted mb-2">Free</p>
            <ul className="space-y-1 text-infraflow-text-secondary">
              <li>✓ 10 heals / month</li>
              <li>✓ Basic dashboard</li>
              <li>✗ <span className="line-through text-infraflow-text-muted">Security details</span></li>
              <li>✗ <span className="line-through text-infraflow-text-muted">Knowledge Base</span></li>
              <li>✗ <span className="line-through text-infraflow-text-muted">Re-code / Fix Again</span></li>
            </ul>
          </div>
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/30">
            <p className="font-semibold text-purple-400 mb-2">Pro ✦</p>
            <ul className="space-y-1 text-infraflow-text-secondary">
              <li>✓ <span className="font-semibold text-infraflow-text">Unlimited heals</span></li>
              <li>✓ Full dashboard</li>
              <li>✓ Security scan details</li>
              <li>✓ Knowledge Base AI</li>
              <li>✓ Re-code / Fix Again</li>
            </ul>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={upgrade}
          disabled={planLoading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {planLoading ? 'Upgrading…' : 'Upgrade to Pro — Free for now'}
        </button>
        <p className="text-center text-xs text-infraflow-text-muted mt-3">
          No credit card required · Cancel anytime
        </p>
      </div>
    </div>
  );
}
