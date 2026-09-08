export type PickupLocationMatchCandidate = {
  name: string;
  addressLine1: string;
  latitude: number;
  longitude: number;
};

export type PickupLocationSeedIdentity = {
  name: string;
  addressLine1: string;
  latitude: number;
  longitude: number;
};

const MATCH_DISTANCE_METERS = 75;

export const normalizePickupLocationIdentityText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const toRadians = (value: number): number => (value * Math.PI) / 180;

export const pickupLocationDistanceMeters = (
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number => {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const startLatitude = toRadians(latitudeA);
  const endLatitude = toRadians(latitudeB);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
};

export const isSamePickupLocation = (
  candidate: PickupLocationMatchCandidate,
  seed: PickupLocationSeedIdentity
): boolean => {
  const sameAddress =
    normalizePickupLocationIdentityText(candidate.addressLine1) ===
    normalizePickupLocationIdentityText(seed.addressLine1);

  if (sameAddress) return true;

  const sameName =
    normalizePickupLocationIdentityText(candidate.name) ===
    normalizePickupLocationIdentityText(seed.name);

  if (!sameName) return false;

  return (
    pickupLocationDistanceMeters(
      candidate.latitude,
      candidate.longitude,
      seed.latitude,
      seed.longitude
    ) <= MATCH_DISTANCE_METERS
  );
};
