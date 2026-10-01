const { existsSync } = require('node:fs');
const path = require('node:path');
const DATABASE_ID = 'dpg-davbqnhsrm7s73bd3uq0-a';
function assertStaging(env = process.env) {
  const fail = () => { throw new Error('Staging isolation check failed. Refusing database access.'); };
  if (env.NODE_ENV !== 'test' || env.SPEEDY_ORDERING_MODE !== 'isolated-staging' || env.AUTO_DISPATCH_ENABLED !== 'false') fail();
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON !== '{}') fail();
  if (!env.STAGING_API_KEY || env.STAGING_API_KEY.length < 32 || !env.JWT_SECRET || env.JWT_SECRET.length < 32) fail();
  let db; try { db = new URL(env.DATABASE_URL); } catch { fail(); }
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !(db.hostname === DATABASE_ID || db.hostname.startsWith(DATABASE_ID + '.'))) fail();
  if (db.pathname !== '/speedy_ordering_staging_db' || db.username !== 'speedy_ordering_staging_db_user') fail();
  if ([...db.searchParams.keys()].some(k => !['sslmode', 'connection_limit', 'pool_timeout'].includes(k))) fail();
  for (const [key, value] of Object.entries(env)) {
    if (value && ((key.endsWith('_API_KEY') && key !== 'STAGING_API_KEY') || /^(TWILIO_|RESEND_|SENDGRID_|GOOGLE_.*KEY|FIREBASE_.*CREDENTIAL)/.test(key))) fail();
  }
  if (existsSync(path.join(__dirname, '..', '.env'))) fail();
  return true;
}
if (require.main === module) assertStaging();
module.exports = { assertStaging, DATABASE_ID };
