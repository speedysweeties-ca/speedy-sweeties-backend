const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withDiagnosticContext, setDiagnosticOrder, diagnosticRecord, logDiagnostic } = require('../dist/utils/operationalDiagnostics');
const { requestDiagnostics, logServerError } = require('../dist/middleware/requestDiagnostics');

const capture = t => {
  const events = [];
  for (const level of ['log', 'warn', 'error']) t.mock.method(console, level, line => events.push(JSON.parse(line)));
  return events;
};

test('concurrent async requests keep their own order, ID and errors', async t => {
  const events = capture(t), ids = [randomUUID(), randomUUID()];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  await Promise.all(ids.map((id, i) => withDiagnosticContext(id, async () => {
    setDiagnosticOrder(501 + i);
    if (i === 0) await barrier; else release();
    await new Promise(resolve => setImmediate(resolve));
    logDiagnostic({ event: 'ORDER_CREATE', outcome: 'committed' });
  })));
  for (const [i, id] of ids.entries()) assert.equal(events.find(e => e.requestId === id).orderNumber, 501 + i);
  assert.equal(diagnosticRecord({ event: 'ORDER_CREATE', outcome: 'started' }).orderNumber, undefined);
});

test('schema rejects private metadata and untrusted codes and IDs; sink failure is harmless', t => {
  const privateValue = 'private-password-address-phone-device-token';
  const record = diagnosticRecord({ event: 'AUTO_DISPATCH', outcome: 'held', orderNumber: 501,
    reason: privateValue, detail: privateValue, code: privateValue, requestId: privateValue,
    orderId: privateValue, customerName: privateValue, address: privateValue, error: new Error(privateValue),
    payload: { token: privateValue }, action: privateValue, route: '/track?token=' + privateValue });
  assert(!JSON.stringify(record).includes(privateValue));
  assert.equal(record.code, 'unclassified');
  assert.equal(record.orderNumber, 501);
  assert.equal(record.schema, 1);
  assert.equal(diagnosticRecord({ code: 'P2034' }).code, 'P2034');
  t.mock.method(console, 'log', () => { throw new Error('sink failed'); });
  assert.doesNotThrow(() => logDiagnostic({ event: 'ORDER_CREATE', outcome: 'committed' }));
});

test('HTTP diagnostics connect direct rejections and exceptions without logging URLs or response bodies', async t => {
  const express = require('express');
  const events = capture(t), app = express();
  app.use(requestDiagnostics);
  app.post('/orders/:id/accept', (_req, res) => { setDiagnosticOrder(501); res.status(409).json({ private: 'private-body' }); });
  app.get('/orders/:id/fail', (req, res) => {
    setDiagnosticOrder(502);
    logServerError(Object.assign(new Error('private-stack'), { code: 'P2034' }), req, res);
    res.status(500).end();
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const reject = await fetch(base + '/orders/private-id/accept?token=private-token', { method: 'POST', headers: { 'X-Request-ID': 'private-header' } });
  assert.equal(reject.status, 409); await reject.text();
  const failed = await fetch(base + '/orders/private-id/fail'); await failed.text();
  await new Promise(resolve => setImmediate(resolve));
  const rejection = events.find(e => e.status === 409);
  assert.equal(rejection.requestId, reject.headers.get('x-request-id'));
  assert.equal(rejection.orderNumber, 501);
  assert.equal(rejection.route, '/orders/:id/accept');
  const exception = events.find(e => e.event === 'HTTP_SERVER_ERROR');
  assert.equal(exception.requestId, failed.headers.get('x-request-id'));
  assert.equal(exception.orderNumber, 502);
  assert.equal(exception.code, 'P2034');
  for (const secret of ['private-id', 'private-token', 'private-header', 'private-stack', 'private-body']) assert(!JSON.stringify(events).includes(secret));
});
