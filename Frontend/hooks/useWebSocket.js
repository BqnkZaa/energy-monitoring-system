'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL =
  (typeof window !== 'undefined' && window.__WS_URL__) ||
  process.env.NEXT_PUBLIC_WS_URL ||
  'ws://192.168.1.100:8000/ws';

const RECONNECT_DELAY_MS = 3000;

/**
 * Custom Hook: useWebSocket
 * เชื่อมต่อ WebSocket Server ของ Backend และ Auto-Reconnect
 * @returns {{ data, status, lastUpdated, wsClients }}
 */
export function useWebSocket() {
  const [data, setData]               = useState(null);
  const [status, setStatus]           = useState('connecting');
  const [lastUpdated, setLastUpdated] = useState(null);
  const wsRef                         = useRef(null);
  const reconnectTimer                = useRef(null);
  const mountedRef                    = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      setStatus('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus('connected');
        console.log('[WS] ✅ เชื่อมต่อสำเร็จ:', WS_URL);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'energy_update' && msg.data) {
            setData(msg.data);
            setLastUpdated(new Date());
          }
          // Welcome message — ไม่ต้องทำอะไร
        } catch (e) {
          console.error('[WS] Parse Error:', e);
        }
      };

      ws.onclose = (e) => {
        if (!mountedRef.current) return;
        setStatus('disconnected');
        console.warn(`[WS] Disconnected (code=${e.code}) — reconnect ใน ${RECONNECT_DELAY_MS}ms`);
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        // onerror มักตามด้วย onclose อัตโนมัติ
        console.error('[WS] Connection error');
      };
    } catch (e) {
      console.error('[WS] Failed to connect:', e);
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // รอ 100ms ให้ client render ก่อน (หลีกเลี่ยง SSR issue)
    const initTimer = setTimeout(connect, 100);

    return () => {
      mountedRef.current = false;
      clearTimeout(initTimer);
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, 'Component unmounted');
    };
  }, [connect]);

  return { data, status, lastUpdated };
}
