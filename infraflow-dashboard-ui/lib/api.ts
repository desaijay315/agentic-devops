const API_BASE = 'http://localhost:8080';

const opts: RequestInit = { cache: 'no-store', credentials: 'include' };

// ── Dashboard ───────────────────────────────────────

export async function fetchDashboardStats(repo?: string) {
  try {
    const q = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetch(`${API_BASE}/api/dashboard/stats${q}`, opts);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchPipelineEvents(repo?: string, branch?: string) {
  try {
    const params = new URLSearchParams();
    if (repo) params.set('repo', repo);
    if (branch) params.set('branch', branch);
    const q = params.toString() ? `?${params}` : '';
    const res = await fetch(`${API_BASE}/api/dashboard/pipeline-events${q}`, opts);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchHealingSessions(repo?: string) {
  try {
    const q = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetch(`${API_BASE}/api/dashboard/healing-sessions${q}`, opts);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchBranches(repoFullName: string) {
  const res = await fetch(`${API_BASE}/api/dashboard/repos/${repoFullName}/branches`, opts);
  if (!res.ok) return [];
  return res.json();
}

// ── Healing ─────────────────────────────────────────

export async function fetchHealingSession(id: number) {
  const res = await fetch(`${API_BASE}/api/healing/sessions/${id}`, opts);
  if (!res.ok) throw new Error('Session not found');
  return res.json();
}

export async function fetchFixPlan(sessionId: number) {
  const res = await fetch(`${API_BASE}/api/healing/sessions/${sessionId}/fix-plan`, opts);
  if (res.status === 204) return null;
  if (!res.ok) throw new Error('Failed to fetch fix plan');
  return res.json();
}

export async function fetchAuditLog(sessionId: number) {
  const res = await fetch(`${API_BASE}/api/healing/sessions/${sessionId}/audit-log`, opts);
  if (!res.ok) throw new Error('Failed to fetch audit log');
  return res.json();
}

export async function approveSession(sessionId: number) {
  const res = await fetch(`${API_BASE}/api/healing/sessions/${sessionId}/approve`, {
    method: 'POST', credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to approve session');
  return res.json();
}

export async function rejectSession(sessionId: number) {
  const res = await fetch(`${API_BASE}/api/healing/sessions/${sessionId}/reject`, {
    method: 'POST', credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to reject session');
  return res.json();
}

export async function regenerateSession(sessionId: number, feedback?: string) {
  const res = await fetch(`${API_BASE}/api/healing/sessions/${sessionId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ feedback }),
  });
  if (!res.ok) throw new Error('Failed to regenerate fix');
  return res.json();
}

// ── Security ─────────────────────────────────────────

export async function fetchSecurityScans(repo?: string, branch?: string) {
  const params = new URLSearchParams();
  if (repo) params.set('repo', repo);
  if (branch) params.set('branch', branch);
  const q = params.toString() ? `?${params}` : '';
  const res = await fetch(`${API_BASE}/api/security/scans${q}`, opts);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSecurityScansByCommit(commitSha: string) {
  const res = await fetch(`${API_BASE}/api/security/scans/commit/${commitSha}`, opts);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSecurityStats(repo?: string) {
  try {
    const q = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetch(`${API_BASE}/api/security/stats${q}`, opts);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Knowledge Base ───────────────────────────────────

export async function fetchKnowledgeBaseStats() {
  try {
    const res = await fetch(`${API_BASE}/api/knowledge/stats`, opts);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchKnowledgeBasePatterns(failureType?: string) {
  try {
    const q = failureType ? `?failureType=${encodeURIComponent(failureType)}` : '';
    const res = await fetch(`${API_BASE}/api/knowledge/patterns${q}`, opts);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ── Auth ────────────────────────────────────────────

export async function fetchCurrentUser() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/user`, { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function logoutUser() {
  await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

export function getLoginUrl() {
  return `${API_BASE}/oauth2/authorization/github`;
}

// ── User / Repos ────────────────────────────────────

export async function fetchUserProfile() {
  const res = await fetch(`${API_BASE}/api/user/me`, opts);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchGitHubRepos() {
  try {
    const res = await fetch(`${API_BASE}/api/user/repos`, opts);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchMonitoredRepos() {
  try {
    const res = await fetch(`${API_BASE}/api/user/repos/monitored`, opts);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function monitorRepo(repoFullName: string, repoUrl: string) {
  const res = await fetch(`${API_BASE}/api/user/repos/monitor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ repoFullName, repoUrl }),
  });
  if (!res.ok) throw new Error('Failed to monitor repo');
  return res.json();
}

export async function unmonitorRepo(repoFullName: string) {
  const res = await fetch(`${API_BASE}/api/user/repos/monitor/${repoFullName}`, {
    method: 'DELETE', credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to unmonitor repo');
  return res.json();
}

// ── Plan / Billing ───────────────────────────────────

export async function fetchUserPlan() {
  try {
    const res = await fetch(`${API_BASE}/api/user/plan`, opts);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function upgradeToProPlan() {
  const res = await fetch(`${API_BASE}/api/user/upgrade`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Upgrade failed');
  return res.json();
}
