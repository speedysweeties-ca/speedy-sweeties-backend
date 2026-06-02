import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes";
import { env } from "./config/env";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";
import { prisma } from "./lib/prisma";

// 🔥 ADD THIS LINE (initializes Firebase Admin)
import "./config/firebase";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
    credentials: true
  })
);

app.use(helmet());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


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

app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);

export default app;