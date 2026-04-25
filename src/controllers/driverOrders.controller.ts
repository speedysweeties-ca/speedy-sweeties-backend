import { PrismaClient, OrderStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

type AuthenticatedUser = {
  userId: string;
  email: string;
  role: string;
};

const getAuthUser = (req: Request): AuthenticatedUser | undefined => {
  return (req as Request & { user?: AuthenticatedUser }).user;
};

const driverOrderInclude = {
  items: true,
  assignedDriver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true
    }
  }
} satisfies Prisma.OrderInclude;

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

  res.status(200).json({
    success: true,
    count: orders.length,
    orders
  });
};