// ─────────────────────────────────────────────
// 3CX Call Control API + WebSocket Types
// ─────────────────────────────────────────────

// Call Control HTTP Request Bodies
export interface MakeCallRequest {
  destination: string;
  source?: string;
  deviceId?: string;
}

export interface TransferRequest {
  destination: string;
}

export interface ConsultTransferRequest {
  consultCallId: string;
}

export interface DtmfRequest {
  digit: string; // "0"-"9", "*", "#"
}

// WebSocket Nachrichtentypen
export type WsEventType =
  | "CallStateChange"
  | "ParticipantUpdate"
  | "DeviceStatusChange"
  | "QueueStatusUpdate"
  | "ActiveCallsUpdate"
  | "ConnectionStatus"
  | "Error";

export interface WsMessage<T = unknown> {
  type: WsEventType;
  payload: T;
}

// WS Event Payloads
export interface CallStateChange {
  callId: string;
  previousState: string;
  currentState: string;
  caller: string;
  callee: string;
  callerDisplayName?: string;
  calleeDisplayName?: string;
}

export interface ParticipantUpdate {
  callId: string;
  participantId: string;
  status: "joined" | "left" | "hold" | "unhold" | "transfer";
  extension?: string;
}

export interface DeviceStatusChange {
  extension: string;
  displayName?: string;
  status: "Online" | "Offline";
}

export interface QueueStatusUpdate {
  queueId: number;
  queueName?: string;
  waitingCalls: number;
  activeAgents: number;
}

// Call Control API Response
export interface CallControlResult {
  success: boolean;
  callId?: string;
  error?: string;
}
