import { useMemo, useState } from "react";
import {
  DISPATCHER_PERFORMANCE_SOURCE_GROUPS,
  type DispatcherPerformanceSourceGroup,
} from "./dispatcherPerformanceFilters";

type UserRole = "ADMIN" | "DISPATCHER";
type OrderStatus =
  | "PLACED"
  | "DISPATCHED"
  | "ACCEPTED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";
type OrderSource =
  | "UNKNOWN"
  | "ANDROID_APP"
  | "IOS_APP"
  | "WEBFLOW"
  | "DISPATCHER_MANUAL";

type DurationBreakdown = {
  sourceGroup: DispatcherPerformanceSourceGroup;
  totalOrders: number;
  averageDispatchMinutes: number | null;
  medianDispatchMinutes: number | null;
  p90DispatchMinutes: number | null;
  withinFiveMinutesPercent: number | null;
};

type PerformanceSummary = {
  manualOrdersCreated: number;
  manualEntryTimeSamples: number;
  averageManualEntryMinutes: number | null;
  ordersDispatched: number;
  dispatchTimeSamples: number;
  averageDispatchMinutes: number | null;
  medianDispatchMinutes: number | null;
  p90DispatchMinutes: number | null;
  withinFiveMinutesPercent: number | null;
  deliveredOrders: number;
  averageTotalDeliveryMinutes: number | null;
  averagePostDispatchDeliveryMinutes: number | null;
  cancelledOrders: number;
  assignmentActions: number;
  reassignments: number;
  unassignments: number;
};

type DispatcherPerformanceStat = PerformanceSummary & {
  dispatcherId: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  sourceBreakdown: DurationBreakdown[];
};

type DispatcherOption = {
  dispatcherId: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  role: UserRole;
  isActive: boolean;
};

type PerformanceOrder = {
  orderId: string;
  orderNumber: number;
  dispatcherId: string | null;
  orderStatus: OrderStatus;
  orderSource: OrderSource;
  sourceGroup: DispatcherPerformanceSourceGroup;
  createdAt: string;
  dispatchedAt: string | null;
  dispatchMinutes: number | null;
  withinFiveMinutes: boolean | null;
  deliveredAt: string | null;
  totalDeliveryMinutes: number | null;
  postDispatchDeliveryMinutes: number | null;
};

export type DispatcherPerformanceData = {
  generatedAt: string;
  timeZone: string;
  range: { startDate: string; endDate: string; days: number };
  dispatchers: DispatcherOption[];
  selectedDispatcherIds: string[];
  selectedSourceGroups: DispatcherPerformanceSourceGroup[];
  summary: PerformanceSummary;
  coverage: {
    allOrdersInRange: number;
    totalOrders: number;
    automaticDispatches: number;
    driverDispatches: number;
    unattributedManualDispatches: number;
    unattributedDispatches: number;
    undispatchedOrders: number;
    unknownSourceOrders: number;
  };
  sourceBreakdown: DurationBreakdown[];
  dailyTrend: Array<{
    date: string;
    totalOrders: number;
    averageDispatchMinutes: number | null;
    medianDispatchMinutes: number | null;
    p90DispatchMinutes: number | null;
    withinFiveMinutesPercent: number | null;
  }>;
  stats: DispatcherPerformanceStat[];
  orders: PerformanceOrder[];
};

type DispatcherPerformanceProps = {
  data: DispatcherPerformanceData | null;
  loading: boolean;
  startDate: string;
  endDate: string;
  selectedDispatcherIds: string[];
  selectedSourceGroups: DispatcherPerformanceSourceGroup[];
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onToggleDispatcher: (dispatcherId: string) => void;
  onSelectAllDispatchers: () => void;
  onClearDispatchers: () => void;
  onToggleSourceGroup: (sourceGroup: DispatcherPerformanceSourceGroup) => void;
  onClearSourceGroups: () => void;
  onPresetDays: (days: number) => void;
  onRefresh: () => void;
};

const sourceLabels: Record<DispatcherPerformanceSourceGroup, string> = {
  APP: "Customer Apps",
  ONLINE: "Website",
  MANUAL: "Manual / Telephone",
  UNKNOWN: "Unknown / Historical"
};

const statusLabels: Record<OrderStatus, string> = {
  PLACED: "Placed",
  DISPATCHED: "Dispatched",
  ACCEPTED: "Accepted",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled"
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const formatMinutes = (value: number | null): string =>
  value === null ? "—" : `${value.toLocaleString("en-CA")} min`;

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${value.toLocaleString("en-CA")}%`;

const formatDateTime = (value: string | null): string =>
  value ? dateTimeFormatter.format(new Date(value)) : "—";

const MetricCard = ({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) => (
  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
    <p className="text-sm font-semibold text-zinc-400">{label}</p>
    <p className="mt-2 text-3xl font-black text-white">{value}</p>
    <p className="mt-2 text-xs text-zinc-500">{note}</p>
  </div>
);

const dispatcherName = (
  dispatcherId: string | null,
  dispatchers: DispatcherOption[]
): string =>
  dispatchers.find((dispatcher) => dispatcher.dispatcherId === dispatcherId)
    ?.displayName ?? "Unattributed";

export function DispatcherPerformance({
  data,
  loading,
  startDate,
  endDate,
  selectedDispatcherIds,
  selectedSourceGroups,
  onStartDateChange,
  onEndDateChange,
  onToggleDispatcher,
  onSelectAllDispatchers,
  onClearDispatchers,
  onToggleSourceGroup,
  onClearSourceGroups,
  onPresetDays,
  onRefresh
}: DispatcherPerformanceProps) {
  const [detailPage, setDetailPage] = useState(1);
  const detailPageSize = 50;
  const detailPages = Math.max(
    1,
    Math.ceil((data?.orders.length ?? 0) / detailPageSize)
  );

  const visibleOrders = useMemo(() => {
    const start = (detailPage - 1) * detailPageSize;
    return data?.orders.slice(start, start + detailPageSize) ?? [];
  }, [data?.orders, detailPage]);

  const selectedDispatcherLabel =
    selectedDispatcherIds.length === 0
      ? "All dispatchers"
      : (data?.dispatchers ?? [])
          .filter((dispatcher) =>
            selectedDispatcherIds.includes(dispatcher.dispatcherId)
          )
          .map((dispatcher) => dispatcher.displayName)
          .join(", ") || `${selectedDispatcherIds.length} dispatcher(s)`;
  const selectedSourceLabel =
    selectedSourceGroups.length === 0
      ? "All order sources"
      : selectedSourceGroups.map((sourceGroup) => sourceLabels[sourceGroup]).join(", ");

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Dispatcher Performance</h2>
            <p className="mt-1 text-zinc-400">
              First-dispatch response, order-source differences, manual-entry work,
              and delivery outcomes for each dispatcher.
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-lg bg-red-600 px-4 py-2 font-semibold transition hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh Performance"}
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <label className="rounded-xl border border-zinc-700 bg-zinc-800/70 p-4">
            <span className="mb-1 block text-xs text-zinc-400">Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-white focus:border-red-500 focus:outline-none"
            />
          </label>

          <label className="rounded-xl border border-zinc-700 bg-zinc-800/70 p-4">
            <span className="mb-1 block text-xs text-zinc-400">End Date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-white focus:border-red-500 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap items-end gap-2">
            {[7, 30, 90, 365].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => onPresetDays(days)}
                className="rounded-lg bg-zinc-800 px-3 py-3 text-sm font-semibold hover:bg-zinc-700"
              >
                {days === 365 ? "1 Year" : `${days} Days`}
              </button>
            ))}
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg bg-red-600 px-4 py-3 font-semibold hover:bg-red-700"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-800/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Filter by Dispatcher</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Select one or more people. Changes apply immediately.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSelectAllDispatchers}
                className="rounded-lg bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={onClearDispatchers}
                className="rounded-lg bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600"
              >
                Show All
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(data?.dispatchers ?? []).map((dispatcher) => (
              <label
                key={dispatcher.dispatcherId}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition hover:border-red-500 ${
                  selectedDispatcherIds.includes(dispatcher.dispatcherId)
                    ? "border-red-500 bg-red-950/30"
                    : "border-zinc-700 bg-zinc-900"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedDispatcherIds.includes(dispatcher.dispatcherId)}
                  onChange={() => {
                    setDetailPage(1);
                    onToggleDispatcher(dispatcher.dispatcherId);
                  }}
                  className="h-4 w-4"
                />
                <span>
                  <span className="block font-medium">{dispatcher.displayName}</span>
                  <span className="text-xs text-zinc-500">
                    {dispatcher.role === "ADMIN" ? "Administrator" : "Dispatcher"}
                    {!dispatcher.isActive ? " · Inactive" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-800/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Filter by Order Source</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Combine a source with any dispatcher selection. Changes apply immediately.
              </p>
            </div>
            <button
              type="button"
              onClick={onClearSourceGroups}
              className="rounded-lg bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600"
            >
              Show All
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {DISPATCHER_PERFORMANCE_SOURCE_GROUPS.map((sourceGroup) => (
              <label
                key={sourceGroup}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition hover:border-red-500 ${
                  selectedSourceGroups.includes(sourceGroup)
                    ? "border-red-500 bg-red-950/30"
                    : "border-zinc-700 bg-zinc-900"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedSourceGroups.includes(sourceGroup)}
                  onChange={() => {
                    setDetailPage(1);
                    onToggleSourceGroup(sourceGroup);
                  }}
                  className="h-4 w-4"
                />
                <span className="font-medium">{sourceLabels[sourceGroup]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Showing:</span>
          <span className="rounded-full bg-red-950 px-3 py-1 font-semibold text-red-200">
            {selectedDispatcherLabel}
          </span>
          <span className="rounded-full bg-red-950 px-3 py-1 font-semibold text-red-200">
            {selectedSourceLabel}
          </span>
          {loading && <span className="text-zinc-400">Updating results...</span>}
        </div>
      </section>

      {loading && !data ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
          Loading dispatcher performance...
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
          Dispatcher performance is unavailable.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Orders Manually Dispatched"
              value={data.summary.ordersDispatched.toLocaleString("en-CA")}
              note={`${data.summary.dispatchTimeSamples.toLocaleString("en-CA")} orders have a valid response-time sample.`}
            />
            <MetricCard
              label="Average Dispatch Time"
              value={formatMinutes(data.summary.averageDispatchMinutes)}
              note={`Median ${formatMinutes(data.summary.medianDispatchMinutes)} · 90th percentile ${formatMinutes(data.summary.p90DispatchMinutes)}`}
            />
            <MetricCard
              label="Dispatched Within 5 Minutes"
              value={formatPercent(data.summary.withinFiveMinutesPercent)}
              note="Based only on orders with valid creation and dispatch timestamps."
            />
            <MetricCard
              label="Average Total Delivery Time"
              value={formatMinutes(data.summary.averageTotalDeliveryMinutes)}
              note={`${data.summary.deliveredOrders.toLocaleString("en-CA")} completed orders attributed to the selected dispatcher(s).`}
            />
            <MetricCard
              label="Manual Orders Entered"
              value={data.summary.manualOrdersCreated.toLocaleString("en-CA")}
              note="Tracks which signed-in staff member created each telephone order."
            />
            <MetricCard
              label="Average Manual Entry Time"
              value={formatMinutes(data.summary.averageManualEntryMinutes)}
              note={`${data.summary.manualEntryTimeSamples.toLocaleString("en-CA")} reliable manual-entry samples.`}
            />
            <MetricCard
              label="Assignment Actions"
              value={data.summary.assignmentActions.toLocaleString("en-CA")}
              note={`${data.summary.reassignments.toLocaleString("en-CA")} reassignments · ${data.summary.unassignments.toLocaleString("en-CA")} unassignments.`}
            />
            <MetricCard
              label="Cancelled After Dispatch"
              value={data.summary.cancelledOrders.toLocaleString("en-CA")}
              note="Shown as an operational outcome, not automatically treated as dispatcher fault."
            />
          </div>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
            <div className="border-b border-zinc-800 p-5">
              <h3 className="text-xl font-bold">Performance by Dispatcher</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Delivery time is contextual: driver, distance, traffic, and store stops also affect it.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1500px] text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="p-3 text-left">Dispatcher</th>
                    <th className="p-3 text-left">Dispatched</th>
                    <th className="p-3 text-left">Avg Dispatch</th>
                    <th className="p-3 text-left">Median</th>
                    <th className="p-3 text-left">90th Percentile</th>
                    <th className="p-3 text-left">Within 5 Min</th>
                    <th className="p-3 text-left">Manual Orders</th>
                    <th className="p-3 text-left">Avg Entry</th>
                    <th className="p-3 text-left">Avg Total Delivery</th>
                    <th className="p-3 text-left">Assignments</th>
                    <th className="p-3 text-left">Reassignments</th>
                    <th className="p-3 text-left">Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="border-t border-zinc-800 p-5 text-zinc-400">
                        No dispatcher results match these filters.
                      </td>
                    </tr>
                  ) : data.stats.map((stat) => (
                    <tr
                      key={stat.dispatcherId}
                      className="border-t border-zinc-800 hover:bg-zinc-800/40"
                    >
                      <td className="p-3 font-semibold">
                        {stat.displayName}
                        {!stat.isActive && (
                          <span className="ml-2 text-xs text-zinc-500">Inactive</span>
                        )}
                      </td>
                      <td className="p-3">{stat.ordersDispatched}</td>
                      <td className="p-3">{formatMinutes(stat.averageDispatchMinutes)}</td>
                      <td className="p-3">{formatMinutes(stat.medianDispatchMinutes)}</td>
                      <td className="p-3">{formatMinutes(stat.p90DispatchMinutes)}</td>
                      <td className="p-3">{formatPercent(stat.withinFiveMinutesPercent)}</td>
                      <td className="p-3">{stat.manualOrdersCreated}</td>
                      <td className="p-3">{formatMinutes(stat.averageManualEntryMinutes)}</td>
                      <td className="p-3">{formatMinutes(stat.averageTotalDeliveryMinutes)}</td>
                      <td className="p-3">{stat.assignmentActions}</td>
                      <td className="p-3">{stat.reassignments}</td>
                      <td className="p-3">{stat.cancelledOrders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
              <div className="border-b border-zinc-800 p-5">
                <h3 className="text-xl font-bold">Dispatch Time by Order Source</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  Customer Apps combines Android and iPhone orders.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-zinc-800 text-zinc-300">
                    <tr>
                      <th className="p-3 text-left">Source</th>
                      <th className="p-3 text-left">Orders</th>
                      <th className="p-3 text-left">Average</th>
                      <th className="p-3 text-left">Median</th>
                      <th className="p-3 text-left">90th Percentile</th>
                      <th className="p-3 text-left">Within 5 Min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sourceBreakdown.map((source) => (
                      <tr key={source.sourceGroup} className="border-t border-zinc-800">
                        <td className="p-3 font-semibold">{sourceLabels[source.sourceGroup]}</td>
                        <td className="p-3">{source.totalOrders}</td>
                        <td className="p-3">{formatMinutes(source.averageDispatchMinutes)}</td>
                        <td className="p-3">{formatMinutes(source.medianDispatchMinutes)}</td>
                        <td className="p-3">{formatMinutes(source.p90DispatchMinutes)}</td>
                        <td className="p-3">{formatPercent(source.withinFiveMinutesPercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
              <div className="border-b border-zinc-800 p-5">
                <h3 className="text-xl font-bold">Data Coverage</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  These orders are retained but excluded from individual dispatcher scoring.
                </p>
              </div>
              <dl className="grid gap-3 p-5 sm:grid-cols-2">
                {[
                  ["Orders matching source/date", data.coverage.totalOrders],
                  ["All orders in date range", data.coverage.allOrdersInRange],
                  ["Automatic dispatches", data.coverage.automaticDispatches],
                  ["Driver-originated dispatches", data.coverage.driverDispatches],
                  ["Unattributed manual", data.coverage.unattributedManualDispatches],
                  ["Historical attribution missing", data.coverage.unattributedDispatches],
                  ["Not yet dispatched", data.coverage.undispatchedOrders],
                  ["Unknown order source", data.coverage.unknownSourceOrders]
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <dt className="text-xs text-zinc-500">{label}</dt>
                    <dd className="mt-1 text-2xl font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="px-5 pb-5 text-xs text-zinc-500">
                Coverage follows the date and order-source filters. Manual-entry and assignment-event coverage begins with this upgrade; older records remain honest blanks.
              </p>
            </section>
          </div>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
            <div className="border-b border-zinc-800 p-5">
              <h3 className="text-xl font-bold">Daily Dispatch Trend</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Toronto business dates for manually dispatched orders in the selected period.
              </p>
            </div>
            {data.dailyTrend.length === 0 ? (
              <p className="p-5 text-zinc-400">No attributed dispatches in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-zinc-800 text-zinc-300">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Orders</th>
                      <th className="p-3 text-left">Average</th>
                      <th className="p-3 text-left">Median</th>
                      <th className="p-3 text-left">90th Percentile</th>
                      <th className="p-3 text-left">Within 5 Min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyTrend.map((day) => (
                      <tr key={day.date} className="border-t border-zinc-800">
                        <td className="p-3 font-semibold">{day.date}</td>
                        <td className="p-3">{day.totalOrders}</td>
                        <td className="p-3">{formatMinutes(day.averageDispatchMinutes)}</td>
                        <td className="p-3">{formatMinutes(day.medianDispatchMinutes)}</td>
                        <td className="p-3">{formatMinutes(day.p90DispatchMinutes)}</td>
                        <td className="p-3">{formatPercent(day.withinFiveMinutesPercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
            <div className="flex flex-col gap-2 border-b border-zinc-800 p-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-xl font-bold">Order-by-Order Evidence</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  Exact records behind the dispatcher response and delivery averages.
                </p>
              </div>
              <p className="text-xs text-zinc-500">
                {data.orders.length.toLocaleString("en-CA")} attributed orders
              </p>
            </div>
            {visibleOrders.length === 0 ? (
              <p className="p-5 text-zinc-400">No attributed dispatcher orders found.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1300px] text-sm">
                    <thead className="bg-zinc-800 text-zinc-300">
                      <tr>
                        <th className="p-3 text-left">Order</th>
                        <th className="p-3 text-left">Dispatcher</th>
                        <th className="p-3 text-left">Source</th>
                        <th className="p-3 text-left">Status</th>
                        <th className="p-3 text-left">Created</th>
                        <th className="p-3 text-left">Dispatched</th>
                        <th className="p-3 text-left">Dispatch Time</th>
                        <th className="p-3 text-left">Within 5 Min</th>
                        <th className="p-3 text-left">Delivered</th>
                        <th className="p-3 text-left">Total Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOrders.map((order) => (
                        <tr key={order.orderId} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                          <td className="p-3 font-semibold">#{order.orderNumber}</td>
                          <td className="p-3">{dispatcherName(order.dispatcherId, data.dispatchers)}</td>
                          <td className="p-3">{sourceLabels[order.sourceGroup]}</td>
                          <td className="p-3">{statusLabels[order.orderStatus]}</td>
                          <td className="p-3">{formatDateTime(order.createdAt)}</td>
                          <td className="p-3">{formatDateTime(order.dispatchedAt)}</td>
                          <td className="p-3">{formatMinutes(order.dispatchMinutes)}</td>
                          <td className="p-3">
                            {order.withinFiveMinutes === null
                              ? "—"
                              : order.withinFiveMinutes
                                ? "Yes"
                                : "No"}
                          </td>
                          <td className="p-3">{formatDateTime(order.deliveredAt)}</td>
                          <td className="p-3">{formatMinutes(order.totalDeliveryMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-800 p-4">
                  <button
                    type="button"
                    disabled={detailPage <= 1}
                    onClick={() => setDetailPage((page) => Math.max(1, page - 1))}
                    className="rounded-lg bg-zinc-800 px-4 py-2 hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <p className="text-sm text-zinc-400">
                    Page {detailPage} of {detailPages}
                  </p>
                  <button
                    type="button"
                    disabled={detailPage >= detailPages}
                    onClick={() => setDetailPage((page) => Math.min(detailPages, page + 1))}
                    className="rounded-lg bg-zinc-800 px-4 py-2 hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
