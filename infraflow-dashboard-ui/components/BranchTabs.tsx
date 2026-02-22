'use client';

interface BranchTabsProps {
  branches: string[];
  selected: string | null;
  onChange: (branch: string | null) => void;
  loading?: boolean;
}

function GitBranchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H8.06a1 1 0 00-.94.647l-.333.876a1.75 1.75 0 01-1.643 1.127H5v1.5a.75.75 0 01-1.5 0v-5A2.25 2.25 0 116 9.25v.152a.25.25 0 00.235-.177l.333-.876A2.5 2.5 0 019.06 7H9a1 1 0 001-1V5.372A2.25 2.25 0 019.5 3.25zM4.25 7.5a.75.75 0 100 1.5.75.75 0 000-1.5z"
      />
    </svg>
  );
}

function SkeletonPill() {
  return (
    <div className="h-8 w-24 rounded-full bg-infraflow-skeleton animate-pulse shrink-0" />
  );
}

export default function BranchTabs({
  branches,
  selected,
  onChange,
  loading = false,
}: BranchTabsProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <SkeletonPill />
        <SkeletonPill />
        <SkeletonPill />
        <SkeletonPill />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      role="tablist"
      aria-label="Branch selector"
    >
      {/* All Branches pill */}
      <button
        role="tab"
        aria-selected={selected === null}
        onClick={() => onChange(null)}
        className={[
          'inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-infraflow-accent',
          selected === null
            ? 'bg-infraflow-accent text-white shadow-sm'
            : 'bg-infraflow-bg text-infraflow-text-secondary hover:bg-infraflow-border hover:text-infraflow-text',
        ].join(' ')}
      >
        <GitBranchIcon className="w-3.5 h-3.5" />
        All Branches
      </button>

      {/* Individual branch pills */}
      {branches.map((branch) => {
        const isSelected = selected === branch;
        return (
          <button
            key={branch}
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(branch)}
            title={branch}
            className={[
              'inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-infraflow-accent max-w-[180px]',
              isSelected
                ? 'bg-infraflow-accent text-white shadow-sm'
                : 'bg-infraflow-bg text-infraflow-text-secondary hover:bg-infraflow-border hover:text-infraflow-text',
            ].join(' ')}
          >
            <GitBranchIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{branch}</span>
          </button>
        );
      })}

      {branches.length === 0 && (
        <span className="text-sm text-infraflow-text-muted px-2">
          No branches found
        </span>
      )}
    </div>
  );
}
