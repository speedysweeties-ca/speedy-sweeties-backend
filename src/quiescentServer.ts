// API writer exclusion, NOT enrollment or a second recovery system.
// No app/config/env/routes/providers/services imports and no business timers.
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import type { PrismaClient } from "@prisma/client";

const gates = ["PRIVACY_DELETION_ENABLED", "PRIVACY_FULFILLMENT_ENABLED",
  "PRIVACY_VERIFICATION_EMAIL_ENABLED", "PRIVACY_VERIFICATION_PHONE_ENABLED"];

function reply(res: ServerResponse, status: number, value: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store",
    "Connection": "close", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify({ mode: "quiescent", applicationWritersStarted: false, ...value }));
}

export function quiescentHandler(checkDatabase: () => Promise<void>) {
  let inFlight: Promise<boolean> | undefined;
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/api/v1/health/live") {
      reply(res, 200, { success: true }); return;
    }
    if (req.method !== "GET" || req.url !== "/api/v1/health/ready") {
      // Do not parse/log/echo request URLs, bodies, credentials or identifiers.
      reply(res, 503, { code: "API_QUIESCENT" }); return;
    }
    // Request-driven only; share one bounded read-only probe for simultaneous GETs.
    const check = inFlight ??= Promise.resolve().then(checkDatabase).then(() => true, () => false);
    void check.then(ok => {
      if (inFlight === check) inFlight = undefined;
      if (!res.destroyed) reply(res, ok ? 200 : 503, { success: ok,
        checks: { database: ok ? "ok" : "unavailable" } });
    });
  };
}

export async function startQuiescentServer() {
  const e = process.env, port = Number(e.PORT ?? 4000);
  if (e.API_STARTUP_MODE !== "quiescent" || !gates.every(k => e[k] === "false") ||
      !Number.isInteger(port) || port < 1 || port > 65535 || !e.DATABASE_URL?.trim())
    throw new Error("QUIESCENT_CONFIGURATION_REQUIRED");
  // Import a log-free direct client only AFTER validation, never lib/prisma/env.
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  const db: PrismaClient = new PrismaClient({ datasources: { db: { url: e.DATABASE_URL } }, log: [] });
  const server = createServer(quiescentHandler(async () => {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='1500ms'");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='500ms'");
      await tx.$queryRaw`SELECT 1`;
    }, { maxWait: 1000, timeout: 2500 });
  }));
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.$disconnect();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "0.0.0.0", () => { server.removeListener("error", reject); resolve(); });
    });
  } catch (error) { await db.$disconnect().catch(() => {}); throw error; }
  server.on("error", () => {
    console.error(JSON.stringify({ event: "API_STARTUP_STOPPED", code: "QUIESCENT_SERVER_FAILED" }));
    void stop().finally(() => process.exit(1));
  });
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => {
    void stop().then(() => process.exit(0), () => process.exit(1));
  });
  console.log(JSON.stringify({ event: "API_QUIESCENT_LISTENING", mode: "quiescent", applicationWritersStarted: false }));
  return server;
}
