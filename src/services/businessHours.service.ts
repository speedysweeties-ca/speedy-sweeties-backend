import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { dailyHoursSlot, evaluateBusinessHours, SavedBusinessHours } from "./businessHoursSchedule";

const cacheKey = () => `business-hours:schedule:${env.GOOGLE_PLACE_ID}`;
const attemptKey = () => `business-hours:attempt:${env.GOOGLE_PLACE_ID}`;

export async function readSavedBusinessHours(): Promise<SavedBusinessHours | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: cacheKey() } });
  if (!row) return null;
  try {
    const saved = JSON.parse(row.value) as SavedBusinessHours;
    return saved.placeId === env.GOOGLE_PLACE_ID ? saved : null;
  } catch { return null; }
}

// Public reads never call Google: only this background refresh can do so.
export async function refreshBusinessHours(now = new Date()): Promise<boolean> {
  if (!env.GOOGLE_PLACES_API_KEY || !env.GOOGLE_PLACE_ID) return false;
  const key = attemptKey();
  const slot = dailyHoursSlot(now);
  const previous = await prisma.systemSetting.findUnique({ where: { key } });
  if (previous && previous.value >= slot) return false;
  // Commit the attempt BEFORE network I/O. Restarts, failures and overlapping
  // instances cannot spend again in the same slot. No network I/O in a transaction.
  const claimed = await prisma.$executeRaw`
    INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
    VALUES (${key}, ${slot}, NOW(), NOW())
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()
    WHERE "SystemSetting"."value" < EXCLUDED."value"`;
  if (!claimed) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(env.GOOGLE_PLACE_ID)}`, {
      headers: {
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "id,displayName,regularOpeningHours,currentOpeningHours"
      }, signal: controller.signal
    });
    if (!response.ok) throw new Error(`Google status ${response.status}`);
    const place = await response.json() as {
      id?: string; displayName?: { text?: string };
      regularOpeningHours?: SavedBusinessHours["regularOpeningHours"];
      currentOpeningHours?: SavedBusinessHours["currentOpeningHours"];
    };
    if (place.id !== env.GOOGLE_PLACE_ID) throw new Error("Unexpected place");
    const saved: SavedBusinessHours = {
      fetchedAt: now.toISOString(), placeId: place.id,
      businessName: place.displayName?.text ?? "Speedy Sweeties",
      regularOpeningHours: place.regularOpeningHours,
      currentOpeningHours: place.currentOpeningHours
    };
    if (!evaluateBusinessHours(saved, now)) throw new Error("No usable schedule");
    await prisma.systemSetting.upsert({ where: { key: cacheKey() },
      create: { key: cacheKey(), value: JSON.stringify(saved) },
      update: { value: JSON.stringify(saved) } });
    console.log(`[Business Hours] Daily schedule refreshed for ${slot}`);
    return true;
  } catch {
    console.error(`[Business Hours] Refresh failed for ${slot}; retaining saved schedule until next daily attempt`);
    return false;
  } finally { clearTimeout(timeout); }
}

export function startBusinessHoursMonitor(): () => void {
  let running = false;
  let stopped = false;
  const run = async () => {
    if (running || stopped) return;
    running = true;
    try { await refreshBusinessHours(); }
    catch { console.error("[Business Hours] Schedule storage unavailable; no Google request made without a durable claim"); }
    finally { running = false; }
  };
  // Bootstrap/catch up once if due. Otherwise startup only reads the saved attempt.
  void run();
  const timer = setInterval(() => { void run(); }, 30_000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
