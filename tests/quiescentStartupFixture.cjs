// Preload ONLY for synthetic child-process startup tests. Never a service entrypoint.
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const http = require('node:http');
assert.equal(process.env.SPEEDY_QUIESCENT_SYNTHETIC, 'yes');
const realDatabase = process.env.SYNTHETIC_REAL_POSTGRES === 'yes';
if (realDatabase) {
  const target = new URL(process.env.DATABASE_URL);
  assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '5432');
  assert.equal(target.pathname, '/speedy_privacy_synthetic'); assert.equal(target.username, 'privacy_test');
  assert.equal(process.env.NODE_ENV, 'test');
} else assert.equal(process.env.DATABASE_URL, 'postgresql://synthetic:synthetic@127.0.0.1:9/speedy_quiescent_synthetic');
const root = path.resolve(__dirname, '..');
const original = Module._load;
const state = { imports: [], starts: [], sql: [], normalLoaded: false, disconnected: false, readonlyVerified: false };
const forbidden = () => { throw new Error('SYNTHETIC_PROVIDER_OR_BACKGROUND_ACTIVITY_FORBIDDEN'); };
global.fetch = forbidden;
global.setInterval = forbidden;
// Real Prisma needs request/transaction deadline timers, not business schedulers.
if (!realDatabase) global.setTimeout = forbidden;
require('node:net').connect = forbidden;
require('node:net').createConnection = forbidden;
require('node:https').request = forbidden;
require('node:https').get = forbidden;
const allowNormal = process.env.SYNTHETIC_ALLOW_NORMAL === 'yes';
const record = name => { state.starts.push(name); return () => {}; };
const tx = {
  async $executeRawUnsafe(sql) { state.sql.push(sql); },
  async $queryRaw(strings) {
    assert.deepEqual([...strings], ['SELECT 1']); state.sql.push('SELECT 1');
    if (process.env.SYNTHETIC_HEALTH_FAILURE === 'yes') throw new Error('PRIVATE_DATABASE_ERROR_SYNTHETIC_CREDENTIAL');
    return [{ '?column?': 1 }];
  },
};
class SyntheticPrisma {
  constructor(options) {
    assert.deepEqual(options, { datasources: { db: { url: process.env.DATABASE_URL } }, log: [] });
    if (process.env.SYNTHETIC_CLIENT_FAILURE === 'yes') throw new Error('PRIVATE_CLIENT_ERROR_SYNTHETIC_CREDENTIAL');
  }
  async $transaction(work, options) {
    assert.deepEqual(options, { maxWait: 1000, timeout: 2500 });
    return work(tx);
  }
  async $disconnect() { state.disconnected = true; }
}
const normalServices = {
  driverAssignmentNotification: { stopDriverAssignmentNotifications() {} },
  undispatchedOrderAlert: { startUndispatchedOrderAlertMonitor: () => record('undispatched') },
  pickupLocationDryRun: { runPickupLocationDryRun: async () => { record('dry-run'); } },
  pickupLocationApply: { runPickupLocationApply: async () => { record('apply'); } },
  pickupLocationHours: { startPickupLocationHoursMonitor: () => record('hours') },
  pickupLocationPlaceIdRepair: { repairUnresolvedPickupLocationPlaceIds: async () => { record('repair'); } },
  bndOrderMonitor: { startBndOrderMonitor: () => record('bnd') },
  bndEmailAlerts: { startBndEmailAlertMonitor: () => record('email') },
  staffSessionLog: { startSessionLogWriter: () => record('sessions'), flushSessionEvents: async () => {} },
};
Module._load = function(name, parent, isMain) {
  if (name === 'dotenv' && process.env.SYNTHETIC_DOTENV_FAILURE === 'yes')
    return { config() { return { error: Object.assign(new Error('PRIVATE_DOTENV_ERROR'), { code: 'EACCES' }) }; } };
  if (name === '@prisma/client') {
    state.imports.push('direct-prisma');
    if (!realDatabase) return { PrismaClient: SyntheticPrisma };
    const actual = original.call(this, name, parent, isMain);
    return { ...actual, PrismaClient: class extends actual.PrismaClient {
      async $transaction(work, options) {
        return super.$transaction(async tx => work({
          async $executeRawUnsafe(sql) {
            assert.ok(["SET TRANSACTION READ ONLY", "SET LOCAL statement_timeout='1500ms'", "SET LOCAL lock_timeout='500ms'"].includes(sql));
            state.sql.push(sql); const r = await tx.$executeRawUnsafe(sql);
            if (sql === 'SET TRANSACTION READ ONLY') {
              const check = await tx.$queryRawUnsafe("SELECT current_setting('transaction_read_only') AS readonly");
              assert.equal(check[0].readonly, 'on'); state.readonlyVerified = true;
            }
            return r;
          },
          async $queryRaw(strings) { assert.deepEqual([...strings], ['SELECT 1']); state.sql.push('SELECT 1'); return tx.$queryRaw(strings); },
        }), options);
      }
    } };
  }
  const resolved = (() => { try { return Module._resolveFilename(name, parent); } catch { return ''; } })();
  if (resolved === path.join(root, 'dist/normalServer.js')) {
    state.normalLoaded = true;
    if (!allowNormal) forbidden();
  }
  const business = resolved.startsWith(path.join(root, 'dist/')) &&
    /\/(?:app\.js|config\/|lib\/|routes\/|services\/|integrations\/)/.test(resolved);
  if (business) {
    state.imports.push(path.relative(path.join(root, 'dist'), resolved));
    if (!allowNormal) forbidden();
    if (resolved.endsWith('/app.js')) return {
      listen(port, callback) {
        return http.createServer((_q, res) => res.end('synthetic normal app')).listen(port, '127.0.0.1', callback);
      },
    };
    if (resolved.endsWith('/config/env.js')) return { env: { PORT: Number(process.env.PORT) } };
    if (resolved.endsWith('/lib/prisma.js')) return { prisma: { $connect: async () => {}, $disconnect: async () => {} } };
    const key = /\/services\/(.+)\.service\.js$/.exec(resolved)?.[1];
    if (normalServices[key]) return normalServices[key];
    forbidden();
  }
  if (/firebase|openai|resend|@aws-sdk/.test(name)) forbidden();
  return original.call(this, name, parent, isMain);
};
process.on('message', msg => {
  if (msg === 'snapshot') process.send(state);
  if (msg === 'mutate-mode') process.env.API_STARTUP_MODE = 'normal';
});
