import express from 'express';
import helmet from 'helmet';
import { accessSync, constants } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildDirectory = fileURLToPath(new URL('./dist/', import.meta.url));
const productionHostname = 'speedy-dispatcher.onrender.com';

export function createDispatcherServer({
  directory = buildDirectory,
  allowedHosts = [productionHostname, 'localhost', '127.0.0.1', '[::1]'],
} = {}) {
  const app = express();
  const hosts = new Set(allowedHosts);
  app.set('env', 'production');
  app.disable('x-powered-by');
  // Do not trust client-supplied forwarding headers when validating the host.
  app.set('trust proxy', false);
  app.use(helmet({
    // Preserve Maps, external B&D windows, printing and the existing API calls.
    // Restrict embedding/base/object use without introducing an untested script
    // or connection allowlist that could interrupt the dispatch workflow.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        // The previous preview server had no CSP. Preserve resource loading
        // while adding these independent restrictions; a full resource policy
        // needs separate Maps/printing integration validation.
        defaultSrc: helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc,
        baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xFrameOptions: { action: 'deny' },
  }));
  app.use((req, res, next) => {
    const host = req.get('host') || '';
    if (!host || /[\s/@\\?#]/.test(host)) return res.sendStatus(403);
    let hostname;
    try { hostname = new URL(`http://${host}`).hostname; }
    catch { return res.sendStatus(403); }
    if (!hosts.has(hostname)) return res.sendStatus(403);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD');
      return res.sendStatus(405);
    }
    res.set('Cache-Control', 'no-cache');
    next();
  });
  app.use((req, res, next) => {
    let pathname;
    try { pathname = decodeURIComponent(req.path); }
    catch { return res.sendStatus(400); }
    // This service serves built public assets only. Never expose project files,
    // dotfiles, source maps, or Vite development/editor endpoints.
    if (pathname.split('/').some(part => part.startsWith('.')) ||
        /^\/(?:src|node_modules|@fs|@vite|@id)(?:\/|$)/.test(pathname) ||
        pathname === '/__open-in-editor' || pathname.endsWith('.map')) {
      return res.sendStatus(404);
    }
    res.locals.assetPath = pathname;
    next();
  });
  app.use(express.static(directory, {
    dotfiles: 'deny', index: false, redirect: false, fallthrough: true,
    cacheControl: false,
    setHeaders(res, filename) {
      if (extname(filename) === '.html') res.setHeader('Cache-Control', 'no-store');
    },
  }));
  app.use((req, res, next) => {
    // Retain SPA navigation and the staff-password query flow, but missing
    // assets/API calls must be real 404s, not HTML disguised as JavaScript/JSON.
    if (extname(res.locals.assetPath) || /^\/(?:assets|api)(?:\/|$)/.test(res.locals.assetPath) ||
        !req.accepts('html')) return res.sendStatus(404);
    res.set('Cache-Control', 'no-store');
    res.sendFile('index.html', { root: directory, cacheControl: false }, error => {
      if (error) next(error);
    });
  });
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    // Never return filesystem paths, source, query strings or error stacks.
    const status = error.status === 404 ? 404 : error.status === 403 ? 403 : 500;
    res.status(status).type('text').send(status === 500 ? 'Service unavailable' : 'Not found');
  });
  return app;
}

export function startDispatcherServer() {
  // Render already invokes `npm run preview -- --host ... --port $PORT`.
  // Keep that command working while starting the production server. PORT is
  // authoritative on Render; the CLI port is also accepted for local checks.
  const portIndex = process.argv.indexOf('--port');
  const port = Number(process.env.PORT || (portIndex >= 0 ? process.argv[portIndex + 1] : 10000));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid server port');
  accessSync(resolve(buildDirectory, 'index.html'), constants.R_OK);
  const allowedHosts = [productionHostname, 'localhost', '127.0.0.1', '[::1]'];
  if (process.env.RENDER_EXTERNAL_HOSTNAME) allowedHosts.push(process.env.RENDER_EXTERNAL_HOSTNAME);
  const server = createDispatcherServer({ allowedHosts }).listen(port, '0.0.0.0', () => {
    console.log(`Dispatcher production server listening on port ${port}`);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 20_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startDispatcherServer();
}
