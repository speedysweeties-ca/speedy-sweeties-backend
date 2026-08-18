import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const logLevel = (
  process.env.NODE_ENV === "development"
    ? ["query", "info", "warn", "error"]
    : ["warn", "error"]
) satisfies ("query" | "info" | "warn" | "error")[];

export const prisma =
  global.__prisma ||
  new PrismaClient({
    log: logLevel
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
