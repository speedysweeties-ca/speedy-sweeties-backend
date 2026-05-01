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

  if (normalizedQuery.length < 2) {
    return res.status(200).json({
      success: true,
      count: 0,
      items: []
    });
  }

  const items = await prisma.itemCatalog.findMany({
    where: {
      isActive: true,
      OR: [
        {
          normalizedName: {
            contains: normalizedQuery
          }
        },
        {
          normalizedBrand: {
            contains: normalizedQuery
          }
        },
        {
          brand: {
            contains: query,
            mode: "insensitive"
          }
        },
        {
          category: {
            contains: query,
            mode: "insensitive"
          }
        }
      ]
    },
    select: {
      id: true,
      name: true,
      brand: true,
      size: true,
      category: true,
      source: true,
      popularityScore: true
    },
    take: 10,
    orderBy: [
      {
        popularityScore: "desc"
      },
      {
        name: "asc"
      }
    ]
  });

  res.status(200).json({
    success: true,
    count: items.length,
    items
  });
};