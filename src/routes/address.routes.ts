import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { getAddressDetails, searchAddresses } from "../services/addressSearch.service";
import { DeliveryAddressValidationError, geocodeDeliveryAddress } from "../services/deliveryGeocoding.service";

const router = Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 180,
  standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { success: false, message: "Too many address searches. Please wait a few minutes or call 519-826-8097." }
}));
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

const sessionToken = z.string().regex(/^[a-zA-Z0-9_-]{16,36}$/);
const schemas = {
  suggestions: z.object({ input: z.string().trim().min(3).max(200), sessionToken }),
  details: z.object({ placeId: z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/), sessionToken }),
  verify: z.object({ addressLine1: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(100), province: z.string().trim().regex(/^(ON|Ontario)$/i) })
};

for (const action of ["suggestions", "details", "verify"] as const) {
  router.post(`/${action}`, async (req, res) => {
    const parsed = schemas[action].safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Please enter a complete delivery address." });
      return;
    }
    try {
      const data = parsed.data as any;
      if (action === "suggestions") {
        res.json({ success: true, suggestions: await searchAddresses(data.input, data.sessionToken) });
      } else if (action === "details") {
        res.json({ success: true, address: await getAddressDetails(data.placeId, data.sessionToken) });
      } else {
        const location = await geocodeDeliveryAddress(data, { requireRooftop: true });
        if (location.geocodeStatus !== "VERIFIED") throw new Error("Address check unavailable");
        res.json({ success: true, verified: true });
      }
    } catch (error) {
      if (error instanceof DeliveryAddressValidationError) {
        res.status(400).json({ success: false, code: error.code,
          message: "We couldn't confirm that house number and street. Please choose your full address from the suggestions, or call 519-826-8097." });
      } else {
        res.status(503).json({ success: false, code: "ADDRESS_CHECK_UNAVAILABLE",
          message: "Address checking is temporarily unavailable. Please try again or call 519-826-8097 to order." });
      }
    }
  });
}
export default router;
