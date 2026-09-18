import {
  computeTrafficAwareRouteMatrixToDestinations,
  type MultiDestinationRouteMatrixOptions,
  type MultiDestinationRouteMatrixResult,
  type RouteMatrixPoint
} from "./multiDestinationRouteMatrix.service";
import { estimateCoordinateRouteMatrix } from "./coordinateRouteMatrix.service";
import { getGoogleLiveTrafficEnabled } from "./googleLiveTrafficSettings.service";

export type TrafficRoutingMode =
  | "GOOGLE_LIVE_TRAFFIC"
  | "FREE_COORDINATE_ESTIMATE";

export type ConfiguredRouteMatrixResult = {
  mode: TrafficRoutingMode;
  matrix: MultiDestinationRouteMatrixResult[];
};

type ConfiguredRouteMatrixOptions = {
  liveTrafficEnabled?: boolean;
  googleOptions?: Omit<
    MultiDestinationRouteMatrixOptions,
    "routingPreference"
  >;
};

/**
 * This is the production gateway for every Google Routes matrix request.
 * When the persisted switch is off, it does not inspect the Google API key or
 * call fetch; it returns a coordinate-only estimate calculated in-process.
 */
export const computeConfiguredRouteMatrixToDestinations = async (
  origins: RouteMatrixPoint[],
  destinations: RouteMatrixPoint[],
  options: ConfiguredRouteMatrixOptions = {}
): Promise<ConfiguredRouteMatrixResult> => {
  const liveTrafficEnabled =
    options.liveTrafficEnabled ?? (await getGoogleLiveTrafficEnabled());

  if (!liveTrafficEnabled) {
    return {
      mode: "FREE_COORDINATE_ESTIMATE",
      matrix: estimateCoordinateRouteMatrix(origins, destinations)
    };
  }

  return {
    mode: "GOOGLE_LIVE_TRAFFIC",
    matrix: await computeTrafficAwareRouteMatrixToDestinations(
      origins,
      destinations,
      {
        ...options.googleOptions,
        routingPreference: "TRAFFIC_AWARE"
      }
    )
  };
};
