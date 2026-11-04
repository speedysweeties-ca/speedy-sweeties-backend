import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  // Prisma's default error/query output can include contacts and query arguments.
  // Keep operational categories, never private rows, tokens or query text.
  const client = new PrismaClient({ log: [
    { level: "warn", emit: "event" }, { level: "error", emit: "event" }
  ] });
  client.$on("warn", () => console.warn("[database] DATABASE_WARNING_PRIVATE_DETAILS_WITHHELD"));
  client.$on("error", () => console.error("[database] DATABASE_ERROR_PRIVATE_DETAILS_WITHHELD"));
  return client;
}

export const prisma =
  global.__prisma ||
  createClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
