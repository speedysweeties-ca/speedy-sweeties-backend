import { createHash } from "crypto";
import { DeliveryAddressInput, DeliveryLocationData, geocodeDeliveryAddress } from "./deliveryGeocoding.service";

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 1000;

// Only server-verified ROOFTOP results enter this cache. No client token or
// client-supplied coordinates can authorize an address. Each process has its own
// bounded cache; restart/eviction simply falls back to Google's normal validation.
export function createVerifiedDeliveryAddressLookup(
  lookup: typeof geocodeDeliveryAddress = geocodeDeliveryAddress,
  clock: () => number = Date.now
) {
  const entries = new Map<string, {
    expiresAt: number;
    result: Promise<DeliveryLocationData>;
  }>();
  return async (address: DeliveryAddressInput): Promise<DeliveryLocationData> => {
    // Exact structured fields avoid conflating different submitted addresses.
    const input = { addressLine1: address.addressLine1, city: address.city, province: address.province };
    const key = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const now = clock();
    for (const [id, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(id);
    }
    const existing = entries.get(key);
    if (existing) return { ...await existing.result };
    if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    const entry = {
      expiresAt: now + TTL_MS,
      result: Promise.resolve().then(() => lookup(input, { requireRooftop: true }))
    };
    entries.set(key, entry);
    try {
      const result = await entry.result;
      if (result.geocodeStatus !== "VERIFIED" && entries.get(key) === entry) entries.delete(key);
      return { ...result };
    } catch (error) {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    }
  };
}

export const getVerifiedDeliveryAddress = createVerifiedDeliveryAddressLookup();
