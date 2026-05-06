"use client";

import { create } from "zustand";
import type { ActiveCall, CallStateChange, QueueStatusUpdate } from "@3cx-dash/types";

export type WsStatus = "disconnected" | "connecting" | "connected" | "error";

interface CallsStore {
  activeCalls: ActiveCall[];
  wsStatus: WsStatus;
  lastWsEvent: string | null;
  selectedCallId: string | null;

  setActiveCalls: (calls: ActiveCall[]) => void;
  updateCallState: (change: CallStateChange) => void;
  removeCall: (callId: string) => void;
  setWsStatus: (status: WsStatus) => void;
  setLastWsEvent: (event: string) => void;
  selectCall: (callId: string | null) => void;
}

export const useCallsStore = create<CallsStore>((set) => ({
  activeCalls: [],
  wsStatus: "disconnected",
  lastWsEvent: null,
  selectedCallId: null,

  setActiveCalls: (calls) => set({ activeCalls: calls }),

  updateCallState: (change) =>
    set((state) => ({
      activeCalls: state.activeCalls.map((c) =>
        // Id ist number in XAPI, callId kann string vom WebSocket sein
        String(c.Id) === String(change.callId)
          ? { ...c, Status: change.currentState as ActiveCall["Status"] }
          : c
      ),
    })),

  removeCall: (callId) =>
    set((state) => ({
      activeCalls: state.activeCalls.filter((c) => String(c.Id) !== String(callId)),
      selectedCallId: state.selectedCallId === callId ? null : state.selectedCallId,
    })),

  setWsStatus: (wsStatus) => set({ wsStatus }),
  setLastWsEvent: (lastWsEvent) => set({ lastWsEvent }),
  selectCall: (selectedCallId) => set({ selectedCallId }),
}));
