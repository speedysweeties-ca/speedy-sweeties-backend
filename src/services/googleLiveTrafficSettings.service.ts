import { prisma } from "../lib/prisma";

export const GOOGLE_LIVE_TRAFFIC_SETTING_KEY =
  "googleLiveTrafficEnabled";

const settingValueToBoolean = (
  value: string | null | undefined
): boolean => !value || value.trim().toLowerCase() !== "false";

/**
 * Defaults to enabled so deploying this additive setting preserves the
 * traffic-aware routing behaviour that was active before the toggle existed.
 */
export const getGoogleLiveTrafficEnabled = async (): Promise<boolean> => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: GOOGLE_LIVE_TRAFFIC_SETTING_KEY },
    select: { value: true }
  });

  return settingValueToBoolean(setting?.value);
};

export const saveGoogleLiveTrafficEnabled = async (
  enabled: boolean
): Promise<boolean> => {
  await prisma.systemSetting.upsert({
    where: { key: GOOGLE_LIVE_TRAFFIC_SETTING_KEY },
    update: { value: enabled ? "true" : "false" },
    create: {
      key: GOOGLE_LIVE_TRAFFIC_SETTING_KEY,
      value: enabled ? "true" : "false"
    }
  });

  return getGoogleLiveTrafficEnabled();
};
