import { createHash } from "crypto";
import { DeliveryGeocodeStatus } from "@prisma/client";
import { env } from "../config/env";

export type DeliveryAddressInput = {
  addressLine1: string;
  city: string;
  province: string;
};

export type DeliveryLocationData = {
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  geocodeStatus: DeliveryGeocodeStatus;
  geocodedAddress: string | null;
  geocodePlaceId: string | null;
  geocodeAddressFingerprint: string;
};

export type GeocodingServiceOptions = {
  apiKey?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
};

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

export type GoogleGeocodeResult = {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  partial_match?: boolean;
  place_id?: string;
  types?: string[];
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
    location_type?: string;
  };
};

type GoogleGeocodeResponse = {
  results?: GoogleGeocodeResult[];
  status?: string;
  error_message?: string;
};

type CandidateEvaluation = {
  result: GoogleGeocodeResult;
  latitude: number;
  longitude: number;
  score: number;
};

export class DeliveryAddressValidationError extends Error {
  readonly code: "INVALID_DELIVERY_ADDRESS";

  constructor(message: string) {
    super(message);
    this.name = "DeliveryAddressValidationError";
    this.code = "INVALID_DELIVERY_ADDRESS";
  }
}

const civicStreetSuffixPattern =
  /\b(?:street|st|road|rd|drive|dr|avenue|ave|lane|ln|boulevard|blvd|highway|hwy|court|ct|crescent|cres|way|trail|trl|terrace|ter|place|pl|circle|cir|parkway|pkwy|line|concession)\.?\b/i;

const trailingDeliveryInstructionPattern =
  /\s+(?:[-–—,;|:]\s*)?(?:(?:please\s+)?(?:use\s+)?(?:side|back|rear|front)\s+(?:door|entrance)|rear\s+entrance|basement(?:\s+(?:door|entrance|unit|apartment|apt|suite))?|buzz(?:\s+(?:code|unit|apartment|apt|suite))?(?:\s+\w+)?|call(?:\s+(?:when|on|upon)\b)?|ring\s+(?:the\s+)?(?:doorbell|bell)|leave\s+(?:it\s+)?(?:at|by|near|beside)\b|door\s+code\b|unit\s+access\b)/i;

const normalizeWhitespace = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const sanitizeAddressLineForGeocoding = (
  addressLine1: string
): string => {
  const normalizedAddress = normalizeWhitespace(addressLine1);
  const instructionIndex = normalizedAddress.search(
    trailingDeliveryInstructionPattern
  );

  if (instructionIndex <= 0) return normalizedAddress;

  const civicAddress = normalizedAddress
    .slice(0, instructionIndex)
    .replace(/[\s,–—;|:-]+$/g, "")
    .trim();

  if (!/\d/.test(civicAddress) || !civicStreetSuffixPattern.test(civicAddress)) {
    return normalizedAddress;
  }

  return civicAddress;
};

const normalizeProvince = (value: string): string => {
  const normalized = normalizeWhitespace(value);
  return /^(on|ontario)$/i.test(normalized) ? "ON" : normalized;
};

export const buildCanonicalDeliveryAddress = (
  address: DeliveryAddressInput
): string =>
  [
    sanitizeAddressLineForGeocoding(address.addressLine1),
    normalizeWhitespace(address.city),
    normalizeProvince(address.province),
    "Canada"
  ].join(", ");

const normalizeFingerprintText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const createDeliveryAddressFingerprint = (
  address: DeliveryAddressInput
): string =>
  createHash("sha256")
    .update(normalizeFingerprintText(buildCanonicalDeliveryAddress(address)))
    .digest("hex");

const getComponent = (
  result: GoogleGeocodeResult,
  types: string[]
): GoogleAddressComponent | undefined =>
  result.address_components?.find((component) =>
    component.types?.some((type) => types.includes(type))
  );

const componentValues = (
  component: GoogleAddressComponent | undefined
): string[] =>
  [component?.long_name, component?.short_name]
    .filter((value): value is string => Boolean(value))
    .map(normalizeFingerprintText);

const normalizeMunicipality = (value: string): string =>
  normalizeFingerprintText(value).replace(
    /^(?:city|town|township|municipality|village|county) of /,
    ""
  );

const municipalityMatches = (
  result: GoogleGeocodeResult,
  submittedMunicipality: string
): boolean => {
  const submitted = normalizeMunicipality(submittedMunicipality);
  const municipalityComponents = result.address_components?.filter(
    (component) =>
      component.types?.some((type) =>
        [
          "locality",
          "postal_town",
          "administrative_area_level_2",
          "administrative_area_level_3",
          "sublocality_level_1"
        ].includes(type)
      )
  );

  return Boolean(
    submitted &&
      municipalityComponents?.some((component) =>
        componentValues(component).some(
          (value) => normalizeMunicipality(value) === submitted
        )
      )
  );
};

const isCountryCanada = (result: GoogleGeocodeResult): boolean =>
  componentValues(getComponent(result, ["country"])).some((value) =>
    ["ca", "canada"].includes(value)
  );

const isProvinceOntario = (result: GoogleGeocodeResult): boolean =>
  componentValues(
    getComponent(result, ["administrative_area_level_1"])
  ).some((value) => ["on", "ontario"].includes(value));

const hasCivicPrecision = (result: GoogleGeocodeResult): boolean => {
  const resultTypes = result.types || [];
  const locationType = result.geometry?.location_type || "";
  const hasStreetNumber = Boolean(getComponent(result, ["street_number"]));
  const hasRoute = Boolean(getComponent(result, ["route"]));
  const isCivicType = resultTypes.some((type) =>
    ["street_address", "premise", "subpremise", "establishment"].includes(type)
  );

  if (result.partial_match === true || locationType === "APPROXIMATE") return false;
  return (hasStreetNumber && hasRoute) || isCivicType;
};

export const selectVerifiedGeocodeCandidate = (
  results: GoogleGeocodeResult[],
  address: DeliveryAddressInput
): GoogleGeocodeResult | null => {
  const evaluated = results.flatMap((result): CandidateEvaluation[] => {
    const latitude = result.geometry?.location?.lat;
    const longitude = result.geometry?.location?.lng;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    if ((latitude as number) < -90 || (latitude as number) > 90) return [];
    if ((longitude as number) < -180 || (longitude as number) > 180) return [];
    if (!isCountryCanada(result) || !isProvinceOntario(result)) return [];
    if (!municipalityMatches(result, address.city)) return [];
    if (!hasCivicPrecision(result)) return [];

    const locationType = result.geometry?.location_type || "";
    const resultTypes = result.types || [];
    const score =
      (locationType === "ROOFTOP"
        ? 5
        : locationType === "RANGE_INTERPOLATED"
          ? 4
          : 2) +
      (resultTypes.includes("street_address") ? 3 : 0) +
      (getComponent(result, ["street_number"]) ? 1 : 0);

    return [{ result, latitude: latitude as number, longitude: longitude as number, score }];
  });

  evaluated.sort((a, b) => b.score - a.score);
  return evaluated[0]?.result ?? null;
};

const needsReviewLocation = (
  address: DeliveryAddressInput
): DeliveryLocationData => ({
  deliveryLatitude: null,
  deliveryLongitude: null,
  geocodeStatus: DeliveryGeocodeStatus.NEEDS_REVIEW,
  geocodedAddress: null,
  geocodePlaceId: null,
  geocodeAddressFingerprint: createDeliveryAddressFingerprint(address)
});

export const geocodeDeliveryAddress = async (
  address: DeliveryAddressInput,
  options: GeocodingServiceOptions = {}
): Promise<DeliveryLocationData> => {
  const canonicalAddress = buildCanonicalDeliveryAddress(address);
  const fingerprint = createDeliveryAddressFingerprint(address);
  const apiKey = options.apiKey ?? env.GOOGLE_GEOCODING_API_KEY;

  if (!apiKey) return needsReviewLocation(address);

  const fetchImplementation = options.fetchImplementation ?? fetch;
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    options.timeoutMs ?? env.GOOGLE_GEOCODING_TIMEOUT_MS
  );

  try {
    const query = new URLSearchParams({
      address: canonicalAddress,
      key: apiKey,
      region: "ca",
      components: "country:CA"
    });
    const response = await fetchImplementation(
      `https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`,
      { signal: abortController.signal }
    );

    if (!response.ok) return needsReviewLocation(address);

    const payload = (await response.json()) as GoogleGeocodeResponse;
    if (payload.status === "ZERO_RESULTS") {
      throw new DeliveryAddressValidationError(
        "Please select a valid delivery address."
      );
    }

    if (payload.status !== "OK") return needsReviewLocation(address);

    const results = payload.results || [];
    const selectedResult = selectVerifiedGeocodeCandidate(results, address);

    if (!selectedResult) {
      throw new DeliveryAddressValidationError(
        "Please select a valid delivery address."
      );
    }

    return {
      deliveryLatitude: selectedResult.geometry?.location?.lat ?? null,
      deliveryLongitude: selectedResult.geometry?.location?.lng ?? null,
      geocodeStatus: DeliveryGeocodeStatus.VERIFIED,
      geocodedAddress: canonicalAddress,
      geocodePlaceId: selectedResult.place_id ?? null,
      geocodeAddressFingerprint: fingerprint
    };
  } catch (error) {
    if (error instanceof DeliveryAddressValidationError) throw error;
    return needsReviewLocation(address);
  } finally {
    clearTimeout(timeoutId);
  }
};

export const hasCivicAddressChanged = (
  existingFingerprint: string | null | undefined,
  address: DeliveryAddressInput
): boolean => existingFingerprint !== createDeliveryAddressFingerprint(address);
