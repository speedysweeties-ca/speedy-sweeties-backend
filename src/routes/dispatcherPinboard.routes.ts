import { Router } from "express";
import { UserRole } from "@prisma/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { createPinboardNote, listPinboardNotes, pinboardSummary, readPinboardNote, setPinboardNoteStatus } from "../controllers/dispatcherPinboard.controller";

const router = Router();
router.use(requireAuth, requireRole([UserRole.ADMIN, UserRole.DISPATCHER]));
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.get("/summary", asyncHandler(pinboardSummary));
router.get("/notes", asyncHandler(listPinboardNotes));
router.post("/notes", asyncHandler(createPinboardNote));
router.post("/notes/:id/read", asyncHandler(readPinboardNote));
router.patch("/notes/:id/status", asyncHandler(setPinboardNoteStatus));
export default router;
