import { OrderSource } from "@prisma/client";

const WEBFLOW_ORDER_ORIGINS = new Set([
  "https://speedysweeties.ca",
  "https://www.speedysweeties.ca",
  "https://speedy-sweeties.webflow.io"
]);

const PUBLIC_ORDER_SOURCES = new Set<OrderSource>([
  OrderSource.UNKNOWN,
  OrderSource.ANDROID_APP,
  OrderSource.IOS_APP,
  OrderSource.WEBFLOW
]);

export const isWebflowOrderOrigin = (origin: unknown): boolean => {
  if (typeof origin !== "string") return false;

  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.protocol === "https:" &&
      parsedOrigin.pathname === "/" &&
      !parsedOrigin.search &&
      !parsedOrigin.hash &&
      WEBFLOW_ORDER_ORIGINS.has(parsedOrigin.origin)
    );
  } catch {
    return false;
  }
};

type ResolveOrderSourceAttributionInput = {
  requestedSource: unknown;
  requestOrigin: unknown;
  override?: OrderSource;
};

export const resolveOrderSourceAttribution = ({
  requestedSource,
  requestOrigin,
  override
}: ResolveOrderSourceAttributionInput): OrderSource => {
  if (override) return override;

  if (
    requestedSource !== OrderSource.UNKNOWN &&
    PUBLIC_ORDER_SOURCES.has(requestedSource as OrderSource)
  ) {
    return requestedSource as OrderSource;
  }

  if (isWebflowOrderOrigin(requestOrigin)) return OrderSource.WEBFLOW;

  return OrderSource.UNKNOWN;
};
