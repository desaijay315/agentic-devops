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
    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8083/ws'),
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true);

        client.subscribe('/topic/pipeline-events', (message) => {
          const event = JSON.parse(message.body);
          setPipelineEvents((prev) => [event, ...prev].slice(0, 50));
        });

        client.subscribe('/topic/healing-events', (message) => {
          const event = JSON.parse(message.body);
          setHealingEvents((prev) => [event, ...prev].slice(0, 50));
        });
      },
      onDisconnect: () => setConnected(false),
      onStompError: (frame) => {
        console.error('STOMP error:', frame.headers['message']);
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, []);

  return { connected, pipelineEvents, healingEvents };
}
