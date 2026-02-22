'use client';

import { useEffect, useState } from 'react';
import { fetchHealingSessions } from '@/lib/api';
import HealingLog from '@/components/HealingLog';
import { useWebSocket } from '@/lib/WebSocketProvider';
import ConnectionIndicator from '@/components/ConnectionIndicator';

export default function HealingPage() {
  const { connected, healingEvents } = useWebSocket();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealingSessions()
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Refresh when healing events come in
  useEffect(() => {
    if (healingEvents.length > 0) {
      fetchHealingSessions().then(setSessions).catch(console.error);
    }
  }, [healingEvents.length]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-infraflow-text">Healing Sessions</h1>
          <p className="text-sm text-infraflow-text-muted mt-1">
            AI-generated fixes awaiting review and applied fixes history
          </p>
        </div>
        <ConnectionIndicator connected={connected} />
      </div>

      <HealingLog sessions={sessions} loading={loading} />
    </div>
  );
}
