export const PICKUP_LOCATION_ROUTING_PRIORITY_OPTIONS = [
  "PREFERRED",
  "STANDARD",
  "FALLBACK"
] as const;

export type PickupLocationRoutingPriority =
  (typeof PICKUP_LOCATION_ROUTING_PRIORITY_OPTIONS)[number];

export const parsePickupLocationRoutingPriority = (
  value: unknown
): PickupLocationRoutingPriority | null => {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  return PICKUP_LOCATION_ROUTING_PRIORITY_OPTIONS.includes(
    normalized as PickupLocationRoutingPriority
  )
    ? (normalized as PickupLocationRoutingPriority)
    : null;
};

export const normalizePickupLocationRoutingPriority = (
  value: unknown
): PickupLocationRoutingPriority =>
  parsePickupLocationRoutingPriority(value) ?? "STANDARD";
