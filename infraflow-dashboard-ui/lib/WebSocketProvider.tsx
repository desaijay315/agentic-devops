'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

interface WebSocketContextValue {
  connected: boolean;
  pipelineEvents: any[];
  healingEvents: any[];
  securityEvents: any[];
  subscribeToRepo: (repoName: string, onEvent: (event: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  connected: false,
  pipelineEvents: [],
  healingEvents: [],
  securityEvents: [],
  subscribeToRepo: () => () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const clientRef = useRef<Client | null>(null);
  const repoListenersRef = useRef<Map<string, Set<(e: any) => void>>>(new Map());

  const [connected, setConnected] = useState(false);
  const [pipelineEvents, setPipelineEvents] = useState<any[]>([]);
  const [healingEvents, setHealingEvents] = useState<any[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);

  useEffect(() => {
    let client: Client;
    try {
      client = new Client({
        webSocketFactory: () => new SockJS('http://localhost:8083/ws'),
        reconnectDelay: 5000,
        onConnect: () => {
          setConnected(true);

          // Global pipeline events
          client.subscribe('/topic/pipeline-events', (message) => {
            try {
              const event = JSON.parse(message.body);
              setPipelineEvents((prev) => [event, ...prev].slice(0, 100));
              if (event.repoName) {
                repoListenersRef.current.get(event.repoName)
                  ?.forEach(fn => fn({ type: 'pipeline', data: event }));
              }
            } catch { /* ignore malformed messages */ }
          });

          // Global healing events
          client.subscribe('/topic/healing-events', (message) => {
            try {
              const event = JSON.parse(message.body);
              setHealingEvents((prev) => [event, ...prev].slice(0, 100));
              if (event.repoName) {
                repoListenersRef.current.get(event.repoName)
                  ?.forEach(fn => fn({ type: 'healing', data: event }));
              }
            } catch { /* ignore malformed messages */ }
          });

          // Security scan events
          client.subscribe('/topic/security-events', (message) => {
            try {
              const event = JSON.parse(message.body);
              setSecurityEvents((prev) => [event, ...prev].slice(0, 200));
              if (event.repoName) {
                repoListenersRef.current.get(event.repoName)
                  ?.forEach(fn => fn({ type: 'security', data: event }));
              }
            } catch { /* ignore malformed messages */ }
          });
        },
        onDisconnect: () => setConnected(false),
        onStompError: (frame) => {
          console.error('STOMP error:', frame.headers['message']);
        },
        onWebSocketError: () => {
          // Silently handle WebSocket connection errors — will auto-reconnect
          setConnected(false);
        },
      });

      client.activate();
      clientRef.current = client;
    } catch {
      // SockJS constructor can throw if the endpoint is unreachable
      console.warn('WebSocket connection failed — dashboard will use REST polling');
      setConnected(false);
    }

    return () => {
      try { client?.deactivate(); } catch { /* ignore */ }
    };
  }, []);

  const subscribeToRepo = useCallback((repoName: string, onEvent: (event: any) => void) => {
    if (!repoListenersRef.current.has(repoName)) {
      repoListenersRef.current.set(repoName, new Set());
    }
    repoListenersRef.current.get(repoName)!.add(onEvent);
    return () => {
      const set = repoListenersRef.current.get(repoName);
      if (set) {
        set.delete(onEvent);
        if (set.size === 0) repoListenersRef.current.delete(repoName);
      }
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{
      connected,
      pipelineEvents,
      healingEvents,
      securityEvents,
      subscribeToRepo,
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

/** Hook returning live events filtered to a specific repo */
export function useRepoWebSocket(repoFullName: string) {
  const { connected, subscribeToRepo, pipelineEvents, healingEvents, securityEvents } = useWebSocket();
  const [liveEvents, setLiveEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!repoFullName) return;
    return subscribeToRepo(repoFullName, (event) => {
      setLiveEvents(prev => [event, ...prev].slice(0, 50));
    });
  }, [repoFullName, subscribeToRepo]);

  return {
    connected,
    liveEvents,
    livePipelineEvents: pipelineEvents.filter(e => e.repoName === repoFullName),
    liveHealingEvents:  healingEvents.filter(e => e.repoName === repoFullName),
    liveSecurityEvents: securityEvents.filter(e => e.repoName === repoFullName),
  };
}
