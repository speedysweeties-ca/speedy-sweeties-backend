import { Router } from "express";
import { getBusinessStatus } from "../controllers/business.controller";

const router = Router();

router.get("/status", getBusinessStatus);

export default router;