export type DeliveryGeocodeStatus =
  | "VERIFIED"
  | "NEEDS_REVIEW"
  | "UNVERIFIED";

export type OrderDeliveryLocation = {
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  geocodeStatus?: DeliveryGeocodeStatus | null;
  geocodeAddressFingerprint?: string | null;
};

export const getVerifiedDeliveryPosition = (
  order: OrderDeliveryLocation
): { lat: number; lng: number } | null => {
  const latitude = order.deliveryLatitude;
  const longitude = order.deliveryLongitude;

  if (order.geocodeStatus !== "VERIFIED") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if ((latitude as number) < -90 || (latitude as number) > 90) return null;
  if ((longitude as number) < -180 || (longitude as number) > 180) return null;

  return { lat: latitude as number, lng: longitude as number };
};

export const shouldUseLegacyBrowserGeocoding = (
  order: OrderDeliveryLocation
): boolean =>
  order.geocodeStatus === undefined &&
  order.deliveryLatitude === undefined &&
  order.deliveryLongitude === undefined;

export const needsDeliveryLocationReview = (
  order: OrderDeliveryLocation
): boolean =>
  !getVerifiedDeliveryPosition(order) && !shouldUseLegacyBrowserGeocoding(order);
