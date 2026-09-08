import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_V1_BASE_URL } from "./apiConfig";

type DriverMapItem = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  isOnline: boolean;
  activeOrderCount: number;
  latitude?: number | null;
  longitude?: number | null;
};

type MapOrder = {
  id: string;
  orderNumber: number;
  addressLine1: string;
  city?: string | null;
  province?: string | null;
  orderStatus: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  geocodeStatus?: string | null;
};

type RoutingPreviewDriver = {
  driverId: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  activeOrderCount: number;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt?: string | null;
  locationAvailable: boolean;
  routeAvailable: boolean;
  etaMinutes: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

type RoutingPreviewResponse = {
  success: boolean;
  cached: boolean;
  cacheSeconds: number;
  generatedAt: string;
  order: {
    id: string;
    orderNumber: number;
    addressLine1: string;
    city?: string | null;
    province?: string | null;
    orderStatus: string;
    latitude: number;
    longitude: number;
  };
  fastestDriverId: string | null;
  drivers: RoutingPreviewDriver[];
};

type CachedPreview = {
  fetchedAtMs: number;
  data: RoutingPreviewResponse;
};

const ACTIVE_ORDER_STATUSES = new Set([
  "PLACED",
  "DISPATCHED",
  "ACCEPTED",
  "OUT_FOR_DELIVERY",
]);

const CLIENT_CACHE_MS = 45_000;

const getDriverDisplayName = (
  driver: Pick<DriverMapItem, "firstName" | "lastName" | "email">,
) => {
  const fullName = [driver.firstName, driver.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || driver.email;
};

const getDriverInitial = (driver: DriverMapItem) =>
  getDriverDisplayName(driver).charAt(0).toUpperCase() || "D";

const formatDistance = (distanceMeters: number | null) => {
  if (distanceMeters === null) return "";
  const kilometres = distanceMeters / 1000;
  return kilometres < 10
    ? `${kilometres.toFixed(1)} km`
    : `${Math.round(kilometres)} km`;
};

const findDriverLocationMap = (): HTMLDivElement | null => {
  const heading = Array.from(document.querySelectorAll("h2")).find(
    (candidate) => candidate.textContent?.trim() === "Driver Location",
  );

  if (!heading) return null;

  const panel = heading.closest(".bg-zinc-900") ?? heading.parentElement?.parentElement;
  if (!panel) return null;

  return (
    Array.from(panel.querySelectorAll("div")).find(
      (candidate) =>
        candidate instanceof HTMLDivElement &&
        candidate.style.height === "500px" &&
        candidate.style.width === "100%",
    ) as HTMLDivElement | undefined
  ) ?? null;
};

const makeTextElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  text: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
};

function RoutingPreviewMap() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const driverMarkersRef = useRef<Record<string, any>>({});
  const orderMarkersRef = useRef<Record<string, any>>({});
  const infoWindowRef = useRef<any>(null);
  const driversRef = useRef<DriverMapItem[]>([]);
  const ordersRef = useRef<MapOrder[]>([]);
  const previewCacheRef = useRef<Record<string, CachedPreview>>({});
  const selectedOrderIdRef = useRef<string | null>(null);
  const pinnedOrderIdRef = useRef<string | null>(null);
  const hasFittedBoundsRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const [statusText, setStatusText] = useState(
    "Loading live drivers and active orders…",
  );

  useEffect(() => {
    let cancelled = false;
    let refreshIntervalId: number | null = null;
    let mapsWaitIntervalId: number | null = null;

    const getOrderById = (orderId: string) =>
      ordersRef.current.find((order) => order.id === orderId) ?? null;

    const updateDriverMarkerTitles = (
      preview: RoutingPreviewResponse | null,
    ) => {
      driversRef.current.forEach((driver) => {
        const marker = driverMarkersRef.current[driver.id];
        if (!marker) return;

        const displayName = getDriverDisplayName(driver);
        const previewDriver = preview?.drivers.find(
          (candidate) => candidate.driverId === driver.id,
        );

        const etaText =
          preview && previewDriver
            ? previewDriver.etaMinutes === null
              ? "ETA unavailable"
              : `~${previewDriver.etaMinutes} min to Order #${preview.order.orderNumber}`
            : null;

        marker.setTitle(
          etaText
            ? `${displayName} • ${etaText} • ${driver.activeOrderCount} active order${
                driver.activeOrderCount === 1 ? "" : "s"
              }`
            : `${displayName} • ${driver.activeOrderCount} active order${
                driver.activeOrderCount === 1 ? "" : "s"
              }`,
        );
      });
    };

    const clearSelection = () => {
      pinnedOrderIdRef.current = null;
      selectedOrderIdRef.current = null;
      infoWindowRef.current?.close();
      updateDriverMarkerTitles(null);
    };

    const buildPreviewContent = (
      order: MapOrder,
      preview?: RoutingPreviewResponse,
      loading = false,
      errorMessage?: string,
    ) => {
      const container = document.createElement("div");
      container.style.minWidth = "290px";
      container.style.maxWidth = "390px";
      container.style.color = "#18181b";
      container.style.fontFamily = "Arial, sans-serif";
      container.style.padding = "2px";

      const heading = makeTextElement(
        "strong",
        `Order #${order.orderNumber} — ${order.addressLine1}`,
      );
      heading.style.display = "block";
      heading.style.fontSize = "15px";
      heading.style.marginBottom = "4px";
      container.appendChild(heading);

      const location = [order.city, order.province].filter(Boolean).join(", ");
      if (location) {
        const locationText = makeTextElement("div", location);
        locationText.style.fontSize = "12px";
        locationText.style.color = "#52525b";
        locationText.style.marginBottom = "8px";
        container.appendChild(locationText);
      }

      if (loading) {
        const loadingText = makeTextElement(
          "div",
          "Calculating traffic-aware driver ETAs…",
        );
        loadingText.style.padding = "8px 0";
        container.appendChild(loadingText);
        return container;
      }

      if (errorMessage) {
        const error = makeTextElement("div", errorMessage);
        error.style.padding = "8px 0";
        error.style.color = "#b91c1c";
        container.appendChild(error);
        return container;
      }

      if (!preview) return container;

      if (preview.drivers.length === 0) {
        const noDrivers = makeTextElement(
          "div",
          "No dispatch-visible drivers are currently signed in.",
        );
        noDrivers.style.padding = "8px 0";
        container.appendChild(noDrivers);
      } else {
        preview.drivers.forEach((driver, index) => {
          const row = document.createElement("div");
          row.style.display = "grid";
          row.style.gridTemplateColumns = "1fr auto";
          row.style.gap = "12px";
          row.style.alignItems = "center";
          row.style.padding = "7px 0";

          if (index > 0) {
            row.style.borderTop = "1px solid #e4e4e7";
          }

          const left = document.createElement("div");
          const name = makeTextElement(
            "strong",
            getDriverDisplayName({
              firstName: driver.firstName,
              lastName: driver.lastName,
              email: driver.email,
            }),
          );
          name.style.fontSize = "13px";
          left.appendChild(name);

          const distanceText =
            driver.distanceMeters === null
              ? ""
              : ` • ${formatDistance(driver.distanceMeters)}`;

          const load = makeTextElement(
            "div",
            `${driver.activeOrderCount} active order${
              driver.activeOrderCount === 1 ? "" : "s"
            }${distanceText}`,
          );
          load.style.fontSize = "11px";
          load.style.color = "#71717a";
          left.appendChild(load);
          row.appendChild(left);

          const eta = makeTextElement(
            "strong",
            driver.etaMinutes === null ? "Unavailable" : `~${driver.etaMinutes} min`,
          );
          eta.style.fontSize = "14px";
          eta.style.whiteSpace = "nowrap";

          if (driver.driverId === preview.fastestDriverId) {
            eta.textContent = `${eta.textContent} • Fastest`;
          }

          row.appendChild(eta);
          container.appendChild(row);
        });
      }

      const note = makeTextElement(
        "p",
        "ETA is from each driver's current GPS location to this customer. Existing deliveries are shown as active-order counts but are not added to the ETA.",
      );
      note.style.fontSize = "10px";
      note.style.lineHeight = "1.35";
      note.style.color = "#71717a";
      note.style.margin = "8px 0 6px";
      container.appendChild(note);

      const refreshButton = makeTextElement("button", "Refresh ETA");
      refreshButton.type = "button";
      refreshButton.style.border = "0";
      refreshButton.style.borderRadius = "6px";
      refreshButton.style.padding = "6px 9px";
      refreshButton.style.background = "#27272a";
      refreshButton.style.color = "white";
      refreshButton.style.cursor = "pointer";
      refreshButton.style.fontSize = "11px";
      refreshButton.addEventListener("click", () => {
        pinnedOrderIdRef.current = order.id;
        void loadPreview(order.id, true);
      });
      container.appendChild(refreshButton);

      return container;
    };

    const openOrderPreview = (orderId: string, content: HTMLElement) => {
      const marker = orderMarkersRef.current[orderId];
      const googleMaps = (window as any).google?.maps;

      if (!marker || !mapRef.current || !googleMaps) return;

      if (!infoWindowRef.current) {
        infoWindowRef.current = new googleMaps.InfoWindow();
        infoWindowRef.current.addListener("closeclick", () => {
          pinnedOrderIdRef.current = null;
          selectedOrderIdRef.current = null;
          updateDriverMarkerTitles(null);
        });
      }

      infoWindowRef.current.setContent(content);
      infoWindowRef.current.open(mapRef.current, marker);
    };

    const loadPreview = async (orderId: string, forceRefresh = false) => {
      const order = getOrderById(orderId);
      if (!order) return;

      selectedOrderIdRef.current = orderId;
      const cached = previewCacheRef.current[orderId];
      const now = Date.now();

      if (!forceRefresh && cached && now - cached.fetchedAtMs < CLIENT_CACHE_MS) {
        openOrderPreview(orderId, buildPreviewContent(order, cached.data));
        updateDriverMarkerTitles(cached.data);
        return;
      }

      openOrderPreview(orderId, buildPreviewContent(order, undefined, true));

      const token = localStorage.getItem("token");
      if (!token) {
        openOrderPreview(
          orderId,
          buildPreviewContent(order, undefined, false, "Dispatcher login expired."),
        );
        return;
      }

      try {
        const url = `${API_V1_BASE_URL}/routing-preview/orders/${encodeURIComponent(
          orderId,
        )}${forceRefresh ? "?refresh=true" : ""}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data: any = await response.json().catch(() => ({}));

        if (!response.ok) {
          openOrderPreview(
            orderId,
            buildPreviewContent(
              order,
              undefined,
              false,
              typeof data?.message === "string"
                ? data.message
                : "Could not calculate driver ETAs.",
            ),
          );
          return;
        }

        const preview = data as RoutingPreviewResponse;
        previewCacheRef.current[orderId] = {
          fetchedAtMs: Date.now(),
          data: preview,
        };

        if (selectedOrderIdRef.current === orderId) {
          openOrderPreview(orderId, buildPreviewContent(order, preview));
          updateDriverMarkerTitles(preview);
        }
      } catch {
        openOrderPreview(
          orderId,
          buildPreviewContent(
            order,
            undefined,
            false,
            "Routing preview is temporarily unavailable.",
          ),
        );
      }
    };

    const updateMap = () => {
      const googleMaps = (window as any).google?.maps;
      if (!googleMaps || !mapElementRef.current) return;

      if (!mapRef.current) {
        mapRef.current = new googleMaps.Map(mapElementRef.current, {
          center: { lat: 43.5448, lng: -80.2482 },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        mapRef.current.addListener("click", () => {
          if (pinnedOrderIdRef.current) clearSelection();
        });
      }

      const map = mapRef.current;
      const signedInDrivers = driversRef.current.filter((driver) => driver.isOnline);
      const driversWithLocation = signedInDrivers.filter(
        (driver) =>
          typeof driver.latitude === "number" &&
          typeof driver.longitude === "number",
      );
      const activeOrders = ordersRef.current.filter(
        (order) =>
          ACTIVE_ORDER_STATUSES.has(order.orderStatus) &&
          order.geocodeStatus === "VERIFIED" &&
          typeof order.deliveryLatitude === "number" &&
          typeof order.deliveryLongitude === "number",
      );

      const activeDriverIds = new Set(
        driversWithLocation.map((driver) => driver.id),
      );

      Object.entries(driverMarkersRef.current).forEach(([driverId, marker]) => {
        if (!activeDriverIds.has(driverId)) {
          marker.setMap(null);
          delete driverMarkersRef.current[driverId];
        }
      });

      driversWithLocation.forEach((driver) => {
        const position = {
          lat: driver.latitude as number,
          lng: driver.longitude as number,
        };
        const displayName = getDriverDisplayName(driver);
        const selectedPreview = selectedOrderIdRef.current
          ? previewCacheRef.current[selectedOrderIdRef.current]?.data
          : null;
        const previewDriver = selectedPreview?.drivers.find(
          (candidate) => candidate.driverId === driver.id,
        );

        const title = previewDriver
          ? `${displayName} • ${
              previewDriver.etaMinutes === null
                ? "ETA unavailable"
                : `~${previewDriver.etaMinutes} min to Order #${selectedPreview?.order.orderNumber}`
            } • ${driver.activeOrderCount} active order${
              driver.activeOrderCount === 1 ? "" : "s"
            }`
          : `${displayName} • ${driver.activeOrderCount} active order${
              driver.activeOrderCount === 1 ? "" : "s"
            }`;

        const isRobDriver =
          displayName.replace(/\s+/g, "").toLowerCase() === "robdriver";

        const robDriverIcon = isRobDriver
          ? {
              url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
              scaledSize: new googleMaps.Size(32, 32),
              labelOrigin: new googleMaps.Point(16, 10),
            }
          : undefined;

        const label = {
          text: getDriverInitial(driver),
          ...(isRobDriver ? { color: "#ffffff", fontWeight: "700" } : {}),
        };

        const existingMarker = driverMarkersRef.current[driver.id];
        if (existingMarker) {
          existingMarker.setPosition(position);
          existingMarker.setTitle(title);
          existingMarker.setIcon(robDriverIcon);
          existingMarker.setLabel(label);
        } else {
          driverMarkersRef.current[driver.id] = new googleMaps.Marker({
            map,
            position,
            title,
            icon: robDriverIcon,
            label,
          });
        }
      });

      const activeOrderIds = new Set(activeOrders.map((order) => order.id));
      Object.entries(orderMarkersRef.current).forEach(([orderId, marker]) => {
        if (!activeOrderIds.has(orderId)) {
          marker.setMap(null);
          delete orderMarkersRef.current[orderId];
          delete previewCacheRef.current[orderId];

          if (selectedOrderIdRef.current === orderId) {
            clearSelection();
          }
        }
      });

      activeOrders.forEach((order) => {
        const position = {
          lat: order.deliveryLatitude as number,
          lng: order.deliveryLongitude as number,
        };
        const existingMarker = orderMarkersRef.current[order.id];

        if (existingMarker) {
          existingMarker.setPosition(position);
          existingMarker.setTitle(
            `Order #${order.orderNumber} • Hover to compare driver ETAs`,
          );
          existingMarker.setLabel({
            text: String(order.orderNumber),
            color: "#ffffff",
            fontWeight: "700",
          });
          return;
        }

        const marker = new googleMaps.Marker({
          map,
          position,
          title: `Order #${order.orderNumber} • Hover to compare driver ETAs`,
          label: {
            text: String(order.orderNumber),
            color: "#ffffff",
            fontWeight: "700",
          },
        });

        marker.addListener("mouseover", () => {
          if (pinnedOrderIdRef.current && pinnedOrderIdRef.current !== order.id) {
            return;
          }
          void loadPreview(order.id, false);
        });

        marker.addListener("mouseout", () => {
          if (pinnedOrderIdRef.current === order.id) return;

          window.setTimeout(() => {
            if (
              pinnedOrderIdRef.current === null &&
              selectedOrderIdRef.current === order.id
            ) {
              infoWindowRef.current?.close();
              selectedOrderIdRef.current = null;
              updateDriverMarkerTitles(null);
            }
          }, 250);
        });

        marker.addListener("click", () => {
          pinnedOrderIdRef.current = order.id;
          void loadPreview(order.id, false);
        });

        orderMarkersRef.current[order.id] = marker;
      });

      if (
        !hasFittedBoundsRef.current &&
        (driversWithLocation.length > 0 || activeOrders.length > 0)
      ) {
        const bounds = new googleMaps.LatLngBounds();

        driversWithLocation.forEach((driver) => {
          bounds.extend({
            lat: driver.latitude as number,
            lng: driver.longitude as number,
          });
        });

        activeOrders.forEach((order) => {
          bounds.extend({
            lat: order.deliveryLatitude as number,
            lng: order.deliveryLongitude as number,
          });
        });

        map.fitBounds(bounds, 60);
        googleMaps.event.addListenerOnce(map, "idle", () => {
          if (map.getZoom() > 14) map.setZoom(14);
        });
        hasFittedBoundsRef.current = true;
      }

      const gpsSuffix =
        signedInDrivers.length === driversWithLocation.length
          ? ""
          : ` • ${driversWithLocation.length} with live GPS`;

      setStatusText(
        `${signedInDrivers.length} signed-in driver${
          signedInDrivers.length === 1 ? "" : "s"
        }${gpsSuffix} • ${activeOrders.length} active mapped order${
          activeOrders.length === 1 ? "" : "s"
        }`,
      );
    };

    const refreshData = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      const requestSequence = ++requestSequenceRef.current;

      try {
        const [driversResponse, ordersResponse] = await Promise.all([
          fetch(`${API_V1_BASE_URL}/auth/drivers`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_V1_BASE_URL}/orders`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!driversResponse.ok || !ordersResponse.ok) return;

        const [driversData, ordersData] = await Promise.all([
          driversResponse.json(),
          ordersResponse.json(),
        ]);

        if (cancelled || requestSequence !== requestSequenceRef.current) return;

        driversRef.current = Array.isArray(driversData?.drivers)
          ? driversData.drivers
          : [];
        ordersRef.current = Array.isArray(ordersData?.orders)
          ? ordersData.orders
          : [];

        updateMap();
      } catch {
        if (!cancelled) {
          setStatusText("Live map refresh temporarily unavailable");
        }
      }
    };

    const start = () => {
      if (cancelled) return;
      if (!(window as any).google?.maps || !mapElementRef.current) return;

      if (mapsWaitIntervalId !== null) {
        window.clearInterval(mapsWaitIntervalId);
        mapsWaitIntervalId = null;
      }

      void refreshData();
      refreshIntervalId = window.setInterval(() => void refreshData(), 3_000);
    };

    start();

    if (!(window as any).google?.maps) {
      mapsWaitIntervalId = window.setInterval(start, 250);
    }

    return () => {
      cancelled = true;

      if (refreshIntervalId !== null) {
        window.clearInterval(refreshIntervalId);
      }
      if (mapsWaitIntervalId !== null) {
        window.clearInterval(mapsWaitIntervalId);
      }

      Object.values(driverMarkersRef.current).forEach((marker) => marker.setMap(null));
      Object.values(orderMarkersRef.current).forEach((marker) => marker.setMap(null));
      driverMarkersRef.current = {};
      orderMarkersRef.current = {};
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      mapRef.current = null;
    };
  }, []);

  return (
    <div>
      <div className="mb-3 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
        <div className="font-semibold text-green-300">Routing Previewer</div>
        <div>
          Hover an order pin to compare traffic-aware ETAs for every signed-in
          driver. Click an order pin to keep the preview open; click the map or
          close the popup to clear it.
        </div>
        <div className="mt-1 text-xs text-zinc-500">{statusText}</div>
      </div>
      <div
        ref={mapElementRef}
        style={{ width: "100%", height: "500px", borderRadius: "12px" }}
      />
    </div>
  );
}

export function RoutingPreviewEnhancer() {
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let originalMap: HTMLDivElement | null = null;
    let portalMount: HTMLDivElement | null = null;

    const restore = () => {
      if (originalMap?.isConnected) {
        originalMap.style.display = "";
        originalMap.removeAttribute("data-routing-preview-original-pins");
      }

      if (portalMount?.isConnected) {
        portalMount.remove();
      }

      originalMap = null;
      portalMount = null;
      setMountNode(null);
    };

    const scan = () => {
      if (portalMount && !portalMount.isConnected) {
        originalMap = null;
        portalMount = null;
        setMountNode(null);
      }

      if (portalMount?.isConnected) return;

      const candidate = findDriverLocationMap();
      if (!candidate || candidate.dataset.routingPreviewOriginalPins === "true") {
        return;
      }

      const mount = document.createElement("div");
      mount.dataset.routingPreviewOriginalPinsMount = "true";
      mount.style.width = "100%";

      candidate.dataset.routingPreviewOriginalPins = "true";
      candidate.style.display = "none";
      candidate.parentElement?.insertBefore(mount, candidate);

      originalMap = candidate;
      portalMount = mount;
      setMountNode(mount);
    };

    const root = document.getElementById("root");
    const observer = new MutationObserver(scan);

    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }

    scan();

    return () => {
      observer.disconnect();
      restore();
    };
  }, []);

  return mountNode ? createPortal(<RoutingPreviewMap />, mountNode) : null;
}
