const PRODUCTION_API_BASE_URL = "https://speedy-api-lbfe.onrender.com";
const ROUTING_PREVIEW_CACHE_MS = 20_000;
const PICKUP_STOP_ALLOWANCE_MINUTES = 5;
const FALLBACK_ROAD_DISTANCE_FACTOR = 1.28;
const FALLBACK_CITY_SPEED_KMH = 32;
const HOVER_CLOSE_DELAY_MS = 1400;

type LatLngPoint = {
  latitude: number;
  longitude: number;
};

type RoutingPreviewDriver = LatLngPoint & {
  id: string;
  displayName: string;
  activeOrderCount: number;
  locationAccuracyMeters?: number | null;
};

export type RoutingPreviewPickupLocation = LatLngPoint & {
  id: string;
  name: string;
  pickupType: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode?: string | null;
};

type RoutingPreviewPayload = {
  success: true;
  generatedAt: string;
  order: {
    id: string;
    orderNumber: number;
    orderStatus: string;
    destination: LatLngPoint & {
      addressLine1: string;
      city: string;
      province: string;
      postalCode?: string | null;
    };
    pickupRequired: boolean;
    requiredPickupTypes: string[];
    unknownPickupItemCount: number;
    unsupportedPickupTypes: string[];
  };
  pickupLocations: RoutingPreviewPickupLocation[];
  drivers: RoutingPreviewDriver[];
};

export type SelectedPickupStops = {
  stops: RoutingPreviewPickupLocation[];
  missingPickupTypes: string[];
};

type DriverEtaPreview = {
  driver: RoutingPreviewDriver;
  etaMinutes: number;
  distanceKm: number;
  pickupStops: RoutingPreviewPickupLocation[];
  missingPickupTypes: string[];
  source: "GOOGLE_ROUTES" | "FALLBACK";
};

type CachedPreview = {
  expiresAt: number;
  html: string;
};

const orderIdByOrderNumber = new Map<number, string>();
const previewCache = new Map<string, CachedPreview>();
let routingInfoWindow: any = null;
let closeTimer: number | null = null;
let activeMarker: any = null;
let requestSequence = 0;

const getApiV1BaseUrl = (): string => {
  const configuredApiBaseUrl = import.meta.env?.VITE_API_BASE_URL?.trim();
  return `${(configuredApiBaseUrl || PRODUCTION_API_BASE_URL).replace(/\/+$/, "")}/api/v1`;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const toRadians = (value: number): number => (value * Math.PI) / 180;

export const haversineDistanceKm = (
  start: LatLngPoint,
  end: LatLngPoint
): number => {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
};

const orderStopsGreedily = (
  driver: LatLngPoint,
  stops: RoutingPreviewPickupLocation[]
): RoutingPreviewPickupLocation[] => {
  const remaining = [...stops];
  const ordered: RoutingPreviewPickupLocation[] = [];
  let current = driver;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const distance = haversineDistanceKm(current, candidate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const [next] = remaining.splice(nearestIndex, 1);
    ordered.push(next);
    current = next;
  }

  return ordered;
};

export const selectPickupStopsForDriver = (
  driver: LatLngPoint,
  destination: LatLngPoint,
  requiredPickupTypes: string[],
  pickupLocations: RoutingPreviewPickupLocation[]
): SelectedPickupStops => {
  const selected: RoutingPreviewPickupLocation[] = [];
  const missingPickupTypes: string[] = [];

  requiredPickupTypes.forEach((pickupType) => {
    const candidates = pickupLocations.filter(
      (location) => location.pickupType === pickupType
    );

    if (candidates.length === 0) {
      missingPickupTypes.push(pickupType);
      return;
    }

    const bestCandidate = [...candidates].sort((left, right) => {
      const leftScore =
        haversineDistanceKm(driver, left) +
        haversineDistanceKm(left, destination);
      const rightScore =
        haversineDistanceKm(driver, right) +
        haversineDistanceKm(right, destination);

      return leftScore - rightScore;
    })[0];

    selected.push(bestCandidate);
  });

  return {
    stops: orderStopsGreedily(driver, selected),
    missingPickupTypes
  };
};

export const estimateFallbackEta = (
  driver: LatLngPoint,
  destination: LatLngPoint,
  pickupStops: RoutingPreviewPickupLocation[]
): { etaMinutes: number; distanceKm: number } => {
  const orderedStops = orderStopsGreedily(driver, pickupStops);
  const points: LatLngPoint[] = [driver, ...orderedStops, destination];

  let straightLineKm = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    straightLineKm += haversineDistanceKm(points[index], points[index + 1]);
  }

  const estimatedRoadKm = straightLineKm * FALLBACK_ROAD_DISTANCE_FACTOR;
  const drivingMinutes = (estimatedRoadKm / FALLBACK_CITY_SPEED_KMH) * 60;
  const pickupMinutes = orderedStops.length * PICKUP_STOP_ALLOWANCE_MINUTES;

  return {
    etaMinutes: Math.max(1, Math.ceil(drivingMinutes + pickupMinutes)),
    distanceKm: estimatedRoadKm
  };
};

const fetchRoutingPreview = async (
  orderId: string
): Promise<RoutingPreviewPayload> => {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("Dispatcher login expired. Please sign in again.");
  }

  const response = await fetch(
    `${getApiV1BaseUrl()}/orders/${encodeURIComponent(orderId)}/routing-preview`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Routing preview is unavailable for this order."
    );
  }

  return data as RoutingPreviewPayload;
};

const computeGoogleRouteEta = async (
  driver: RoutingPreviewDriver,
  destination: LatLngPoint,
  pickupStops: RoutingPreviewPickupLocation[]
): Promise<{
  etaMinutes: number;
  distanceKm: number;
  pickupStops: RoutingPreviewPickupLocation[];
}> => {
  const googleMaps = (window as any).google?.maps;
  if (!googleMaps?.importLibrary) {
    throw new Error("Google Routes library is unavailable.");
  }

  const routesLibrary = await googleMaps.importLibrary("routes");
  const Route = routesLibrary?.Route;

  if (!Route?.computeRoutes) {
    throw new Error("Google Routes API is unavailable.");
  }

  const fields = ["durationMillis", "distanceMeters", "legs"];
  const request: Record<string, unknown> = {
    origin: {
      lat: driver.latitude,
      lng: driver.longitude
    },
    destination: {
      lat: destination.latitude,
      lng: destination.longitude
    },
    travelMode: "DRIVING",
    routingPreference: "TRAFFIC_AWARE",
    fields
  };

  if (pickupStops.length > 0) {
    request.intermediates = pickupStops.map((stop) => ({
      location: {
        lat: stop.latitude,
        lng: stop.longitude
      }
    }));
  }

  if (pickupStops.length > 1) {
    request.optimizeWaypointOrder = true;
    fields.push("optimizedIntermediateWaypointIndices");
  }

  const result = await Route.computeRoutes(request);
  const route = result?.routes?.[0];
  const durationMillis = Number(route?.durationMillis);
  const distanceMeters = Number(route?.distanceMeters);

  if (!Number.isFinite(durationMillis) || durationMillis <= 0) {
    throw new Error("Google Routes did not return a usable duration.");
  }

  let orderedStops = pickupStops;
  const optimizedIndices = Array.isArray(route?.optimizedIntermediateWaypointIndices)
    ? route.optimizedIntermediateWaypointIndices
    : [];

  if (
    optimizedIndices.length === pickupStops.length &&
    optimizedIndices.every((index: unknown) => Number.isInteger(index))
  ) {
    orderedStops = optimizedIndices
      .map((index: number) => pickupStops[index])
      .filter(Boolean);
  }

  return {
    etaMinutes: Math.max(
      1,
      Math.ceil(
        durationMillis / 60_000 +
          orderedStops.length * PICKUP_STOP_ALLOWANCE_MINUTES
      )
    ),
    distanceKm: Number.isFinite(distanceMeters) ? distanceMeters / 1000 : 0,
    pickupStops: orderedStops
  };
};

const estimateDriver = async (
  driver: RoutingPreviewDriver,
  payload: RoutingPreviewPayload
): Promise<DriverEtaPreview> => {
  const destination = payload.order.destination;
  const selected = payload.order.pickupRequired
    ? selectPickupStopsForDriver(
        driver,
        destination,
        payload.order.requiredPickupTypes,
        payload.pickupLocations
      )
    : { stops: [], missingPickupTypes: [] };

  try {
    const googleEstimate = await computeGoogleRouteEta(
      driver,
      destination,
      selected.stops
    );

    return {
      driver,
      etaMinutes: googleEstimate.etaMinutes,
      distanceKm: googleEstimate.distanceKm,
      pickupStops: googleEstimate.pickupStops,
      missingPickupTypes: selected.missingPickupTypes,
      source: "GOOGLE_ROUTES"
    };
  } catch {
    const fallback = estimateFallbackEta(driver, destination, selected.stops);

    return {
      driver,
      etaMinutes: fallback.etaMinutes,
      distanceKm: fallback.distanceKm,
      pickupStops: selected.stops,
      missingPickupTypes: selected.missingPickupTypes,
      source: "FALLBACK"
    };
  }
};

const buildPreviewHtml = async (
  payload: RoutingPreviewPayload
): Promise<string> => {
  const estimates = await Promise.all(
    payload.drivers.map((driver) => estimateDriver(driver, payload))
  );

  estimates.sort((left, right) => left.etaMinutes - right.etaMinutes);

  const warningLines: string[] = [];

  if (payload.order.pickupRequired && payload.order.unknownPickupItemCount > 0) {
    warningLines.push(
      `${payload.order.unknownPickupItemCount} item(s) have UNKNOWN pickup type; those pickup stops are not included.`
    );
  }

  if (payload.order.unsupportedPickupTypes.length > 0) {
    warningLines.push(
      `Unsupported pickup type(s): ${payload.order.unsupportedPickupTypes.join(", ")}.`
    );
  }

  if (
    payload.order.pickupRequired &&
    payload.order.requiredPickupTypes.length === 0
  ) {
    warningLines.push(
      "Pickup type is unknown, so these ETAs are direct-to-customer estimates only."
    );
  }

  const rows = estimates.length
    ? estimates
        .map((estimate, index) => {
          const pickupText = estimate.pickupStops.length
            ? estimate.pickupStops.map((stop) => stop.name).join(" → ")
            : payload.order.pickupRequired
              ? "No known pickup stop"
              : "Direct to customer";
          const activeOrdersText = `${estimate.driver.activeOrderCount} active order${
            estimate.driver.activeOrderCount === 1 ? "" : "s"
          }`;
          const routeSource =
            estimate.source === "GOOGLE_ROUTES" ? "Google traffic" : "approx. fallback";

          return `
            <div style="padding:8px 0;${index > 0 ? "border-top:1px solid #e4e4e7;" : ""}">
              <div style="display:flex;justify-content:space-between;gap:14px;align-items:baseline;">
                <strong>${index + 1}. ${escapeHtml(estimate.driver.displayName)}</strong>
                <strong style="font-size:16px;color:${index === 0 ? "#15803d" : "#18181b"};white-space:nowrap;">~${estimate.etaMinutes} min</strong>
              </div>
              <div style="font-size:12px;color:#52525b;margin-top:2px;">
                ${escapeHtml(pickupText)}
              </div>
              <div style="font-size:11px;color:#71717a;margin-top:2px;">
                ${escapeHtml(activeOrdersText)} · ${estimate.distanceKm.toFixed(1)} km · ${escapeHtml(routeSource)}
              </div>
            </div>
          `;
        })
        .join("")
    : `
        <div style="padding:10px 0;color:#71717a;">
          No currently signed-in drivers have a usable GPS location.
        </div>
      `;

  const warnings = warningLines.length
    ? `
        <div style="margin-top:8px;padding:7px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;font-size:11px;color:#9a3412;">
          ${warningLines.map((line) => escapeHtml(line)).join("<br>")}
        </div>
      `
    : "";

  return `
    <div style="min-width:300px;max-width:390px;padding:5px 3px;color:#18181b;font-family:Arial,sans-serif;line-height:1.35;">
      <div style="font-size:17px;font-weight:700;">Routing Preview · Order #${escapeHtml(payload.order.orderNumber)}</div>
      <div style="font-size:11px;color:#71717a;margin-top:2px;margin-bottom:6px;">
        ETA assumes the driver takes this order next. Includes ${PICKUP_STOP_ALLOWANCE_MINUTES} min per known pickup stop.
      </div>
      ${rows}
      ${warnings}
    </div>
  `;
};

const getPreviewHtml = async (orderId: string): Promise<string> => {
  const cached = previewCache.get(orderId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.html;
  }

  const payload = await fetchRoutingPreview(orderId);
  const html = await buildPreviewHtml(payload);

  previewCache.set(orderId, {
    expiresAt: Date.now() + ROUTING_PREVIEW_CACHE_MS,
    html
  });

  return html;
};

const showRoutingPreview = async (
  marker: any,
  orderId: string,
  orderNumber: number
): Promise<void> => {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  activeMarker = marker;
  const sequence = ++requestSequence;
  const googleMaps = (window as any).google?.maps;

  if (!googleMaps?.InfoWindow) return;

  if (!routingInfoWindow) {
    routingInfoWindow = new googleMaps.InfoWindow();
  }

  routingInfoWindow.setContent(`
    <div style="min-width:260px;padding:8px;font-family:Arial,sans-serif;color:#18181b;">
      <strong>Routing Preview · Order #${escapeHtml(orderNumber)}</strong>
      <div style="margin-top:6px;color:#71717a;">Calculating driver ETAs…</div>
    </div>
  `);
  routingInfoWindow.open(marker.getMap?.() || null, marker);

  try {
    const html = await getPreviewHtml(orderId);
    if (activeMarker !== marker || sequence !== requestSequence) return;
    routingInfoWindow.setContent(html);
  } catch (error) {
    if (activeMarker !== marker || sequence !== requestSequence) return;

    routingInfoWindow.setContent(`
      <div style="min-width:260px;padding:8px;font-family:Arial,sans-serif;color:#18181b;">
        <strong>Routing Preview · Order #${escapeHtml(orderNumber)}</strong>
        <div style="margin-top:6px;color:#b91c1c;">
          ${escapeHtml(error instanceof Error ? error.message : "Unable to calculate routing preview.")}
        </div>
      </div>
    `);
  }
};

const scheduleRoutingPreviewClose = (marker: any): void => {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
  }

  closeTimer = window.setTimeout(() => {
    if (activeMarker !== marker) return;
    activeMarker = null;
    requestSequence += 1;
    routingInfoWindow?.close?.();
  }, HOVER_CLOSE_DELAY_MS);
};

const parseOrderNumberFromTitle = (title: unknown): number | null => {
  const match = String(title || "").match(/^Order #(\d+)/);
  if (!match) return null;

  const orderNumber = Number(match[1]);
  return Number.isInteger(orderNumber) ? orderNumber : null;
};

const attachRoutingPreviewListeners = (
  marker: any,
  title: unknown,
  originalAddListener: (...args: any[]) => any
): void => {
  if (marker.__speedyRoutingPreviewAttached) return;

  const orderNumber = parseOrderNumberFromTitle(title);
  if (orderNumber === null) return;

  const orderId = orderIdByOrderNumber.get(orderNumber);
  if (!orderId) return;

  marker.__speedyRoutingPreviewAttached = true;
  marker.__speedyRoutingPreviewOrderId = orderId;

  originalAddListener.call(marker, "mouseover", () => {
    const currentOrderId =
      marker.__speedyRoutingPreviewOrderId || orderIdByOrderNumber.get(orderNumber);
    if (!currentOrderId) return;
    void showRoutingPreview(marker, currentOrderId, orderNumber);
  });

  originalAddListener.call(marker, "mouseout", () => {
    scheduleRoutingPreviewClose(marker);
  });
};

const installRoutingPreviewMarkerHooks = (): void => {
  if (typeof window === "undefined") return;

  const googleMaps = (window as any).google?.maps;
  const markerPrototype = googleMaps?.Marker?.prototype;
  if (!markerPrototype || markerPrototype.__speedyRoutingPreviewPatched) return;

  const originalAddListener = markerPrototype.addListener;
  const originalSetTitle = markerPrototype.setTitle;

  if (
    typeof originalAddListener !== "function" ||
    typeof originalSetTitle !== "function"
  ) {
    return;
  }

  markerPrototype.__speedyRoutingPreviewPatched = true;

  markerPrototype.addListener = function patchedAddListener(
    eventName: string,
    handler: (...args: any[]) => void
  ) {
    const result = originalAddListener.call(this, eventName, handler);
    attachRoutingPreviewListeners(
      this,
      typeof this.getTitle === "function" ? this.getTitle() : undefined,
      originalAddListener
    );
    return result;
  };

  markerPrototype.setTitle = function patchedSetTitle(title: string) {
    const result = originalSetTitle.call(this, title);
    attachRoutingPreviewListeners(this, title, originalAddListener);
    return result;
  };
};

export const registerRoutingPreviewOrder = (order: {
  id?: string | null;
  orderNumber?: number | null;
}): void => {
  if (typeof window === "undefined") return;
  if (!order.id || !Number.isInteger(order.orderNumber)) return;

  orderIdByOrderNumber.set(order.orderNumber as number, order.id);
  installRoutingPreviewMarkerHooks();
};
