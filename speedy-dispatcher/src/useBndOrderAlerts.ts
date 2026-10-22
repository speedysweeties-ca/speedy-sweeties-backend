import { useCallback, useEffect, useReducer, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";
import { OrderAlarmAudio } from "./orderAlarmAudio";
import { createBndStatusPolling } from "./bndStatusPolling";
import {
  BND_ALERT_REPEAT_MS,
  bndAlertReducer, createBndAlertState, getBndAlertView,
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
    const polling = createBndStatusPolling({
      url: `${API_V1_BASE_URL}/bnd-alerts/status`,
      hoursUrl: `${API_V1_BASE_URL}/bnd-alerts/hours`, token,
      onSnapshot: snapshot => dispatch({ type: "snapshot", token, snapshot }),
      onFailure: () => dispatch({ type: "failed", token }), onTick: setNow,
    });
    const resume = () => { if (!document.hidden) void polling.poll(); };
    void polling.poll();
    document.addEventListener("visibilitychange", resume);
    return () => {
      polling.stop();
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
