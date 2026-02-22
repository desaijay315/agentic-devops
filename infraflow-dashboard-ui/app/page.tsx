'use client';

import { useEffect, useState } from 'react';
import { useWebSocket } from '@/lib/useWebSocket';
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

  // Load initial data
  useEffect(() => {
    fetchDashboardStats().then(setStats).catch(console.error);
    fetchPipelineEvents().then(setEvents).catch(console.error);
    fetchHealingSessions().then(setSessions).catch(console.error);
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
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time CI/CD pipeline monitoring and autonomous healing
          </p>
        </div>
        <ConnectionIndicator connected={connected} />
      </div>

      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Pipeline Feed
          </h2>
          <PipelineFeed events={allEvents} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Healing Activity
          </h2>
          <HealingLog sessions={allSessions} />
        </div>
      </div>
    </div>
  );
}
