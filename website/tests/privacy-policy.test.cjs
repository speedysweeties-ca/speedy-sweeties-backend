const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { parseHTML } = require('linkedom');
const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
let policy, renderer;
before(async () => {
  ({ proposedPrivacyPolicy: policy } = await import(pathToFileURL(path.join(root, 'content/privacy-policy-proposed.mjs'))));
  renderer = await import(pathToFileURL(path.join(root, 'scripts/render-privacy-page.mjs')));
});
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

// Historical content hashes include the previous sensitive-data example.
const usePreviousSensitiveExample = t => {
  const section = policy.sections.find(s => s.id === 'customer-details');
  const current = section.paragraphs[2];
  section.paragraphs[2] = current.replace(
    'An order request may itself reveal sensitive personal information.',
    'An order request may itself reveal sensitive information, including information about a prescription pickup.'
  );
  t.after(() => { section.paragraphs[2] = current; });
};

test('ordinary policy rendering preserves the published source and dates', () => {
  const { document } = parseHTML(renderer.renderPrivacyPage(home));
  assert.match(document.querySelector('.policy-dates').textContent, /October 1, 2026/);
  assert.match(document.querySelector('.policy-dates').textContent, /October 29, 2026/);
  assert.doesNotMatch(document.querySelector('.policy-copy').textContent, /voice-draft request/);
});

test('proposed homepage replacement leaves every unrelated byte intact', () => {
  const candidate = renderer.replaceHomepagePolicy(home);
  const pattern = /(<span id="privacy-policy">[\s\S]*?<\/span>)[\s\S]*?(<\/div>)/g;
  assert.equal(candidate.replace(pattern, '$1POLICY$2'), home.replace(pattern, '$1POLICY$2'));
  assert.throws(() => renderer.replaceHomepagePolicy('<div>no policy</div>'), /exactly one/);
  assert.throws(() => renderer.replaceHomepagePolicy(home + home), /exactly one/);
});

test('one proposed source supplies all homepage and standalone policy paragraphs', () => {
  const candidate = renderer.replaceHomepagePolicy(home);
  const { document } = parseHTML(renderer.renderPrivacyPage(candidate, { proposed: true }));
  const copy = document.querySelector('.policy-copy').textContent;
  const { document: homepage } = parseHTML(candidate);
  for (const section of policy.sections) {
    assert.ok(document.getElementById(section.id));
    for (const paragraph of section.paragraphs) {
      assert.ok(copy.includes(paragraph));
      assert.ok(homepage.body.textContent.includes(paragraph));
    }
  }
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://www.speedysweeties.ca/privacy-policy/');
  assert.match(copy, /up to eight recent user\/assistant messages/);
  assert.match(copy, /not currently enabled/);
  assert.match(copy, /asks OpenAI not to store the response/);
  assert.match(copy, /24 calendar months after actual request closure/);
  assert.doesNotMatch(copy, /\[EDITOR|PUBLICATION HOLD|INSERT ACTUAL/);
});

test('the legal page needs no login, order form, age prompt, analytics or bot challenge', () => {
  const html = renderer.renderPrivacyPage(renderer.replaceHomepagePolicy(home), { proposed: true });
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll('form, input, iframe').length, 0);
  const scripts = [...document.querySelectorAll('script')].map(x => x.getAttribute('src') || x.textContent);
  assert.deepEqual(scripts, ['/js/site-config.js']);
  assert.match(html, /noindex, nofollow/);
  assert.ok(document.querySelector('a[href="https://developers.openai.com/api/docs/guides/your-data"]'));
  assert.doesNotMatch(html, /href="\/support\/"|href="\/account-deletion\/"/);
});

test('previews cannot claim an effective date and new publication requires approval and today', () => {
  assert.match(renderer.proposedPolicyBlocks().join(' '), /Effective Date:<\/strong> Not assigned/);
  assert.throws(() => renderer.proposedPolicyBlocks({ publicationDate: today() }), /preview/);
  assert.throws(() => renderer.proposedPolicyBlocks({ production: true }), /separate approval/);
  for (const publicationDate of ['', '2026-02-30', '2000-01-01', '2099-01-01']) {
    assert.throws(() => renderer.proposedPolicyBlocks({ production: true, approved: true, publicationDate }), /actual Toronto publication date/);
  }
});

test('approved production rendering uses only its explicit date; compatibility copy stays noindex', () => {
  const options = { production: true, approved: true, publicationDate: today(), proposed: true };
  const candidate = renderer.replaceHomepagePolicy(home, options);
  const html = renderer.renderPrivacyPage(candidate, options);
  assert.doesNotMatch(html, /publication pending|Not assigned|noindex/);
  assert.match(html, new RegExp('Effective Date:</strong> ' + today()));
  assert.match(renderer.renderPrivacyPage(candidate, { ...options, legacy: true }), /noindex, follow/);
  assert.throws(() => renderer.renderPrivacyPage(candidate, { proposed: true, production: true }), /separate approval/);
});

test('production build refuses an unstamped or unapproved proposal before touching output', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'speedy-policy-build-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.cpSync(path.join(root, 'scripts'), path.join(fixture, 'scripts'), { recursive: true });
  fs.cpSync(path.join(root, 'content'), path.join(fixture, 'content'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'dist'));
  const index = path.join(fixture, 'dist/index.html');
  fs.writeFileSync(index, 'preserve existing output');
  for (const approved of ['false', 'true']) {
    const child = spawnSync(process.execPath, [path.join(fixture, 'scripts/build.mjs'), '--production', '--proposed-privacy-policy'], {
      env: { ...process.env, PUBLIC_CUSTOMER_PAGES_APPROVED: approved }, encoding: 'utf8'
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, approved === 'true' ? /actual Toronto publication date/ : /separate approval/);
  }
  assert.equal(fs.readFileSync(index, 'utf8'), 'preserve existing output');
});

test('the plain-text review copy contains current-state disclosure without an invented date', () => {
  const text = renderer.proposedPolicyReviewText();
  assert.match(text, /PROPOSED REPLACEMENT — NOT PUBLISHED/);
  assert.match(text, /Effective date: not assigned/);
  assert.match(text, /Following ownership and scope review, Robert uses the guarded deletion process/);
  assert.match(text, /Completion is confirmed only after the applicable separately held and provider copies/);
  assert.doesNotMatch(text, /Deletion fulfillment remains disabled during this request-only stage/);
  assert.doesNotMatch(text, /\[EDITOR|PUBLICATION HOLD|INSERT ACTUAL/);
});

test('current-main integration preserves driver pages and ordinary output while the policy stays opt-in', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'speedy-policy-integration-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const name of ['scripts', 'content', 'src']) {
    fs.cpSync(path.join(root, name), path.join(fixture, name), { recursive: true });
  }
  const build = args => {
    const child = spawnSync(process.execPath, [path.join(fixture, 'scripts/build.mjs'), ...args], {
      env: { ...process.env, PUBLIC_CUSTOMER_PAGES_APPROVED: 'false' }, encoding: 'utf8'
    });
    assert.equal(child.status, 0, 'Local preview must build without publication approval');
  };
  const read = name => fs.readFileSync(path.join(fixture, 'dist', name), 'utf8');
  build([]);
  const ordinaryHome = read('index.html');
  const ordinaryDriver = read('drive-with-us/index.html');
  const ordinarySitemap = read('sitemap.xml');
  const withoutCounter = ordinaryHome.replace('<link rel="stylesheet" href="/assets/page-counter.css">', '')
    .replace(/<div class="page-counter"[\s\S]*?<script defer src="\/js\/page-counter.js"><\/script>/, '');
  assert.equal(withoutCounter, home.replace('<!--BUILD_ROBOTS-->', '<meta name="robots" content="noindex, nofollow">'));
  assert.match(ordinaryDriver, /applicant-smartserve/);
  assert.match(ordinarySitemap, /drive-with-us/);
  assert.doesNotMatch(read('privacy-policy/index.html'), /voice-draft request/);
  build(['--proposed-privacy-policy']);
  assert.equal(read('drive-with-us/index.html'), ordinaryDriver);
  assert.equal(read('sitemap.xml'), ordinarySitemap);
  const pattern = /(<span id="privacy-policy">[\s\S]*?<\/span>)[\s\S]*?(<\/div>)/g;
  assert.equal(read('index.html').replace(pattern, '$1POLICY$2'), ordinaryHome.replace(pattern, '$1POLICY$2'));
  for (const name of ['index.html', 'privacy-policy/index.html', 'privacy/index.html']) {
    assert.match(read(name), /voice-draft request/);
    assert.match(read(name), /Smart Serve certificate number/);
    assert.match(read(name), /Not assigned/);
    assert.match(read(name), /noindex/);
  }
  for (const route of ['support', 'account-deletion']) assert.equal(fs.existsSync(path.join(fixture, 'dist', route)), false);
});


test('published operational policy preserves November 7 while changed content needs a new date', t => {
  usePreviousSensitiveExample(t);
  const website = policy.sections.find(s => s.id === 'website');
  const currentWebsite = website.paragraphs;
  website.paragraphs = currentWebsite.filter(p => !p.startsWith('To understand which sources'));
  t.after(() => { website.paragraphs = currentWebsite; });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-08T17:00:00Z') });
  const options = { production: true, approved: true, publicationDate: '2026-11-07' };
  assert.throws(() => renderer.proposedPolicyBlocks({ ...options, approved: false }), /separate approval/);
  assert.match(renderer.proposedPolicyBlocks(options).join(' '), /Effective Date:<\/strong> 2026-11-07/);
  const introduction = policy.introduction;
  try {
    policy.introduction += ' Unpublished change.';
    assert.throws(() => renderer.proposedPolicyBlocks(options), /actual Toronto publication date/);
  } finally { policy.introduction = introduction; }
  assert.throws(() => renderer.proposedPolicyBlocks({ ...options, publicationDate: '2026-11-03' }), /actual Toronto publication date/);
  assert.throws(() => renderer.proposedPolicyBlocks({ ...options, publicationDate: '2026-11-04' }), /actual Toronto publication date/);
  assert.match(renderer.proposedPolicyBlocks({ ...options, publicationDate: '2026-11-08' }).join(' '), /Effective Date:<\/strong> 2026-11-08/);
});

test('request-only published policy retains its exact November 7 date as rollback evidence', t => {
  usePreviousSensitiveExample(t);
  const website = policy.sections.find(s => s.id === 'website');
  const currentWebsite = website.paragraphs;
  website.paragraphs = currentWebsite.filter(p => !p.startsWith('To understand which sources'));
  t.after(() => { website.paragraphs = currentWebsite; });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-08T17:00:00Z') });
  const requests = policy.sections.find(s => s.id === 'requests').paragraphs;
  const current = [requests[2], requests[3]], introduction = policy.introduction;
  try {
    requests[2] = "Email verification and submission of eligible deletion requests are available in the app. Verification alone does not submit a request: you must explicitly confirm it. You can review its status and cancel while the request is still cancellable. If you cannot use your saved credentials, contact Robert for a private ownership review; you do not need to place another order. Deletion fulfillment remains disabled during this request-only stage. Submitting a request is not confirmation of deletion, and no deletion completion is promised while fulfillment is disabled.";
    requests[3] = 'Our adopted normal target is completion within 30 calendar days after identity verification. This remains a target for the intended operational process, not confirmation that manual deletion can be completed today. It is not a promise of immediate or automatic erasure. Ownership disputes, active deliveries or applicable holds may require more time or a separately explained outcome. The adopted procedure calls for explaining completed actions and any information retained.';
    const options = { production: true, approved: true, publicationDate: '2026-11-07' };
    assert.match(renderer.proposedPolicyBlocks(options).join(' '), /Effective Date:<\/strong> 2026-11-07/);
    policy.introduction += ' Changed policy text.';
    assert.throws(() => renderer.proposedPolicyBlocks(options), /actual Toronto publication date/);
  } finally { [requests[2], requests[3]] = current; policy.introduction = introduction; }
});

test('unchanged previous policy still supports its exact November 3 rollback date', t => {
  usePreviousSensitiveExample(t);
  const website = policy.sections.find(s => s.id === 'website');
  const currentWebsite = website.paragraphs;
  website.paragraphs = currentWebsite.filter(p => !p.startsWith('To understand which sources'));
  t.after(() => { website.paragraphs = currentWebsite; });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-06T17:00:00Z') });
  const provider = policy.sections.find(s => s.id === 'providers-storage').paragraphs;
  const requests = policy.sections.find(s => s.id === 'requests').paragraphs;
  const current = [provider[3], requests[2], requests[3]];
  try {
    provider[3] = "The prepared account-deletion verification integration uses Resend for an eligible existing email address or Twilio Verify for an eligible existing phone number. A verification provider receives the destination, verification/message content and transaction metadata. The server selects the contact from credential-bound records, rather than treating a newly entered contact as authority over past orders. These production verification channels and the in-app request process are not currently enabled.";
    requests[2] = "The in-app deletion-verification, request and fulfillment services are not currently enabled. A complete manual-deletion process, including the handling of separately held and provider records, has not yet been verified as available. You can contact Robert to submit a request for review, but neither the account-deletion screen nor receipt of your request confirms that deletion can be completed today.";
    requests[3] = 'Our adopted normal target is completion within 30 calendar days after identity verification. This remains a target for the intended operational process, not confirmation that manual deletion can be completed today. It is not a promise of immediate or automatic erasure. Ownership disputes, active deliveries or applicable holds may require more time or a separately explained outcome. The adopted procedure calls for explaining completed actions and any information retained.';
    assert.match(renderer.proposedPolicyBlocks({ production: true, approved: true, publicationDate: '2026-11-03' }).join(' '), /Last updated:<\/strong> 2026-11-03/);
  } finally { [provider[3], requests[2], requests[3]] = current; }
});


test('new attribution disclosure cannot be published with the older November 7 date', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T17:00:00Z') });
  const options = { production: true, approved: true, publicationDate: '2026-11-11' };
  assert.match(renderer.proposedPolicyBlocks(options).join(' '), /up to 30 minutes/);
  assert.throws(() => renderer.proposedPolicyBlocks({ ...options, publicationDate: '2026-11-07' }), /actual Toronto publication date/);
});


test('attribution policy rebuild preserves its November 11 date and rejects content drift', t => {
  usePreviousSensitiveExample(t);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-12T17:00:00Z') });
  const options = { production: true, approved: true, publicationDate: '2026-11-11' };
  assert.match(renderer.proposedPolicyBlocks(options).join(' '), /Last updated:<\/strong> 2026-11-11/);
  const introduction = policy.introduction;
  try {
    policy.introduction += ' Unpublished change.';
    assert.throws(() => renderer.proposedPolicyBlocks(options), /actual Toronto publication date/);
  } finally { policy.introduction = introduction; }
});

test('deployment date override supersedes an old saved command but preserves approval checks', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'speedy-policy-date-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const name of ['scripts', 'content', 'src']) fs.cpSync(path.join(root, name), path.join(fixture, name), { recursive: true });
  const run = approved => spawnSync(process.execPath, [path.join(fixture, 'scripts/build.mjs'), '--production', '--proposed-privacy-policy', '--privacy-policy-date=2026-11-07'], {
    env: { ...process.env, PUBLIC_CUSTOMER_PAGES_APPROVED: approved, PUBLIC_PRIVACY_POLICY_DATE: today(), TURNSTILE_SITE_KEY: '0xSYNTHETIC_BUILD_ONLY_12345' }, encoding: 'utf8'
  });
  const denied = run('false'); assert.notEqual(denied.status, 0); assert.match(denied.stderr, /separate approval/);
  const approved = run('true'); assert.equal(approved.status, 0, approved.stderr);
  const output = fs.readFileSync(path.join(fixture, 'dist/privacy-policy/index.html'), 'utf8');
  assert.match(output, new RegExp('Last updated:</strong> ' + today()));
  assert.match(output, /up to 30 minutes/);
});

test('neutral sensitive-data wording keeps its November 12 date without weakening publication guards', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-13T17:00:00Z') });
  const options = { production: true, approved: true, publicationDate: '2026-11-12' };
  const candidate = renderer.replaceHomepagePolicy(home, options);
  for (const output of [candidate, renderer.renderPrivacyPage(candidate, { ...options, proposed: true }), renderer.renderPrivacyPage(candidate, { ...options, proposed: true, legacy: true })]) {
    assert.match(output, /An order request may itself reveal sensitive personal information\./);
    assert.doesNotMatch(output, /prescription pickup/i);
    assert.match(output, /Last updated:<\/strong> 2026-11-12/);
  }
  assert.throws(() => renderer.proposedPolicyBlocks({ ...options, approved: false }), /separate approval/);
  assert.throws(() => renderer.proposedPolicyBlocks({ ...options, publicationDate: '2026-11-11' }), /actual Toronto publication date/);
  const introduction = policy.introduction;
  try {
    policy.introduction += ' Unpublished change.';
    assert.throws(() => renderer.proposedPolicyBlocks(options), /actual Toronto publication date/);
  } finally { policy.introduction = introduction; }
});
