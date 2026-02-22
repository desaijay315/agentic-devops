'use client';

import { useMemo } from 'react';

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  fileName?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const diffs: { type: 'added' | 'removed' | 'unchanged'; line: string }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffs.unshift({ type: 'unchanged', line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffs.unshift({ type: 'added', line: newLines[j - 1] });
      j--;
    } else if (i > 0) {
      diffs.unshift({ type: 'removed', line: oldLines[i - 1] });
      i--;
    }
  }

  let oldNum = 0, newNum = 0;
  for (const d of diffs) {
    if (d.type === 'unchanged') {
      oldNum++; newNum++;
      result.push({ type: 'unchanged', content: d.line, oldLineNum: oldNum, newLineNum: newNum });
    } else if (d.type === 'removed') {
      oldNum++;
      result.push({ type: 'removed', content: d.line, oldLineNum: oldNum });
    } else {
      newNum++;
      result.push({ type: 'added', content: d.line, newLineNum: newNum });
    }
  }

  return result;
}

export default function DiffView({ oldContent, newContent, fileName }: DiffViewProps) {
  const diffLines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);

  const added = diffLines.filter(l => l.type === 'added').length;
  const removed = diffLines.filter(l => l.type === 'removed').length;

  return (
    <div className="rounded-xl border border-infraflow-border overflow-hidden">
      {/* Header */}
      <div className="bg-infraflow-card px-4 py-3 border-b border-infraflow-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-infraflow-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-mono text-infraflow-text">{fileName || 'diff'}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-400">+{added}</span>
          <span className="text-red-400">-{removed}</span>
        </div>
      </div>

      {/* Diff content */}
      <div className="overflow-x-auto bg-infraflow-bg">
        <table className="w-full text-xs font-mono">
          <tbody>
            {diffLines.map((line, idx) => (
              <tr
                key={idx}
                className={
                  line.type === 'added'
                    ? 'bg-emerald-900/20'
                    : line.type === 'removed'
                    ? 'bg-red-900/20'
                    : ''
                }
              >
                {/* Old line number */}
                <td className="w-12 text-right px-2 py-0.5 text-infraflow-text-muted select-none border-r border-infraflow-border/50">
                  {line.oldLineNum || ''}
                </td>
                {/* New line number */}
                <td className="w-12 text-right px-2 py-0.5 text-infraflow-text-muted select-none border-r border-infraflow-border/50">
                  {line.newLineNum || ''}
                </td>
                {/* Indicator */}
                <td className={`w-6 text-center py-0.5 select-none ${
                  line.type === 'added' ? 'text-emerald-400' : line.type === 'removed' ? 'text-red-400' : 'text-infraflow-text-muted'
                }`}>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </td>
                {/* Content */}
                <td className={`px-2 py-0.5 whitespace-pre ${
                  line.type === 'added'
                    ? 'text-emerald-300'
                    : line.type === 'removed'
                    ? 'text-red-300'
                    : 'text-infraflow-text-secondary'
                }`}>
                  {line.content}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
