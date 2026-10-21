import { useEffect, useRef, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";
import type { EditPause } from "./dispatchTiming";

export type EditTimingSnapshot = {
  orderId: string;
  dispatchEditPauses: EditPause[];
  firstDispatchedAt: string | null;
  dispatchedAt: string | null;
  paused: boolean;
  serverNow: string;
};

// A visible editor renews its server lease. Save, cancel, navigation, logout,
// visibility changes and page close all stop it; a crash expires in 45 seconds.
export function useOrderEditPause(
  token: string | null,
  orderId: string | null,
  enabled: boolean,
  onTiming: (snapshot: EditTimingSnapshot) => void
) {
  const update = useRef(onTiming);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const [problem, setProblem] = useState<{ orderId: string; message: string } | null>(null);
  useEffect(() => { update.current = onTiming; }, [onTiming]);
  useEffect(() => {
    const visibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  useEffect(() => {
    if (!token || !orderId || !enabled || !visible) return;
    let sessionId = crypto.randomUUID();
    let started = false;
    let stopped = false;
    let inFlight = false;
    const request = async (action: "start" | "heartbeat" | "stop", id = sessionId) => {
      const response = await fetch(`${API_V1_BASE_URL}/orders/${orderId}/edit-pause`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId: id }),
        keepalive: action === "stop",
        signal: action === "stop" ? undefined : AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        if (response.status === 409) { sessionId = crypto.randomUUID(); started = false; }
        throw new Error("Editing pause could not be confirmed. The timer may be running; reconnect to resume the pause.");
      }
      return await response.json() as EditTimingSnapshot;
    };
    const tick = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const snapshot = await request(started ? "heartbeat" : "start");
        if (!stopped) {
          started = true;
          update.current(snapshot);
          setProblem(null);
          // No more renewals are needed after first dispatch or cancellation.
          if (!snapshot.paused) window.clearInterval(timer);
        }
      } catch (error) {
        if (!stopped) setProblem({ orderId, message: error instanceof Error ? error.message : "Unable to pause dispatch timer" });
      } finally { inFlight = false; }
    };
    const timer = window.setInterval(() => void tick(), 15_000);
    void tick();
    const stop = () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      // The server also handles a stop arriving before its start.
      void request("stop").then(snapshot => update.current(snapshot)).catch(() => {
        // A lost close request is bounded by the server lease.
      });
    };
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [token, orderId, enabled, visible]);

  return problem?.orderId === orderId ? problem.message : null;
}
