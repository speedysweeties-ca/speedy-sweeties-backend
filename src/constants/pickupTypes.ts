export const PICKUP_TYPE_OPTIONS = [
  "UNKNOWN",
  "CONVENIENCE",
  "BEER_STORE",
  "LCBO",
  "VAPE",
  "DISPENSARY"
] as const;

export type PickupTypeValue = (typeof PICKUP_TYPE_OPTIONS)[number];

export const ROUTABLE_PICKUP_TYPE_OPTIONS = [
  "CONVENIENCE",
  "BEER_STORE",
  "LCBO",
  "VAPE",
  "DISPENSARY"
] as const;

export type RoutablePickupTypeValue =
  (typeof ROUTABLE_PICKUP_TYPE_OPTIONS)[number];

export const normalizePickupType = (value: unknown): string =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

export const normalizePickupTypeOrUnknown = (value: unknown): string =>
  normalizePickupType(value) || "UNKNOWN";

export const parsePickupType = (
  value: unknown
): PickupTypeValue | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;

  const normalizedValue = normalizePickupType(value);
  if (!normalizedValue) return undefined;

  return (
    PICKUP_TYPE_OPTIONS.find(
      (pickupType) => pickupType === normalizedValue
    ) ?? null
  );
};

export const isRoutablePickupType = (
  value: unknown
): value is RoutablePickupTypeValue =>
  typeof value === "string" &&
  ROUTABLE_PICKUP_TYPE_OPTIONS.some((pickupType) => pickupType === value);
