const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/js/order-attribution.js'), 'utf8');
const key = 'speedy-order-attribution-v1';
function visit({ referrer = '', search = '', pathname = '/', live = true, blocked = false, saved, time = 10000000 } = {}) {
  let stored = saved ?? null, clock = time, timer;
  const window = { speedySite: { live }, location: { search, pathname },
    sessionStorage: {
      getItem() { if (blocked) throw Error('Blocked'); return stored; },
      setItem(_key, value) { assert.equal(_key, key); if (blocked) throw Error('Blocked'); stored = value; },
      removeItem() { if (blocked) throw Error('Blocked'); stored = null; }
    }, setTimeout(callback, delay) { timer = { callback, delay }; } };
  vm.runInNewContext(source, { window, document: { referrer }, URL, URLSearchParams, Date: { now: () => clock } });
  return { fields: () => JSON.parse(JSON.stringify(window.speedyOrderAttribution?.fields() ?? {})), saved: () => stored,
    advance: ms => { clock += ms; }, timer: () => timer };
}

test('source survives service-page to homepage navigation without retaining URLs or identifiers', () => {
  const h = visit({ referrer: 'https://www.google.ca/search?q=private+query', pathname: '/beer-delivery-guelph/', search: '?email=private@example.invalid#track=private' });
  assert.deepEqual(h.fields(), { utmSource: 'google', utmMedium: 'organic', utmContent: 'web_v1:beer:referrer' });
  assert.doesNotMatch(h.saved(), /private|search|gclid|email|track|https/);
  const next = visit({ saved: h.saved(), referrer: 'https://www.speedysweeties.ca/beer-delivery-guelph/', time: 10001000 });
  assert.deepEqual(next.fields(), h.fields());
  assert.equal(next.timer().delay, 1799000);
});

test('only allowlisted source/medium tags are retained, with no campaign or free text', () => {
  const h = visit({ search: '?utm_source=google&utm_medium=cpc&utm_campaign=person@example.invalid&utm_term=private&utm_content=secret&gclid=opaque' });
  assert.deepEqual(h.fields(), { utmSource: 'google', utmMedium: 'cpc', utmContent: 'web_v1:home:utm' });
  assert.doesNotMatch(h.saved(), /person|private|secret|opaque/);
  const invalid = visit({ search: '?utm_source=person@example.invalid&utm_medium=secret' });
  assert.deepEqual(invalid.fields(), { utmContent: 'web_v1:home:unknown' });
  assert.deepEqual(visit({ search: '?utm_source=chatgpt.com&utm_medium=ai-assistant' }).fields(), {
    utmSource: 'chatgpt.com', utmMedium: 'ai-assistant', utmContent: 'web_v1:home:utm'
  });
});

test('recognized external sources replace earlier attribution; suffix spoofs stay generic', () => {
  const old = visit({ referrer: 'https://www.google.com/' }).saved();
  assert.equal(visit({ referrer: 'https://chatgpt.com/c/private', saved: old }).fields().utmSource, 'chatgpt.com');
  assert.equal(visit({ referrer: 'https://www.google.com.evil.invalid/', saved: old }).fields().utmSource, 'other_referral');
  assert.equal(visit({ referrer: 'https://mail.google.com/private' }).fields().utmSource, 'other_referral');
  assert.equal(visit({ referrer: 'https://gemini.google.com/private' }).fields().utmSource, 'gemini.google.com');
  assert.equal(visit({ referrer: 'https://ca.search.yahoo.com/' }).fields().utmSource, 'yahoo');
  assert.equal(visit({ referrer: 'https://l.facebook.com/' }).fields().utmMedium, 'social');
});

test('missing referrer remains unknown, including when storage is unavailable', () => {
  assert.deepEqual(visit().fields(), { utmContent: 'web_v1:home:unknown' });
  assert.equal(visit({ blocked: true, referrer: 'https://www.bing.com/' }).fields().utmSource, 'bing');
  assert.deepEqual(visit({ blocked: true }).fields(), { utmContent: 'web_v1:home:unknown' });
});

test('expired, corrupt, future or arbitrary stored fields cannot be submitted', () => {
  const old = visit({ referrer: 'https://google.ca/' });
  old.advance(1800000);
  assert.deepEqual(old.fields(), { utmContent: 'web_v1:unknown:expired' });
  assert.equal(old.saved(), null);
  for (const saved of ['{invalid', JSON.stringify({ source: 'private@example.invalid', medium: 'cpc', landing: 'home', method: 'utm', createdAt: 10000000 }),
    visit({ referrer: 'https://google.ca/', time: 10000001 }).saved(),
    visit({ referrer: 'https://google.ca/', time: 8000000 }).saved()]) {
    assert.deepEqual(visit({ saved }).fields(), { utmContent: 'web_v1:home:unknown' });
  }
  const saved = JSON.parse(visit({ referrer: 'https://google.ca/' }).saved()); saved.customerName = 'do not copy';
  assert.doesNotMatch(JSON.stringify(visit({ saved: JSON.stringify(saved) }).fields()), /customerName|do not copy/);
});

test('preview never reads or writes attribution, and expiry removes the short-lived record', () => {
  const preview = visit({ live: false, saved: 'unchanged' });
  assert.deepEqual(preview.fields(), {}); assert.equal(preview.saved(), 'unchanged'); assert.equal(preview.timer(), undefined);
  const h = visit(); h.advance(1800000); h.timer().callback(); assert.equal(h.saved(), null);
});


test('advertising click-tag presence prevents mislabelling paid visits as organic without retaining the identifier', () => {
  for (const name of ['gclid', 'gbraid', 'wbraid', 'msclkid']) {
    const h = visit({ search: '?' + name + '=sensitive-click-value', referrer: 'https://google.com/' });
    assert.equal(h.fields().utmSource, name === 'msclkid' ? 'bing' : 'google');
    assert.equal(h.fields().utmMedium, 'cpc');
    assert.equal(h.fields().utmContent, 'web_v1:home:click_tag');
    assert.doesNotMatch(h.saved(), /sensitive-click-value|gclid|gbraid|wbraid|msclkid/);
  }
});


test('known AI source-only links work even when the browser withholds the referrer', () => {
  for (const search of ['?utm_source=chatgpt.com', '?utm_source=chatgpt&utm_medium=referral']) {
    const fields = visit({ search }).fields();
    assert.equal(fields.utmSource, 'chatgpt.com'); assert.equal(fields.utmMedium, 'ai-assistant');
  }
  assert.equal(visit({ search: '?utm_source=google' }).fields().utmSource, undefined);
});
