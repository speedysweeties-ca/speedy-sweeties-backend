import { Server } from "node:http";
import app from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

const SHUTDOWN_TIMEOUT_MS = 10_000;

let server: Server | undefined;
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Starting graceful shutdown.`);

  const forceExitTimeout = setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing process exit.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimeout.unref();

  let exitCode = 0;

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } catch (error) {
    exitCode = 1;
    console.error("Failed to close HTTP server cleanly", error instanceof Error ? error.name : typeof error);
  } finally {
    try {
      await prisma.$disconnect();
    } catch (error) {
      exitCode = 1;
      console.error("Failed to disconnect Prisma cleanly", error instanceof Error ? error.name : typeof error);
    }

    clearTimeout(forceExitTimeout);
    process.exit(exitCode);
  }
}

async function startServer(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("Connected to database");

    server = app.listen(env.PORT, () => {
      console.log(`Server running on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error instanceof Error ? error.name : typeof error);
    process.exit(1);
  }
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

void startServer();
