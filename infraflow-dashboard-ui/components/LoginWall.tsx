'use client';

import { useAuth } from '@/lib/auth';

interface LoginWallProps {
  children: React.ReactNode;
}

/**
 * Wraps page content. Shows a login prompt if the user is not authenticated.
 * After OAuth completes, the user is redirected back automatically.
 */
export default function LoginWall({ children }: LoginWallProps) {
  const { user, loading, login } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-infraflow-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl bg-infraflow-accent/10 border border-infraflow-accent/30 flex items-center justify-center mb-6">
          <span className="text-3xl font-black text-infraflow-accent">IF</span>
        </div>

        <h1 className="text-3xl font-bold text-infraflow-text mb-3">
          InfraFlow AI
        </h1>
        <p className="text-infraflow-text-muted max-w-sm mb-8 leading-relaxed">
          Autonomous CI/CD self-healing platform. Sign in with your GitHub account to monitor
          your repos, view pipeline failures, and let AI fix them automatically.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {[
            '🤖 AI-powered fixes',
            '🔒 Security scanning',
            '🧠 Self-learning KB',
            '📊 Real-time dashboard',
            '🔁 Re-code on demand',
          ].map((f) => (
            <span
              key={f}
              className="px-3 py-1 rounded-full bg-infraflow-bg border border-infraflow-border text-sm text-infraflow-text-secondary"
            >
              {f}
            </span>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={login}
          className="flex items-center gap-3 px-6 py-3 rounded-xl bg-gray-900 text-white text-base font-semibold hover:bg-gray-800 transition-colors border border-gray-700"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Sign in with GitHub
        </button>

        <p className="text-xs text-infraflow-text-muted mt-4">
          Free tier: 10 heals / month · No credit card required
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
