import { env } from "../config/env";
import { createBndMonitor } from "../integrations/bnd/monitor";

// One monitor per backend process, independent of connected browser tabs.
// Credentials/token and responses remain server-side; no Order/Customer writes.
const monitor = createBndMonitor({
  enabled: env.BND_MONITOR_ENABLED,
  email: env.BND_LOGIN_EMAIL,
  password: env.BND_LOGIN_PASSWORD,
});
export const getBndMonitorStatus = monitor.getStatus;
export const startBndOrderMonitor = monitor.start;
