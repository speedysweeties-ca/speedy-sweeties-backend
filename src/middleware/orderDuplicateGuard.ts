import { createHash } from "crypto";
import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const DUPLICATE_WINDOW_MS = 60 * 1000;
const ORDER_SUBMISSION_KEY_PREFIX = "orderSubmission:";

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeNumber = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeItems = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => ({
        name: normalizeString(item?.name),
        quantity: normalizeNumber(item?.quantity) ?? 1,
        unitPrice: normalizeNumber(item?.unitPrice),
        totalPrice: normalizeNumber(item?.totalPrice)
      }))
    : [];

export const createOrderSubmissionFingerprint = (body: unknown): string => {
  const requestBody =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const duplicateRelevantPayload = {
    customerName: normalizeString(requestBody.customerName),
    customerPhone: normalizeString(requestBody.customerPhone).replace(/\D/g, ""),
    customerEmail: normalizeString(requestBody.customerEmail),
    addressLine1: normalizeString(requestBody.addressLine1),
    city: normalizeString(requestBody.city),
    province: normalizeString(requestBody.province),
    paymentMethod: normalizeString(requestBody.paymentMethod),
    additionalNotes: normalizeString(requestBody.additionalNotes),
    deliveryInstructions: normalizeString(requestBody.deliveryInstructions),
    notes: normalizeString(requestBody.notes),
    items: normalizeItems(requestBody.items)
  };

  return createHash("sha256")
    .update(JSON.stringify(duplicateRelevantPayload))
    .digest("hex");
};

const releaseReservation = async (key: string): Promise<void> => {
  await prisma.systemSetting.deleteMany({
    where: { key }
  });
};

export const preventDuplicatePublicOrderSubmission = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const fingerprint = createOrderSubmissionFingerprint(req.body);
  const key = `${ORDER_SUBMISSION_KEY_PREFIX}${fingerprint}`;
  const expiresAt = new Date(Date.now() + DUPLICATE_WINDOW_MS).toISOString();

  // Remove expired reservations so the same legitimate order can be placed later.
  await prisma.$executeRaw`
    DELETE FROM "SystemSetting"
    WHERE "key" LIKE 'orderSubmission:%'
      AND "value"::timestamptz <= NOW()
  `;

  const reserved = await prisma.$queryRaw<Array<{ key: string }>>`
    INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
    VALUES (${key}, ${expiresAt}, NOW(), NOW())
    ON CONFLICT ("key") DO NOTHING
    RETURNING "key"
  `;

  if (reserved.length === 0) {
    res.status(409).json({
      success: false,
      code: "DUPLICATE_ORDER_SUBMISSION",
      message: "This order was already submitted. Please check your current order before trying again."
    });
    return;
  }

  res.once("finish", () => {
    if (res.statusCode >= 400) {
      void releaseReservation(key).catch((error) => {
        console.error(
          "Failed to release unsuccessful order submission reservation:",
          error instanceof Error ? error.name : typeof error
        );
      });
    }
  });

  next();
};
