import { useCallback, useEffect, useReducer, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";
import { OrderAlarmAudio } from "./orderAlarmAudio";
import {
  BND_ALERT_REPEAT_MS, BND_STATUS_POLL_MS,
  bndAlertReducer, createBndAlertState, getBndAlertView, parseBndStatus,
} from "./bndOrderAlerts";

export function useBndOrderAlerts(token: string | null) {
  const [state, dispatch] = useReducer(bndAlertReducer, undefined, createBndAlertState);
  const [audio] = useState(() => new OrderAlarmAudio());
  const [audioReady, setAudioReady] = useState(false);
  const [now, setNow] = useState(Date.now);
  const view = getBndAlertView(state, token, now);
  const pendingKey = view.pending.map(order => order.id).sort().join(",");
  const enableSound = useCallback(() => { void audio.unlock(setAudioReady); }, [audio]);

  useEffect(() => {
    // A new dispatcher session always starts with alerts on.
    dispatch({ type: "session", token });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const poll = async () => {
      if (disposed || running) return;
      running = true;
      clearTimeout(timer);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetch(`${API_V1_BASE_URL}/bnd-alerts/status`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("B&D status unavailable");
        const snapshot = parseBndStatus(await response.json());
        if (!disposed) dispatch({ type: "snapshot", token, snapshot });
      } catch {
        if (!disposed) dispatch({ type: "failed", token });
      } finally {
        clearTimeout(timeout);
        running = false;
        if (!disposed) {
          setNow(Date.now());
          timer = setTimeout(() => void poll(), BND_STATUS_POLL_MS);
        }
      }
    };
    const resume = () => { if (!document.hidden) void poll(); };
    void poll();
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [token]);

  useEffect(() => {
    if (!token || !state.enabled) return;
    const unlock = (event: Event) => { if (event.isTrusted) enableSound(); };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [token, state.enabled, enableSound]);

  useEffect(() => () => audio.close(), [token, audio]);

  useEffect(() => {
    if (!view.alerting || !audioReady) return;
    const play = () => { if (!audio.play()) setAudioReady(false); };
    play();
    const timer = setInterval(play, BND_ALERT_REPEAT_MS);
    return () => { clearInterval(timer); audio.stop(); };
  }, [view.alerting, audioReady, pendingKey, audio]);

  return {
    ...view, enabled: state.enabled, audioReady, enableSound,
    toggle: () => {
      audio.stop();
      if (!state.enabled) enableSound();
      dispatch({ type: "enabled", enabled: !state.enabled });
    },
  };
}
