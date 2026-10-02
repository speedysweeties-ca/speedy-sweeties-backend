import { useCallback, useEffect, useReducer, useState } from "react";
import {
  createOrderAlarmState, orderAlarmReducer, ORDER_ALARM_REPEAT_MS,
  ORDER_ALARM_STORAGE_KEY, type AlarmOrder,
} from "./incomingOrderAlarm";
import { OrderAlarmAudio } from "./orderAlarmAudio";

function loadAlarmState() {
  try { return createOrderAlarmState(localStorage.getItem(ORDER_ALARM_STORAGE_KEY) !== "false"); }
  catch { return createOrderAlarmState(); }
}

export function useIncomingOrderAlarm(active: boolean) {
  const [state, dispatch] = useReducer(orderAlarmReducer, undefined, loadAlarmState);
  const [audio] = useState(() => new OrderAlarmAudio());
  const [audioReady, setAudioReady] = useState(false);
  const pendingKey = state.pending.map(order => order.id).sort().join(",");
  const alerting = active && state.enabled && (state.pending.length > 0 || state.testing);

  const enableSound = useCallback(() => {
    void audio.unlock(setAudioReady);
  }, [audio]);

  useEffect(() => {
    try { localStorage.setItem(ORDER_ALARM_STORAGE_KEY, String(state.enabled)); }
    catch { /* The switch still works when browser storage is unavailable. */ }
  }, [state.enabled]);

  useEffect(() => {
    if (!active || !state.enabled) return;
    // The explicit Enable Sound/Test Alarm controls remain available if a
    // browser rejects a gesture or suspends the context later.
    const unlock = (event: Event) => {
      if (event.isTrusted) enableSound();
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [active, state.enabled, enableSound]);

  useEffect(() => () => audio.close(), [active, audio]);

  useEffect(() => {
    if (!alerting || !audioReady) return;
    const play = () => {
      if (!audio.play()) setAudioReady(false);
    };
    play();
    const interval = window.setInterval(play, ORDER_ALARM_REPEAT_MS);
    return () => {
      window.clearInterval(interval);
      audio.stop();
    };
  }, [alerting, audioReady, pendingKey, state.testing, audio]);

  useEffect(() => {
    if (!alerting) return;
    const originalTitle = document.title;
    document.title = state.pending.length
      ? `(${state.pending.length}) New order — Speedy Sweeties`
      : "Test alarm — Speedy Sweeties";
    return () => { document.title = originalTitle; };
  }, [alerting, state.pending.length]);

  const receiveOrders = useCallback((orders: AlarmOrder[]) => {
    dispatch({ type: "snapshot", orders });
  }, []);

  return {
    ...state, audioReady, alerting, receiveOrders, enableSound,
    toggle: () => {
      audio.stop();
      if (!state.enabled) enableSound();
      dispatch({ type: "enabled", enabled: !state.enabled });
    },
    acknowledge: () => {
      audio.stop();
      dispatch({ type: "acknowledge" });
    },
    test: () => {
      enableSound();
      dispatch({ type: "test" });
    },
    reset: () => {
      audio.close();
      setAudioReady(false);
      dispatch({ type: "reset" });
    },
  };
}
