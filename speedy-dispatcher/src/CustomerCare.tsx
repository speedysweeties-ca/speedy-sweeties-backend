import { useEffect, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";

type HelpRequest = {
  id: string; message: string; status: "OPEN" | "HANDLED"; createdAt: string;
  handledAt: string | null; resolutionNote: string | null;
  handledBy: { firstName: string | null; lastName: string | null } | null;
  order: { id: string; orderNumber: number; customerName: string; phone: string; deliveredAt: string | null };
};
type Queue = { requests: HelpRequest[]; total: number; openTotal: number; pageSize: number };
const date = (value: string) => new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto" });

export function CustomerCare({ token }: { token: string }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<"OPEN" | "HANDLED">("OPEN");
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`${API_V1_BASE_URL}/check-in/requests?status=${status}&page=${page}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])
        });
        if (!response.ok) throw new Error("Customer follow-ups could not refresh. Check your connection or sign in again.");
        const body = await response.json();
        if (active) { setQueue(body); setError(""); }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load customer follow-ups.");
      } finally { if (active) timer = setTimeout(poll, 15000); }
    }
    void poll();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [token, status, page, refresh]);

  async function handle(id: string) {
    if (!(notes[id]?.trim().length >= 3)) return;
    setSaving(id); setSaveError("");
    try {
      const response = await fetch(`${API_V1_BASE_URL}/check-in/requests/${id}/handled`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionNote: notes[id].trim() }), signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error("The request wasn't marked handled. Please try again.");
      setRefresh(value => value + 1);
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Could not save this request."); }
    finally { setSaving(null); }
  }

  return <section className={`mx-auto my-4 max-w-7xl rounded-xl border p-4 ${queue?.openTotal ? "border-amber-500 bg-amber-950/50" : "border-zinc-700 bg-zinc-900"}`} aria-label="Customer follow-ups">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="status"><h2 className="font-bold">Customer follow-ups {queue ? `(${queue.openTotal} waiting)` : ""}</h2>
        <p className="text-sm text-zinc-300">{queue?.openTotal ? "Customers have asked for help with completed deliveries." : "Delivery support requests appear here. Checked every 15 seconds."}</p></div>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="rounded-lg bg-zinc-700 px-4 py-2 font-semibold hover:bg-zinc-600">{expanded ? "Close follow-ups" : "View follow-ups"}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-amber-200">{error} Any requests shown may be out of date.</p>}
    {expanded && <div className="mt-4 space-y-4">
      <div className="flex gap-3">
        <label>Show <select value={status} onChange={event => { setStatus(event.target.value as "OPEN" | "HANDLED"); setPage(1); setQueue(null); }} className="ml-2 rounded-lg bg-zinc-800 p-2"><option value="OPEN">Waiting for follow-up</option><option value="HANDLED">Handled</option></select></label>
        <button type="button" onClick={() => setRefresh(value => value + 1)} className="rounded-lg bg-zinc-700 px-3">Refresh</button>
      </div>
      {saveError && <p role="alert" className="text-red-200">{saveError}</p>}
      {!queue ? <p>Loading follow-ups…</p> : queue.requests.length === 0 ? <p className="text-zinc-300">No requests in this view.</p> : queue.requests.map(request => <article key={request.id} className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
        <h3 className="font-bold">Order #{request.order.orderNumber} · {request.order.customerName}</h3>
        <p className="mt-1 text-sm text-zinc-400">Requested {date(request.createdAt)} · <a className="text-blue-300 underline" href={`tel:${request.order.phone.replace(/[^+\d]/g, "")}`}>{request.order.phone}</a></p>
        <p className="my-3 whitespace-pre-wrap break-words">{request.message}</p>
        {request.status === "OPEN" ? <form onSubmit={event => { event.preventDefault(); void handle(request.id); }} className="space-y-2">
          <label className="block text-sm" htmlFor={`resolution-${request.id}`}>How was this handled?</label>
          <textarea id={`resolution-${request.id}`} required minLength={3} maxLength={1000} rows={2} value={notes[request.id] ?? ""} onChange={event => setNotes(value => ({ ...value, [request.id]: event.target.value }))} placeholder="Record your follow-up before marking this handled." className="block w-full rounded-lg border border-zinc-600 bg-zinc-800 p-3" />
          <button disabled={Boolean(saving) || (notes[request.id]?.trim().length ?? 0) < 3} className="rounded-lg bg-red-600 px-4 py-2 font-bold disabled:opacity-50">{saving === request.id ? "Saving…" : "Handled"}</button>
        </form> : <div className="text-sm text-emerald-200"><p>Handled {request.handledAt ? date(request.handledAt) : ""}{request.handledBy ? ` by ${[request.handledBy.firstName, request.handledBy.lastName].filter(Boolean).join(" ") || "staff"}` : ""}</p><p className="whitespace-pre-wrap">{request.resolutionNote}</p></div>}
      </article>)}
      {queue && queue.total > queue.pageSize && <div className="flex items-center gap-4"><button disabled={page === 1} onClick={() => { setPage(value => value - 1); setQueue(null); }} className="disabled:opacity-40">Previous</button><span>Page {page} of {Math.ceil(queue.total / queue.pageSize)}</span><button disabled={page * queue.pageSize >= queue.total} onClick={() => { setPage(value => value + 1); setQueue(null); }} className="disabled:opacity-40">Next</button></div>}
    </div>}
  </section>;
}

type Results = {
  viewed: number; reviewClicks: number; shareClicks: number; shareCompleted: number;
  requested: number; customersRequestingHelp: number; open: number; handled: number;
  averageHandlingMinutes: number | null; firstTimeCustomers: number; orderedAgain: number;
};

export function CheckInResults({ token, startDate, endDate }: { token: string; startDate: string; endDate: string }) {
  const [data, setData] = useState<{ range: string; result: Results } | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const range = `${startDate}/${endDate}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${API_V1_BASE_URL}/check-in/results?${new URLSearchParams({ startDate, endDate })}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), cache: "no-store" });
        if (!response.ok) throw new Error("Check-in results couldn't load. Please try again.");
        const body = await response.json();
        if (!controller.signal.aborted) { setData({ range, result: body.data }); setError(""); }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Couldn't load results."); }
    }
    void load(); return () => controller.abort();
  }, [token, startDate, endDate, range, refresh]);
  const current = data?.range === range ? data.result : null;
  return <section className="mb-6 rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-bold">Sweetie Check-In results</h2><p className="mt-1 text-sm text-zinc-400">{startDate} to {endDate} · Guelph local time</p></div><button onClick={() => setRefresh(value => value + 1)} className="rounded-lg bg-zinc-700 px-4 py-2">Refresh results</button></div>
    {error && <p role="alert" className="mt-3 text-amber-200">{error} Any displayed results may be out of date.</p>}
    {!current ? <p className="mt-4">{error ? "Results unavailable." : "Loading results…"}</p> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        ["Help requests", current.requested, `${current.customersRequestingHelp} linked customers`],
        ["Handled", current.handled, "Of requests received in this period"],
        ["Average time to handle", current.averageHandlingMinutes === null ? "—" : `${Math.round(current.averageHandlingMinutes)} min`, "Elapsed time, including closed hours"],
        ["Still waiting", current.open, "Across all dates"],
        ["Check-ins viewed", current.viewed, "Distinct delivered orders"],
        ["Google review clicks", current.reviewClicks, "Clicks, not confirmed posted reviews"],
        ["Share button used", current.shareClicks, `${current.shareCompleted} native shares / link copies reported`],
        ["First-time customers ordering again", `${current.orderedAgain} / ${current.firstTimeCustomers}`, "Second completed delivery by period end"]
      ].map(([label, value, note]) => <div key={label} className="rounded-xl bg-zinc-800 p-4"><p className="text-sm text-zinc-300">{label}</p><p className="my-2 text-3xl font-black">{value}</p><p className="text-xs text-zinc-400">{note}</p></div>)}</div>
      <p className="mt-4 text-xs text-zinc-400">Actions count each delivery once, on its first use of that action. Repeat customers are based on first recorded completed deliveries in this period, with linked customer records and delivery timestamps. Newer customers have had less time to return. These totals do not prove that the check-in caused a repeat order or that a shared link was received.</p>
    </>}
  </section>;
}
