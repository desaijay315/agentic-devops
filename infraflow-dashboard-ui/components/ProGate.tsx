'use client';

import { useAuth } from '@/lib/auth';
import { ReactNode } from 'react';

interface ProGateProps {
  children: ReactNode;
  feature?: string;
  fallback?: ReactNode;
}

/**
 * Wraps content that is only available to PRO users.
 * Shows a lock/upgrade prompt for FREE users.
 */
export default function ProGate({ children, feature = 'This feature', fallback }: ProGateProps) {
  const { plan, user, openUpgradeModal, loading } = useAuth();

  if (loading || !user) return null;

  if (plan?.planType === 'PRO') return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* blurred preview */}
      <div className="pointer-events-none select-none blur-sm opacity-40">
        {children}
      </div>
      {/* lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-infraflow-bg/70 backdrop-blur-[2px]">
        <div className="text-center p-6">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-infraflow-card border border-infraflow-border flex items-center justify-center text-lg">
            🔒
          </div>
          <p className="text-sm font-semibold text-infraflow-text mb-1">{feature}</p>
          <p className="text-xs text-infraflow-text-muted mb-4">Available on the Pro plan</p>
          <button
            onClick={openUpgradeModal}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Upgrade to Pro ✦
          </button>
        </div>
      </div>
    </div>
  );
}
