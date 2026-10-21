import { dispatchWaitingMilliseconds, type EditPause } from "./dispatchTiming.ts";
export const ORDER_ALARM_STORAGE_KEY = "speedy-dispatcher-order-alarm-enabled";
export const ORDER_ALARM_REPEAT_MS = 10_000;
export const UNACCEPTED_ORDER_WARNING_MS = 5 * 60_000;
export const UNACCEPTED_ORDER_REPEAT_MS = 30_000;

export type AlarmOrder = {
  id: string;
  orderNumber: number;
  orderStatus: string;
  orderSource?: string | null;
  createdByUserId?: string | null;
  createdAt?: string | null;
  acceptedAt?: string | null;
  dispatchedAt?: string | null;
  firstDispatchedAt?: string | null;
  dispatchEditPauses?: EditPause[];
};

export type OrderAlarmState = {
  enabled: boolean;
  initialized: boolean;
  seen: Set<string>;
  pending: AlarmOrder[];
  waitingForAcceptance: AlarmOrder[];
  testing: boolean;
};

export type OrderAlarmAction =
  | { type: "snapshot"; orders: AlarmOrder[] }
  | { type: "enabled"; enabled: boolean }
  | { type: "acknowledge" }
  | { type: "test" }
  | { type: "reset" };

export const createOrderAlarmState = (enabled = true): OrderAlarmState => ({
  enabled, initialized: false, seen: new Set(), pending: [], waitingForAcceptance: [], testing: false,
});

const isWaitingForAcceptance = (order: AlarmOrder) =>
  !order.acceptedAt && ["PLACED", "DISPATCHED"].includes(order.orderStatus);

// Card and sound share the clock, excluding verified pre-dispatch editing.
export const isUnacceptedOrderLate = (order: AlarmOrder, nowMs: number) => {
  const createdMs = order.createdAt ? Date.parse(order.createdAt) : NaN;
  return isWaitingForAcceptance(order) && Number.isFinite(createdMs) &&
    dispatchWaitingMilliseconds(order, nowMs) >= UNACCEPTED_ORDER_WARNING_MS;
};

export const isIncomingCustomerOrder = (order: AlarmOrder) =>
  order.orderSource !== "DISPATCHER_MANUAL" && !order.createdByUserId &&
  ["PLACED", "DISPATCHED", "ACCEPTED", "OUT_FOR_DELIVERY"].includes(order.orderStatus);

export const incomingOrderSourceLabel = (source?: string | null) => {
  switch (source) {
    case "ANDROID_APP": return "Android app";
    case "IOS_APP": return "iOS app";
    case "WEBFLOW": return "Website";
    case "CHATGPT": return "ChatGPT";
    // The current ChatGPT gateway uses UNKNOWN. Do not mislabel other sources.
    default: return "Customer order";
  }
};

export function orderAlarmReducer(state: OrderAlarmState, action: OrderAlarmAction): OrderAlarmState {
  switch (action.type) {
    case "enabled":
      return { ...state, enabled: action.enabled, pending: [], testing: false };
    case "acknowledge":
      return { ...state, pending: [], testing: false };
    case "test":
      return state.enabled ? { ...state, testing: true } : state;
    case "reset":
      return createOrderAlarmState(state.enabled);
    case "snapshot": {
      const seen = new Set(state.seen);
      const pendingIds = new Set(state.pending.map(order => order.id));
      const pending: AlarmOrder[] = [];
      for (const order of action.orders) {
        const fresh = !seen.has(order.id);
        // Keep all seen IDs for this login session, even after orders leave the board.
        seen.add(order.id);
        if (state.enabled && state.initialized && isIncomingCustomerOrder(order) &&
            (pendingIds.has(order.id) || fresh)) {
          pending.push(order);
          pendingIds.delete(order.id);
        }
      }
      // First successful snapshot is a baseline, not a new batch of orders.
      const waitingForAcceptance = Array.from(new Map(
        action.orders.filter(isWaitingForAcceptance).map(order => [order.id, order])
      ).values());
      return { ...state, initialized: true, seen, pending, waitingForAcceptance };
    }
  }
}
