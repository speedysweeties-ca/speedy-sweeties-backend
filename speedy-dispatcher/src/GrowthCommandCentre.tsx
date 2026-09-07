type OrderStatus =
  | "PLACED"
  | "DISPATCHED"
  | "ACCEPTED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

type PaymentMethod = "CASH" | "DEBIT" | "VISA" | "MASTERCARD" | "ETRANSFER";

type GrowthPeriodMetrics = {
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  uniqueDeliveredCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  returningCustomerRate: number | null;
  completionRate: number | null;
  cancellationRate: number | null;
  averageMinutesToDispatch: number | null;
  dispatchesOverFiveMinutesRate: number | null;
  averageMinutesCreatedToDelivered: number | null;
  deliveriesUnderFortyMinutesRate: number | null;
  deliveryFeesRecorded: number;
  receiptSalesTotal: number;
  statusCounts: Record<OrderStatus, number>;
  paymentCounts: Record<PaymentMethod, number>;
  dataCoverage: {
    customerLinkRate: number | null;
    receiptRate: number | null;
    dispatchTimestampRate: number | null;
    deliveryTimeRate: number | null;
  };
  daily: Array<{
    date: string;
    totalOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
  }>;
  weekdays: Array<{ weekday: string; totalOrders: number }>;
  hours: Array<{ hour: number; totalOrders: number }>;
};

export type GrowthDashboardData = {
  generatedAt: string;
  timeZone: string;
  range: { startDate: string; endDate: string; days: number };
  previousRange: { startDate: string; endDate: string; days: number };
  current: GrowthPeriodMetrics;
  previous: GrowthPeriodMetrics;
  live: {
    activeOrders: number;
    waitingOverFiveMinutes: number;
    runningOverFortyMinutes: number;
  };
};

type GrowthCommandCentreProps = {
  data: GrowthDashboardData | null;
  loading: boolean;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPresetDays: (days: number) => void;
  onRefresh: () => void;
};

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD"
});

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  month: "short",
  day: "numeric"
});

const formatNumber = (value: number | null, suffix = ""): string => {
  return value === null ? "—" : `${value.toLocaleString("en-CA")}${suffix}`;
};

const formatDateKey = (value: string): string => {
  return dateFormatter.format(new Date(`${value}T12:00:00-04:00`));
};

const changeFromPrevious = (
  current: number,
  previous: number,
  lowerIsBetter = false
) => {
  if (previous === 0) {
    return {
      label: current === 0 ? "No change" : "New baseline",
      className: "text-zinc-400"
    };
  }

  const change = Math.round(((current - previous) / previous) * 1000) / 10;
  const isGood = lowerIsBetter ? change < 0 : change > 0;
  const isBad = lowerIsBetter ? change > 0 : change < 0;

  return {
    label: `${change > 0 ? "+" : ""}${change}% vs. prior period`,
    className: isGood
      ? "text-emerald-300"
      : isBad
        ? "text-red-300"
        : "text-zinc-400"
  };
};

const nullableChangeFromPrevious = (
  current: number | null,
  previous: number | null,
  lowerIsBetter = false
) => {
  if (current === null || previous === null) {
    return { label: "No prior comparison", className: "text-zinc-400" };
  }

  return changeFromPrevious(current, previous, lowerIsBetter);
};

const pointChangeFromPrevious = (
  current: number | null,
  previous: number | null,
  lowerIsBetter = false
) => {
  if (current === null || previous === null) {
    return { label: "No prior comparison", className: "text-zinc-400" };
  }

  const change = Math.round((current - previous) * 10) / 10;
  const isGood = lowerIsBetter ? change < 0 : change > 0;
  const isBad = lowerIsBetter ? change > 0 : change < 0;

  return {
    label: `${change > 0 ? "+" : ""}${change} points vs. prior`,
    className: isGood
      ? "text-emerald-300"
      : isBad
        ? "text-red-300"
        : "text-zinc-400"
  };
};

const MetricCard = ({
  label,
  value,
  comparison,
  note
}: {
  label: string;
  value: string;
  comparison: { label: string; className: string };
  note?: string;
}) => (
  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
    <p className="text-sm font-semibold text-zinc-400">{label}</p>
    <p className="mt-2 text-3xl font-black text-white">{value}</p>
    <p className={`mt-2 text-xs font-semibold ${comparison.className}`}>
      {comparison.label}
    </p>
    {note && <p className="mt-2 text-xs text-zinc-500">{note}</p>}
  </div>
);

const DailyOrdersChart = ({ data }: { data: GrowthPeriodMetrics["daily"] }) => {
  const width = Math.max(760, data.length * 30);
  const height = 230;
  const paddingX = 28;
  const paddingTop = 18;
  const paddingBottom = 36;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxOrders = Math.max(1, ...data.map((day) => day.totalOrders));
  const point = (value: number, index: number) => {
    const x =
      data.length <= 1
        ? width / 2
        : paddingX + (index / (data.length - 1)) * (width - paddingX * 2);
    const y = paddingTop + chartHeight - (value / maxOrders) * chartHeight;
    return `${x},${y}`;
  };
  const totalPoints = data.map((day, index) => point(day.totalOrders, index)).join(" ");
  const deliveredPoints = data
    .map((day, index) => point(day.deliveredOrders, index))
    .join(" ");
  const labelStep = Math.max(1, Math.ceil(data.length / 10));

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 min-w-full"
        role="img"
        aria-label="Daily order and completed delivery trend"
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = paddingTop + chartHeight * ratio;
          return (
            <line
              key={ratio}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="rgb(63 63 70)"
              strokeWidth="1"
            />
          );
        })}
        <polyline
          points={totalPoints}
          fill="none"
          stroke="rgb(248 113 113)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={deliveredPoints}
          fill="none"
          stroke="rgb(52 211 153)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((day, index) => {
          const [xText, yText] = point(day.totalOrders, index).split(",");
          const x = Number(xText);
          const y = Number(yText);
          return (
            <g key={day.date}>
              <circle cx={x} cy={y} r="4" fill="rgb(248 113 113)">
                <title>{`${formatDateKey(day.date)}: ${day.totalOrders} orders, ${day.deliveredOrders} delivered, ${day.cancelledOrders} cancelled`}</title>
              </circle>
              {index % labelStep === 0 && (
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  fill="rgb(161 161 170)"
                  fontSize="11"
                >
                  {formatDateKey(day.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const HorizontalBars = ({
  rows,
  labelFor
}: {
  rows: Array<{ label: string; value: number }>;
  labelFor?: (label: string) => string;
}) => {
  const maximum = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-zinc-300">{labelFor ? labelFor(row.label) : row.label}</span>
            <span className="font-bold text-white">{row.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-red-500"
              style={{ width: `${(row.value / maximum) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const hourLabel = (rawHour: string): string => {
  const hour = Number(rawHour);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${suffix}`;
};

export function GrowthCommandCentre({
  data,
  loading,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onPresetDays,
  onRefresh
}: GrowthCommandCentreProps) {
  const current = data?.current;
  const previous = data?.previous;
  const busiestHours = current
    ? [...current.hours]
        .filter((row) => row.totalOrders > 0)
        .sort((a, b) => b.totalOrders - a.totalOrders)
        .slice(0, 8)
        .map((row) => ({ label: String(row.hour), value: row.totalOrders }))
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-400">
              Owner view
            </p>
            <h2 className="mt-1 text-3xl font-black">Growth Command Centre</h2>
            <p className="mt-2 max-w-2xl text-zinc-400">
              Orders, customers, recorded fees, and operating speed in one view.
              All calendar dates use Guelph time.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-zinc-700 bg-zinc-800/60 p-4">
            <div className="flex flex-wrap gap-2">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => onPresetDays(days)}
                  className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-semibold hover:bg-zinc-600"
                >
                  Last {days} days
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-zinc-300">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => onStartDateChange(event.target.value)}
                  className="mt-1 block rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-zinc-300">
                End date
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => onEndDateChange(event.target.value)}
                  className="mt-1 block rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white"
                />
              </label>
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading || !startDate || !endDate}
                className="rounded-lg bg-red-600 px-4 py-2 font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Loading..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {loading && !data ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
          Building your scoreboard...
        </div>
      ) : !current || !previous || !data ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
          No growth data is available for this period.
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 [@media(min-width:1280px)]:grid-cols-5">
            <MetricCard
              label="Completed Orders"
              value={formatNumber(current.deliveredOrders)}
              comparison={changeFromPrevious(
                current.deliveredOrders,
                previous.deliveredOrders
              )}
            />
            <MetricCard
              label="New Customers"
              value={formatNumber(current.newCustomers)}
              comparison={changeFromPrevious(
                current.newCustomers,
                previous.newCustomers
              )}
              note="First recorded completed order"
            />
            <MetricCard
              label="Returning Customers"
              value={formatNumber(current.returningCustomers)}
              comparison={changeFromPrevious(
                current.returningCustomers,
                previous.returningCustomers
              )}
            />
            <MetricCard
              label="Returning Customer Share"
              value={formatNumber(current.returningCustomerRate, "%")}
              comparison={pointChangeFromPrevious(
                current.returningCustomerRate,
                previous.returningCustomerRate
              )}
            />
            <MetricCard
              label="Delivery Fees Recorded"
              value={currencyFormatter.format(current.deliveryFeesRecorded)}
              comparison={changeFromPrevious(
                current.deliveryFeesRecorded,
                previous.deliveryFeesRecorded
              )}
              note={`Receipt coverage: ${formatNumber(current.dataCoverage.receiptRate, "%")}`}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-sm font-semibold text-zinc-400">Active Right Now</p>
              <p className="mt-2 text-3xl font-black">{data.live.activeOrders}</p>
            </div>
            <div
              className={`rounded-2xl border p-5 ${
                data.live.waitingOverFiveMinutes > 0
                  ? "border-amber-500 bg-amber-950/40"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <p className="text-sm font-semibold text-zinc-400">Waiting 5+ Minutes</p>
              <p className="mt-2 text-3xl font-black">{data.live.waitingOverFiveMinutes}</p>
            </div>
            <div
              className={`rounded-2xl border p-5 ${
                data.live.runningOverFortyMinutes > 0
                  ? "border-red-500 bg-red-950/40"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <p className="text-sm font-semibold text-zinc-400">Running 40+ Minutes</p>
              <p className="mt-2 text-3xl font-black">{data.live.runningOverFortyMinutes}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold">Order Trend</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {formatDateKey(data.range.startDate)}–{formatDateKey(data.range.endDate)} compared with {" "}
                  {formatDateKey(data.previousRange.startDate)}–{formatDateKey(data.previousRange.endDate)}
                </p>
              </div>
              <div className="flex gap-4 text-xs font-semibold">
                <span className="text-red-300">● All orders</span>
                <span className="text-emerald-300">● Delivered</span>
              </div>
            </div>
            <div className="mt-5">
              <DailyOrdersChart data={current.daily} />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
              <h3 className="text-xl font-bold">Orders by Weekday</h3>
              <p className="mb-5 mt-1 text-sm text-zinc-400">Where weekly demand is strongest.</p>
              <HorizontalBars
                rows={current.weekdays.map((row) => ({
                  label: row.weekday,
                  value: row.totalOrders
                }))}
              />
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
              <h3 className="text-xl font-bold">Busiest Order Hours</h3>
              <p className="mb-5 mt-1 text-sm text-zinc-400">Top hours in Guelph local time.</p>
              {busiestHours.length > 0 ? (
                <HorizontalBars rows={busiestHours} labelFor={hourLabel} />
              ) : (
                <p className="text-zinc-400">No orders in this period.</p>
              )}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Completion Rate"
              value={formatNumber(current.completionRate, "%")}
              comparison={pointChangeFromPrevious(
                current.completionRate,
                previous.completionRate
              )}
              note="Delivered ÷ delivered plus cancelled"
            />
            <MetricCard
              label="Under 40 Minutes"
              value={formatNumber(current.deliveriesUnderFortyMinutesRate, "%")}
              comparison={pointChangeFromPrevious(
                current.deliveriesUnderFortyMinutesRate,
                previous.deliveriesUnderFortyMinutesRate
              )}
            />
            <MetricCard
              label="Average Total Time"
              value={formatNumber(current.averageMinutesCreatedToDelivered, " min")}
              comparison={nullableChangeFromPrevious(
                current.averageMinutesCreatedToDelivered,
                previous.averageMinutesCreatedToDelivered,
                true
              )}
            />
            <MetricCard
              label="Dispatches Over 5 Minutes"
              value={formatNumber(current.dispatchesOverFiveMinutesRate, "%")}
              comparison={pointChangeFromPrevious(
                current.dispatchesOverFiveMinutesRate,
                previous.dispatchesOverFiveMinutesRate,
                true
              )}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
              <h3 className="text-xl font-bold">Order Outcomes</h3>
              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl bg-zinc-800 p-4">
                  <p className="text-zinc-400">All orders</p>
                  <p className="mt-1 text-2xl font-black">{current.totalOrders}</p>
                </div>
                <div className="rounded-xl bg-zinc-800 p-4">
                  <p className="text-zinc-400">Cancelled</p>
                  <p className="mt-1 text-2xl font-black">{current.cancelledOrders}</p>
                </div>
                <div className="rounded-xl bg-zinc-800 p-4">
                  <p className="text-zinc-400">Cancellation rate</p>
                  <p className="mt-1 text-2xl font-black">{formatNumber(current.cancellationRate, "%")}</p>
                </div>
                <div className="rounded-xl bg-zinc-800 p-4">
                  <p className="text-zinc-400">Average dispatch time</p>
                  <p className="mt-1 text-2xl font-black">{formatNumber(current.averageMinutesToDispatch, " min")}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
              <h3 className="text-xl font-bold">Data Confidence</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Higher coverage means the numbers above are more complete.
              </p>
              <div className="mt-5 space-y-4">
                {[
                  ["Customer linked", current.dataCoverage.customerLinkRate],
                  ["Receipt recorded", current.dataCoverage.receiptRate],
                  ["Dispatch timestamp", current.dataCoverage.dispatchTimestampRate],
                  ["Delivery-time timestamp", current.dataCoverage.deliveryTimeRate]
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-zinc-300">{label}</span>
                      <span className="font-bold">{formatNumber(value as number | null, "%")}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${value ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-blue-900 bg-blue-950/30 p-5 text-sm text-blue-100">
            <p className="font-bold">Money definition</p>
            <p className="mt-1 text-blue-200">
              Delivery Fees Recorded totals the delivery-charge field on completed digital receipts.
              Receipt Sales Total is {currencyFormatter.format(current.receiptSalesTotal)} for this period,
              but it includes purchased items and is not Speedy Sweeties profit.
            </p>
            <p className="mt-2 text-xs text-blue-300">
              Updated {new Date(data.generatedAt).toLocaleString("en-CA", { timeZone: data.timeZone })}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
