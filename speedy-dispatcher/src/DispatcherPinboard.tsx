import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { API_V1_BASE_URL } from "./apiConfig";

type Identity = { firstName: string | null; lastName: string | null } | null;
type Note = {
  id: string; title: string; message: string; isImportant: boolean; status: "ACTIVE" | "RESOLVED";
  version: number; createdAt: string; author: Identity; hasRead: boolean;
  resolvedAt: string | null; resolvedBy: Identity;
  readBy: Array<{ name: Identity; readAt: string }>;
};
type Board = { notes: Note[]; total: number; page: number; pageSize: number; status: Note["status"] };
const name = (person: Identity) => person ? [person.firstName, person.lastName].filter(Boolean).join(" ") || "Dispatcher" : "Former staff member";
const date = (value: string) => new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });
const fieldClass = "mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-800 p-3 text-white focus:border-red-500 focus:outline-none";
const secondaryButton = "rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold hover:bg-zinc-600 disabled:opacity-50";

export function DispatcherPinboard({ token, visible, refreshKey, onUnreadCountChange }: {
  token: string; visible: boolean; refreshKey: number; onUnreadCountChange: (count: number | null) => void;
}) {
  const [status, setStatus] = useState<Note["status"]>("ACTIVE");
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState<Board | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [important, setImportant] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const pending = useRef(false);
  const postId = useRef<string | null>(null);
  const saveController = useRef<AbortController | null>(null);

  useEffect(() => () => saveController.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`${API_V1_BASE_URL}/dispatcher-pinboard/summary`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error("Unread notes could not refresh");
        const body = await response.json();
        if (!Number.isInteger(body.unreadTotal) || body.unreadTotal < 0) throw new Error("Invalid count");
        if (!controller.signal.aborted) onUnreadCountChange(body.unreadTotal);
      } catch { if (!controller.signal.aborted) onUnreadCountChange(null); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 15000); }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [token, refresh, refreshKey, onUnreadCountChange]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`${API_V1_BASE_URL}/dispatcher-pinboard/notes?${new URLSearchParams({ status, page: String(page) })}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error(response.status === 401 ? "Your sign-in expired. Please log out and sign in again." : "The pinboard could not refresh. Check your connection or try Refresh notes.");
        const body = await response.json() as Board;
        if (!Array.isArray(body.notes) || body.status !== status || body.page !== page) throw new Error("The pinboard could not refresh. Try Refresh notes.");
        if (!controller.signal.aborted) {
          const lastPage = Math.max(1, Math.ceil(body.total / body.pageSize));
          if (page > lastPage) setPage(lastPage);
          else { setBoard(body); setLoadError(""); }
        }
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "The pinboard could not refresh. Check your connection or try Refresh notes.");
      } finally { if (!controller.signal.aborted) timer = setTimeout(poll, 15000); }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [token, visible, status, page, refresh, refreshKey]);

  async function save(path: string, method: string, body: object, savingKey: string, success: string) {
    if (pending.current) return false;
    pending.current = true; setSaving(savingKey); setSaveError(""); setNotice("");
    const controller = new AbortController(); saveController.current = controller;
    try {
      const response = await fetch(`${API_V1_BASE_URL}/dispatcher-pinboard/${path}`, {
        method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const data = await response.json().catch(() => ({}));
      if (controller.signal.aborted) return false;
      if (!response.ok) {
        setSaveError(response.status === 401 ? "Your sign-in expired. Please log out and sign in again." : typeof data.message === "string" ? data.message : "The change was not saved. Check the details and try again.");
        return false;
      }
      const request = body as Record<string, unknown>;
      if (savingKey === "post" ? data.note?.id !== request.id : path.endsWith("/status") ? data.note?.id !== savingKey || data.note.status !== request.status : data.message !== "Marked as read.") {
        throw new Error("Unexpected save response");
      }
      setNotice(success); setRefresh(value => value + 1);
      return true;
    } catch {
      if (!controller.signal.aborted) setSaveError(savingKey === "post" ? "Connection interrupted. Your note may have posted. Refresh to check, or retry the same note; it will not post twice." : "Connection interrupted. Refresh the notes to check whether the change saved, then try again if needed.");
      return false;
    } finally { pending.current = false; if (!controller.signal.aborted) setSaving(null); }
  }

  async function post(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!title.trim() || !message.trim()) { setSaveError("Enter a title and a message for your note."); return; }
    postId.current ??= crypto.randomUUID();
    if (await save("notes", "POST", { id: postId.current, title: title.trim(), message: message.trim(), isImportant: important }, "post", "Your note is posted for the dispatch team.")) {
      setTitle(""); setMessage(""); setImportant(false); postId.current = null; setStatus("ACTIVE"); setPage(1);
    }
  }

  function clearDraft() { setTitle(""); setMessage(""); setImportant(false); postId.current = null; setSaveError(""); }
  async function setNoteStatus(note: Note) {
    if (pending.current) return;
    const resolving = note.status === "ACTIVE";
    if (!window.confirm(resolving ? `Resolve “${note.title}”? It will move to Resolved notes, where it can be reopened.` : `Reopen “${note.title}” on the active pinboard?`)) return;
    await save(`notes/${note.id}/status`, "PATCH", { status: resolving ? "RESOLVED" : "ACTIVE", version: note.version }, note.id, resolving ? "Note resolved. You can find it under Resolved notes." : "Note reopened on the active pinboard.");
  }

  const current = board?.status === status && board.page === page ? board : null;
  return <section aria-labelledby="pinboard-title" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="pinboard-title" className="text-2xl font-bold">Dispatcher Pinboard</h2><p className="mt-1 text-zinc-400">Leave a note for the next shift. Private to dispatchers and administrators.</p></div>
      <button type="button" onClick={() => setRefresh(value => value + 1)} className={secondaryButton}>Refresh notes</button>
    </div>

    <form onSubmit={event => void post(event)} aria-label="Post a dispatcher note" className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6">
      <h3 className="text-lg font-bold">Pin a new note</h3>
      <fieldset disabled={saving !== null} className="mt-4 min-w-0 space-y-4 disabled:opacity-60">
        <div><label htmlFor="pinboard-note-title" className="text-sm font-semibold">Title</label><input id="pinboard-note-title" required maxLength={140} value={title} onChange={event => setTitle(event.target.value)} placeholder="What should the next dispatcher know?" className={fieldClass} /></div>
        <div><label htmlFor="pinboard-note-message" className="text-sm font-semibold">Message</label><textarea id="pinboard-note-message" required maxLength={3000} rows={4} value={message} onChange={event => setMessage(event.target.value)} placeholder="Add the details and anything that needs attention." className={fieldClass} /><p className="mt-1 text-right text-xs text-zinc-500">{message.length} / 3,000</p></div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={important} onChange={event => setImportant(event.target.checked)} className="h-5 w-5 accent-amber-400" />Important — keep at the top</label>
          <div className="flex flex-wrap gap-3"><button type="submit" className="rounded-lg bg-red-600 px-5 py-3 font-semibold hover:bg-red-700">{saving === "post" ? "Posting…" : "Post note"}</button><button type="button" onClick={clearDraft} className={secondaryButton}>Clear draft</button></div>
        </div>
      </fieldset>
    </form>

    {saveError && <p role="alert" className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-red-200">{saveError}</p>}
    {notice && <p role="status" className="rounded-xl border border-green-800 bg-green-950/50 p-4 text-green-200">{notice}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Choose pinboard view" className="flex flex-wrap gap-2">{(["ACTIVE", "RESOLVED"] as const).map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); setLoadError(""); }} className={`rounded-lg px-4 py-3 font-semibold ${status === value ? "bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>{value === "ACTIVE" ? "Active notes" : "Resolved notes"}</button>)}</div>
      <p className="text-sm text-zinc-400">{current ? `${current.total} ${current.total === 1 ? "note" : "notes"}` : ""}</p>
    </div>
    {loadError && <p role="alert" className="rounded-lg bg-amber-950/50 p-3 text-amber-200">{loadError} {current ? "Notes shown may be out of date." : ""}</p>}
    {!current ? <p className="py-6 text-zinc-400">{loadError ? "Notes are unavailable right now." : "Loading notes…"}</p> : current.notes.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center"><h3 className="font-semibold">{status === "ACTIVE" ? "The pinboard is clear" : "No resolved notes yet"}</h3><p className="mt-2 text-sm text-zinc-400">{status === "ACTIVE" ? "Post the first note above for your dispatch team." : "Notes stay here after the team marks them resolved."}</p></div> : <div className="grid gap-4 lg:grid-cols-2">
      {current.notes.map(note => <article aria-label={note.title} key={note.id} className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${note.isImportant && note.status === "ACTIVE" ? "border-amber-500/70 bg-amber-950/25" : "border-zinc-700 bg-zinc-900"}`}>
        <div className="mb-3 flex flex-wrap gap-2">{note.isImportant && <span className="rounded-full bg-amber-400 px-2 py-1 text-xs font-bold text-zinc-950">Important</span>}{!note.hasRead && note.status === "ACTIVE" && <span className="rounded-full bg-blue-950 px-2 py-1 text-xs text-blue-200">Unread</span>}{note.status === "RESOLVED" && <span className="rounded-full bg-green-950 px-2 py-1 text-xs text-green-200">Resolved</span>}</div>
        <h3 className="break-words text-lg font-bold">{note.title}</h3><p className="mt-2 text-xs text-zinc-400">Posted by {name(note.author)} · {date(note.createdAt)}</p>
        <p className="my-5 whitespace-pre-wrap break-words leading-relaxed">{note.message}</p>
        <div className="border-t border-zinc-700/70 pt-4">
          <details className="text-sm text-zinc-400"><summary className="cursor-pointer">Read by {note.readBy.length} {note.readBy.length === 1 ? "person" : "people"}</summary><ul className="mt-2 space-y-1">{note.readBy.map((read, index) => <li key={index}>{name(read.name)} · {date(read.readAt)}</li>)}</ul></details>
          {note.resolvedAt && <p className="mt-3 text-xs text-green-200">Resolved by {name(note.resolvedBy)} · {date(note.resolvedAt)}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {note.hasRead ? <span className="text-sm text-green-200">You’ve read this</span> : <button type="button" disabled={saving !== null} onClick={() => void save(`notes/${note.id}/read`, "POST", {}, note.id, "Marked as read. The team can see your acknowledgement.")} className={secondaryButton}>I’ve read this</button>}
            <button type="button" disabled={saving !== null} onClick={() => void setNoteStatus(note)} className={secondaryButton}>{saving === note.id ? "Saving…" : note.status === "ACTIVE" ? "Resolve note" : "Reopen note"}</button>
          </div>
        </div>
      </article>)}
    </div>}
    {current && current.total > current.pageSize && <nav aria-label="Pinboard pages" className="flex flex-wrap items-center justify-center gap-4"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className={secondaryButton}>Previous</button><span className="text-sm">Page {page} of {Math.ceil(current.total / current.pageSize)}</span><button disabled={page * current.pageSize >= current.total} onClick={() => setPage(value => value + 1)} className={secondaryButton}>Next</button></nav>}
  </section>;
}
