const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');

test('reviewed ADMIN intake on guarded synthetic PostgreSQL', { skip: process.env.PRIVACY_SYNTHETIC_DATABASE !== 'yes' }, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_privacy_synthetic');
  const { prisma: db } = require('../dist/lib/prisma');
  const { PrivacyDeletionService, PrivacyError, ADOPTED_COMPLETION_TIMEFRAME, retainedFinancialFields } = require('../dist/services/privacyDeletion.service');
  const { INTAKE_POLICY, INTAKE_GRANT_MS, signIntakeGrant, readIntakeGrant } = require('../dist/services/privacyIntakeGrant');
  const { PrivacyRecoveryJournal, RecoveryError, canonical } = require('../dist/services/privacyRecoveryJournal');
  const { SyntheticDecisionStore } = require('./privacyRecoveryFixture.cjs');
  const key = 'synthetic-admin-intake-digest-only', previousAllowlist = process.env.PRIVACY_ADMIN_USER_IDS;
  let counter = 0;
  const fixture = async (fulfillment = false) => {
    const admin = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, passwordHash: 'synthetic-non-login', role: 'ADMIN' } });
    process.env.PRIVACY_ADMIN_USER_IDS = admin.id;
    const phone = String(5197000000 + (++counter));
    const customer = await db.customer.create({ data: { fullName: 'Synthetic Intake Person', normalizedFullName: 'synthetic intake person',
      phone, normalizedPhone: phone, email: `${randomUUID()}@example.invalid`, addressLine1: '1 Synthetic Street', city: 'Guelph', province: 'ON' } });
    await db.customer.update({ where: { id: customer.id }, data: { normalizedEmail: customer.email } });
    const current = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    const tracking = randomBytes(32).toString('base64url');
    const order = await db.order.create({ data: { customerId: current.id, customerName: current.fullName,
      phone, email: current.email, addressLine1: current.addressLine1, city: 'Guelph', province: 'ON', itemsText: 'Synthetic water',
      paymentMethod: 'CASH', orderSource: 'IOS_APP', orderStatus: 'DELIVERED',
      trackingTokenHash: createHash('sha256').update(tracking).digest('hex'), trackingTokenExpiresAt: new Date(Date.now()+86400000),
      items: { create: { name: 'Synthetic water', quantity: 1, price: '3.00' } },
      digitalReceipt: { create: { receiptNumber: randomUUID(), itemTotal: '3.00', deliveryCharge: '10.00', taxOrFees: '0.00', grandTotal: '13.00' } } } });
    const sent = new Map(), store = new SyntheticDecisionStore();
    const journal = new PrivacyRecoveryJournal(store, `synthetic-intake-${counter}`, key);
    const empty = { count: async () => 0 };
    await journal.enrollEmptyDatabase({ privacyDeletionRequest: empty, privacyDeletedIdentity: empty, privacyAudit: empty, privacyExternalTask: empty });
    let sendFailure = false, sendCalls = 0;
    const requester = randomUUID();
    const service = new PrivacyDeletionService(db, key, { start: async message => {
      sendCalls += 1; sent.set(message.id, message); if (sendFailure) throw new Error('PRIVATE_PROVIDER_CANARY');
      return { reference: 'synthetic-provider-reference' };
    }, check: async () => { throw new Error('SMS forbidden'); } }, () => fulfillment, ADOPTED_COMPLETION_TIMEFRAME, '12-31', journal);
    const actor = { userId: admin.id, authVersion: admin.authVersion };
    const preview = () => service.previewIntake(current.id, order.id, actor);
    const input = async changes => ({ subjectId: current.id, sourceOrderId: order.id, scopeHash: (await preview()).scopeHash,
      policyReference: INTAKE_POLICY, receivedAt: new Date(Date.now()-1000).toISOString(), destination: `new-${randomUUID()}@example.invalid`,
      privateReviewReference: 'SYNTHETIC-CASE-REF', conflictsReviewed: true, ownershipDisputed: false,
      sharedOrReassignedContact: false, thirdPartyAuthorityUnresolved: false,
      evidence: { method: 'PRIOR_PERSONAL_RECOGNITION', genuinePriorRecognitionConfirmed: true,
        directPrivateInteractionConfirmed: true, exactPersonRecordLinkConfirmed: true }, ...changes });
    const issue = async changes => { const body = await input(changes); return { body, ...(await service.issueIntake(body, actor)) }; };
    const redeem = grant => service.challenge({ intakeGrant: grant.intakeGrant, destination: grant.body.destination }, requester);
    const verify = grant => service.verify(readIntakeGrant(grant.intakeGrant, value => service.hash(value)).id,
      sent.get(readIntakeGrant(grant.intakeGrant, value => service.hash(value)).id).code, undefined, grant.intakeGrant, grant.body.destination);
    const submission = (grant, proof, extra = {}) => ({ id: randomUUID(), token: randomBytes(32).toString('hex'),
      challengeId: readIntakeGrant(grant.intakeGrant, value => service.hash(value)).id, proof, accessToken: '',
      intakeGrant: grant.intakeGrant, intakeDestination: grant.body.destination, confirmed: true, ...extra });
    return { db, admin, actor, customer: current, order, tracking, service, journal, store, sent, preview, input, issue, redeem, verify, submission,
      calls: () => sendCalls, failSend: () => { sendFailure = true; }, claims: grant => readIntakeGrant(grant.intakeGrant, value => service.hash(value)) };
  };
  const financialDecision = () => ({policyReference:'SS-RETENTION-2026-10-23',justification:'Synthetic required financial retention.',taxYearEnd:`${new Date().getUTCFullYear()}-12-31`,financialRetainUntil:`${new Date().getUTCFullYear()+6}-12-31T23:59:59.999Z`,personalFields:[],financialFields:[...retainedFinancialFields],unlinkedRecordsReviewed:true,confirmed:true});
  const reject = async (promise, code) => assert.rejects(promise, error => (error instanceof PrivacyError || error instanceof RecoveryError) && (!code || error.code === code));
  try {
    await t.test('P01 ordinary credential path remains available', async () => {
      const f = await fixture(); const c = await f.service.challenge({ trackingToken: f.tracking }, 'ordinary');
      const access = randomBytes(32).toString('hex'); const proof = await f.service.verify(c.challengeId, f.sent.get(c.challengeId).code, access);
      const status = await f.service.submit({ id: randomUUID(), token: randomBytes(32).toString('hex'), challengeId: c.challengeId, proof: proof.proof, accessToken: access });
      assert.equal(status.status, 'SUBMITTED');
    });
    await t.test('P02 historical verified email and fresh original-channel control', async () => {
      const f = await fixture(), old = await f.service.challenge({ trackingToken: f.tracking }, 'old');
      await f.service.verify(old.challengeId, f.sent.get(old.challengeId).code, randomBytes(32).toString('hex'));
      await new Promise(resolve=>setTimeout(resolve,5));
      const grant = await f.issue({ destination: f.customer.email, receivedAt: new Date().toISOString(), evidence: {
        method: 'HISTORICAL_VERIFIED_EMAIL', priorChallengeId: old.challengeId, continuityConfirmed: true, exactPersonRecordLinkConfirmed: true } });
      await f.redeem(grant); const { proof } = await f.verify(grant); const r = await f.service.submit(f.submission(grant, proof));
      assert.equal(r.status, 'SUBMITTED');
    });
    await t.test('P03 new email is request-only; genuine-review attestation is journal-bound', async () => {
      const f = await fixture(), before = canonical([await db.customer.findUnique({ where: { id: f.customer.id } }), await db.order.findUnique({ where: { id: f.order.id } })]);
      const grant = await f.issue(); assert.equal(f.sent.size, 0); await f.redeem(grant);
      const { proof } = await f.verify(grant); const r = await f.service.submit(f.submission(grant, proof));
      assert.equal(r.status, 'SUBMITTED');
      assert.equal(canonical([await db.customer.findUnique({ where: { id: f.customer.id } }), await db.order.findUnique({ where: { id: f.order.id } })]), before);
      assert.equal(await db.privacyAccessCredential.count({ where: { customerId: f.customer.id } }), 0);
      assert.ok((await db.privacyAudit.findMany({ where: { requestId: r.id } })).some(a => a.actorId === f.admin.id && a.event.startsWith('ADMIN_INTAKE:')));
      assert.equal((await f.journal.ready()).cases.get(r.id).request.status, 'SUBMITTED');
      assert.equal((await f.service.status(r.id, f.submission(grant, proof).token).catch(() => null)), null);
    });
    await t.test('P04 active delivery permits request but refuses fulfillment', async () => {
      const f = await fixture(true); await db.order.update({ where: { id: f.order.id }, data: { orderStatus: 'PLACED' } });
      const g = await f.issue(); await f.redeem(g); const p = await f.verify(g); const r = await f.service.submit(f.submission(g, p.proof));
      assert.equal(r.status, 'SUBMITTED'); const impact = await f.service.impact(r.id); assert.equal(impact.activeOrders.length, 1);
      await reject(f.service.fulfill(r.id,f.admin.id,impact.version,impact.previewHash,financialDecision()),'ACTIVE_ORDERS_HOLD');
      assert.equal(await db.privacyExternalTask.count({ where: { requestId: r.id } }), 0);
    });
    await t.test('P05 held active request recovered with unchanged HOLD/due date and old status revoked', async () => {
      const f = await fixture(), g = await f.issue(); await f.redeem(g); const proof = await f.verify(g); const first = f.submission(g, proof.proof);
      const a = await f.service.submit(first); await f.service.hold(a.id,f.admin.id); const next = await f.issue(); await f.redeem(next); const p = await f.verify(next), input = f.submission(next, p.proof);
      const b = await f.service.submit(input); assert.equal(b.id, a.id); assert.equal(b.dueAt, a.dueAt); assert.equal(b.status,'HOLD');
      await reject(f.service.status(a.id, first.token)); assert.equal((await f.service.status(a.id, input.token)).status, 'HOLD');
    });
    await t.test('R01 R02 current singleton ADMIN allowlist and active authVersion', async () => {
      const f = await fixture(); await reject(f.service.previewIntake(f.customer.id, f.order.id, { ...f.actor, userId: randomUUID() }));
      await db.user.update({ where: { id: f.admin.id }, data: { role: 'DRIVER' } }); await reject(f.preview());
      await db.user.update({ where: { id: f.admin.id }, data: { role: 'ADMIN', isActive: false } }); await reject(f.preview());
      await db.user.update({ where: { id: f.admin.id }, data: { isActive: true, authVersion: 1 } }); await reject(f.preview());
    });
    await t.test('R03 draft policy and unavailable history refuse', async () => {
      const f = await fixture(); await reject(f.service.issueIntake(await f.input({ policyReference: 'DRAFT' }), f.actor));
      f.store.failKind = 'INTENT'; const g = await f.issue(); await f.redeem(g); const p = await f.verify(g);
      await reject(f.service.submit(f.submission(g, p.proof))); assert.equal(await db.privacyDeletionRequest.count({ where: { subjectId: f.customer.id } }), 0);
    });
    await t.test('R04 R05 R07 order facts, copied receipts and weak recognition cannot authorize', async () => {
      const f = await fixture();
      for (const evidence of [{ method: 'ORDER_FACTS_ONLY' }, { method: 'COPIED_RECEIPTS' },
        { method: 'PRIOR_PERSONAL_RECOGNITION', genuinePriorRecognitionConfirmed: false, directPrivateInteractionConfirmed: true, exactPersonRecordLinkConfirmed: true },
        { method: 'PRIOR_PERSONAL_RECOGNITION', genuinePriorRecognitionConfirmed: true, directPrivateInteractionConfirmed: true, exactPersonRecordLinkConfirmed: false }])
        await reject(f.service.issueIntake(await f.input({ evidence }), f.actor), 'INTAKE_EVIDENCE_REQUIRED');
      assert.equal(f.sent.size, 0);
    });
    await t.test('R06 missing independently verified binding cannot use historical email route', async () => {
      const f = await fixture(); await reject(f.issue({ destination: f.customer.email, evidence: { method: 'HISTORICAL_VERIFIED_EMAIL', priorChallengeId: randomUUID(), continuityConfirmed: true, exactPersonRecordLinkConfirmed: true } }));
    });
    await t.test('R08 R09 disputes, shared channels and third-party authority refuse', async () => {
      const f = await fixture();
      for (const key of ['ownershipDisputed', 'sharedOrReassignedContact', 'thirdPartyAuthorityUnresolved']) await reject(f.issue({ [key]: true }));
      await db.customer.create({ data: { ...Object.fromEntries(['fullName','normalizedFullName','phone','normalizedPhone','addressLine1','city','province'].map(k => [k,f.customer[k]])) } });
      await reject(f.preview());
    });
    await t.test('R10 wrong subject/source cannot be substituted', async () => {
      const f = await fixture(); await reject(f.service.previewIntake(f.customer.id, randomUUID(), f.actor),'SOURCE_ORDER_UNAVAILABLE');
      await reject(f.service.previewIntake(randomUUID(),f.order.id,f.actor),'SUBJECT_UNAVAILABLE');
      const other=await db.customer.create({data:{fullName:'Other synthetic person',normalizedFullName:'other synthetic person',phone:'5198880001',normalizedPhone:'5198880001',addressLine1:'1 Other Synthetic Street',city:'Guelph',province:'ON'}});
      await db.order.update({where:{id:f.order.id},data:{customerId:other.id}});await reject(f.preview(),'SOURCE_ORDER_UNAVAILABLE');
      await db.order.update({where:{id:f.order.id},data:{customerId:f.customer.id}});
      await db.order.update({ where: { id: f.order.id }, data: { privacyErasedAt: new Date() } }); await reject(f.preview());
    });
    await t.test('R11 conflicting linked and detached orders block approval', async () => {
      const f = await fixture(); const data = { customerId: f.customer.id, customerName: 'Different identity', phone: f.customer.phone,
        email: f.customer.email, addressLine1: '1 Synthetic Street', city: 'Guelph', province: 'ON', itemsText: 'Synthetic', paymentMethod:'CASH', orderSource:'IOS_APP', orderStatus:'DELIVERED' };
      const conflict = await db.order.create({ data }); await reject(f.preview());
      await db.order.update({ where: { id: conflict.id }, data: { customerId: null } }); await reject(f.preview());
    });
    await t.test('R12 scope mutation invalidates before send and after code', async () => {
      const f = await fixture(), g = await f.issue(); await db.order.update({ where: { id: f.order.id }, data: { additionalNotes: 'changed synthetic scope' } });
      await reject(f.redeem(g), 'STALE_PREVIEW'); assert.equal(f.sent.size, 0);
      const next = await f.issue(); await f.redeem(next); const proof = await f.verify(next);
      await db.customer.update({ where: { id: f.customer.id }, data: { addressLine1: '2 Synthetic Street' } });
      await reject(f.service.submit(f.submission(next, proof.proof)), 'STALE_PREVIEW');
    });
    await t.test('R13 R14 24-hour expiry, tampering, supersession and consumed replay', async () => {
      const f = await fixture(), g = await f.issue(); const claims = f.claims(g);
      assert.equal(claims.expiresAt-claims.issuedAt, INTAKE_GRANT_MS);
      assert.equal(readIntakeGrant(g.intakeGrant, s=>f.service.hash(s), claims.expiresAt), null);
      const past = Date.now()-INTAKE_GRANT_MS-1000;
      const expired = signIntakeGrant({ ...claims, issuedAt: past, expiresAt: past+INTAKE_GRANT_MS }, s=>f.service.hash(s));
      await reject(f.redeem({ ...g, intakeGrant: expired }));
      const parts=g.intakeGrant.split('.'); parts[1]=Buffer.from(JSON.stringify({ ...claims, scopeHash:'0'.repeat(64) })).toString('base64url');
      await reject(f.redeem({ ...g, intakeGrant: parts.join('.') }));
      const next=await f.issue(); await reject(f.redeem(g)); await f.redeem(next); const p=await f.verify(next);
      await f.service.submit(f.submission(next,p.proof)); await reject(f.verify(next));
    });
    await t.test('R15 destination mismatch stops before sending', async () => {
      const f=await fixture(),g=await f.issue(); await reject(f.redeem({ ...g, body:{...g.body,destination:'wrong@example.invalid'} })); assert.equal(f.sent.size,0);
    });
    await t.test('R16 concurrent redemption reserves exactly one provider call', async () => {
      const f=await fixture(),g=await f.issue(); const results=await Promise.allSettled([f.redeem(g),f.redeem(g)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(f.calls(),1); await reject(f.redeem(g)); assert.equal(f.calls(),1);
    });
    await t.test('R17 uncertain provider outcome cannot resend or verify', async () => {
      const f=await fixture(),g=await f.issue();f.failSend();await reject(f.redeem(g),'VERIFICATION_DELIVERY_UNAVAILABLE');await reject(f.redeem(g));
      assert.equal(f.calls(),1);await reject(f.verify(g));
    });
    await t.test('R18 five attempts, code expiry and actor revocation are enforced', async () => {
      const f=await fixture(),g=await f.issue();await f.redeem(g);
      for(let i=0;i<5;i++) await reject(f.service.verify(f.claims(g).id,'00000000',undefined,g.intakeGrant,g.body.destination),'INVALID_OR_EXPIRED_CODE');
      await reject(f.verify(g)); assert.equal((await db.privacyChallenge.findUnique({where:{id:f.claims(g).id}})).attempts,5);
      const next=await f.issue();await f.redeem(next);await db.privacyChallenge.update({where:{id:f.claims(next).id},data:{expiresAt:new Date(Date.now()-1)}});await reject(f.verify(next));
      const last=await f.issue();await db.user.update({where:{id:f.admin.id},data:{isActive:false}});await reject(f.redeem(last));
    });
    await t.test('R19 normal and intake proofs cannot be interchanged',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);await reject(f.service.verify(f.claims(g).id,f.sent.get(f.claims(g).id).code,randomBytes(32).toString('hex')));
      const p=await f.verify(g);await reject(f.service.submit({...f.submission(g,p.proof),intakeGrant:undefined}),'VERIFICATION_REQUIRED');await reject(f.service.submit(f.submission(g,f.service.hash(`proof:${f.claims(g).id}`))),'VERIFICATION_REQUIRED');
    });
    await t.test('R20 explicit confirmation required after successful code',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g);
      assert.equal(await db.privacyDeletionRequest.count({where:{subjectId:f.customer.id}}),0);
      await reject(f.service.submit(f.submission(g,p.proof,{confirmed:false})), 'EXPLICIT_CONFIRMATION_REQUIRED');
    });
    await t.test('R21 concurrent submission and duplicate replay preserve one request',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g),input=f.submission(g,p.proof);
      const inputs=[input,f.submission(g,p.proof)];const result=await Promise.allSettled(inputs.map(value=>f.service.submit(value)));
      assert.equal(result.filter(v=>v.status==='fulfilled').length,1);assert.equal(await db.privacyDeletionRequest.count({where:{subjectId:f.customer.id}}),1);
      const winner=inputs[result.findIndex(v=>v.status==='fulfilled')];const duplicate=await f.service.submit(winner);assert.equal(duplicate.id,winner.id);await reject(f.service.submit({...winner,token:randomBytes(32).toString('hex')}),'REQUEST_UNAVAILABLE');
    });
    await t.test('R22 cancellation is terminal for that request and old grant',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g),input=f.submission(g,p.proof);await f.service.submit(input);
      await f.service.cancel(input.id,input.token);await reject(f.redeem(g));assert.equal((await f.service.status(input.id,input.token)).status,'CANCELLED');
    });
    await t.test('R23 R27 request-only flow preserves source and fulfillment-disabled guard',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g),input=f.submission(g,p.proof);await f.service.submit(input);const preview=await f.service.impact(input.id);
      await reject(f.service.fulfill(input.id,f.admin.id,preview.version,preview.previewHash,{policyReference:'SS-RETENTION-2026-10-23',justification:'Synthetic required financial retention.',taxYearEnd:`${new Date().getUTCFullYear()}-12-31`,financialRetainUntil:`${new Date().getUTCFullYear()+7}-12-31T23:59:59.999Z`,personalFields:[],financialFields:[...retainedFinancialFields],unlinkedRecordsReviewed:true,confirmed:true}),'FULFILLMENT_DISABLED');
      assert.equal(await db.privacyAccessCredential.count({where:{customerId:f.customer.id}}),0);assert.equal((await db.order.findUnique({where:{id:f.order.id}})).privacyErasedAt,null);
    });
    await t.test('R24 R25 R26 journal interruption and existing enrolled format remain protected',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g),input=f.submission(g,p.proof);
      f.store.failKind='COMMIT';await reject(f.service.submit(input));await reject(f.journal.ready());
      assert.equal((await db.privacyDeletionRequest.findUnique({where:{id:input.id}})).status,'SUBMITTED');
      assert.ok(f.store.entries.some(e=>e.kind==='INTENT'));assert.ok(f.store.entries.every(e=>!JSON.stringify(e).includes(g.intakeGrant)));
    });
    await t.test('R28 invalid financial decision still refuses without erasure',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g),input=f.submission(g,p.proof);await f.service.submit(input);const preview=await f.service.impact(input.id);
      await reject(f.service.fulfill(input.id,f.admin.id,preview.version,preview.previewHash,{}),'VALIDATED_RETENTION_DECISION_REQUIRED');
    });
    await t.test('R29 R30 private metadata, received date and insufficient notes are minimized',async()=>{
      const f=await fixture();await reject(f.issue({privateReviewReference:'private@example.invalid'}));await reject(f.issue({receivedAt:new Date(Date.now()+60000).toISOString()}));
      const g=await f.issue();await f.redeem(g);const p=await f.verify(g),input=f.submission(g,p.proof);await f.service.submit(input);
      const stored=JSON.stringify(f.store.entries);assert.ok(!stored.includes(g.intakeGrant));assert.ok(!stored.includes(g.body.destination));assert.ok(!stored.includes('SYNTHETIC-CASE-REF'));
    });

    await t.test('R01 R02 R03 actual HTTP authentication, enabled gate and sanitized errors',async()=>{
      const express=require('express'),{privacyRouter}=require('../dist/routes/privacy.routes'),{signAuthToken}=require('../dist/utils/jwt');
      const f=await fixture(),app=express();app.use(express.json({limit:'16kb'}));app.use('/privacy',privacyRouter(f.service));app.use('/disabled',privacyRouter());
      const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
      const base=`http://127.0.0.1:${server.address().port}`;
      const token=(changes={})=>signAuthToken({userId:f.admin.id,email:f.admin.email,role:'ADMIN',authVersion:0,...changes});
      const call=async(path,body,auth)=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${auth}`}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};};
      const body={subjectId:f.customer.id,sourceOrderId:f.order.id},oldGate=process.env.PRIVACY_DELETION_ENABLED;
      try{
        assert.equal((await call('/privacy/admin/intakes/preview',body)).status,401);
        assert.equal((await call('/privacy/admin/intakes/preview',body,'invalid-synthetic-token')).status,401);
        assert.equal((await call('/privacy/admin/intakes/preview',body,token({authVersion:9}))).status,401);
        assert.equal((await call('/privacy/admin/intakes/preview',body,require('jsonwebtoken').sign({userId:f.admin.id,email:f.admin.email,role:'ADMIN',authVersion:0},process.env.JWT_SECRET,{expiresIn:-1}))).status,401);
        const other=await db.user.create({data:{email:`${randomUUID()}@example.invalid`,passwordHash:'synthetic',role:'ADMIN'}});
        assert.equal((await call('/privacy/admin/intakes/preview',body,token({userId:other.id,email:other.email}))).status,403);
        await db.user.update({where:{id:f.admin.id},data:{role:'DRIVER'}});
        assert.equal((await call('/privacy/admin/intakes/preview',body,token())).status,403);
        await db.user.update({where:{id:f.admin.id},data:{role:'ADMIN',forceLogoutAt:new Date()}});
        assert.equal((await call('/privacy/admin/intakes/preview',body,token())).status,401);
        await db.user.update({where:{id:f.admin.id},data:{forceLogoutAt:null,passwordChangeRequired:true}});
        assert.equal((await call('/privacy/admin/intakes/preview',body,token())).status,401);
        await db.user.update({where:{id:f.admin.id},data:{passwordChangeRequired:false}});
        const preview=await call('/privacy/admin/intakes/preview',body,token());assert.equal(preview.status,200);assert.equal(preview.cache,'no-store');
        const issued=await call('/privacy/admin/intakes/issue',await f.input(),token());assert.equal(issued.status,201);assert.equal(f.calls(),0);
        const bad=await call('/privacy/admin/intakes/issue',{...(await f.input()),actorId:other.id},token());assert.equal(bad.status,400);
        process.env.PRIVACY_DELETION_ENABLED='false';const disabled=await call('/disabled/admin/intakes/preview',body,token());assert.equal(disabled.status,503);assert.equal(disabled.body.scopeHash,undefined);
        f.service.issueIntake=async()=>{throw new Error('PRIVATE_DETAILS_CANARY');};
        const failure=await call('/privacy/admin/intakes/issue',{},token());assert.equal(failure.status,503);assert.deepEqual(failure.body,{code:'PRIVACY_SERVICE_UNAVAILABLE'});
      }finally{if(oldGate===undefined)delete process.env.PRIVACY_DELETION_ENABLED;else process.env.PRIVACY_DELETION_ENABLED=oldGate;await new Promise(resolve=>server.close(resolve));}
    });
    await t.test('R02 approver eligibility is rechecked after delivery and verification',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);await db.user.update({where:{id:f.admin.id},data:{authVersion:1}});await reject(f.verify(g));
      await db.user.update({where:{id:f.admin.id},data:{authVersion:0}});const p=await f.verify(g);process.env.PRIVACY_ADMIN_USER_IDS='';await reject(f.service.submit(f.submission(g,p.proof)));
      assert.equal(await db.privacyDeletionRequest.count({where:{subjectId:f.customer.id}}),0);
    });
    await t.test('R03 email gate disabled never calls provider; missing history refuses preview',async()=>{
      const {privacyVerificationDelivery}=require('../dist/services/privacyDelivery.service');const f=await fixture();let calls=0;
      const delivery=privacyVerificationDelivery({resendApiKey:'synthetic-only',resendFrom:'sender@example.invalid',emailEnabled:false,twilioAccountSid:'',twilioAuthToken:'',twilioVerifyServiceSid:'',phoneEnabled:false},async()=>{calls++;throw new Error('NETWORK_FORBIDDEN');},()=>{});
      const svc=new PrivacyDeletionService(db,key,delivery,()=>false,ADOPTED_COMPLETION_TIMEFRAME,'12-31',f.journal);
      const g=await f.issue();await reject(svc.challenge({intakeGrant:g.intakeGrant,destination:g.body.destination},randomUUID()),'VERIFICATION_DELIVERY_UNAVAILABLE');assert.equal(calls,0);await reject(f.redeem(g));
      const missing=new PrivacyDeletionService(db,key,delivery,()=>false,ADOPTED_COMPLETION_TIMEFRAME,'12-31');await reject(missing.previewIntake(f.customer.id,f.order.id,f.actor),'PRIVACY_RECOVERY_STORE_REQUIRED');
    });
    await t.test('R06 R15 historical email cannot switch to a new address or invent continuity',async()=>{
      const f=await fixture(),old=await f.service.challenge({trackingToken:f.tracking},randomUUID());await f.service.verify(old.challengeId,f.sent.get(old.challengeId).code,randomBytes(32).toString('hex'));
      await new Promise(resolve=>setTimeout(resolve,5));const evidence={method:'HISTORICAL_VERIFIED_EMAIL',priorChallengeId:old.challengeId,continuityConfirmed:true,exactPersonRecordLinkConfirmed:true};
      await reject(f.issue({receivedAt:new Date().toISOString(),evidence}),'INTAKE_OWNERSHIP_REVIEW_REQUIRED');
      await reject(f.issue({destination:f.customer.email,receivedAt:new Date().toISOString(),evidence:{...evidence,continuityConfirmed:false}}),'INTAKE_EVIDENCE_REQUIRED');assert.equal(f.calls(),1);
    });
    await t.test('R13 R18 immutable row purpose, delivery and exact fifth-code success',async()=>{
      const f=await fixture(),g=await f.issue();await reject(f.service.verify(f.claims(g).id,'11111111',undefined,g.intakeGrant,g.body.destination),'INTAKE_UNAVAILABLE');await f.redeem(g);
      const wrong=f.sent.get(f.claims(g).id).code==='11111111'?'22222222':'11111111';
      for(let i=0;i<4;i++)await reject(f.service.verify(f.claims(g).id,wrong,undefined,g.intakeGrant,g.body.destination));
      const p=await f.verify(g);assert.ok(p.proof);assert.equal((await db.privacyChallenge.findUnique({where:{id:f.claims(g).id}})).attempts,5);
      await db.privacyChallenge.update({where:{id:f.claims(g).id},data:{purpose:'DELETE'}});await reject(f.service.submit(f.submission(g,p.proof)));assert.equal(await db.privacyDeletionRequest.count({where:{subjectId:f.customer.id}}),0);
    });
    await t.test('R22 cancelled case stays closed when a new grant supplies its old request ID',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g),input=f.submission(g,p.proof);await f.service.submit(input);await f.service.cancel(input.id,input.token);
      const next=await f.issue();await f.redeem(next);const q=await f.verify(next);await reject(f.service.submit(f.submission(next,q.proof,{id:input.id})),'REQUEST_UNAVAILABLE');
      assert.equal((await f.service.submit(f.submission(next,q.proof,{id:input.id,token:input.token}))).status,'CANCELLED');
      assert.equal(await db.privacyDeletionRequest.count({where:{subjectId:f.customer.id}}),1);
    });
    await t.test('R24 R25 R26 new intake round-trip preserves history format and detects request drift',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g),input=f.submission(g,p.proof);await f.service.submit(input);
      const before=canonical(f.store.entries),loaded=new PrivacyRecoveryJournal(f.store,`synthetic-intake-${counter}`,key);const state=await loaded.ready();assert.equal(state.cases.get(input.id).request.status,'SUBMITTED');assert.equal(canonical(f.store.entries),before);
      const commit=f.store.entries.find(e=>e.kind==='COMMIT');assert.ok(commit);
      await db.privacyDeletionRequest.update({where:{id:input.id},data:{version:{increment:1}}});await reject(f.service.cancel(input.id,input.token),'RECOVERY_UNRECORDED_DECISION');assert.equal(canonical(f.store.entries),before);
    });

    await t.test('R25 uncertain database acknowledgement leaves intent open and never auto-reissues',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g),input=f.submission(g,p.proof);
      const uncertain=new Proxy(db,{get(target,name){if(name==='$transaction')return async(...args)=>{const result=await target.$transaction(...args);throw new Error('SYNTHETIC_COMMIT_ACK_UNAVAILABLE');};const value=Reflect.get(target,name);return typeof value==='function'?value.bind(target):value;}});
      const svc=new PrivacyDeletionService(uncertain,key,{start:async()=>{throw new Error('SEND_FORBIDDEN');},check:async()=>false},()=>false,ADOPTED_COMPLETION_TIMEFRAME,'12-31',f.journal);
      await reject(svc.submit(input),'PRIVACY_RECOVERY_UNAVAILABLE');assert.equal((await db.privacyDeletionRequest.findUnique({where:{id:input.id}})).status,'SUBMITTED');await reject(f.journal.ready());assert.equal(f.calls(),1);
    });
    await t.test('R26 ordinary enrolled case remains byte-stable while intake recovers its status',async()=>{
      const f=await fixture(),c=await f.service.challenge({trackingToken:f.tracking},randomUUID()),access=randomBytes(32).toString('hex');
      const p=await f.service.verify(c.challengeId,f.sent.get(c.challengeId).code,access),normal={id:randomUUID(),token:randomBytes(32).toString('hex'),challengeId:c.challengeId,proof:p.proof,accessToken:access};
      const initial=await f.service.submit(normal),prefix=structuredClone(f.store.entries);
      const g=await f.issue();await f.redeem(g);const q=await f.verify(g),recovered=await f.service.submit(f.submission(g,q.proof));assert.equal(recovered.id,initial.id);assert.equal(recovered.dueAt,initial.dueAt);assert.equal(canonical(f.store.entries.slice(0,prefix.length)),canonical(prefix));
      const loaded=new PrivacyRecoveryJournal(f.store,`synthetic-intake-${counter}`,key);assert.equal((await loaded.ready()).cases.get(initial.id).request.status,'SUBMITTED');await reject(f.service.status(initial.id,normal.token),'REQUEST_UNAVAILABLE');
    });

    await t.test('R12 stale pre-issue preview and expanded linked scope refuse without delivery',async()=>{
      const f=await fixture(),body=await f.input();await db.customer.update({where:{id:f.customer.id},data:{addressLine1:'3 Synthetic Street'}});await reject(f.service.issueIntake(body,f.actor),'STALE_PREVIEW');
      const g=await f.issue();await db.order.create({data:{customerId:f.customer.id,customerName:f.customer.fullName,phone:f.customer.phone,email:f.customer.email,addressLine1:'1 Synthetic Street',city:'Guelph',province:'ON',itemsText:'Synthetic extra order',paymentMethod:'CASH',orderSource:'IOS_APP',orderStatus:'DELIVERED'}});await reject(f.redeem(g),'STALE_PREVIEW');assert.equal(f.calls(),0);
    });
    await t.test('R19 wrong challenge and normal proof cannot authorize the reviewed challenge',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);await reject(f.service.verify(randomUUID(),f.sent.get(f.claims(g).id).code,undefined,g.intakeGrant,g.body.destination),'INVALID_OR_EXPIRED_CODE');
      const p=await f.verify(g);await reject(f.service.submit(f.submission(g,p.proof,{challengeId:randomUUID()})),'VERIFICATION_REQUIRED');assert.equal(await db.privacyDeletionRequest.count({where:{subjectId:f.customer.id}}),0);
    });
    await t.test('R22 different source cannot recover an existing active request or rotate its secret',async()=>{
      const f=await fixture(),g=await f.issue();await f.redeem(g);const p=await f.verify(g),first=f.submission(g,p.proof);await f.service.submit(first);
      const other=await db.order.create({data:{customerId:f.customer.id,customerName:f.customer.fullName,phone:f.customer.phone,email:f.customer.email,addressLine1:'1 Synthetic Street',city:'Guelph',province:'ON',itemsText:'Synthetic second order',paymentMethod:'CASH',orderSource:'IOS_APP',orderStatus:'DELIVERED'}});
      const scope=await f.service.previewIntake(f.customer.id,other.id,f.actor),body=await f.input({sourceOrderId:other.id,scopeHash:scope.scopeHash}),next={body,...(await f.service.issueIntake(body,f.actor))};
      await f.redeem(next);const q=await f.verify(next);await reject(f.service.submit(f.submission(next,q.proof)),'VERIFICATION_REQUIRED');assert.equal((await f.service.status(first.id,first.token)).status,'SUBMITTED');
    });
  } finally { if(previousAllowlist===undefined) delete process.env.PRIVACY_ADMIN_USER_IDS;else process.env.PRIVACY_ADMIN_USER_IDS=previousAllowlist;await db.$disconnect(); }
});
