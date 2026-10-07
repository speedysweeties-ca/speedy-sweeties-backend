import { env } from "../config/env";
import { DeliveryAddressValidationError } from "./deliveryGeocoding.service";

export class AddressSearchUnavailableError extends Error {}

type PlacesOptions = { apiKey?: string; fetchImplementation?: typeof fetch };
type Component = { longText?: string; shortText?: string; types?: string[] };

const placesRequest = async (url: string, body: object | null, fields: string,
  options: PlacesOptions): Promise<any> => {
  const apiKey = options.apiKey ?? env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new AddressSearchUnavailableError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await (options.fetchImplementation ?? fetch)(url, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fields },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal
    });
    if (!response.ok) throw new AddressSearchUnavailableError();
    return await response.json();
  } catch {
    // Do not expose Google credentials, upstream URLs, or customer input in logs.
    throw new AddressSearchUnavailableError();
  } finally { clearTimeout(timer); }
};

export const searchAddresses = async (input: string, sessionToken: string,
  options: PlacesOptions = {}) => {
  const data = await placesRequest("https://places.googleapis.com/v1/places:autocomplete", {
    input, sessionToken, includedRegionCodes: ["ca"],
    includedPrimaryTypes: ["street_address", "premise", "subpremise"],
    languageCode: "en", regionCode: "ca",
    locationBias: { circle: { center: { latitude: 43.5448, longitude: -80.2482 }, radius: 50000 } }
  }, "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text", options);
  if (!data || (data.suggestions !== undefined && !Array.isArray(data.suggestions))) {
    throw new AddressSearchUnavailableError();
  }
  return (data.suggestions || []).slice(0, 5).flatMap((suggestion: any) => {
    const prediction = suggestion?.placePrediction;
    return typeof prediction?.placeId === "string" && typeof prediction?.text?.text === "string"
      ? [{ placeId: prediction.placeId, description: prediction.text.text }] : [];
  });
};

export const parsePlaceAddress = (components: Component[]) => {
  const get = (types: string[], short = false): string => {
    const component = components.find((item) => types.some((type) => item.types?.includes(type)));
    return ((short ? component?.shortText : component?.longText) || "").trim();
  };
  const number = get(["street_number"]), route = get(["route"]);
  const city = get(["locality", "postal_town", "administrative_area_level_3"]);
  if (!number || !route || !city || get(["country"], true) !== "CA" ||
      get(["administrative_area_level_1"], true) !== "ON") {
    throw new DeliveryAddressValidationError("Please choose a complete Ontario street address, including the house number.");
  }
  return { addressLine1: `${number} ${route}`, city, province: "Ontario",
    unitNumber: get(["subpremise"]) || null };
};

export const getAddressDetails = async (placeId: string, sessionToken: string,
  options: PlacesOptions = {}) => {
  const data = await placesRequest(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en&regionCode=ca`,
    null, "addressComponents", options);
  if (!Array.isArray(data?.addressComponents)) throw new AddressSearchUnavailableError();
  return parsePlaceAddress(data.addressComponents);
};
