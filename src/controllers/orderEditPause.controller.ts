import { Request, Response } from "express";
import { z } from "zod";
import { updateOrderEditPause } from "../services/orderEditPause.service";

const inputSchema = z.object({
  sessionId: z.string().uuid(),
  action: z.enum(["start", "heartbeat", "stop"])
}).strict();

export async function orderEditPauseController(req: Request, res: Response): Promise<void> {
  const body = inputSchema.safeParse(req.body);
  const id = z.string().uuid().safeParse(req.params.id);
  if (!body.success || !id.success) {
    res.status(400).json({ success: false, message: "Invalid edit pause request" });
    return;
  }
  const actorUserId = (req as Request & { user?: { userId: string } }).user?.userId;
  if (!actorUserId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  const timing = await updateOrderEditPause({ ...body.data, orderId: id.data, actorUserId });
  res.status(200).json({ success: true, ...timing });
}
