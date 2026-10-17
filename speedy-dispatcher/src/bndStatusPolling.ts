import { getBndSchedule } from "./bndSchedule.ts";
import { BND_STATUS_POLL_MS, parseBndStatus, type BndStatus } from "./bndOrderAlerts.ts";

export function createBndStatusPolling(options: {
  url: string;
  token: string;
  onSnapshot: (snapshot: BndStatus) => void;
  onFailure: () => void;
  onTick: (now: number) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
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
    timer = setTimeout(() => void poll(), Math.max(1, delay));
  }

  async function poll() {
    if (disposed || running) return;
    clearTimeout(timer);
    options.onTick(now());
    const hours = getBndSchedule(now());
    if (!hours.open) { schedule(); return; }
    running = true;
    const requestController = new AbortController();
    controller = requestController;
    const timeout = setTimeout(() => requestController.abort(), Math.min(10_000, hours.nextChangeAt - now()));
    try {
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
