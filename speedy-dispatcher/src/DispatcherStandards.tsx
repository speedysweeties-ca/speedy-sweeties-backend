import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { API_V1_BASE_URL } from "./apiConfig";

type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type Entry = {
  id: string; title: string; expectation: string; consequence: string; status: Status;
  updatedAt: string | null; updatedBy: string | null;
};
type Board = { version: number; canEdit: boolean; entries: Entry[] };
type Editor = Entry & { version: number; isNew: boolean };
const statuses: Record<Status, string> = { DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" };
const field = "mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-800 p-3 text-white focus:border-red-500 focus:outline-none";
const button = "rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold hover:bg-zinc-600 disabled:opacity-50";
const starterIds = new Set(["1796c14a-16cc-4cb7-951a-44773ba66e10", "4f789b97-d4c0-4ddf-8967-eae073575413"]);
function isBoard(value: unknown): value is Board {
  if (!value || typeof value !== "object") return false;
  const data = value as Board;
  return Number.isInteger(data.version) && data.version >= 0 && typeof data.canEdit === "boolean" &&
    Array.isArray(data.entries) && data.entries.every(entry => entry && typeof entry.id === "string" &&
      typeof entry.title === "string" && typeof entry.expectation === "string" && typeof entry.consequence === "string" &&
      Object.hasOwn(statuses, entry.status) && (entry.updatedAt === null || typeof entry.updatedAt === "string") &&
      (entry.updatedBy === null || typeof entry.updatedBy === "string"));
}

export function DispatcherStandards({ token, visible, refreshKey }: { token: string; visible: boolean; refreshKey: number }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [refresh, setRefresh] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);
  const saveController = useRef<AbortController | null>(null);

  useEffect(() => () => saveController.current?.abort(), []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const currentGeneration = ++generation.current;
    async function load() {
      try {
        const response = await fetch(`${API_V1_BASE_URL}/dispatcher-standards`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error(response.status === 401 ? "Your sign-in expired. Please sign in again." : "Standards could not refresh. Check your connection and try Refresh standards.");
        const data: unknown = await response.json();
        if (!isBoard(data)) throw new Error("Standards could not refresh. Please try again.");
        if (!controller.signal.aborted && generation.current === currentGeneration) { setBoard(data); setLoadError(""); }
      } catch (error) {
        if (!controller.signal.aborted && generation.current === currentGeneration) setLoadError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Standards could not refresh. Please try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [token, visible, refresh, refreshKey]);

  function begin(entry?: Entry) {
    if (!board || pending.current) return;
    setSaveError(""); setNotice("");
    setEditor(entry ? { ...entry, version: board.version, isNew: false } : {
      id: crypto.randomUUID(), title: "", expectation: "", consequence: "", status: "DRAFT",
      updatedAt: null, updatedBy: null, version: board.version, isNew: true,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || pending.current || !board?.canEdit) return;
    if (editor.status === "PUBLISHED" && !window.confirm(`Publish “${editor.title.trim()}”? Dispatchers will see this wording as a current standard. Make sure the policy and any consequences are ready to apply.`)) return;
    pending.current = true; setSaving(true); setSaveError(""); setNotice("");
    ++generation.current; // Ignore any read started before this save.
    const controller = new AbortController(); saveController.current = controller;
    try {
      const response = await fetch(`${API_V1_BASE_URL}/dispatcher-standards/entries${editor.isNew ? "" : `/${editor.id}`}`, {
        method: editor.isNew ? "POST" : "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editor.isNew ? { id: editor.id } : {}), version: editor.version,
          title: editor.title.trim(), expectation: editor.expectation.trim(), consequence: editor.consequence.trim(), status: editor.status }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setSaveError(response.status === 401 ? "Your sign-in expired. Please sign in again." : typeof data?.message === "string" ? data.message : "The entry was not saved. Please try again.");
        return;
      }
      if (!isBoard(data) || !data.entries.some(entry => entry.id === editor.id && entry.status === editor.status)) throw new Error("Unexpected response");
      ++generation.current;
      setBoard(data); setEditor(null); setFilter("ALL"); setLoadError("");
      setNotice(editor.status === "PUBLISHED" ? "Entry published. Dispatchers can read it in this tab." : editor.status === "ARCHIVED" ? "Entry archived. It is no longer visible to dispatchers." : "Draft saved. Only administrators can see it.");
    } catch {
      if (!controller.signal.aborted) setSaveError("Connection interrupted. Your change may have saved. Refresh standards to check before retrying. Your text is still in the editor.");
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  if (!visible) return null;
  const entries = board?.entries.filter(entry => !board.canEdit || filter === "ALL" || entry.status === filter) ?? [];
  const feeDrafts = board?.canEdit && board.entries.some(entry => starterIds.has(entry.id) && entry.status === "DRAFT" && entry.consequence.includes("$10"));

  return <section aria-labelledby="standards-title" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="standards-title" className="text-2xl font-bold">Dispatcher Standards</h2>
        <p className="mt-1 text-zinc-400">Expectations, responsibilities, and what happens when a standard is missed.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={saving} className={button}>Refresh standards</button>
        {board?.canEdit && <button type="button" onClick={() => begin()} disabled={saving || !!editor || !!loadError} className="rounded-lg bg-red-600 px-4 py-2 font-semibold hover:bg-red-700 disabled:opacity-50">Add entry</button>}
      </div>
    </div>
    {board?.canEdit && <p className="text-sm text-zinc-400">Only administrators can add or edit entries. Dispatchers see published entries. Drafts and archived entries are private to administrators.</p>}
    {feeDrafts && <aside className="rounded-xl border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-100">
      <p className="font-semibold">Review proposed fees before publishing</p>
      <p className="mt-2">For independent contractors, confirm that any fee is supported by an enforceable contractor agreement. Posting a standard here does not establish agreement to a new fee. Have an Ontario lawyer review the terms before applying them.</p>
      <p className="mt-2">Worker status depends on the actual working arrangement. If a dispatcher is legally an employee, Ontario's restrictions on wage deductions still apply.</p>
      <a href="https://www.ontario.ca/document/your-guide-employment-standards-act-0/employee-status" target="_blank" rel="noreferrer" className="mt-2 inline-block underline">Ontario guidance on employee and contractor status</a>
    </aside>}
    {loadError && <p role="alert" className="rounded-xl border border-amber-700 p-4 text-amber-200">{loadError}{board ? " Showing the last loaded entries; they may be out of date." : ""}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 p-4 text-emerald-200">{notice}</p>}

    {editor && board?.canEdit && <form onSubmit={save} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
      <fieldset disabled={saving} className="space-y-4">
        <legend className="mb-4 text-lg font-semibold">{editor.isNew ? "Add a draft entry" : "Edit entry"}</legend>
        <div><label htmlFor="standard-title" className="font-semibold">Title</label><input id="standard-title" required maxLength={140} value={editor.title} onChange={event => setEditor({ ...editor, title: event.target.value })} className={field} /></div>
        <div><label htmlFor="standard-expectation" className="font-semibold">What is expected</label><textarea id="standard-expectation" required maxLength={3000} rows={3} value={editor.expectation} onChange={event => setEditor({ ...editor, expectation: event.target.value })} className={field} /></div>
        <div><label htmlFor="standard-consequence" className="font-semibold">What happens if this is missed</label><textarea id="standard-consequence" required maxLength={3000} rows={3} value={editor.consequence} onChange={event => setEditor({ ...editor, consequence: event.target.value })} className={field} /></div>
        {!editor.isNew && <div><label htmlFor="standard-status" className="font-semibold">Visibility</label>
          <select id="standard-status" value={editor.status} onChange={event => setEditor({ ...editor, status: event.target.value as Status })} className={field}>
            <option value="DRAFT">Draft — administrators only</option><option value="PUBLISHED">Published — visible to dispatchers</option><option value="ARCHIVED">Archived — administrators only</option>
          </select></div>}
        {saveError && <p role="alert" className="text-amber-200">{saveError}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={!!loadError || !editor.title.trim() || !editor.expectation.trim() || !editor.consequence.trim()} className="rounded-lg bg-red-600 px-4 py-2 font-semibold hover:bg-red-700 disabled:opacity-50">{saving ? "Saving…" : editor.status === "PUBLISHED" ? "Save and publish" : editor.status === "ARCHIVED" ? "Save as archived" : "Save draft"}</button>
          <button type="button" onClick={() => { setEditor(null); setSaveError(""); }} className={button}>Cancel</button>
        </div>
      </fieldset>
    </form>}

    {board?.canEdit && <div role="group" aria-label="Filter standards" className="flex flex-wrap gap-2">
      {(["ALL", "PUBLISHED", "DRAFT", "ARCHIVED"] as const).map(value => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-lg px-4 py-2 text-sm font-semibold ${filter === value ? "bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>
        {value === "ALL" ? "All entries" : statuses[value]} ({board.entries.filter(entry => value === "ALL" || entry.status === value).length})
      </button>)}
    </div>}
    {!board ? <p className="py-6 text-zinc-400">{loadError ? "Standards are unavailable right now." : "Loading standards…"}</p> : entries.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-zinc-400">{board.canEdit ? "No entries in this view." : "No dispatcher standards have been published yet."}</div> : <div className="grid gap-4 lg:grid-cols-2">
      {entries.map(entry => <article key={entry.id} className="min-w-0 space-y-4 rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-words text-lg font-semibold">{entry.title}</h3>
          {board.canEdit && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.status === "PUBLISHED" ? "bg-emerald-900 text-emerald-100" : entry.status === "DRAFT" ? "bg-amber-900 text-amber-100" : "bg-zinc-700 text-zinc-200"}`}>{statuses[entry.status]}</span>}</div>
        <p className="text-sm font-semibold text-zinc-200">
          {entry.updatedAt ? <>{entry.status === "PUBLISHED" ? "Current version posted: " : "Last updated: "}
            <time dateTime={entry.updatedAt}>{new Date(entry.updatedAt).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "long", timeStyle: "short" })}</time>
            {" (Guelph time)"}
          </> : entry.status === "DRAFT" ? "Draft — not published" : "Date unavailable"}
        </p>
        <div><h4 className="text-sm font-semibold text-zinc-400">What is expected</h4><p className="mt-1 whitespace-pre-wrap break-words">{entry.expectation}</p></div>
        <div><h4 className="text-sm font-semibold text-zinc-400">What happens if this is missed</h4><p className="mt-1 whitespace-pre-wrap break-words">{entry.consequence}</p></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
          <p className="text-xs text-zinc-400">{entry.updatedBy ? `Saved by ${entry.updatedBy}` : ""}</p>
          {board.canEdit && <button type="button" aria-label={`Edit ${entry.title}`} disabled={saving || !!editor || !!loadError} onClick={() => begin(entry)} className={button}>Edit</button>}
        </div>
      </article>)}
    </div>}
  </section>;
}
