import { getBndSchedule, getBndHours, parseBndHours, setBndHours } from "./bndSchedule.ts";
import { BND_STATUS_POLL_MS, parseBndStatus, type BndStatus } from "./bndOrderAlerts.ts";

export function createBndStatusPolling(options: {
  url: string;
  hoursUrl?: string;
  token: string;
  onSnapshot: (snapshot: BndStatus) => void;
  onFailure: () => void;
  onTick: (now: number) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
  let hoursRefreshAt = 0;
  let disposed = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  function schedule() {
    if (disposed) return;
    const time = now();
    const hours = getBndSchedule(time);
    const delay = hours.open
      ? Math.min(BND_STATUS_POLL_MS, hours.nextChangeAt - time)
      : hours.nextChangeAt - time;
    timer = setTimeout(() => void poll(), Math.max(1, Math.min(delay, options.hoursUrl ? hoursRefreshAt - time : Infinity)));
  }

  async function poll() {
    if (disposed || running) return;
    clearTimeout(timer);
    running = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (options.hoursUrl && now() >= hoursRefreshAt) {
        const requestController = new AbortController();
        controller = requestController;
        timeout = setTimeout(() => requestController.abort(), 10_000);
        try {
          const response = await fetchImpl(options.hoursUrl, {
            headers: { Authorization: `Bearer ${options.token}` }, cache: "no-store", signal: requestController.signal,
          });
          if (!response.ok) throw new Error("B&D hours unavailable");
          const hours = parseBndHours(await response.json());
          if (disposed) return;
          setBndHours(hours);
          // Let the backend finish its opening/midnight refresh before reading its cache.
          hoursRefreshAt = hours.refreshAt === 0 ? now() + 15 * 60_000
            : Math.max(now() + 30_000, hours.refreshAt + 3_000);
        } catch {
          if (disposed) return;
          const saved = getBndHours();
          setBndHours({ ...saved, source: saved.checkedAt === null ? "fallback" : "cached" });
          hoursRefreshAt = now() + 15 * 60_000;
        } finally { clearTimeout(timeout); }
      }
      if (disposed) return;
      options.onTick(now());
      const hours = getBndSchedule(now());
      if (!hours.open) return;
      const requestController = new AbortController();
      controller = requestController;
      timeout = setTimeout(() => requestController.abort(), Math.min(10_000, hours.nextChangeAt - now()));
      const response = await fetchImpl(options.url, {
        headers: { Authorization: `Bearer ${options.token}` }, cache: "no-store", signal: requestController.signal,
      });
      if (!response.ok) throw new Error("B&D status unavailable");
      const snapshot = parseBndStatus(await response.json());
      if (!disposed) options.onSnapshot(snapshot);
    } catch {
      if (!disposed && getBndSchedule(now()).open) options.onFailure();
    } finally {
      clearTimeout(timeout);
      controller = undefined;
      running = false;
      if (!disposed) options.onTick(now());
      schedule();
    }
  }

  return {
    poll,
    stop: () => { disposed = true; controller?.abort(); clearTimeout(timer); },
  };
}
