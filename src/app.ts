import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import routes from "./routes";
import { env } from "./config/env";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";
import { loginRateLimiter } from "./middleware/loginRateLimiter";
import { qrStatisticsRateLimiter } from "./middleware/qrStatisticsRateLimiter";
import { prisma } from "./lib/prisma";

// 🔥 ADD THIS LINE (initializes Firebase Admin)
import "./config/firebase";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

const allowedCorsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllCorsOrigins = allowedCorsOrigins.includes("*");

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowAllCorsOrigins ||
        allowedCorsOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin is not allowed"));
    },
    credentials: true
  })
);

app.use(helmet());
// Do not log request URLs in production: token-based tracking URLs contain credentials.
app.use(
  morgan(
    env.NODE_ENV === "production"
      ? ":method :status :res[content-length] :response-time ms"
      : "dev"
  )
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Standalone customer page, with no analytics or third-party scripts that could read its credential.
app.use("/track", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.removeHeader("X-Frame-Options");
  res.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://www.speedysweeties.ca https://speedysweeties.ca https://speedy-sweeties.webflow.io");
  next();
}, express.static(path.join(__dirname, "../public/track")));


app.get("/q/lighter", async (_req, res, next) => {
  try {
    await prisma.qrScan.create({
      data: {
        campaign: "lighter"
      }
    });

    return res.redirect("https://www.speedysweeties.ca/#contact-us");
  } catch (error) {
    return next(error);
  }
});

app.get("/q/lighter/stats", qrStatisticsRateLimiter, async (_req, res, next) => {
  try {
    const totalScans = await prisma.qrScan.count({
      where: {
        campaign: "lighter"
      }
    });

    return res.status(200).json({
      success: true,
      campaign: "lighter",
      totalScans
    });
  } catch (error) {
    return next(error);
  }
});

app.use("/api/v1/auth/login", loginRateLimiter);
app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
