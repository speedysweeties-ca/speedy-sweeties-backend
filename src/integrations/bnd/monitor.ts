// BDD Dispatcher 1.0.0 uses these two endpoints. Never open order details:
// its details screen sends a PATCH that claims the order.
const LOGIN_URL = "https://api.bddeliveries.ca/api/account/login";
const ORDERS_URL = "https://api.bddeliveries.ca/api/driver/order";
export const BND_POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_RETRY_MS = 15 * 60_000;

type ErrorCode = "authentication" | "connection" | "response" | "rate_limited";
export type BndPendingOrder = { id: string; number: string };
export type BndStatus = {
  state: "disabled" | "unconfigured" | "checking" | "connected" | "error";
  pendingOrders: BndPendingOrder[];
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  nextCheckAt: string | null;
  errorCode: ErrorCode | null;
};
type Options = {
  enabled: boolean;
  email: string;
  password: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  requestTimeoutMs?: number;
};

class MonitorError extends Error {
  constructor(public code: ErrorCode, public retryMs = 0) {
    super(code); // Never retain upstream error text, responses or credentials.
  }
}

function identifier(value: unknown): string {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
    throw new MonitorError("response");
  }
  if (typeof value !== "string" && typeof value !== "number") throw new MonitorError("response");
  const text = String(value);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(text)) throw new MonitorError("response");
  return text;
}

export function parseBndOrders(body: unknown): BndPendingOrder[] {
  if (!Array.isArray(body) || body.length > 10_000) throw new MonitorError("response");
  const pending: BndPendingOrder[] = [];
  const seen = new Set<string>();
  for (const item of body) {
    if (!item || typeof item !== "object") throw new MonitorError("response");
    const id = identifier(item.id);
    const number = identifier(item.number_id);
    // The APK treats this as a boolean. Reject missing/unknown values rather
    // than silently reporting no waiting calls after an upstream change.
    if (![true, false, 0, 1].includes(item.is_en_route)) throw new MonitorError("response");
    if (seen.has(id)) throw new MonitorError("response");
    seen.add(id);
    if (item.is_en_route === false || item.is_en_route === 0) pending.push({ id, number });
  }
  return pending;
}

async function readJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES || !response.body) {
    await response.body?.cancel();
    throw new MonitorError("response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new MonitorError("response");
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new MonitorError("response"); }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createBndMonitor(options: Options) {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const configured = Boolean(options.email.trim() && options.password);
  let status: BndStatus = {
    state: !options.enabled ? "disabled" : !configured ? "unconfigured" : "checking",
    pendingOrders: [], lastCheckedAt: null, lastSuccessAt: null, nextCheckAt: null, errorCode: null,
  };
  let token: string | null = null;
  let inFlight = false;
  let failures = 0;
  let notBefore = 0;
  let stopped = false;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  async function request(url: string, init: RequestInit) {
    if (stopped) throw new MonitorError("connection");
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { ...init, redirect: "error", signal: controller.signal });
      if (!response.ok) {
        const retry = response.headers.get("retry-after");
        const seconds = retry === null ? NaN : Number(retry);
        const retryMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry ?? "") - now();
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) throw new MonitorError("authentication");
        if (response.status === 429) throw new MonitorError("rate_limited", Number.isFinite(retryMs) ? Math.max(0, Math.min(retryMs, 24 * 60 * 60_000)) : 0);
        throw new MonitorError("connection");
      }
      return await readJson(response);
    } finally {
      clearTimeout(timeout);
      controller = undefined;
    }
  }

  async function login() {
    const body = await request(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: options.email.trim(), password: options.password }),
    });
    if (!body || typeof body !== "object" || !("token" in body) ||
        typeof body.token !== "string" || !body.token || body.token.length > 16_384 || /\s/.test(body.token)) {
      throw new MonitorError("authentication");
    }
    if (!stopped) token = body.token;
  }

  async function readOrders() {
    return parseBndOrders(await request(ORDERS_URL, {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }));
  }

  async function check() {
    if (stopped || inFlight || !options.enabled || !configured || now() < notBefore) return;
    inFlight = true;
    status.lastCheckedAt = new Date(now()).toISOString();
    try {
      const hadToken = Boolean(token);
      if (!token) await login();
      let pendingOrders: BndPendingOrder[];
      try { pendingOrders = await readOrders(); }
      catch (error) {
        // Refresh an expired session once. Bad credentials never cause a tight login loop.
        if (!(error instanceof MonitorError) || error.code !== "authentication" || !hadToken || stopped) throw error;
        token = null;
        await login();
        pendingOrders = await readOrders();
      }
      if (stopped) return;
      failures = 0;
      notBefore = now() + BND_POLL_MS;
      status = {
        state: "connected", pendingOrders, lastCheckedAt: status.lastCheckedAt,
        lastSuccessAt: new Date(now()).toISOString(), nextCheckAt: new Date(notBefore).toISOString(), errorCode: null,
      };
    } catch (error) {
      if (stopped) return;
      const safeError = error instanceof MonitorError ? error : new MonitorError("connection");
      if (safeError.code === "authentication") token = null;
      failures = Math.min(failures + 1, 5);
      const backoff = Math.min(MAX_RETRY_MS, BND_POLL_MS * 2 ** (failures - 1));
      const delay = Math.max(backoff, safeError.retryMs, safeError.code === "authentication" ? MAX_RETRY_MS : 0);
      notBefore = now() + delay;
      // Retain last-known waiting calls on failure. An outage is never an empty queue.
      status = { ...status, state: "error", errorCode: safeError.code, nextCheckAt: new Date(notBefore).toISOString() };
    } finally { inFlight = false; }
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    token = null;
  }

  function start() {
    if (started || stopped) return stop;
    started = true;
    if (!options.enabled || !configured) return stop;
    const tick = async () => {
      await check();
      if (!stopped) {
        timer = setTimeout(() => void tick(), Math.max(BND_POLL_MS, notBefore - now()));
        timer.unref();
      }
    };
    void tick();
    return stop;
  }

  function getStatus(): BndStatus {
    const stale = status.state === "connected" && status.lastSuccessAt &&
      now() - Date.parse(status.lastSuccessAt) > 2 * BND_POLL_MS;
    return {
      ...status,
      ...(stale ? { state: "error" as const, errorCode: "connection" as const } : {}),
      pendingOrders: status.pendingOrders.map(order => ({ ...order })),
    };
  }
  return { start, stop, check, getStatus };
}
