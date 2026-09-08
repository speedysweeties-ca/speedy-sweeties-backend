import { OrderStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  normalizePickupType,
  parsePickupType,
  type RoutablePickupTypeValue
} from "../constants/pickupTypes";

type AuthenticatedUser = {
  userId: string;
  email: string;
  role: string;
};

const getAuthUser = (req: Request): AuthenticatedUser | undefined => {
  return (req as Request & { user?: AuthenticatedUser }).user;
};

export const driverOrderInclude = {
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

export const withDriverRoutingPlan = <
  TOrder extends object,
  TRoutingPlan extends object
>(
  order: TOrder,
  routingPlan: TRoutingPlan
): TOrder & { routingPlan: TRoutingPlan } => ({
  ...order,
  routingPlan
});

export type PickupRequirement = {
  pickupRequired: boolean;
  routablePickupTypes: RoutablePickupTypeValue[];
  unknownPickupItemCount: number;
  unsupportedPickupTypeCount: number;
};

export const buildPickupRequirement = (
  pickupTypes: Array<string | null | undefined>,
  pickupRequired: boolean
): PickupRequirement => {
  const normalizedPickupTypes = pickupTypes.map(
    (pickupType) => normalizePickupType(pickupType) || "UNKNOWN"
  );

  const unknownPickupItemCount = normalizedPickupTypes.filter(
    (pickupType) => pickupType === "UNKNOWN"
  ).length;

  const uniqueRequiredPickupTypes = Array.from(
    new Set(
      normalizedPickupTypes.filter((pickupType) => pickupType !== "UNKNOWN")
    )
  );

  const routablePickupTypes: RoutablePickupTypeValue[] = [];
  let unsupportedPickupTypeCount = 0;

  for (const pickupType of uniqueRequiredPickupTypes) {
    const parsedPickupType = parsePickupType(pickupType);

    if (parsedPickupType && parsedPickupType !== "UNKNOWN") {
      routablePickupTypes.push(parsedPickupType);
    } else {
      unsupportedPickupTypeCount += 1;
    }
  }

  return {
    pickupRequired,
    routablePickupTypes,
    unknownPickupItemCount,
    unsupportedPickupTypeCount
  };
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

  const pickupRequirements = orders.map((order) =>
    buildPickupRequirement(
      order.items.map((item) => item.itemCatalog?.pickupType),
      order.orderStatus !== OrderStatus.OUT_FOR_DELIVERY
    )
  );

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
              location.pickupType as RoutablePickupTypeValue
            )
          )
        : [];

    return withDriverRoutingPlan(order, {
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
    });
  });

  res.status(200).json({
    success: true,
    count: ordersWithRouting.length,
    orders: ordersWithRouting
  });
};
