import { env } from "../config/env";

export type RoutingPreviewOrigin = {
  driverId: string;
  latitude: number;
  longitude: number;
};

export type RoutingPreviewDestination = {
  latitude: number;
  longitude: number;
};

export type RoutingPreviewMatrixResult = {
  driverId: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  routeAvailable: boolean;
};

type GoogleRouteMatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  status?: {
    code?: number;
    message?: string;
  };
  condition?: string;
  distanceMeters?: number;
  duration?: string;
};

export type RoutingPreviewServiceOptions = {
  apiKey?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
};

export class RoutingPreviewUnavailableError extends Error {
  readonly code: "ROUTING_PREVIEW_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "RoutingPreviewUnavailableError";
    this.code = "ROUTING_PREVIEW_UNAVAILABLE";
  }
}

const isValidCoordinate = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

export const parseGoogleDurationSeconds = (
  duration: string | null | undefined
): number | null => {
  if (!duration || !duration.endsWith("s")) return null;

  const parsed = Number(duration.slice(0, -1));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const computeTrafficAwareRouteMatrix = async (
  origins: RoutingPreviewOrigin[],
  destination: RoutingPreviewDestination,
  options: RoutingPreviewServiceOptions = {}
): Promise<RoutingPreviewMatrixResult[]> => {
  if (origins.length === 0) return [];

  if (!isValidCoordinate(destination.latitude, destination.longitude)) {
    throw new RoutingPreviewUnavailableError(
      "The order does not have a valid delivery location."
    );
  }

  for (const origin of origins) {
    if (!isValidCoordinate(origin.latitude, origin.longitude)) {
      throw new RoutingPreviewUnavailableError(
        `Driver ${origin.driverId} does not have a valid GPS location.`
      );
    }
  }

  const apiKey = options.apiKey ?? env.GOOGLE_ROUTES_API_KEY;
  if (!apiKey) {
    throw new RoutingPreviewUnavailableError(
      "Google Routes API is not configured."
    );
  }

  const fetchImplementation = options.fetchImplementation ?? fetch;
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    options.timeoutMs ?? env.GOOGLE_ROUTES_TIMEOUT_MS
  );

  try {
    const response = await fetchImplementation(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "originIndex,destinationIndex,status,condition,distanceMeters,duration"
        },
        body: JSON.stringify({
          origins: origins.map((origin) => ({
            waypoint: {
              location: {
                latLng: {
                  latitude: origin.latitude,
                  longitude: origin.longitude
                }
              }
            }
          })),
          destinations: [
            {
              waypoint: {
                location: {
                  latLng: {
                    latitude: destination.latitude,
                    longitude: destination.longitude
                  }
                }
              }
            }
          ],
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE"
        }),
        signal: abortController.signal
      }
    );

    if (!response.ok) {
      throw new RoutingPreviewUnavailableError(
        `Google Routes API returned HTTP ${response.status}.`
      );
    }

    const payload = (await response.json()) as GoogleRouteMatrixElement[];
    if (!Array.isArray(payload)) {
      throw new RoutingPreviewUnavailableError(
        "Google Routes API returned an unexpected response."
      );
    }

    const byOriginIndex = new Map<number, GoogleRouteMatrixElement>();
    for (const element of payload) {
      if (
        typeof element.originIndex === "number" &&
        Number.isInteger(element.originIndex) &&
        (element.destinationIndex ?? 0) === 0
      ) {
        byOriginIndex.set(element.originIndex, element);
      }
    }

    return origins.map((origin, index) => {
      const element = byOriginIndex.get(index);
      const durationSeconds = parseGoogleDurationSeconds(element?.duration);
      const statusCode = element?.status?.code ?? 0;
      const routeAvailable =
        Boolean(element) &&
        statusCode === 0 &&
        element?.condition !== "ROUTE_NOT_FOUND" &&
        durationSeconds !== null;
      const distanceMeters =
        routeAvailable && typeof element?.distanceMeters === "number"
          ? element.distanceMeters
          : null;

      return {
        driverId: origin.driverId,
        durationSeconds: routeAvailable ? durationSeconds : null,
        distanceMeters,
        routeAvailable
      };
    });
  } catch (error) {
    if (error instanceof RoutingPreviewUnavailableError) throw error;

    throw new RoutingPreviewUnavailableError(
      error instanceof Error && error.name === "AbortError"
        ? "Google Routes API timed out."
        : "Google Routes API could not calculate the preview."
    );
  } finally {
    clearTimeout(timeoutId);
  }
};
