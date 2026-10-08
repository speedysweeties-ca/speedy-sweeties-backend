import { useCallback, useEffect, useRef, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";

type Dispatcher = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
  isActive: boolean;
};
const nameOf = (user: Dispatcher) => [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

export function DispatcherLogout({ token, visible, refreshKey, onChanged }: {
  token: string;
  visible: boolean;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_V1_BASE_URL}/auth/staff`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.staff)) throw new Error("Could not load dispatchers. Try Refresh dispatchers.");
      if (!signal.aborted) setDispatchers(data.staff.filter((user: Dispatcher) => user.role === "DISPATCHER"));
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load dispatchers.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    // Loading state follows the external staff directory request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load, visible, refreshKey]);

  async function forceLogout(user: Dispatcher) {
    if (pending.current || !user.isActive) return;
    if (!window.confirm(`Force logout ${nameOf(user)}? This signs them out on all devices. They can sign in again with their usual password.`)) return;
    pending.current = true;
    setPendingId(user.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_V1_BASE_URL}/auth/dispatchers/${encodeURIComponent(user.id)}/force-logout`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) {
        setError(typeof data.message === "string" ? data.message : "Could not log out this dispatcher. Please try again.");
        return;
      }
      setNotice(`${nameOf(user)} has been logged out. Their connected screens will return to sign-in on the next refresh.`);
      onChanged();
    } catch {
      setError("Connection interrupted. Logout could not be confirmed. Check with the dispatcher before trying again.");
    } finally {
      pending.current = false;
      setPendingId(null);
    }
  }

  return <section aria-labelledby="dispatcher-logout-title" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="dispatcher-logout-title" className="text-xl font-bold">Dispatchers</h3>
        <p className="mt-1 text-sm text-zinc-400">Sign a dispatcher out of all devices. They can sign in again with their usual password.</p>
      </div>
      <button type="button" disabled={loading || pendingId !== null} onClick={onChanged}
        className="rounded-lg bg-zinc-800 px-4 py-2 font-semibold hover:bg-zinc-700 disabled:opacity-50">{loading ? "Refreshing…" : "Refresh dispatchers"}</button>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-950 p-3 text-red-200">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg bg-green-950 p-3 text-green-200">{notice}</p>}
    {loading && dispatchers.length === 0 ? <p className="text-zinc-400">Loading dispatchers…</p> :
      !error && dispatchers.length === 0 ? <p className="text-zinc-400">No dispatcher accounts found.</p> :
      <div className="space-y-3">{dispatchers.map(user => <article aria-label={nameOf(user)} key={user.id}
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-700 bg-zinc-800 p-4">
        <div className="min-w-0">
          <p className="font-semibold">{nameOf(user)}</p>
          <p className="mt-1 break-all text-sm text-zinc-400">{user.email}</p>
          {!user.isActive && <p className="mt-1 text-sm text-zinc-400">Account inactive</p>}
        </div>
        <button type="button" disabled={loading || pendingId !== null || !user.isActive}
          onClick={() => void forceLogout(user)}
          className="rounded-lg bg-red-600 px-4 py-2 font-semibold transition hover:bg-red-700 disabled:opacity-50">
          {pendingId === user.id ? "Logging out…" : "Force Logout"}
        </button>
      </article>)}</div>}
  </section>;
}
