export const CATALOG_PICKUP_TYPE_OPTIONS = [
  "UNKNOWN",
  "CONVENIENCE",
  "BEER_STORE",
  "LCBO",
  "VAPE",
  "DISPENSARY",
] as const;

export const PICKUP_LOCATION_TYPE_OPTIONS = [
  "CONVENIENCE",
  "BEER_STORE",
  "LCBO",
  "VAPE",
  "DISPENSARY",
] as const;

export const isPickupLocationType = (value: string): boolean =>
  PICKUP_LOCATION_TYPE_OPTIONS.some((pickupType) => pickupType === value);
