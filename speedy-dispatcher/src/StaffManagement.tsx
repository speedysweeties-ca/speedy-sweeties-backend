import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { API_V1_BASE_URL } from "./apiConfig";

type Staff = {
  id: string; firstName: string | null; lastName: string | null; email: string;
  role: "ADMIN" | "DRIVER" | "DISPATCHER"; isActive: boolean;
  passwordChangeRequired: boolean; isVisibleInDispatch: boolean; staffRevision: number;
};
type Action = { kind: "edit" | "password" | "status"; user: Staff };
const nameOf = (user: Staff) => [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
const roleOf = (role: Staff["role"]) => role === "ADMIN" ? "Administrator" : role === "DRIVER" ? "Driver" : "Dispatcher";
const inputClass = "mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-800 p-3 text-white";
const buttonClass = "rounded-lg bg-zinc-700 px-3 py-2 text-sm font-semibold hover:bg-zinc-600 disabled:opacity-50";

export function StaffManagement({ token, visible, refreshKey, onChanged, onDriverVisibility, onDriverLogout }: {
  token: string; visible: boolean; refreshKey: number; onChanged: () => void;
  onDriverVisibility: (user: Staff, visible: boolean) => Promise<void>;
  onDriverLogout: (id: string) => Promise<void>;
}) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [editRole, setEditRole] = useState("DRIVER");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const readSequence = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  const passwordUrl = `${window.location.origin}/?staff-password=1`;

  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current;
    setLoading(true); setLoadError("");
    try {
      const response = await fetch(`${API_V1_BASE_URL}/auth/staff`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.staff)) throw new Error(response.status === 401 ? "Your sign-in expired. Please log out and sign in again." : "Could not load staff. Try Refresh staff.");
      if (sequence === readSequence.current) setStaff(data.staff);
    } catch (cause) {
      if (sequence === readSequence.current) setLoadError(cause instanceof Error ? cause.message : "Could not load staff. Try Refresh staff.");
    } finally { if (sequence === readSequence.current) setLoading(false); }
  }, [token]);
  useEffect(() => {
    // Loading state follows the external directory request when this page becomes visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visible) void refresh();
  }, [visible, refreshKey, refresh]);
  useEffect(() => { if (action) { panel.current?.scrollIntoView({ block: "nearest" }); panel.current?.focus(); } }, [action]);

  function open(kind: Action["kind"], user: Staff) {
    setAction({ kind, user }); setError(""); setNotice(""); setPassword(""); setConfirmation("");
    setFirstName(user.firstName || ""); setLastName(user.lastName || ""); setEmail(user.email); setEditRole(user.role);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action || pending.current) return;
    setError("");
    if (action.kind === "edit" && (!firstName.trim() || !lastName.trim())) {
      setError("Enter the staff member's first and last name."); return;
    }
    if (action.kind === "password" && (password !== confirmation || password.length < 6 || new TextEncoder().encode(password).length > 72)) {
      setError("Use matching passwords with at least 6 characters and no more than 72 bytes."); return;
    }
    pending.current = true; setSaving(true);
    const path = action.kind === "edit" ? "" : action.kind === "status" ? "/status" : "/reset-password";
    const body = { staffRevision: action.user.staffRevision, ...(action.kind === "edit" ? {
      firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), role: editRole,
    } : action.kind === "status" ? { isActive: !action.user.isActive } : { temporaryPassword: password }) };
    try {
      const response = await fetch(`${API_V1_BASE_URL}/auth/staff/${encodeURIComponent(action.user.id)}${path}`, {
        method: action.kind === "password" ? "POST" : "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(response.status === 401 ? "Your sign-in expired. Log out and sign in again." : typeof data.message === "string" ? data.message : "Check the details and try again."); return;
      }
      if (data.user?.id !== action.user.id) throw new Error("Unexpected response");
      setNotice(`${nameOf(data.user)}: ${data.message || "Changes saved."}`);
      setAction(null); setPassword(""); setConfirmation("");
      setStaff(previous => previous.map(user => user.id === data.user.id ? data.user : user));
      onChanged();
    } catch { setError("Connection interrupted. The change may have saved. Cancel and refresh the staff list before trying again."); }
    finally { pending.current = false; setSaving(false); }
  }

  async function driverAction(user: Staff, kind: "visibility" | "logout") {
    if (pending.current) return;
    pending.current = true; setSaving(true);
    try {
      if (kind === "visibility") await onDriverVisibility(user, !user.isVisibleInDispatch);
      else await onDriverLogout(user.id);
      await refresh();
    } finally { pending.current = false; setSaving(false); }
  }

  const filtered = staff.filter(user => (role === "ALL" || user.role === role) &&
    (status === "ALL" || user.isActive === (status === "ACTIVE")) &&
    `${nameOf(user)} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase()));

  return <section aria-labelledby="staff-list-title" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 id="staff-list-title" className="text-xl font-bold">Staff directory</h3><p className="mt-1 text-sm text-zinc-400">Manage drivers and dispatchers. Administrator accounts are read-only here.</p></div>
      <button disabled={loading || saving} onClick={() => void refresh()} className={buttonClass}>{loading ? "Refreshing…" : "Refresh staff"}</button>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div><label htmlFor="staff-search" className="text-sm">Search staff</label><input id="staff-search" type="search" value={search} onChange={e => setSearch(e.target.value)} className={inputClass} placeholder="Name or email" /></div>
      <div><label htmlFor="staff-filter-role" className="text-sm">Role</label><select id="staff-filter-role" value={role} onChange={e => setRole(e.target.value)} className={inputClass}><option value="ALL">Everyone</option><option value="DRIVER">Drivers</option><option value="DISPATCHER">Dispatchers</option></select></div>
      <div><label htmlFor="staff-filter-status" className="text-sm">Account status</label><select id="staff-filter-status" value={status} onChange={e => setStatus(e.target.value)} className={inputClass}><option value="ALL">All accounts</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
    </div>
    {loadError && <p role="alert" className="mt-4 text-red-200">{loadError}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-green-950 p-3 text-green-200">{notice}</p>}
    {action && <div ref={panel} tabIndex={-1} role="region" aria-label={`${action.kind === "edit" ? "Edit profile" : action.kind === "password" ? "Reset password" : "Change account status"}: ${nameOf(action.user)}`} className="mt-5 rounded-xl border border-red-600 bg-zinc-950 p-4 sm:p-5">
      <h4 className="text-lg font-bold">{action.kind === "edit" ? "Edit profile" : action.kind === "password" ? "Reset password" : action.user.isActive ? "Deactivate account" : "Reactivate account"} · {nameOf(action.user)}</h4>
      <p className="mt-1 break-all text-sm text-zinc-400">{action.user.email}</p>
      <form onSubmit={event => void submit(event)} className="mt-4 space-y-4" autoComplete="off">
        <fieldset disabled={saving} className="min-w-0 space-y-4 disabled:opacity-60">
          {action.kind === "edit" ? <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="edit-staff-first">First name</label><input id="edit-staff-first" required maxLength={100} value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass} /></div>
              <div><label htmlFor="edit-staff-last">Last name</label><input id="edit-staff-last" required maxLength={100} value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass} /></div>
              <div><label htmlFor="edit-staff-email">Email address</label><input id="edit-staff-email" required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></div>
              <div><label htmlFor="edit-staff-role">Staff role</label><select id="edit-staff-role" value={editRole} onChange={e => setEditRole(e.target.value)} className={inputClass}><option value="DRIVER">Driver</option><option value="DISPATCHER">Dispatcher</option></select></div>
            </div><p className="text-sm text-zinc-300">Changing their email or role signs them out. Their history stays attached to this account.</p>
          </> : action.kind === "password" ? <>
            <p className="text-sm text-zinc-300">This signs them out. Give them the temporary password privately and ask them to open the staff password page to choose their own password before signing in again.</p>
            <div><label htmlFor="reset-staff-password">Temporary password</label><input id="reset-staff-password" type="password" required minLength={6} maxLength={72} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} /></div>
            <div><label htmlFor="reset-staff-confirm">Confirm temporary password</label><input id="reset-staff-confirm" type="password" required minLength={6} maxLength={72} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} className={inputClass} /></div>
          </> : <p className="text-sm text-zinc-300">{action.user.isActive ? "They will be signed out and unable to sign in. Their deliveries and performance history will remain available." : "They will be able to sign in again. If a password change is pending, they must finish it first. Driver dispatch visibility stays as it was."}</p>}
          {error && <p role="alert" className="rounded-lg bg-red-950 p-3 text-sm text-red-200">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="rounded-lg bg-red-600 px-4 py-3 font-semibold hover:bg-red-700">{saving ? "Saving…" : action.kind === "edit" ? "Save profile" : action.kind === "password" ? "Set temporary password" : action.user.isActive ? "Confirm deactivation" : "Confirm reactivation"}</button>
            <button type="button" onClick={() => { setAction(null); setPassword(""); setConfirmation(""); setError(""); }} className={buttonClass}>Cancel</button>
          </div>
        </fieldset>
      </form>
    </div>}
    <p className="mt-5 text-sm text-zinc-400">{filtered.length} of {staff.length} staff members</p>
    <div className="mt-3 space-y-3">
      {filtered.map(user => <article aria-label={nameOf(user)} key={user.id} className="rounded-xl border border-zinc-700 bg-zinc-800 p-4">
        <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{nameOf(user)}</h4><span className="rounded-full bg-zinc-700 px-2 py-1 text-xs">{roleOf(user.role)}</span><span className={`rounded-full px-2 py-1 text-xs ${user.isActive ? "bg-green-950 text-green-200" : "bg-zinc-700 text-zinc-300"}`}>{user.isActive ? "Active" : "Inactive"}</span>{user.passwordChangeRequired && <span className="text-xs text-amber-200">Password change needed</span>}</div>
        <p className="mt-2 break-all text-sm text-zinc-300">{user.email}</p>
        {user.role !== "ADMIN" && <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={saving || !!action} onClick={() => open("edit", user)} className={buttonClass}>Edit profile</button>
          <button disabled={saving || !!action || !user.isActive} onClick={() => open("password", user)} className={buttonClass}>Reset password</button>
          <button disabled={saving || !!action} onClick={() => open("status", user)} className={buttonClass}>{user.isActive ? "Deactivate" : "Reactivate"}</button>
          {user.role === "DRIVER" && <>
            <button disabled={saving || !!action || !user.isActive} onClick={() => void driverAction(user, "logout")} className={buttonClass}>Force Logout</button>
            <label className="flex items-center gap-2 rounded-lg px-2 text-sm"><input type="checkbox" checked={user.isVisibleInDispatch} disabled={saving || !!action || !user.isActive} onChange={() => void driverAction(user, "visibility")} aria-label={`Show ${nameOf(user)} in dispatch`} className="h-5 w-5 accent-green-600" />{user.isVisibleInDispatch ? "Visible in dispatch" : "Hidden from dispatch"}</label>
          </>}
        </div>}
      </article>)}
      {!loading && !loadError && filtered.length === 0 && <p className="py-4 text-zinc-400">No staff match these filters.</p>}
    </div>
    <div className="mt-6 border-t border-zinc-700 pt-4 text-sm text-zinc-300"><p className="font-semibold">Staff password page</p><p className="mt-1">After a reset, drivers and dispatchers can choose their own password here:</p><a className="mt-2 block break-all text-red-300 underline" href={passwordUrl} target="_blank" rel="noreferrer">{passwordUrl}</a></div>
  </section>;
}
