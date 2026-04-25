import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const normalize = (value: string) => value.trim().toLowerCase();

export const searchItemsController = async (
  req: Request,
  res: Response
) => {
  const { query } = req.query;

  if (!query || typeof query !== "string") {
    return res.status(400).json({
      success: false,
      message: "Query is required"
    });
  }

  const normalizedQuery = normalize(query);

  const items = await prisma.itemCatalog.findMany({
    where: {
      normalizedName: {
        contains: normalizedQuery
      },
      isActive: true
    },
    take: 10,
    orderBy: {
      name: "asc"
    }
  });

  res.status(200).json({
    success: true,
    count: items.length,
    items
  });
};