import { prisma } from "../lib/prisma";
import { createBndHoursProvider } from "../integrations/bnd/hours";
export { getBndHours } from "../integrations/bnd/schedule";
import { env } from "../config/env";
import { createBndMonitor } from "../integrations/bnd/monitor";
import { recordBndSnapshot } from "./bndWaitingHistory.service";

const hours = createBndHoursProvider({
  load: async () => (await prisma.systemSetting.findUnique({ where: { key: "bndBusinessHoursCache" } }))?.value ?? null,
  save: async (calendar, audit) => {
    await prisma.$transaction([
      prisma.systemSetting.upsert({ where: { key: "bndBusinessHoursCache" },
        create: { key: "bndBusinessHoursCache", value: JSON.stringify(calendar) }, update: { value: JSON.stringify(calendar) } }),
      prisma.systemSetting.upsert({ where: { key: `bndHours:${audit.date}` },
        create: { key: `bndHours:${audit.date}`, value: JSON.stringify(audit) }, update: { value: JSON.stringify(audit) } }),
    ]);
  },
  onError: () => console.error("B&D hours refresh or persistence failed; monitoring uses the available hours and will retry."),
});

// One monitor per backend process, independent of connected browser tabs.
// Credentials/token and responses remain server-side; no Order/Customer writes.
const monitor = createBndMonitor({
  enabled: env.BND_MONITOR_ENABLED,
  email: env.BND_LOGIN_EMAIL,
  password: env.BND_LOGIN_PASSWORD,
  beforeCheck: hours.refreshIfDue,
  nextHoursRefreshAt: hours.nextRefreshAt,
  onSnapshot: recordBndSnapshot,
  onSnapshotError: () => console.error("B&D timing history could not be saved; waiting-call alerts remain active."),
});
export const getBndMonitorStatus = monitor.getStatus;
export const startBndOrderMonitor = monitor.start;
