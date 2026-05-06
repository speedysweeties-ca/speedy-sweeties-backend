import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const normalize = (value: string) => value.trim().toLowerCase();

const normalizeOptional = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

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

export const listCatalogItemsController = async (
  req: Request,
  res: Response
) => {
  const { query, isActive } = req.query;

  const searchText = typeof query === "string" ? query.trim() : "";
  const normalizedQuery = searchText ? normalize(searchText) : "";

  const activeFilter =
    isActive === "true" ? true :
    isActive === "false" ? false :
    undefined;

  const items = await prisma.itemCatalog.findMany({
    where: {
      ...(activeFilter !== undefined ? { isActive: activeFilter } : {}),
      ...(normalizedQuery.length >= 2
        ? {
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
                  contains: searchText,
                  mode: "insensitive"
                }
              },
              {
                category: {
                  contains: searchText,
                  mode: "insensitive"
                }
              },
              {
                source: {
                  contains: searchText,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    },
    orderBy: [
      {
        isActive: "desc"
      },
      {
        popularityScore: "desc"
      },
      {
        name: "asc"
      }
    ],
    take: 100
  });

  res.status(200).json({
    success: true,
    count: items.length,
    items
  });
};

export const updateCatalogItemController = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const { id } = req.params;

  const {
    name,
    brand,
    size,
    category,
    source,
    isActive
  } = req.body;

  const existingItem = await prisma.itemCatalog.findUnique({
    where: { id }
  });

  if (!existingItem) {
    return res.status(404).json({
      success: false,
      message: "Catalog item not found"
    });
  }

  const cleanedName =
    typeof name === "string" && name.trim()
      ? name.trim()
      : existingItem.name;

  const cleanedBrand =
    typeof brand === "string" && brand.trim()
      ? brand.trim()
      : null;

  const updatedItem = await prisma.itemCatalog.update({
    where: { id },
    data: {
      name: cleanedName,
      normalizedName: normalize(cleanedName),
      brand: cleanedBrand,
      normalizedBrand: normalizeOptional(cleanedBrand),
      size:
        typeof size === "string" && size.trim()
          ? size.trim()
          : null,
      category:
        typeof category === "string" && category.trim()
          ? category.trim()
          : null,
      source:
        typeof source === "string" && source.trim()
          ? source.trim()
          : null,
      ...(typeof isActive === "boolean" ? { isActive } : {})
    }
  });

  res.status(200).json({
    success: true,
    message: "Catalog item updated successfully",
    item: updatedItem
  });
};

export const deactivateCatalogItemController = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const { id } = req.params;

  const existingItem = await prisma.itemCatalog.findUnique({
    where: { id }
  });

  if (!existingItem) {
    return res.status(404).json({
      success: false,
      message: "Catalog item not found"
    });
  }

  const updatedItem = await prisma.itemCatalog.update({
    where: { id },
    data: {
      isActive: false
    }
  });

  res.status(200).json({
    success: true,
    message: "Catalog item deactivated successfully",
    item: updatedItem
  });
};