"use client";

import { useEffect, useRef, useCallback } from "react";
import { useCallsStore } from "@/store/calls-store";
import type { WsMessage, CallStateChange, DeviceStatusChange, QueueStatusUpdate } from "@3cx-dash/types";

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setWsStatus, updateCallState, removeCall, setLastWsEvent } = useCallsStore();

  const connect = useCallback(async () => {
    setWsStatus("connecting");

    try {
      const res = await fetch("/api/ws-token");
      if (!res.ok) throw new Error("WS-Token Anfrage fehlgeschlagen");
      const { token, wsUrl } = await res.json();

      const ws = new WebSocket(`${wsUrl}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        setWsStatus("connected");
        setLastWsEvent(`Verbunden @ ${new Date().toLocaleTimeString("de-DE")}`);
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data as string);
          setLastWsEvent(`${msg.type} @ ${new Date().toLocaleTimeString("de-DE")}`);

          switch (msg.type) {
            case "CallStateChange": {
              const change = msg.payload as CallStateChange;
              if (
                change.currentState === "Disconnected" ||
                change.currentState === "Terminated"
              ) {
                removeCall(change.callId);
              } else {
                updateCallState(change);
              }
              break;
            }
            case "QueueStatusUpdate":
              window.dispatchEvent(
                new CustomEvent("3cx:queue-update", { detail: msg.payload as QueueStatusUpdate })
              );
              break;
            case "DeviceStatusChange":
              window.dispatchEvent(
                new CustomEvent("3cx:device-status", { detail: msg.payload as DeviceStatusChange })
              );
              break;
            case "ActiveCallsUpdate":
              window.dispatchEvent(new CustomEvent("3cx:active-calls-update"));
              break;
          }
        } catch {
          // Fehlerhafte Nachrichten ignorieren
        }
      };

      ws.onerror = () => {
        setWsStatus("error");
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current++;
          const delay = Math.min(RECONNECT_DELAY_MS * reconnectAttempts.current, 30_000);
          reconnectTimer.current = setTimeout(connect, delay);
        }
      };
    } catch {
      setWsStatus("error");
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS * 2);
      }
    }
  }, [setWsStatus, updateCallState, removeCall, setLastWsEvent]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { reconnect: connect, wsStatus: useCallsStore((s) => s.wsStatus) };
}
