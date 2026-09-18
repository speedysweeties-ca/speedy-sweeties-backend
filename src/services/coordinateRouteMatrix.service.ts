import type {
  MultiDestinationRouteMatrixResult,
  RouteMatrixPoint
} from "./multiDestinationRouteMatrix.service";

const EARTH_RADIUS_METERS = 6_371_000;
const ESTIMATED_ROAD_DISTANCE_FACTOR = 1.2;
const ESTIMATED_CITY_SPEED_KPH = 35;

const degreesToRadians = (degrees: number): number =>
  (degrees * Math.PI) / 180;

export const calculateCoordinateDistanceMeters = (
  origin: Pick<RouteMatrixPoint, "latitude" | "longitude">,
  destination: Pick<RouteMatrixPoint, "latitude" | "longitude">
): number => {
  const originLatitude = degreesToRadians(origin.latitude);
  const destinationLatitude = degreesToRadians(destination.latitude);
  const latitudeDelta = degreesToRadians(
    destination.latitude - origin.latitude
  );
  const longitudeDelta = degreesToRadians(
    destination.longitude - origin.longitude
  );

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    EARTH_RADIUS_METERS *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
};

/**
 * Produces a no-provider estimate from stored coordinates. The road-distance
 * factor and city-speed assumption are intentionally conservative enough for
 * ordering candidates, but the UI labels these results as estimates rather
 * than live traffic ETAs.
 */
export const estimateCoordinateRouteMatrix = (
  origins: RouteMatrixPoint[],
  destinations: RouteMatrixPoint[]
): MultiDestinationRouteMatrixResult[] => {
  const estimatedMetersPerSecond =
    (ESTIMATED_CITY_SPEED_KPH * 1_000) / 3_600;

  return origins.flatMap((origin) =>
    destinations.map((destination) => {
      const straightLineDistanceMeters = calculateCoordinateDistanceMeters(
        origin,
        destination
      );
      const estimatedRoadDistanceMeters = Math.round(
        straightLineDistanceMeters * ESTIMATED_ROAD_DISTANCE_FACTOR
      );

      return {
        originId: origin.id,
        destinationId: destination.id,
        durationSeconds: Math.max(
          1,
          Math.round(estimatedRoadDistanceMeters / estimatedMetersPerSecond)
        ),
        distanceMeters: estimatedRoadDistanceMeters,
        routeAvailable: true
      };
    })
  );
};
