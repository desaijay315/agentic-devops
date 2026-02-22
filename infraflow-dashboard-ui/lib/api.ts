const API_BASE = 'http://localhost:8080';

export async function fetchDashboardStats() {
  const res = await fetch(`${API_BASE}/api/dashboard/stats`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchPipelineEvents() {
  const res = await fetch(`${API_BASE}/api/dashboard/pipeline-events`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch pipeline events');
  return res.json();
}

export async function fetchHealingSessions() {
  const res = await fetch(`${API_BASE}/api/dashboard/healing-sessions`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch healing sessions');
  return res.json();
}

export async function approveSession(sessionId: number) {
  const res = await fetch(`${API_BASE}/api/healing/sessions/${sessionId}/approve`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to approve session');
  return res.json();
}

export async function rejectSession(sessionId: number) {
  const res = await fetch(`${API_BASE}/api/healing/sessions/${sessionId}/reject`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reject session');
  return res.json();
}
