import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type Health = { ready: boolean; database: "ok" | "unavailable" | "timeout" };

export function createReadinessProbe(options: {
  checkDatabase(): Promise<unknown>;
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 2000;
  const cacheMs = options.cacheMs ?? 2000;
  let cached: { result: Health; checkedAt: number } | undefined;
  let databaseCheck: Promise<Health> | undefined;
  let responseCheck: Promise<Health> | undefined;

  return async (): Promise<Health> => {
    if (cached && now() - cached.checkedAt < cacheMs) return cached.result;
    if (responseCheck) return responseCheck;
    // A timed-out query is not cancellable through Prisma. Keep that one check
    // shared until it settles, instead of piling new queries onto a broken pool.
    if (!databaseCheck) {
      databaseCheck = Promise.resolve().then(options.checkDatabase).then(
        (): Health => ({ ready: true, database: "ok" }),
        (): Health => ({ ready: false, database: "unavailable" })
      ).finally(() => { databaseCheck = undefined; });
    }
    const query = databaseCheck;
    responseCheck = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          query,
          new Promise<Health>(resolve => {
            timer = setTimeout(() => resolve({ ready: false, database: "timeout" }), timeoutMs);
          })
        ]);
        cached = { result, checkedAt: now() };
        return result;
      } finally {
        if (timer) clearTimeout(timer);
        responseCheck = undefined;
      }
    })();
    return responseCheck;
  };
}

export const probeReadiness = createReadinessProbe({ checkDatabase: () => prisma.$queryRaw`SELECT 1` });
let previousState: boolean | undefined;

export async function getReadiness(_req: Request, res: Response): Promise<void> {
  const health = await probeReadiness();
  res.set("Cache-Control", "no-store");
  if (previousState !== health.ready) {
    const event = JSON.stringify({ event: "API_READINESS", state: health.ready ? "ready" : "unavailable", database: health.database });
    if (health.ready) console.log(event); else console.error(event);
    previousState = health.ready;
  }
  if (!health.ready) res.set("Retry-After", "5");
  res.status(health.ready ? 200 : 503).json({
    success: health.ready,
    message: health.ready ? "Speedy Sweeties backend is ready" : "Speedy Sweeties backend is temporarily unavailable",
    checks: { database: health.database }
  });
}
