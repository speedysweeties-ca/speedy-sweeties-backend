export const BND_ALERT_REPEAT_MS = 10_000;
export const BND_STATUS_POLL_MS = 10_000;
export type BndStatus = {
  state: "disabled" | "unconfigured" | "checking" | "connected" | "error";
  pendingOrders: { id: string; number: string }[];
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  errorCode: "authentication" | "connection" | "response" | "rate_limited" | null;
};
export type BndAlertState = {
  token: string | null;
  enabled: boolean;
  snapshot: BndStatus | null;
  connectionFailed: boolean;
};
type Action =
  | { type: "session"; token: string | null }
  | { type: "snapshot"; token: string; snapshot: BndStatus }
  | { type: "failed"; token: string }
  | { type: "enabled"; enabled: boolean };

export function createBndAlertState(enabled = true): BndAlertState {
  return { token: null, enabled, snapshot: null, connectionFailed: false };
}

export function bndAlertReducer(state: BndAlertState, action: Action): BndAlertState {
  if (action.type === "session") return state.token === action.token
    ? state : { ...createBndAlertState(), token: action.token };
  if (action.type === "enabled") return { ...state, enabled: action.enabled };
  if (action.type === "failed") return {
    ...state, token: action.token, connectionFailed: true,
    snapshot: state.token === action.token ? state.snapshot : null,
  };
  return { ...state, token: action.token, snapshot: action.snapshot, connectionFailed: false };
}

export function parseBndStatus(value: unknown): BndStatus {
  if (!value || typeof value !== "object") throw new Error("Invalid B&D status");
  const s = value as Record<string, unknown>;
  if (!["disabled", "unconfigured", "checking", "connected", "error"].includes(String(s.state)) ||
      !Array.isArray(s.pendingOrders) || s.pendingOrders.length > 10_000 ||
      (s.errorCode !== null && !["authentication", "connection", "response", "rate_limited"].includes(String(s.errorCode)))) {
    throw new Error("Invalid B&D status");
  }
  for (const field of ["lastSuccessAt", "lastCheckedAt", "nextCheckAt"]) {
    if (s[field] !== null && (typeof s[field] !== "string" || !Number.isFinite(Date.parse(s[field] as string)))) {
      throw new Error("Invalid B&D status");
    }
  }
  const seen = new Set<string>();
  const pendingOrders = s.pendingOrders.map((order: unknown) => {
    if (!order || typeof order !== "object") throw new Error("Invalid B&D status");
    const { id, number } = order as Record<string, unknown>;
    if (typeof id !== "string" || typeof number !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^[A-Za-z0-9_-]{1,64}$/.test(number) || seen.has(id)) {
      throw new Error("Invalid B&D status");
    }
    seen.add(id);
    return { id, number };
  });
  if (s.state === "connected" && !s.lastSuccessAt) throw new Error("Invalid B&D status");
  return { ...s, pendingOrders } as BndStatus;
}

export function getBndAlertView(state: BndAlertState, token: string | null, now = Date.now()) {
  const snapshot = token && state.token === token ? state.snapshot : null;
  const unavailable = Boolean(token && state.token === token && state.connectionFailed) ||
    snapshot?.state === "error" || Boolean(snapshot?.state === "connected" && snapshot.lastSuccessAt &&
      now - Date.parse(snapshot.lastSuccessAt) > 120_000);
  const monitoring = Boolean(snapshot && !["disabled", "unconfigured"].includes(snapshot.state));
  const pending = monitoring ? snapshot!.pendingOrders : [];
  return {
    snapshot, unavailable, pending,
    alerting: Boolean(token && state.enabled && pending.length),
  };
}
