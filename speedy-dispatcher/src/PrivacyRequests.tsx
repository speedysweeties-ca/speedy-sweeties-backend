import { useState } from 'react';
import { API_V1_BASE_URL } from './apiConfig';
import { privacyDecision, type PrivacyPreview } from './privacyRequest';

type Case = { id: string; status: string; version: number; summary: string | null;
  tasks: { system: string; status: string; evidence: string | null }[];
  audit: { id: string; event: string; actorId: string; createdAt: string }[] };
export function PrivacyRequests({ token }: { token: string }) {
  const [cases, setCases] = useState<Case[]>([]), [selected, setSelected] = useState<Case>();
  const [next, setNext] = useState<string | null>(null);
  const [preview, setPreview] = useState<PrivacyPreview>();
  const [notice, setNotice] = useState('Load requests to verify your privacy-administrator access.'), [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState(''), [reason, setReason] = useState('');
  const [financialUntil, setFinancialUntil] = useState(''), [requestUntil, setRequestUntil] = useState(''), [suppressionReview, setSuppressionReview] = useState('');
  const [confirmed, setConfirmed] = useState(false), [system, setSystem] = useState('phones_and_synced_contacts');
  const [evidence, setEvidence] = useState(''), [externalUntil, setExternalUntil] = useState('');
  async function api(path: string, body?: unknown) {
    const res = await fetch(`${API_V1_BASE_URL}/privacy/deletion/admin/${path}`, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!res.ok) throw new Error(res.status === 403 ? 'Privacy administrator access is required; general dispatcher access is insufficient.' :
      res.status === 503 ? 'Privacy workflow or fulfillment is disabled/unavailable. Nothing is confirmed completed.' : 'Request changed or validation failed. Refresh and review before retrying.');
    return res.json();
  }
  async function run(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setNotice('');
    try { await work(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Operation unavailable.'); } finally { setBusy(false); }
  }
  async function reload() {
    const page: { requests: Case[]; next: string | null } = await api('requests');
    const list = page.requests; setCases(list); setNext(page.next);
    if (selected) setSelected(list.find(c => c.id === selected.id));
    setPreview(undefined); setConfirmed(false);
  }
  return <section className="rounded-xl bg-zinc-900 p-6 space-y-4">
    <h2 className="text-2xl font-bold">Privacy deletion requests</h2>
    <p>Restricted administrators only. Request received is not deletion completed. No financial retention defaults are supplied.</p>
    <p role="status">{notice}</p>
    <fieldset disabled={busy} className="space-y-4">
      <button onClick={() => void run(reload)}>Load / refresh requests</button>
      <ul>{cases.map(c => <li key={c.id}><button onClick={() => { setSelected(c); setPreview(undefined); setConfirmed(false); }}>{c.id} — {c.status}</button></li>)}</ul>
      {next && <button onClick={() => void run(async () => {
        const page: { requests: Case[]; next: string | null } = await api(`requests?after=${encodeURIComponent(next)}`);
        setCases(previous => [...previous, ...page.requests]); setNext(page.next);
      })}>Load more requests</button>}
      {selected && <>
        <h3 className="font-bold">{selected.id} — {selected.status}</h3><p>{selected.summary}</p>
        {['SUBMITTED', 'REVIEWING', 'HOLD'].includes(selected.status) && <>
          <button onClick={() => void run(async () => { setPreview(await api(`requests/${selected.id}/preview`)); setConfirmed(false); })}>Preview affected records (no deletion)</button>
          {preview && <>
            <p>{preview.orderCount} linked orders. Active orders: {preview.activeOrders.length}. Unlinked candidates: {preview.unlinkedOrderIds.length}.</p>
            <p>{preview.removes}</p><p>Retained financial fields: {preview.financialFields.join(', ')}</p>
            <label className="block">Approved retention-policy reference <input value={policy} onChange={e => setPolicy(e.target.value)} /></label>
            <label className="block">Legal/business justification (no customer details) <textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
            <label className="block">Financial records retain until <input type="date" value={financialUntil} onChange={e => setFinancialUntil(e.target.value)} /></label>
            <label className="block">Request/audit evidence retain until <input type="date" value={requestUntil} onChange={e => setRequestUntil(e.target.value)} /></label>
            <label className="block">Anti-recreation identifier review date <input type="date" value={suppressionReview} onChange={e => setSuppressionReview(e.target.value)} /></label>
            <label className="block"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I have validated this retention decision and reviewed unlinked records. No additional customer personal fields are required in the financial record.</label>
            <button onClick={() => void run(async () => {
              const body = privacyDecision(preview, { policy, reason, financialUntil, requestUntil, suppressionReview, confirmed });
              if (!window.confirm('Start irreversible fulfillment for this verified request? Active deliveries, stale previews and unapproved retention are rejected by the server.')) return;
              await api(`requests/${selected.id}/fulfill`, body); await reload(); setNotice('Database fulfillment recorded. External work must still be verified; deletion is not yet complete.');
            })}>Confirm and begin fulfillment</button>
          </>}
        </>}
        {selected.status === 'FULFILLING' && <>
          <ul>{selected.tasks.map(t => <li key={t.system}>{t.system}: {t.status} — {t.evidence}</li>)}</ul>
          <label className="block">External system <select value={system} onChange={e => setSystem(e.target.value)}>{selected.tasks.map(t => <option key={t.system}>{t.system}</option>)}</select></label>
          <label className="block">Verified outcome/evidence reference, including restore suppression where needed (no customer details)<textarea value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
          <label className="block">Retained external copy expiry (leave blank only if fully resolved)<input type="date" value={externalUntil} onChange={e => setExternalUntil(e.target.value)} /></label>
          <button onClick={() => void run(async () => { await api(`requests/${selected.id}/external`, { system, evidence, ...(externalUntil ? { retainUntil: new Date(externalUntil).toISOString() } : {}) }); await reload(); })}>Record verified external outcome</button>
          <button onClick={() => void run(async () => {
            if (!window.confirm('Confirm all eligible deletion and external handling is verified? This makes completion and retention details available to the customer.')) return;
            await api(`requests/${selected.id}/complete`, {}); await reload(); setNotice('Completion recorded and available in the customer’s in-app status. No email or SMS confirmation has been sent.');
          })}>Confirm completion</button>
        </>}
        <h4>Audit trail</h4><ul>{selected.audit.map(a => <li key={a.id}>{a.createdAt}: {a.event} ({a.actorId})</li>)}</ul>
      </>}
    </fieldset>
  </section>;
}
