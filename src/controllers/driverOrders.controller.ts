import { OrderStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type AuthenticatedUser = {
  userId: string;
  email: string;
  role: string;
};

const getAuthUser = (req: Request): AuthenticatedUser | undefined => {
  return (req as Request & { user?: AuthenticatedUser }).user;
};

const driverOrderInclude = {
  items: {
    include: {
      itemCatalog: {
        select: {
          pickupType: true
        }
      }
    }
  },
  digitalReceipt: true,
  assignedDriver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true
    }
  }
} satisfies Prisma.OrderInclude;

const ROUTABLE_PICKUP_TYPES = new Set([
  "CONVENIENCE",
  "GENERAL_RETAIL",
  "GROCERY",
  "PHARMACY",
  "OTHER"
]);

const normalizePickupType = (
  value: string | null | undefined
): string => {
  const normalizedValue = String(value || "UNKNOWN").trim().toUpperCase();

  return normalizedValue || "UNKNOWN";
};

export const getDriverOrdersController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const user = getAuthUser(req);

  if (!user?.userId) {
    res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
    return;
  }

  const orders = await prisma.order.findMany({
    where: {
      assignedDriverId: user.userId,
      orderStatus: {
        notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED]
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    include: driverOrderInclude
  });

  const pickupRequirements = orders.map((order) => {
    const requiredPickupTypes = Array.from(
      new Set(
        order.items
          .map((item) => normalizePickupType(item.itemCatalog?.pickupType))
          .filter((pickupType) => pickupType !== "UNKNOWN")
      )
    );

    const unknownPickupItemCount = order.items.filter(
      (item) => normalizePickupType(item.itemCatalog?.pickupType) === "UNKNOWN"
    ).length;

    const routablePickupTypes = requiredPickupTypes.filter((pickupType) =>
      ROUTABLE_PICKUP_TYPES.has(pickupType)
    );

    const unsupportedPickupTypeCount =
      requiredPickupTypes.length - routablePickupTypes.length;

    const pickupRequired = order.orderStatus !== OrderStatus.OUT_FOR_DELIVERY;

    return {
      pickupRequired,
      routablePickupTypes,
      unknownPickupItemCount,
      unsupportedPickupTypeCount
    };
  });

  const requestedPickupTypes = Array.from(
    new Set(
      pickupRequirements
        .filter((requirement) => requirement.pickupRequired)
        .flatMap((requirement) => requirement.routablePickupTypes)
    )
  );

  const pickupLocations =
    requestedPickupTypes.length > 0
      ? await prisma.pickupLocation.findMany({
          where: {
            isActive: true,
            pickupType: {
              in: requestedPickupTypes
            }
          },
          select: {
            id: true,
            name: true,
            pickupType: true,
            addressLine1: true,
            city: true,
            province: true,
            postalCode: true,
            latitude: true,
            longitude: true
          },
          orderBy: [
            {
              pickupType: "asc"
            },
            {
              name: "asc"
            }
          ]
        })
      : [];

  const ordersWithRouting = orders.map((order, index) => {
    const pickupRequirement = pickupRequirements[index];

      const pickupLocationCandidates =
        pickupRequirement.pickupRequired &&
        pickupRequirement.routablePickupTypes.length > 0
          ? pickupLocations.filter((location) =>
              pickupRequirement.routablePickupTypes.includes(
                location.pickupType
              )
            )
          : [];

      return {
        ...order,
        routingPlan: {
          pickupRequired: pickupRequirement.pickupRequired,
          requiredPickupTypes: pickupRequirement.routablePickupTypes,
          unknownPickupItemCount: pickupRequirement.unknownPickupItemCount,
          unsupportedPickupTypeCount:
            pickupRequirement.unsupportedPickupTypeCount,
          pickupLocationCandidates,
          destination: {
            addressLine1: order.addressLine1,
            city: order.city,
            province: order.province,
            postalCode: order.postalCode
          }
        }
      };
    });

  res.status(200).json({
    success: true,
    count: ordersWithRouting.length,
    orders: ordersWithRouting
  });
};
