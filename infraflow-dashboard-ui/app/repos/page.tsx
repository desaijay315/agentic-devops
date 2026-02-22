'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchGitHubRepos, monitorRepo, unmonitorRepo } from '@/lib/api';

interface Repo {
  fullName: string;
  name: string;
  htmlUrl: string;
  description: string;
  language: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  stargazersCount: number;
  forksCount: number;
  monitored: boolean;
}

const langColors: Record<string, string> = {
  Java: 'bg-orange-500',
  TypeScript: 'bg-blue-500',
  JavaScript: 'bg-yellow-500',
  Python: 'bg-green-500',
  Go: 'bg-cyan-500',
  Rust: 'bg-red-600',
  Kotlin: 'bg-purple-500',
};

export default function ReposPage() {
  const { user, login } = useAuth();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'monitored'>('all');

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchGitHubRepos()
      .then(setRepos)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const toggleMonitor = async (repo: Repo) => {
    try {
      if (repo.monitored) {
        await unmonitorRepo(repo.fullName);
      } else {
        await monitorRepo(repo.fullName, repo.htmlUrl);
      }
      setRepos(prev => prev.map(r =>
        r.fullName === repo.fullName ? { ...r, monitored: !r.monitored } : r
      ));
    } catch (e) {
      console.error('Failed to toggle monitoring', e);
    }
  };

  const filtered = repos
    .filter(r => filter === 'all' || r.monitored)
    .filter(r =>
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase())
    );

  if (!user) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-full bg-infraflow-accent/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-infraflow-accent" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-infraflow-text mb-2">Sign in to manage repos</h2>
        <p className="text-infraflow-text-muted mb-4">Connect your GitHub account to monitor repositories</p>
        <button onClick={login} className="px-4 py-2 rounded-lg bg-infraflow-accent text-white hover:opacity-90 transition-opacity">
          Sign in with GitHub
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-infraflow-text">GitHub Repositories</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-infraflow-border overflow-hidden">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-sm ${filter === 'all' ? 'bg-infraflow-accent text-white' : 'bg-infraflow-card text-infraflow-text-secondary'}`}
            >All</button>
            <button
              onClick={() => setFilter('monitored')}
              className={`px-3 py-1.5 text-sm ${filter === 'monitored' ? 'bg-infraflow-accent text-white' : 'bg-infraflow-card text-infraflow-text-secondary'}`}
            >Monitored</button>
          </div>
          <input
            type="text"
            placeholder="Search repos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-infraflow-border bg-infraflow-bg text-infraflow-text text-sm focus:outline-none focus:ring-2 focus:ring-infraflow-accent"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-infraflow-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(repo => (
            <div
              key={repo.fullName}
              className={`rounded-xl border p-4 transition-all ${
                repo.monitored
                  ? 'border-infraflow-accent bg-infraflow-accent/5'
                  : 'border-infraflow-border bg-infraflow-card hover:border-infraflow-accent/50'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <a href={`/repos/${repo.fullName}`} className="text-sm font-semibold text-infraflow-accent hover:underline truncate">
                  {repo.fullName}
                </a>
                <button
                  onClick={() => toggleMonitor(repo)}
                  className={`shrink-0 ml-2 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    repo.monitored
                      ? 'bg-infraflow-accent text-white'
                      : 'bg-infraflow-bg text-infraflow-text-secondary hover:bg-infraflow-accent/20'
                  }`}
                >
                  {repo.monitored ? 'Monitoring' : 'Monitor'}
                </button>
              </div>
              <p className="text-xs text-infraflow-text-muted line-clamp-2 mb-3">{repo.description || 'No description'}</p>
              <div className="flex items-center gap-3 text-xs text-infraflow-text-muted">
                {repo.language && (
                  <span className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${langColors[repo.language] || 'bg-gray-400'}`} />
                    {repo.language}
                  </span>
                )}
                {repo.private && <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Private</span>}
                <span>{repo.stargazersCount} stars</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-center text-infraflow-text-muted py-12">
          {search ? 'No repos match your search' : 'No repositories found'}
        </p>
      )}
    </div>
  );
}
