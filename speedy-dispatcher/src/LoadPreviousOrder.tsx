import { useEffect, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";
import {
  getDistinctPreviousOrders,
  getPreviousOrderFields,
  type PreviousOrder,
  type PreviousOrderFields,
} from "./manualPreviousOrder";

type HistoryState = {
  status: "loading" | "error" | "ready";
  orders: PreviousOrder[];
  hasHistory: boolean;
};

const emptyHistory: HistoryState = { status: "loading", orders: [], hasHistory: false };

type Props = {
  customerId: string;
  token: string;
  disabled: boolean;
  onLoad: (fields: PreviousOrderFields) => void;
};

// The parent keys this component by customer ID so another customer's history
// cannot remain visible while the next lookup is pending.
export function LoadPreviousOrder({ customerId, token, disabled, onLoad }: Props) {
  const [history, setHistory] = useState<HistoryState>(emptyHistory);
  const [attempt, setAttempt] = useState(0);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchHistory = async () => {
      try {
        let cursor: string | null = null;
        let orders: PreviousOrder[] = [];
        let hasHistory = false;
        const visitedCursors = new Set<string>();

        while (!controller.signal.aborted) {
          const query = cursor ? `?ordersCursor=${encodeURIComponent(cursor)}` : "";
          const response = await fetch(
            `${API_V1_BASE_URL}/customers/${encodeURIComponent(customerId)}${query}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            }
          );
          const data = await response.json();
          if (controller.signal.aborted) return;
          if (
            !response.ok ||
            data.customer?.id !== customerId ||
            !Array.isArray(data.customer.orders)
          ) {
            throw new Error("Customer history unavailable");
          }
          hasHistory ||= data.customer.orders.length > 0;
          // Keep the newest instance of each basket across history pages.
          orders = getDistinctPreviousOrders([...orders, ...data.customer.orders]);
          cursor = typeof data.nextOrdersCursor === "string" && data.nextOrdersCursor
            ? data.nextOrdersCursor
            : null;
          const needsOlderOrders = orders.length < 2 && cursor !== null;
          setHistory({ status: needsOlderOrders ? "loading" : "ready", orders, hasHistory });
          if (!needsOlderOrders) return;
          if (visitedCursors.has(cursor!)) throw new Error("Order history did not advance");
          visitedCursors.add(cursor!);
        }
      } catch {
        if (!controller.signal.aborted) {
          setHistory((previous) => ({ ...previous, status: "error" }));
        }
      }
    };

    void fetchHistory();
    return () => controller.abort();
  }, [customerId, token, attempt]);

  return (
    <>
      {history.orders.map((order, index) => (
        <PreviousOrderCard
          key={order.id}
          order={order}
          different={index === 1}
          disabled={disabled}
          loaded={loadedOrderId === order.id}
          onLoad={(fields) => {
            onLoad(fields);
            setLoadedOrderId(order.id);
          }}
        />
      ))}
      {history.status === "loading" && (
        <p className="mt-4 text-sm text-zinc-400" role="status">
          {history.orders.length ? "Checking for a different previous order..." : "Checking previous orders..."}
        </p>
      )}
      {history.status === "error" && (
        <div className="mt-4 text-sm text-zinc-400" role="status">
          {history.orders.length ? "Could not finish checking older orders." : "Could not check previous orders."}{" "}
          <button
            type="button"
            disabled={disabled}
            className="text-white underline disabled:opacity-50"
            onClick={() => {
              setHistory(emptyHistory);
              setLoadedOrderId(null);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {history.status === "ready" && history.hasHistory && history.orders.length === 0 && (
        <p className="mt-4 text-sm text-zinc-400" role="status">Previous orders have no usable item details. Please enter the items below.</p>
      )}
    </>
  );
}

function PreviousOrderCard({ order, different, disabled, loaded, onLoad }: {
  order: PreviousOrder;
  different: boolean;
  disabled: boolean;
  loaded: boolean;
  onLoad: Props["onLoad"];
}) {
  const fields = getPreviousOrderFields(order);
  if (!fields) return null;

  const { createdAt, deliveredAt, orderStatus } = order;
  const createdTime = createdAt ? new Date(createdAt).getTime() : NaN;
  const deliveredTime = deliveredAt ? new Date(deliveredAt).getTime() : NaN;
  const hasDeliveryTime = orderStatus !== "CANCELLED" && Number.isFinite(deliveredTime);
  const deliveredLabel = hasDeliveryTime
    ? new Date(deliveredTime).toLocaleString("en-CA", {
        timeZone: "America/Toronto",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      })
    : orderStatus === "CANCELLED"
      ? "Cancelled — not delivered"
      : orderStatus === "DELIVERED"
        ? "Delivery time not recorded"
        : "Not delivered yet";
  const deliveryMinutes = hasDeliveryTime && Number.isFinite(createdTime) && deliveredTime >= createdTime
    ? Math.floor((deliveredTime - createdTime) / 60000)
    : null;

  return (
    <section aria-label={different ? "Different previous order" : "Previous order"} className="mt-6 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
      {different && <h3 className="mb-3 font-semibold text-zinc-100">Different previous order</h3>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition font-semibold disabled:opacity-50"
          onClick={() => onLoad(fields)}
        >
          {different ? "Load Different Previous Order" : "Load Previous Order"}
        </button>
        <span className="text-sm text-zinc-400">Order #{order.orderNumber}</span>
      </div>
      <div className="mt-3 space-y-1 text-sm text-zinc-300">
        <p><span className="font-semibold text-zinc-100">Delivered:</span> {deliveredLabel}</p>
        {hasDeliveryTime && (
          <p><span className="font-semibold text-zinc-100">Delivery time:</span> {deliveryMinutes === null ? "Not available" : `${deliveryMinutes} min`}</p>
        )}
      </div>
      <ul aria-label={different ? "Different previous order items" : "Previous order items"} className="mt-3 space-y-1 text-sm text-zinc-100">
        {fields.items.map((item, index) => (
          <li key={index} className="break-words">
            <span className="font-semibold">{item.quantity} ×</span> {item.itemName}
          </li>
        ))}
      </ul>
      {loaded && <p className="mt-2 text-sm text-green-400" role="status">Previous order loaded. Review the details before creating the order.</p>}
    </section>
  );
}
