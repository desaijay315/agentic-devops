'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function UserMenu() {
  const { user, plan, login, logout, loading, openUpgradeModal } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-infraflow-skeleton animate-pulse" />;
  }

  if (!user) {
    return (
      <button
        onClick={login}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        Sign in with GitHub
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-infraflow-accent flex items-center justify-center text-white text-xs font-bold">
            {user.login[0].toUpperCase()}
          </div>
        )}
        <span className="text-sm text-infraflow-text-secondary">{user.login}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-56 rounded-lg bg-infraflow-card border border-infraflow-border shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b border-infraflow-border">
            <p className="text-sm font-medium text-infraflow-text">{user.name || user.login}</p>
            <p className="text-xs text-infraflow-text-muted">{user.email}</p>
          </div>

          {/* Plan section */}
          {plan && (
            <div className="px-3 py-2 border-b border-infraflow-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-infraflow-text-muted">Plan</span>
                <span className={`text-xs font-semibold ${plan.planType === 'PRO' ? 'text-purple-400' : 'text-infraflow-text-secondary'}`}>
                  {plan.planType === 'PRO' ? '✦ Pro' : 'Free'}
                </span>
              </div>
              {plan.planType === 'FREE' && (
                <>
                  <div className="flex justify-between text-xs text-infraflow-text-muted mb-1">
                    <span>Heals this month</span>
                    <span>{plan.healCountMonth}/{plan.healLimitMonth}</span>
                  </div>
                  <div className="h-1 rounded-full bg-infraflow-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-infraflow-accent transition-all"
                      style={{ width: `${Math.min(100, (plan.healCountMonth / plan.healLimitMonth) * 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={() => { setOpen(false); openUpgradeModal(); }}
                    className="mt-2 w-full text-center text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    Upgrade to Pro ✦
                  </button>
                </>
              )}
            </div>
          )}

          <Link
            href="/repos"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-infraflow-text-secondary hover:bg-infraflow-bg transition-colors"
          >
            My Repos
          </Link>
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="block w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-infraflow-bg transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
