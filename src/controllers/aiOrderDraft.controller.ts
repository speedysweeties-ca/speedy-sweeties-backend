import { Request, Response } from "express";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import {
  AiConversationTurn,
  createAiOrderDraft
} from "../services/aiOrderDraft.service";

import { CurrentCart } from "../services/aiOrderEdit";

interface AiOrderDraftRequestBody {
  transcript: string;
  history?: AiConversationTurn[];
  currentCart?: CurrentCart;
}

export const createAiOrderDraftController = async (
  req: Request<Record<string, never>, unknown, AiOrderDraftRequestBody>,
  res: Response
) => {
  const catalogItems = await prisma.itemCatalog.findMany({
    where: {
      isActive: true
    },
    select: {
      id: true,
      name: true,
      normalizedName: true,
      brand: true,
      size: true,
      category: true,
      source: true,
      pickupType: true,
      popularityScore: true
    },
    orderBy: [
      {
        popularityScore: "desc"
      },
      {
        name: "asc"
      }
    ],
    take: env.AI_ORDER_DRAFT_CATALOG_LIMIT
  });

  const result = await createAiOrderDraft({
    transcript: req.body.transcript.trim(),
    history: Array.isArray(req.body.history) ? req.body.history : [],
    catalogItems,
    currentCart: req.body.currentCart
  });

  res.set("Cache-Control", "no-store");
  res.status(200).json({
    success: true,
    ...result
  });
};
