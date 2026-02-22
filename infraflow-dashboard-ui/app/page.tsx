'use client';

import { useEffect, useState } from 'react';
import { useWebSocket } from '@/lib/WebSocketProvider';
import { fetchDashboardStats, fetchPipelineEvents, fetchHealingSessions } from '@/lib/api';
import StatsCards from '@/components/StatsCards';
import PipelineFeed from '@/components/PipelineFeed';
import HealingLog from '@/components/HealingLog';
import ConnectionIndicator from '@/components/ConnectionIndicator';

export default function DashboardPage() {
  const { connected, pipelineEvents: liveEvents, healingEvents: liveHealing } =
    useWebSocket();

  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    Promise.allSettled([
      fetchDashboardStats().then(setStats),
      fetchPipelineEvents().then(setEvents),
      fetchHealingSessions().then(setSessions),
    ]).finally(() => setLoading(false));
  }, []);

  // Merge live WebSocket events with initial data
  const allEvents = [...liveEvents, ...events].slice(0, 50);
  const allSessions = [...liveHealing, ...sessions].slice(0, 50);

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDashboardStats().then(setStats).catch(console.error);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-infraflow-text">Dashboard</h1>
          <p className="text-sm text-infraflow-text-muted mt-1">
            Real-time CI/CD pipeline monitoring and autonomous healing
          </p>
        </div>
        <ConnectionIndicator connected={connected} />
      </div>

      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-infraflow-text mb-4">
            Pipeline Feed
          </h2>
          <PipelineFeed events={allEvents} loading={loading} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-infraflow-text mb-4">
            Healing Activity
          </h2>
          <HealingLog sessions={allSessions} loading={loading} />
        </div>
      </div>
    </div>
  );
}
