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

  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ?? "",
  GOOGLE_PLACE_ID: process.env.GOOGLE_PLACE_ID ?? "ChIJBSxQSViaK4gRaS6LjGPMvTs",

  GOOGLE_GEOCODING_API_KEY: process.env.GOOGLE_GEOCODING_API_KEY ?? "",
  GOOGLE_GEOCODING_TIMEOUT_MS: numberEnv("GOOGLE_GEOCODING_TIMEOUT_MS", 5_000)
};
