import { incomingOrderSourceLabel } from "./incomingOrderAlarm";
import type { useIncomingOrderAlarm } from "./useIncomingOrderAlarm";

type Alarm = ReturnType<typeof useIncomingOrderAlarm>;

export function IncomingOrderAlarmControls({ alarm }: { alarm: Alarm }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-600 p-2">
      <button type="button" role="switch" aria-checked={alarm.enabled}
        aria-label="Incoming order alarm" onClick={alarm.toggle}
        className={`rounded-lg px-4 py-2 font-semibold ${alarm.enabled
          ? "bg-green-600 hover:bg-green-700" : "bg-zinc-700 hover:bg-zinc-600"}`}>
        Alarm: {alarm.enabled ? "ON" : "OFF"}
      </button>
      {alarm.enabled && (
        <>
          <button type="button" onClick={alarm.test}
            className="rounded-lg border border-zinc-500 px-3 py-2 hover:bg-zinc-700">
            Test Alarm
          </button>
          {!alarm.audioReady && (
            <button type="button" onClick={alarm.enableSound}
              className="rounded-lg bg-amber-300 px-3 py-2 font-semibold text-zinc-950">
              Enable Sound
            </button>
          )}
        </>
      )}
      <p className="w-full text-xs text-zinc-300">
        {alarm.enabled
          ? alarm.audioReady ? "Sound ready · This browser" : "Click Enable Sound to activate audio."
          : "Incoming-order alerts are off on this browser."}
      </p>
    </div>
  );
}

export function IncomingOrderAlarmPopup({ alarm, onViewOrders }: { alarm: Alarm; onViewOrders: () => void }) {
  if (!alarm.alerting) return null;
  const testOnly = alarm.testing && alarm.pending.length === 0;
  return (
    <aside aria-label="Incoming order notification"
      className="fixed bottom-4 right-4 z-[100] w-[calc(100%-2rem)] max-w-md rounded-2xl border-2 border-red-300 bg-red-950 p-5 text-white shadow-2xl">
      <div role="alert" aria-atomic="true">
        <p className="text-xs font-bold uppercase tracking-wider text-red-200">Speedy Sweeties dispatcher</p>
        <h2 className="mt-1 text-2xl font-bold">
          {testOnly ? "Test alarm" : alarm.pending.length === 1 ? "New order received!" : `${alarm.pending.length} new orders received!`}
        </h2>
        {testOnly ? (
          <p className="mt-2">This is a test. No order has been created.</p>
        ) : (
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto font-semibold">
            {alarm.pending.map(order => (
              <li key={order.id}>Order #{order.orderNumber} · {incomingOrderSourceLabel(order.orderSource)}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-sm text-red-100">
        Repeats every 10 seconds until acknowledged. Acknowledging does not assign a driver.
      </p>
      {!alarm.audioReady && (
        <button type="button" onClick={alarm.enableSound}
          className="mt-3 rounded-lg bg-amber-300 px-4 py-2 font-bold text-zinc-950">
          Enable Sound
        </button>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {!testOnly && (
          <button type="button" onClick={onViewOrders}
            className="rounded-lg bg-white px-4 py-2 font-bold text-red-950 hover:bg-red-100">
            View Orders
          </button>
        )}
        <button type="button" onClick={alarm.acknowledge}
          className="rounded-lg border border-red-200 px-4 py-2 font-semibold hover:bg-red-900">
          Acknowledge
        </button>
      </div>
    </aside>
  );
}
