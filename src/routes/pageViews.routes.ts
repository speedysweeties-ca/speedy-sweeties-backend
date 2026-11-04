import { Router } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";

// Fixed keys prevent arbitrary paths/query strings or visitor data being stored.
export const pageViewKeys = new Set(["home", "beer", "alcohol", "vapes", "cannabis", "convenience", "drivers"]);
const router = Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }));
router.post("/:page", async (req, res, next) => {
  if (req.get("origin") !== "https://www.speedysweeties.ca") {
    return res.status(403).json({ success: false, message: "Website origin required" });
  }
  const page = req.params.page as string;
  if (!pageViewKeys.has(page)) return res.status(404).json({ success: false, message: "Unknown page" });
  try {
    // One PostgreSQL statement: concurrent page loads cannot lose increments.
    const rows = await prisma.$queryRaw<{ views: bigint }[]>`
      INSERT INTO "PageViewCounter" ("page", "views") VALUES (${page}, 1)
      ON CONFLICT ("page") DO UPDATE SET "views" = "PageViewCounter"."views" + 1
      RETURNING "views"`;
    return res.json({ success: true, page, views: rows[0].views.toString() });
  } catch (error) { return next(error); }
});
export default router;
