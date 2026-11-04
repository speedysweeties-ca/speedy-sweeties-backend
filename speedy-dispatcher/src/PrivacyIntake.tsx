import { useState } from 'react';

type Preview = { scopeHash: string; orderCount: number; activeOrders: string[] };
type Grant = { intakeGrant: string; expiresAt: string; maskedDestination: string; message: string };
export function PrivacyIntake({ api }: { api: (path: string, body?: unknown) => Promise<unknown> }) {
  const [subject, setSubject] = useState(''), [order, setOrder] = useState('');
  const [destination, setDestination] = useState(''), [reference, setReference] = useState('');
  const [received, setReceived] = useState(''), [prior, setPrior] = useState('');
  const [method, setMethod] = useState('HISTORICAL_VERIFIED_EMAIL');
  const [recognition, setRecognition] = useState(false), [linked, setLinked] = useState(false), [clear, setClear] = useState(false);
  const [preview, setPreview] = useState<Preview>(), [grant, setGrant] = useState<Grant>();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  function change(work: () => void) { work(); setPreview(undefined); setGrant(undefined); }
  async function run(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setNotice('');
    try { await work(); } catch { setNotice('Intake was not confirmed. Review authorization, evidence and current scope before trying again.'); }
    finally { setBusy(false); }
  }
  return <details className="border border-zinc-700 rounded p-4">
    <summary>Reviewed lost-credential intake — restricted privacy administrator</summary>
    <p>Robert reviews the existing private evidence first. A new mailbox code proves only current contact control. Names, addresses and order facts alone never establish historical ownership. Shared, disputed or unresolved records must stay under review.</p>
    <p>Use an existing working customer/order/request credential first. Keep insufficient-evidence intake notes in Robert's protected register, review holds within seven calendar days, and review minimized closed notes after 24 months; do not collect routine ID copies or create a verified request for an unverified intake.</p>
    <p role="status">{notice}</p>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block">Exact existing Customer ID <input value={subject} onChange={e => change(() => setSubject(e.target.value))} /></label>
      <label className="block">Exact linked source Order ID <input value={order} onChange={e => change(() => setOrder(e.target.value))} /></label>
      <label className="block">First receipt of this request <input type="datetime-local" value={received} onChange={e => change(() => setReceived(e.target.value))} /></label>
      <label className="block">Opaque private review reference (no names or proof documents) <input value={reference} onChange={e => change(() => setReference(e.target.value))} /></label>
      <label className="block">Agreed email for this privacy request <input type="email" autoComplete="off" value={destination} onChange={e => change(() => setDestination(e.target.value))} /></label>
      <label className="block">Ownership route <select value={method} onChange={e => change(() => { setMethod(e.target.value); setRecognition(false); setLinked(false); setClear(false); })}>
        <option value="HISTORICAL_VERIFIED_EMAIL">Earlier verified email binding and same-customer continuity</option>
        <option value="PRIOR_PERSONAL_RECOGNITION">Robert's genuine prior personal recognition and existing record linkage</option>
      </select></label>
      {method === 'HISTORICAL_VERIFIED_EMAIL' && <label className="block">Earlier independently verified challenge ID <input value={prior} onChange={e => change(() => setPrior(e.target.value))} /></label>}
      <label className="block"><input type="checkbox" checked={recognition} onChange={e => change(() => setRecognition(e.target.checked))} />
        {method === 'HISTORICAL_VERIFIED_EMAIL' ? ' I reviewed attributable continuity to the same customer. The destination is the original historically verified email.' : ' I am Robert and genuinely recognize this person from a prior business relationship in a direct private interaction; familiar names, addresses or order facts are not my basis.'}</label>
      <label className="block"><input type="checkbox" checked={linked} onChange={e => change(() => setLinked(e.target.checked))} /> I reviewed an existing attributable record linking this exact person to this exact subject/order.</label>
      <label className="block"><input type="checkbox" checked={clear} onChange={e => change(() => setClear(e.target.checked))} /> I reviewed sharing, reassignment, disputed ownership and representative authority and found no unresolved conflict.</label>
      <button disabled={!recognition || !linked || !clear} onClick={() => void run(async () => {
        setPreview(await api('intakes/preview', { subjectId: subject, sourceOrderId: order }) as Preview); setGrant(undefined);
      })}>Preview intake scope (no message or request)</button>
      {preview && <>
        <p>{preview.orderCount} linked orders; {preview.activeOrders.length} active deliveries. An active delivery still blocks fulfillment.</p>
        <button onClick={() => void run(async () => {
          const evidence = method === 'HISTORICAL_VERIFIED_EMAIL'
            ? { method, priorChallengeId: prior, continuityConfirmed: true, exactPersonRecordLinkConfirmed: true }
            : { method, genuinePriorRecognitionConfirmed: true, directPrivateInteractionConfirmed: true, exactPersonRecordLinkConfirmed: true };
          const result = await api('intakes/issue', { subjectId: subject, sourceOrderId: order, scopeHash: preview.scopeHash,
            policyReference: 'SS-PRIVACY-INTAKE-1.0', receivedAt: new Date(received).toISOString(),
            destination, privateReviewReference: reference, conflictsReviewed: true,
            ownershipDisputed: false, sharedOrReassignedContact: false, thirdPartyAuthorityUnresolved: false, evidence }) as Grant;
          setGrant(result); setPreview(undefined);
        })}>Issue private one-use recovery reference (no email)</button>
      </>}
      {grant && <div>
        <p>{grant.message} Destination: {grant.maskedDestination}. Expires: {new Date(grant.expiresAt).toLocaleString()}.</p>
        <p>Give the reference privately to the reviewed applicant. Do not put it in a URL, notes, logs, Git or an unprotected screenshot. The customer must redeem it, enter the fresh code and explicitly confirm their request.</p>
        <label className="block">Private recovery reference <input type="password" autoComplete="off" readOnly value={grant.intakeGrant} /></label>
        <button onClick={() => setGrant(undefined)}>Clear private reference from this screen</button>
      </div>}
    </fieldset>
  </details>;
}
