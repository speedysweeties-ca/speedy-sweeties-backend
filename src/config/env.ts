import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  const value = rawValue === undefined ? fallback : Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }

  return value;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];
  if (rawValue === undefined) return fallback;

  const normalized = rawValue.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  throw new Error(`Invalid boolean environment variable: ${name}`);
}

const NODE_ENV = process.env.NODE_ENV ?? "development";
const CORS_ORIGIN =
  process.env.CORS_ORIGIN ??
  (NODE_ENV === "production" ? requireEnv("CORS_ORIGIN") : "*");

export const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  JWT_SECRET: requireEnv("JWT_SECRET"),
  FIREBASE_SERVICE_ACCOUNT_JSON: requireEnv("FIREBASE_SERVICE_ACCOUNT_JSON"),
  CORS_ORIGIN,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_ORDER_DRAFT_MODEL:
    process.env.OPENAI_ORDER_DRAFT_MODEL ?? "gpt-5.6-luna",
  OPENAI_ORDER_DRAFT_TIMEOUT_MS: Math.min(
    30_000,
    Math.max(1_000, numberEnv("OPENAI_ORDER_DRAFT_TIMEOUT_MS", 12_000))
  ),
  AI_ORDER_DRAFT_CATALOG_LIMIT: Math.floor(
    Math.min(
      1_000,
      Math.max(25, numberEnv("AI_ORDER_DRAFT_CATALOG_LIMIT", 750))
    )
  ),
  AI_PRODUCT_WEB_LOOKUP_ENABLED: booleanEnv(
    "AI_PRODUCT_WEB_LOOKUP_ENABLED",
    true
  ),
  OPENAI_PRODUCT_WEB_LOOKUP_MODEL:
    process.env.OPENAI_PRODUCT_WEB_LOOKUP_MODEL ??
    process.env.OPENAI_ORDER_DRAFT_MODEL ??
    "gpt-5.6-luna",
  AI_PRODUCT_WEB_LOOKUP_TIMEOUT_MS: Math.min(
    15_000,
    Math.max(1_000, numberEnv("AI_PRODUCT_WEB_LOOKUP_TIMEOUT_MS", 8_000))
  ),
  AI_PRODUCT_WEB_LOOKUP_MAX_ITEMS: Math.floor(
    Math.min(
      3,
      Math.max(1, numberEnv("AI_PRODUCT_WEB_LOOKUP_MAX_ITEMS", 2))
    )
  ),

  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ?? "",
  GOOGLE_PLACE_ID: process.env.GOOGLE_PLACE_ID ?? "ChIJBSxQSViaK4gRaS6LjGPMvTs",

  GOOGLE_GEOCODING_API_KEY: process.env.GOOGLE_GEOCODING_API_KEY ?? "",
  GOOGLE_GEOCODING_TIMEOUT_MS: numberEnv("GOOGLE_GEOCODING_TIMEOUT_MS", 5_000),

  GOOGLE_ROUTES_API_KEY: process.env.GOOGLE_ROUTES_API_KEY ?? "",
  GOOGLE_ROUTES_TIMEOUT_MS: numberEnv("GOOGLE_ROUTES_TIMEOUT_MS", 6_000),
  ROUTING_PREVIEW_CACHE_SECONDS: numberEnv(
    "ROUTING_PREVIEW_CACHE_SECONDS",
    45
  ),

  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  UNDISPATCHED_ALERT_EMAIL:
    process.env.UNDISPATCHED_ALERT_EMAIL ?? "rstubbings@hotmail.com",
  UNDISPATCHED_ALERT_FROM:
    process.env.UNDISPATCHED_ALERT_FROM ??
    "Speedy Sweeties Alerts <onboarding@resend.dev>",
  UNDISPATCHED_ALERT_AFTER_MINUTES: numberEnv(
    "UNDISPATCHED_ALERT_AFTER_MINUTES",
    5
  ),
  UNDISPATCHED_ALERT_POLL_SECONDS: numberEnv(
    "UNDISPATCHED_ALERT_POLL_SECONDS",
    60
  ),
  UNDISPATCHED_ALERT_MAX_AGE_HOURS: numberEnv(
    "UNDISPATCHED_ALERT_MAX_AGE_HOURS",
    24
  )
};
