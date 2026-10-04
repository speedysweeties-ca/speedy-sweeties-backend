import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { API_V1_BASE_URL } from "./apiConfig";

type StaffRole = "DRIVER" | "DISPATCHER";
type StaffForm = {
  firstName: string;
  lastName: string;
  email: string;
  role: StaffRole;
  password: string;
  confirmPassword: string;
};
type CreatedProfile = Pick<StaffForm, "firstName" | "lastName" | "email" | "role">;

const emptyForm: StaffForm = {
  firstName: "", lastName: "", email: "", role: "DRIVER", password: "", confirmPassword: "",
};
const inputClass = "mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-800 p-3 text-white focus:border-red-500 focus:outline-none";

export function CreateStaffProfile({ token, onCreated }: {
  token: string;
  onCreated: (role: StaffRole) => void;
}) {
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedProfile | null>(null);
  const pending = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function update<K extends keyof StaffForm>(field: K, value: StaffForm[K]) {
    setForm(previous => ({ ...previous, [field]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError(""); setCreated(null);
    const profile: CreatedProfile = {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(), role: form.role,
    };
    if (!profile.firstName || !profile.lastName) {
      setError("Enter the staff member's first and last name."); return;
    }
    if (form.password.length < 6) {
      setError("Use a password with at least 6 characters."); return;
    }
    if (new TextEncoder().encode(form.password).length > 72) {
      setError("This password is too long. Use a shorter password."); return;
    }
    if (form.password !== form.confirmPassword) {
      setError("The passwords do not match. Please enter them again."); return;
    }
    pending.current = true; setSaving(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch(`${API_V1_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, password: form.password }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const data = await response.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 409) setError("A staff profile already uses this email. If you retried after a connection problem, the first attempt may have created it.");
        else if (response.status === 401) setError("Your sign-in has expired. Sign in again before creating this profile.");
        else if (response.status === 403) setError("Only administrators can create staff profiles.");
        else if (response.status === 400) {
          const messages = Array.isArray(data.errors)
            ? data.errors.flatMap((issue: { message?: unknown }) => typeof issue?.message === "string" ? [issue.message] : [])
            : [];
          setError(messages.join(" ") || "Check the profile details and try again.");
        } else setError("We couldn't confirm whether the profile was created. Retry with the same email to avoid creating a duplicate.");
        return;
      }
      if (response.status !== 201 || typeof data.user?.id !== "string" || data.user.email !== profile.email || data.user.role !== profile.role) {
        throw new Error("Unexpected registration response");
      }
      setCreated(profile); setForm(emptyForm);
      onCreated(profile.role);
    } catch {
      if (!controller.signal.aborted) setError("Connection interrupted. The profile may have been created. Retry with the same email to avoid creating a duplicate.");
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return (
    <section aria-labelledby="create-staff-title" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <h3 id="create-staff-title" className="text-xl font-bold">Create Staff Profile</h3>
      <p className="mt-1 text-sm text-zinc-400">Create a sign-in for a new driver or dispatcher. All fields are required.</p>

      {created && <div role="status" className="mt-4 rounded-xl border border-green-700 bg-green-950/40 p-4">
        <p className="font-semibold text-green-200">{created.role === "DRIVER" ? "Driver" : "Dispatcher"} profile created for {created.firstName} {created.lastName}.</p>
        <p className="mt-1 break-all text-sm">Sign-in email: {created.email}</p>
        <p className="mt-1 text-sm text-zinc-300">They can sign in to {created.role === "DRIVER" ? "the driver app" : "the dispatcher"} with this email and the password you set. Share their sign-in details with them privately.</p>
      </div>}

      <form onSubmit={event => void submit(event)} className="mt-5 space-y-4" autoComplete="off">
        <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2 disabled:opacity-60">
          <legend className="sr-only">New staff profile details</legend>
          <div>
            <label className="text-sm font-semibold" htmlFor="staff-first-name">First name</label>
            <input id="staff-first-name" autoComplete="section-new-staff given-name" required maxLength={100} value={form.firstName} onChange={event => update("firstName", event.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="staff-last-name">Last name</label>
            <input id="staff-last-name" autoComplete="section-new-staff family-name" required maxLength={100} value={form.lastName} onChange={event => update("lastName", event.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="staff-email">Email address</label>
            <input id="staff-email" type="email" autoComplete="section-new-staff username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={form.email} onChange={event => update("email", event.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="staff-role">Staff role</label>
            <select id="staff-role" value={form.role} onChange={event => update("role", event.target.value as StaffRole)} className={inputClass}>
              <option value="DRIVER">Driver</option><option value="DISPATCHER">Dispatcher</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="staff-password">Password</label>
            <input id="staff-password" type="password" autoComplete="new-password" required minLength={6} maxLength={72} aria-describedby="staff-password-help" value={form.password} onChange={event => update("password", event.target.value)} className={inputClass} />
            <span id="staff-password-help" className="mt-1 block text-xs font-normal text-zinc-400">At least 6 characters. Use a unique password for this staff member.</span>
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="staff-confirm-password">Confirm password</label>
            <input id="staff-confirm-password" type="password" autoComplete="new-password" required minLength={6} maxLength={72} value={form.confirmPassword} onChange={event => update("confirmPassword", event.target.value)} className={inputClass} />
          </div>
        </fieldset>
        {error && <p role="alert" className="rounded-lg bg-red-950/60 p-3 text-sm text-red-200">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="rounded-lg bg-red-600 px-4 py-3 font-semibold transition hover:bg-red-700 disabled:opacity-50">{saving ? "Creating profile…" : "Create Staff Profile"}</button>
          <button type="button" disabled={saving} onClick={() => { setForm(emptyForm); setError(""); setCreated(null); }} className="rounded-lg bg-zinc-800 px-4 py-3 font-semibold transition hover:bg-zinc-700 disabled:opacity-50">Clear form</button>
        </div>
      </form>
    </section>
  );
}
