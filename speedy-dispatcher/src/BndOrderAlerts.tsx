import type { useBndOrderAlerts } from "./useBndOrderAlerts";
import { DispatchToggleControl } from "./DispatchToggleControl";

type Alarm = ReturnType<typeof useBndOrderAlerts>;

export function BndOrderAlertControls({ alarm }: { alarm: Alarm }) {
  let status = "Checking B&D monitoring…";
  if (alarm.unavailable) status = alarm.snapshot?.errorCode === "authentication"
    ? "B&D login needs attention. Monitoring is interrupted."
    : "B&D monitoring interrupted. Waiting-call status may be out of date.";
  else if (alarm.snapshot?.state === "disabled") status = "B&D monitoring has not been enabled.";
  else if (alarm.snapshot?.state === "unconfigured") status = "B&D login has not been set up.";
  else if (alarm.snapshot?.state === "connected") status = `B&D connected · ${alarm.pending.length} waiting`;
  return (
    <DispatchToggleControl label="B&D Alerts" switchLabel="B&D alerts"
      enabled={alarm.enabled} onToggle={alarm.toggle}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p role="status" className={alarm.unavailable ? "text-amber-200" : undefined}>{status}</p>
        {alarm.enabled && !alarm.audioReady && (
          <button type="button" onClick={alarm.enableSound}
            className="py-1 font-semibold underline underline-offset-4 hover:text-white">Enable B&D Sound</button>
        )}
      </div>
      {!alarm.enabled && <p className="mt-1">B&D pop-ups and sound are off on this browser.</p>}
    </DispatchToggleControl>
  );
}

export function BndOrderAlertPopup({ alarm }: { alarm: Alarm }) {
  if (!alarm.alerting) return null;
  return (
    <aside aria-label="B&D waiting call notification"
      className="w-full shrink-0 rounded-2xl border-2 border-amber-300 bg-amber-950 p-5 text-white shadow-2xl">
      <div role="alert" aria-atomic="true">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-200">B&D calls</p>
        <h2 className="mt-1 text-2xl font-bold">{alarm.pending.length === 1
          ? "New B&D order to collect" : `${alarm.pending.length} B&D orders to collect`}</h2>
        <p className="mt-2 font-semibold">Please check B&D.</p>
        <ul className="mt-3 max-h-32 overflow-y-auto">
          {alarm.pending.map(order => <li key={order.id}>Order #{order.number}</li>)}
        </ul>
      </div>
      <p className="mt-3 text-sm text-amber-100">
        Sound repeats every 10 seconds. Open or claim the call in B&D; this alert clears after the next successful check.
      </p>
      {alarm.unavailable && <p role="status" className="mt-3 rounded-lg bg-amber-200 p-2 font-semibold text-amber-950">
        Monitoring interrupted. These are the last known waiting calls. Check B&D directly.
      </p>}
      {!alarm.audioReady && <button type="button" onClick={alarm.enableSound}
        className="mt-3 rounded-lg bg-amber-300 px-4 py-2 font-bold text-zinc-950">Enable B&D Sound</button>}
      <button type="button" onClick={alarm.toggle}
        className="mt-3 block rounded-lg border border-amber-300 px-4 py-2 font-semibold hover:bg-amber-900">
        Turn B&D Alerts Off
      </button>
      <p className="mt-1 text-xs text-amber-100">Off applies to this browser only.</p>
    </aside>
  );
}
