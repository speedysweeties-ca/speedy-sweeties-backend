import { useEffect, useRef, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";

type Entry = { id: string; occurredAt: string; staffName: string; role: string; client: string;
  reasonLabel: string; outcome: string; outcomeLabel: string; actorName: string | null };
const button = "rounded-lg bg-zinc-800 px-4 py-2 font-semibold hover:bg-zinc-700 disabled:opacity-40";
const field = "block w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white";
const time = (value: string) => new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "medium" });

export function LogoutLog({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [filter, setFilter] = useState({ search: "", role: "", before: "", page: 1 });
  const [events, setEvents] = useState<Entry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const anchor = useRef("");

  useEffect(() => {
    const current = ++sequence.current;
    const controller = new AbortController();
    // The external request owns the loading and error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError(""); setEvents([]); setHasMore(false);
    const query = new URLSearchParams({ page: String(filter.page) });
    if (filter.before) query.set("before", filter.before);
    if (filter.search) query.set("search", filter.search);
    if (filter.role) query.set("role", filter.role);
    void (async () => {
      try {
        const response = await fetch(`${API_V1_BASE_URL}/auth/session-log?${query}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? "Your sign-in has expired. Sign in again to view the log." : response.status === 403 ? "Only administrators can view this log." : "Could not load the log. Try Refresh.");
        if (!Array.isArray(data.events)) throw new Error("Could not read the log. Try Refresh.");
        if (current === sequence.current && !controller.signal.aborted) { anchor.current = data.before; setEvents(data.events); setHasMore(data.hasMore === true); }
      } catch (cause) {
        if (current === sequence.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the log.");
      } finally { if (current === sequence.current && !controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); };
  }, [filter, token]);

  function refresh() { setFilter({ search: search.trim(), role, before: "", page: 1 }); }
  return <section aria-labelledby="logout-log-title" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="logout-log-title" className="text-2xl font-bold">Logout Log</h2>
        <p className="mt-2 text-zinc-300">Who was signed out, when, and the reason reported by the server or app.</p>
        <p className="mt-1 text-sm text-zinc-400">Times are shown in Guelph time. Logging starts with this update; earlier logouts are not reconstructed.</p>
      </div><button className={button} onClick={refresh} disabled={loading}>Refresh</button>
    </div>
    <form className="mt-6 grid items-end gap-3 sm:grid-cols-[1fr_200px_auto]" onSubmit={event => { event.preventDefault(); refresh(); }}>
      <label>Staff name<input className={`${field} mt-2`} maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="Ryan, Paul…" /></label>
      <label>Role<select className={`${field} mt-2`} value={role} onChange={event => setRole(event.target.value)}><option value="">All staff</option><option value="DRIVER">Drivers</option><option value="DISPATCHER">Dispatchers</option><option value="ADMIN">Administrators</option></select></label>
      <button className={`${button} py-3`} disabled={loading}>Apply filters</button>
    </form>
    <p className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-300">A rejected session shows what the server refused. An offline report or connection interruption does not prove the app logged out. Older phone apps may not report a local timeout or an offline logout.</p>
    {error && <p role="alert" className="mt-5 text-red-200">{error}</p>}
    {loading && <p role="status" className="mt-5 text-zinc-300">Loading logout log…</p>}
    {!loading && !error && events.length === 0 && <p className="mt-6 text-zinc-300">No recorded events match these filters.</p>}
    <div className="mt-5 space-y-3">{events.map(entry => <article key={entry.id} className="rounded-xl border border-zinc-700 bg-zinc-800 p-4">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{entry.staffName} <span className="font-normal text-zinc-400">· {entry.role === "DRIVER" ? "Driver" : entry.role === "DISPATCHER" ? "Dispatcher" : "Administrator"}</span></h3><time className="text-sm text-zinc-300" dateTime={entry.occurredAt}>{time(entry.occurredAt)}</time></div>
      <p className="mt-2 font-semibold">{entry.reasonLabel}</p>
      <p className={`mt-2 text-sm ${entry.outcome === "CHECK_INTERRUPTED" || entry.outcome === "OFFLINE_REPORTED" ? "text-amber-200" : "text-zinc-300"}`}>{entry.outcomeLabel} · Source: {entry.client}</p>
      {entry.actorName && <p className="mt-1 text-sm text-zinc-400">Action by: {entry.actorName}</p>}
    </article>)}</div>
    <div className="mt-6 flex items-center justify-between gap-3"><button className={button} disabled={loading || filter.page === 1} onClick={() => setFilter(previous => ({ ...previous, before: anchor.current, page: previous.page - 1 }))}>Newer</button><span className="text-sm text-zinc-400">Page {filter.page}</span><button className={button} disabled={loading || !hasMore} onClick={() => setFilter(previous => ({ ...previous, before: anchor.current, page: previous.page + 1 }))}>Older</button></div>
  </section>;
}
