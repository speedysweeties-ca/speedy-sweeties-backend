import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { closeSyntheticProfile, enrollSyntheticProfile, validateSyntheticEnrollmentProfile } from "../services/syntheticOrderSafety.service";
function actor(req: Request) { return (req as Request & { user?: { userId: string; role: string } }).user; }
export async function validateSyntheticEnrollmentController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const result = await validateSyntheticEnrollmentProfile(prisma, actor(req), req.body);
  res.status(200).json({ success: true, ...result });
}
export async function enrollSyntheticController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const result = await enrollSyntheticProfile(prisma, actor(req), req.body);
  res.status(201).json({ success: true, ...result }); // No contacts, fingerprints or credentials.
}
export async function closeSyntheticController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const result = await closeSyntheticProfile(prisma, actor(req));
  res.status(200).json({ success: true, ...result });
}
