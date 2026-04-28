import { PrismaClient, UserRole } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

type Params = {
  id: string;
};

export const forceLogoutDriverController = async (
  req: Request<Params>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const driver = await prisma.user.findUnique({
    where: { id }
  });

  if (!driver || driver.role !== UserRole.DRIVER) {
    res.status(404).json({
      success: false,
      message: "Driver not found"
    });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: {
      isOnline: false,
      lastSeenAt: new Date(),
      forceLogoutAt: new Date()
}
  });

  res.status(200).json({
    success: true,
    message: "Driver has been logged out successfully"
  });
};