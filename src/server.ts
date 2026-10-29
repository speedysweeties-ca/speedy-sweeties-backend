// Select once before app, env, Prisma, Firebase or any business service imports.
import dotenv from "dotenv";

function selectStartup(): "normal" | "quiescent" {
  // Preserve existing .env development behavior; never load it in synthetic tests.
  if (process.env.NODE_ENV !== "test") {
    const loaded = dotenv.config();
    if (loaded.error && (loaded.error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("STARTUP_CONFIGURATION_UNAVAILABLE");
  }
  const mode = process.env.API_STARTUP_MODE;
  if (mode === undefined || mode === "normal") return "normal";
  if (mode === "quiescent") return "quiescent";
  throw new Error("STARTUP_MODE_INVALID");
}

let mode: "normal" | "quiescent";
try { mode = selectStartup(); }
catch {
  console.error(JSON.stringify({ event: "API_STARTUP_STOPPED", code: "STARTUP_CONFIGURATION_INVALID" }));
  process.exit(1);
}
if (mode === "quiescent") {
  // Rejected startup never falls through to normal operation, regardless of cause.
  require("./quiescentServer").startQuiescentServer().catch(() => {
    console.error(JSON.stringify({ event: "API_STARTUP_STOPPED", code: "QUIESCENT_STARTUP_FAILED" }));
    process.exit(1);
  });
} else {
  require("./normalServer");
}
