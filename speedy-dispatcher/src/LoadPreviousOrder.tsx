import { useEffect, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";
import {
  getPreviousOrderFields,
  type PreviousOrder,
  type PreviousOrderFields,
} from "./manualPreviousOrder";

type HistoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; order: PreviousOrder | null };

type Props = {
  customerId: string;
  token: string;
  disabled: boolean;
  onLoad: (fields: PreviousOrderFields) => void;
};

// The parent keys this component by customer ID so another customer's history
// cannot remain visible while the next lookup is pending.
export function LoadPreviousOrder({ customerId, token, disabled, onLoad }: Props) {
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const fetchHistory = async () => {
      try {
        const response = await fetch(
          `${API_V1_BASE_URL}/customers/${encodeURIComponent(customerId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        );
        const data = await response.json();
        if (
          !response.ok ||
          data.customer?.id !== customerId ||
          !Array.isArray(data.customer.orders)
        ) {
          throw new Error("Customer history unavailable");
        }
        if (!controller.signal.aborted) {
          // Customer history is returned newest first by the existing API.
          setHistory({ status: "ready", order: data.customer.orders[0] ?? null });
        }
      } catch {
        if (!controller.signal.aborted) setHistory({ status: "error" });
      }
    };

    void fetchHistory();
    return () => controller.abort();
  }, [customerId, token, attempt]);

  if (history.status === "loading") {
    return <p className="mt-4 text-sm text-zinc-400" role="status">Checking previous order...</p>;
  }

  if (history.status === "error") {
    return (
      <div className="mt-4 text-sm text-zinc-400" role="status">
        Could not check previous order.{" "}
        <button
          type="button"
          disabled={disabled}
          className="text-white underline disabled:opacity-50"
          onClick={() => {
            setHistory({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!history.order) return null;
  const fields = getPreviousOrderFields(history.order);
  if (!fields) {
    return <p className="mt-4 text-sm text-zinc-400" role="status">The previous order has no usable item details. Please enter the items below.</p>;
  }

  return (
    <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition font-semibold disabled:opacity-50"
          onClick={() => {
            onLoad(fields);
            setLoaded(true);
          }}
        >
          Load Previous Order
        </button>
        <span className="text-sm text-zinc-400">Order #{history.order.orderNumber}</span>
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        Replaces the items, quantities and payment method with the previous order. You can edit them before creating the order.
      </p>
      {loaded && <p className="mt-2 text-sm text-green-400" role="status">Previous order loaded. Review the details before creating the order.</p>}
    </div>
  );
}
