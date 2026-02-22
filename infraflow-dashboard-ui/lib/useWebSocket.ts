'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

interface WebSocketMessage {
  topic: string;
  body: any;
}

export function useWebSocket() {
  const clientRef = useRef<Client | null>(null);
  const [connected, setConnected] = useState(false);
  const [pipelineEvents, setPipelineEvents] = useState<any[]>([]);
  const [healingEvents, setHealingEvents] = useState<any[]>([]);

  useEffect(() => {
    let client: Client;
    try {
      client = new Client({
        webSocketFactory: () => new SockJS('http://localhost:8083/ws'),
        reconnectDelay: 5000,
        onConnect: () => {
          setConnected(true);

          client.subscribe('/topic/pipeline-events', (message) => {
            try {
              const event = JSON.parse(message.body);
              setPipelineEvents((prev) => [event, ...prev].slice(0, 50));
            } catch { /* ignore */ }
          });

          client.subscribe('/topic/healing-events', (message) => {
            try {
              const event = JSON.parse(message.body);
              setHealingEvents((prev) => [event, ...prev].slice(0, 50));
            } catch { /* ignore */ }
          });
        },
        onDisconnect: () => setConnected(false),
        onStompError: (frame) => {
          console.error('STOMP error:', frame.headers['message']);
        },
        onWebSocketError: () => {
          setConnected(false);
        },
      });

      client.activate();
      clientRef.current = client;
    } catch {
      console.warn('WebSocket connection failed — will retry');
      setConnected(false);
    }

    return () => {
      try { client?.deactivate(); } catch { /* ignore */ }
    };
  }, []);

  return { connected, pipelineEvents, healingEvents };
}
