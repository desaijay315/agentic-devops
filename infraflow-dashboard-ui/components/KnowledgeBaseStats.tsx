'use client';

import Link from 'next/link';

interface KbStats {
  totalPatterns: number;
  totalFixes: number;
  cacheHitsToday?: number;
}

interface KnowledgeBaseStatsProps {
  stats: KbStats | null;
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-infraflow-text-muted">{label}</span>
      <span className="text-sm font-semibold text-infraflow-text">{value}</span>
    </div>
  );
}

function SkeletonStat() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-3 w-16 bg-infraflow-skeleton rounded animate-pulse" />
      <div className="h-4 w-10 bg-infraflow-skeleton rounded animate-pulse" />
    </div>
  );
}

export default function KnowledgeBaseStats({ stats }: KnowledgeBaseStatsProps) {
  return (
    <div className="mb-6">
      <div className="rounded-xl border border-infraflow-accent/30 bg-gradient-to-r from-infraflow-accent/5 to-purple-500/5 px-5 py-3 flex items-center gap-6">
        {/* Left: brain icon + label + LEARNING badge */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <svg
              className="w-4 h-4 text-infraflow-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <span className="text-sm font-medium text-infraflow-text">
              Knowledge Base
            </span>
          </div>
          {/* Pulsing LEARNING badge */}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wide">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            LEARNING
          </span>
        </div>

        {/* Center: stats */}
        <div className="flex items-center gap-6 flex-1 overflow-x-auto">
          {stats ? (
            <>
              <StatItem
                label="patterns"
                value={`${stats.totalPatterns} patterns`}
              />
              <div className="w-px h-8 bg-infraflow-border shrink-0" />
              <StatItem
                label="fixes cached"
                value={`${stats.totalFixes} fixes cached`}
              />
              {stats.cacheHitsToday !== undefined && (
                <>
                  <div className="w-px h-8 bg-infraflow-border shrink-0" />
                  <StatItem
                    label="cache hits today"
                    value={stats.cacheHitsToday}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <SkeletonStat />
              <div className="w-px h-8 bg-infraflow-skeleton shrink-0" />
              <SkeletonStat />
              <div className="w-px h-8 bg-infraflow-skeleton shrink-0" />
              <SkeletonStat />
            </>
          )}
        </div>

        {/* Right: link */}
        <Link
          href="/knowledge"
          className="shrink-0 text-xs text-infraflow-accent hover:text-indigo-400 transition-colors flex items-center gap-1 whitespace-nowrap"
        >
          View details
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
