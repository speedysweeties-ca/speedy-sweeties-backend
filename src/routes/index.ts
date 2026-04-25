import { Router } from "express";
import orderRoutes from "./order.routes";
import authRoutes from "./auth.routes";
import customerRoutes from "./customer.routes";
import itemRoutes from "./item.routes";
import driverRoutes from "./driver.routes";
import notificationRoutes from "./notification.routes";
import testNotificationRoutes from "./test-notification.routes";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Speedy Sweeties backend is running"
  });
});

router.use("/orders", orderRoutes);
router.use("/auth", authRoutes);
router.use("/customers", customerRoutes);
router.use("/items", itemRoutes);
router.use("/driver", driverRoutes);
router.use("/notifications", notificationRoutes);
router.use("/test-notification", testNotificationRoutes);

export default router;