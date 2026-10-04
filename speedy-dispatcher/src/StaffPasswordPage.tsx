import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { API_V1_BASE_URL } from "./apiConfig";

const inputClass = "mt-2 w-full rounded-lg border border-zinc-600 bg-zinc-800 p-3 text-white";

export function StaffPasswordPage({ initialResetToken = "", onBack }: {
  initialResetToken?: string; onBack?: () => void;
}) {
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [doneRole, setDoneRole] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    if (resetToken && (password !== confirmation || password.length < 6 || new TextEncoder().encode(password).length > 72)) {
      setError("Use matching passwords with at least 6 characters and no more than 72 bytes."); return;
    }
    pending.current = true; setSaving(true);
    try {
      const response = await fetch(`${API_V1_BASE_URL}/auth/${resetToken ? "change-password" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resetToken ? { resetToken, password } : { email: email.trim().toLowerCase(), password, passwordChangeOnly: true }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => ({}));
      if (!resetToken && data.code === "PASSWORD_CHANGE_REQUIRED" && typeof data.resetToken === "string") {
        setResetToken(data.resetToken); setPassword(""); setConfirmation(""); return;
      }
      if (resetToken && response.ok && typeof data.role === "string") {
        setDoneRole(data.role); setResetToken(""); setPassword(""); setConfirmation(""); return;
      }
      if (resetToken && response.status === 401) {
        setResetToken(""); setPassword(""); setConfirmation("");
      }
      setError(typeof data.message === "string" ? data.message : "Check your details and try again.");
    } catch {
      setError(resetToken ? "Connection interrupted. If the password was saved, you can sign in with your new password. Otherwise, start again with your temporary password." : "Could not connect. Check your connection and try again.");
    } finally { pending.current = false; setSaving(false); }
  }

  return <main className="min-h-screen bg-zinc-950 px-4 py-12 text-white flex items-center justify-center">
    <section aria-labelledby="staff-password-title" className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <p className="text-sm font-semibold text-red-400">Speedy Sweeties · Staff</p>
      <h1 id="staff-password-title" className="mt-2 text-2xl font-bold">{doneRole ? "Password changed" : resetToken ? "Choose your own password" : "Staff password"}</h1>
      {doneRole ? <div role="status" className="mt-4 space-y-3">
        <p className="text-green-200">Your new password is ready.</p>
        <p>{doneRole === "DRIVER" ? "Return to the driver app and sign in with your email and new password." : "Return to the dispatcher login and sign in with your email and new password."}</p>
      </div> : <>
        <p className="mt-3 text-sm text-zinc-300">{resetToken ? "Choose a different password that only you know. This will sign out your other sessions." : "Drivers and dispatchers: enter your email and the temporary password your administrator gave you. You can also use your current password."}</p>
        <form onSubmit={event => void submit(event)} className="mt-6 space-y-4">
          <fieldset disabled={saving} className="min-w-0 space-y-4 disabled:opacity-60">
            {!resetToken && <div><label htmlFor="password-page-email">Email address</label><input id="password-page-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></div>}
            <div><label htmlFor="password-page-password">{resetToken ? "New password" : "Temporary or current password"}</label><input id="password-page-password" type="password" required minLength={resetToken ? 6 : undefined} maxLength={resetToken ? 72 : undefined} autoComplete={resetToken ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} /></div>
            {resetToken && <div><label htmlFor="password-page-confirm">Confirm new password</label><input id="password-page-confirm" type="password" required minLength={6} maxLength={72} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} className={inputClass} /><p className="mt-2 text-xs text-zinc-400">At least 6 characters.</p></div>}
            <button type="submit" className="w-full rounded-lg bg-red-600 p-3 font-semibold hover:bg-red-700 disabled:opacity-50">{saving ? "Saving…" : resetToken ? "Save my password" : "Continue"}</button>
          </fieldset>
          {error && <p role="alert" className="rounded-lg bg-red-950 p-3 text-sm text-red-200">{error}</p>}
        </form>
        {resetToken && <button disabled={saving} onClick={() => { setResetToken(""); setPassword(""); setConfirmation(""); setError(""); }} className="mt-4 text-sm underline disabled:opacity-50">Start again</button>}
      </>}
      {onBack ? <button disabled={saving} onClick={onBack} className="mt-6 block text-sm underline disabled:opacity-50">Back to dispatcher login</button> : <a href="/" className="mt-6 block text-sm underline">Back to dispatcher login</a>}
    </section>
  </main>;
}
