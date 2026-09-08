import { env } from "../config/env";
import {
  parseGoogleDurationSeconds,
  RoutingPreviewUnavailableError
} from "./routingPreview.service";

export type RouteMatrixPoint = {
  id: string;
  latitude: number;
  longitude: number;
};

export type MultiDestinationRouteMatrixResult = {
  originId: string;
  destinationId: string;
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

type MultiDestinationRouteMatrixOptions = {
  apiKey?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
  maxElementsPerRequest?: number;
};

const DEFAULT_MAX_ELEMENTS_PER_REQUEST = 625;

const isValidCoordinate = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

const computeBatch = async (
  origins: RouteMatrixPoint[],
  destinations: RouteMatrixPoint[],
  options: MultiDestinationRouteMatrixOptions
): Promise<MultiDestinationRouteMatrixResult[]> => {
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
          destinations: destinations.map((destination) => ({
            waypoint: {
              location: {
                latLng: {
                  latitude: destination.latitude,
                  longitude: destination.longitude
                }
              }
            }
          })),
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

    const byIndexes = new Map<string, GoogleRouteMatrixElement>();
    for (const element of payload) {
      if (
        typeof element.originIndex === "number" &&
        Number.isInteger(element.originIndex) &&
        typeof element.destinationIndex === "number" &&
        Number.isInteger(element.destinationIndex)
      ) {
        byIndexes.set(
          `${element.originIndex}:${element.destinationIndex}`,
          element
        );
      }
    }

    const results: MultiDestinationRouteMatrixResult[] = [];

    origins.forEach((origin, originIndex) => {
      destinations.forEach((destination, destinationIndex) => {
        const element = byIndexes.get(`${originIndex}:${destinationIndex}`);
        const durationSeconds = parseGoogleDurationSeconds(element?.duration);
        const statusCode = element?.status?.code ?? 0;
        const routeAvailable =
          Boolean(element) &&
          statusCode === 0 &&
          element?.condition !== "ROUTE_NOT_FOUND" &&
          durationSeconds !== null;

        results.push({
          originId: origin.id,
          destinationId: destination.id,
          durationSeconds: routeAvailable ? durationSeconds : null,
          distanceMeters:
            routeAvailable && typeof element?.distanceMeters === "number"
              ? element.distanceMeters
              : null,
          routeAvailable
        });
      });
    });

    return results;
  } catch (error) {
    if (error instanceof RoutingPreviewUnavailableError) throw error;

    throw new RoutingPreviewUnavailableError(
      error instanceof Error && error.name === "AbortError"
        ? "Google Routes API timed out."
        : "Google Routes API could not calculate pickup-store routes."
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

export const computeTrafficAwareRouteMatrixToDestinations = async (
  origins: RouteMatrixPoint[],
  destinations: RouteMatrixPoint[],
  options: MultiDestinationRouteMatrixOptions = {}
): Promise<MultiDestinationRouteMatrixResult[]> => {
  if (origins.length === 0 || destinations.length === 0) return [];

  origins.forEach((origin) => {
    if (!isValidCoordinate(origin.latitude, origin.longitude)) {
      throw new RoutingPreviewUnavailableError(
        `Route origin ${origin.id} does not have valid coordinates.`
      );
    }
  });

  destinations.forEach((destination) => {
    if (!isValidCoordinate(destination.latitude, destination.longitude)) {
      throw new RoutingPreviewUnavailableError(
        `Route destination ${destination.id} does not have valid coordinates.`
      );
    }
  });

  const maxElements = Math.max(
    origins.length,
    options.maxElementsPerRequest ?? DEFAULT_MAX_ELEMENTS_PER_REQUEST
  );
  const destinationsPerBatch = Math.max(
    1,
    Math.floor(maxElements / origins.length)
  );

  const results: MultiDestinationRouteMatrixResult[] = [];

  for (
    let startIndex = 0;
    startIndex < destinations.length;
    startIndex += destinationsPerBatch
  ) {
    const batch = destinations.slice(
      startIndex,
      startIndex + destinationsPerBatch
    );
    const batchResults = await computeBatch(origins, batch, options);
    results.push(...batchResults);
  }

  return results;
};
