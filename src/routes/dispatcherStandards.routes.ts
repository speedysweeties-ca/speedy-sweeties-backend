import { Router, Request } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { presentStandards, readStandards, saveStandard, standardFields } from "../services/dispatcherStandards.service";

const router = Router();
const actor = (req: Request) => (req as Request & { user: { role: UserRole; firstName?: string; lastName?: string } }).user;
const updateSchema = standardFields.extend({ version: z.number().int().nonnegative() }).strict();
const createSchema = updateSchema.extend({ id: z.uuid(), status: z.literal("DRAFT") }).strict();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use(requireAuth, requireRole([UserRole.ADMIN, UserRole.DISPATCHER]));

router.get("/", asyncHandler(async (req, res) => {
  const { board } = await readStandards();
  res.json(presentStandards(board, actor(req).role === UserRole.ADMIN));
}));

router.post("/entries", requireRole([UserRole.ADMIN]), asyncHandler(async (req, res) => {
  const { id, version, ...fields } = createSchema.parse(req.body);
  const user = actor(req);
  const board = await saveStandard({ id, version, fields, create: true,
    editorName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Administrator" });
  res.status(201).json(presentStandards(board, true));
}));

router.put("/entries/:id", requireRole([UserRole.ADMIN]), asyncHandler(async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { version, ...fields } = updateSchema.parse(req.body);
  const user = actor(req);
  const board = await saveStandard({ id, version, fields, create: false,
    editorName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Administrator" });
  res.json(presentStandards(board, true));
}));

export default router;
