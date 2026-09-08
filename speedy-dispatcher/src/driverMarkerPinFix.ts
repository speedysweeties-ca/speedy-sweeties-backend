type GoogleMapsLike = {
  Marker?: any;
  SymbolPath?: { CIRCLE?: unknown };
  Size?: new (width: number, height: number) => unknown;
  Point?: new (x: number, y: number) => unknown;
};

const DRIVER_MARKER_PATCH_FLAG = "__speedyDriverPinPatchInstalled";
const DRIVER_MARKER_INSTANCE_FLAG = "__speedyDriverMarker";

const getDriverInitial = (title: string): string => {
  const namePortion = title.split("•")[0]?.trim() || "";
  return namePortion.charAt(0).toUpperCase() || "D";
};

const isDriverCircleIcon = (
  maps: GoogleMapsLike,
  marker: any,
  icon: any,
): boolean => {
  const title = String(marker?.getTitle?.() || "");
  const isCircle =
    icon &&
    typeof icon === "object" &&
    icon.path === maps.SymbolPath?.CIRCLE;

  return Boolean(
    isCircle &&
      !title.startsWith("Order #") &&
      (title.includes("active order") || marker?.[DRIVER_MARKER_INSTANCE_FLAG]),
  );
};

const buildDriverPinIcon = (
  maps: GoogleMapsLike,
  color: string,
) => {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#16a34a";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
      <path d="M17 1C8.16 1 1 8.16 1 17c0 11.8 16 26 16 26s16-14.2 16-26C33 8.16 25.84 1 17 1Z" fill="${safeColor}" stroke="#ffffff" stroke-width="2"/>
    </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: maps.Size ? new maps.Size(34, 44) : undefined,
    anchor: maps.Point ? new maps.Point(17, 44) : undefined,
    labelOrigin: maps.Point ? new maps.Point(17, 17) : undefined,
  };
};

const applyDriverLabel = (marker: any) => {
  const title = String(marker?.getTitle?.() || "");
  marker?.setLabel?.({
    text: getDriverInitial(title),
    color: "#ffffff",
    fontWeight: "700",
    fontSize: "13px",
  });
};

const patchGoogleMapsMarker = (): boolean => {
  const mapsWindow = window as any;
  const maps = mapsWindow.google?.maps as GoogleMapsLike | undefined;
  const OriginalMarker = maps?.Marker;

  if (!maps || !OriginalMarker || !maps.SymbolPath?.CIRCLE) return false;
  if ((OriginalMarker as any)[DRIVER_MARKER_PATCH_FLAG]) return true;

  const originalSetIcon = OriginalMarker.prototype.setIcon;

  OriginalMarker.prototype.setIcon = function patchedSetIcon(icon: any) {
    if (isDriverCircleIcon(maps, this, icon)) {
      this[DRIVER_MARKER_INSTANCE_FLAG] = true;
      applyDriverLabel(this);
      return originalSetIcon.call(
        this,
        buildDriverPinIcon(maps, String(icon.fillColor || "#16a34a")),
      );
    }

    return originalSetIcon.call(this, icon);
  };

  function SpeedyMarker(this: any, options?: any) {
    const marker = new OriginalMarker(options);
    const icon = options?.icon;

    if (isDriverCircleIcon(maps, marker, icon)) {
      marker[DRIVER_MARKER_INSTANCE_FLAG] = true;
      applyDriverLabel(marker);
      originalSetIcon.call(
        marker,
        buildDriverPinIcon(maps, String(icon.fillColor || "#16a34a")),
      );
    }

    return marker;
  }

  SpeedyMarker.prototype = OriginalMarker.prototype;
  Object.setPrototypeOf(SpeedyMarker, OriginalMarker);
  (SpeedyMarker as any)[DRIVER_MARKER_PATCH_FLAG] = true;
  maps.Marker = SpeedyMarker;

  return true;
};

export const installDriverMarkerPinFix = () => {
  if (patchGoogleMapsMarker()) return;

  const intervalId = window.setInterval(() => {
    if (patchGoogleMapsMarker()) {
      window.clearInterval(intervalId);
    }
  }, 50);

  window.setTimeout(() => window.clearInterval(intervalId), 30_000);
};
