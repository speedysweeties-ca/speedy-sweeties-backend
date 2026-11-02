const assert = require('node:assert/strict');

const AUTHORIZED_RENDER_SERVICE_ID = 'srv-dbe3861srm7s73dgfe50';
const AUTHORIZED_RENDER_SERVICE_NAME = 'speedy-privacy-isolated';
const AUTHORIZED_RENDER_DATABASE_ID = 'dpg-dbe37v59fdbs73961o3g-a';
const AUTHORIZED_RENDER_DATABASE_NAME = 'speedy_privacy_synthetic';
const AUTHORIZED_RENDER_DATABASE_USER = 'speedy_privacy_synthetic_user';

function validateAuthorizedRenderTarget(env) {
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.PRIVACY_SYNTHETIC_DATABASE, 'yes');
  assert.equal(env.PRIVACY_ISOLATED_RENDER, 'yes');
  assert.equal(env.RENDER, 'true');
  assert.equal(env.RENDER_SERVICE_ID, AUTHORIZED_RENDER_SERVICE_ID);
  assert.equal(env.RENDER_SERVICE_NAME, AUTHORIZED_RENDER_SERVICE_NAME);
  assert.equal(env.PRIVACY_EXPECTED_DATABASE_RESOURCE_ID, AUTHORIZED_RENDER_DATABASE_ID);

  const url = new URL(env.DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(decodeURIComponent(url.pathname), `/${AUTHORIZED_RENDER_DATABASE_NAME}`);
  assert.equal(decodeURIComponent(url.username), AUTHORIZED_RENDER_DATABASE_USER);
  assert.equal(env.PRIVACY_EXPECTED_DATABASE_HOST, url.hostname);
  assert.ok(
    url.hostname === AUTHORIZED_RENDER_DATABASE_ID ||
      url.hostname.startsWith(`${AUTHORIZED_RENDER_DATABASE_ID}.`),
    'database host must identify the authorized Render database resource',
  );
  assert.notEqual(url.hostname, 'localhost');
  assert.notEqual(url.hostname, '127.0.0.1');

  return { url };
}

function runWithAuthorizedRenderTarget(env, operation) {
  return operation(validateAuthorizedRenderTarget(env));
}

module.exports = {
  AUTHORIZED_RENDER_SERVICE_ID,
  AUTHORIZED_RENDER_SERVICE_NAME,
  AUTHORIZED_RENDER_DATABASE_ID,
  AUTHORIZED_RENDER_DATABASE_NAME,
  AUTHORIZED_RENDER_DATABASE_USER,
  validateAuthorizedRenderTarget,
  runWithAuthorizedRenderTarget,
};
