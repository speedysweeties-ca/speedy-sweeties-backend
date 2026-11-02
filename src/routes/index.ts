import { Router } from "express";
import privacyRoutes from "./privacy.routes";
import orderRoutes from "./orders";
import authRoutes from "./auth.routes";
import customerRoutes from "./customer.routes";
import itemRoutes from "./item.routes";
import driverRoutes from "./driver.routes";
import notificationRoutes from "./notification.routes";
import testNotificationRoutes from "./test-notification.routes";
import businessRoutes from "./business.routes";
import dispatcherChecklistRoutes from "./dispatcherChecklist.routes";
import pickupLocationRoutes from "./pickupLocation.routes";
import routingPreviewRoutes from "./routingPreview.routes";
import aiOrderDraftRoutes from "./aiOrderDraft.routes";
import dispatcherHelpRoutes from "./dispatcherHelp.routes";
import chatgptOrderingRoutes from "./chatgptOrdering.routes";
import bndAlertsRoutes from "./bndAlerts.routes";
import deliveryCheckInRoutes from "./deliveryCheckIn.routes";
import dispatcherPinboardRoutes from "./dispatcherPinboard.routes";
import dispatcherStandardsRoutes from "./dispatcherStandards.routes";
import addressRoutes from "./address.routes";

import { getReadiness } from "../services/readiness.service";

import retentionSmsRoutes from "./retentionSms.routes";

const router = Router();
router.use("/retention-sms", retentionSmsRoutes);
router.use("/privacy/deletion", privacyRoutes);

router.get("/health", getReadiness);
router.get("/health/ready", getReadiness);

router.get("/health/live", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Speedy Sweeties backend is running"
  });
});

router.use("/orders", orderRoutes);
router.use("/addresses", addressRoutes);
router.use("/chatgpt", chatgptOrderingRoutes);
router.use("/auth", authRoutes);
router.use("/customers", customerRoutes);
router.use("/items", itemRoutes);
router.use("/driver", driverRoutes);
router.use("/notifications", notificationRoutes);
router.use("/test-notification", testNotificationRoutes);
router.use("/business", businessRoutes);
router.use("/dispatcher-checklist", dispatcherChecklistRoutes);
router.use("/pickup-locations", pickupLocationRoutes);
router.use("/routing-preview", routingPreviewRoutes);
router.use("/ai", aiOrderDraftRoutes);
router.use("/dispatcher-help", dispatcherHelpRoutes);
router.use("/bnd-alerts", bndAlertsRoutes);
router.use("/check-in", deliveryCheckInRoutes);
router.use("/dispatcher-pinboard", dispatcherPinboardRoutes);
router.use("/dispatcher-standards", dispatcherStandardsRoutes);

export default router;
