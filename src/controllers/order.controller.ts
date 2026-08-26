import { Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import {
  Prisma,
  OrderStatus,
  OrderPriority,
  PaymentMethod,
  UserRole
} from "@prisma/client";
import { messaging } from "../config/firebase";
import { prisma } from "../lib/prisma";
import { signCustomerLoyaltyToken } from "../utils/jwt";
import { isBusinessConfirmedClosed } from "./business.controller";
import {
  getDriverFreshnessCutoff,
  isDriverLocationFresh
} from "../utils/driverFreshness";

/* ================= TYPES ================= */

type IdParams = {
  id: string;
};

type TrackingTokenParams = {
  token: string;
};

type UpdateStatusBody = {
  orderStatus: OrderStatus;
  cancellationReason?: string;
};

type UpdatePriorityBody = {
  priority: OrderPriority;
};

type AutoDispatchSettingsBody = {
  enabled: boolean;
};

type CreateOrderItemInput = {
  name: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
};

type UpdateOrderItemInput = {
  name: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  price?: number;
};

type UpdateOrderDetailsBody = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  additionalNotes?: string | null;
  paymentMethod: PaymentMethod;
  items: UpdateOrderItemInput[];
};

type DriverPushCandidate = {
  isOnline: boolean;
  driverFcmToken: string | null;
  driverAppState: string | null;
};

type DriverAssignedOrderPushPayload = {
  driverFcmToken: string;
  orderNumber: number;
  customerName: string;
  addressLine1: string;
  city?: string | null;
};

type PickupRoutingSummary = {
  requiredPickupTypes: string[];
  unknownItemCount: number;
};

/* ================= HELPERS ================= */

const orderInclude = {
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

const publicTrackingOrderInclude = {
  digitalReceipt: {
    select: {
      grandTotal: true
    }
  },
  assignedDriver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      latitude: true,
      longitude: true,
      lastSeenAt: true,
      locationUpdatedAt: true
    }
  }
} satisfies Prisma.OrderInclude;

type PublicTrackingOrder = Prisma.OrderGetPayload<{
  include: typeof publicTrackingOrderInclude;
}>;

const TRACKING_TOKEN_LIFETIME_MS = 48 * 60 * 60 * 1000;

const createTrackingCredential = (): {
  token: string;
  hash: string;
  expiresAt: Date;
} => {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    hash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + TRACKING_TOKEN_LIFETIME_MS)
  };
};

const normalize = (value: string) => value.trim().toLowerCase();

const normalizePhone = (value: string) => value.replace(/\D/g, "");

const normalizePickupType = (
  value: string | null | undefined
): string => {
  const normalizedValue = String(value || "UNKNOWN").trim().toUpperCase();

  return normalizedValue || "UNKNOWN";
};

const summarizePickupRouting = (
  pickupTypes: Array<string | null | undefined>
): PickupRoutingSummary => {
  const requiredPickupTypes = new Set<string>();
  let unknownItemCount = 0;

  for (const pickupTypeValue of pickupTypes) {
    const pickupType = normalizePickupType(pickupTypeValue);

    if (pickupType === "UNKNOWN") {
      unknownItemCount += 1;
      continue;
    }

    requiredPickupTypes.add(pickupType);
  }

  return {
    requiredPickupTypes: Array.from(requiredPickupTypes).sort((a, b) =>
      a.localeCompare(b)
    ),
    unknownItemCount
  };
};

const logPickupRoutingAdvisory = (
  orderId: string,
  pickupRouting: PickupRoutingSummary
): void => {
  const requiredTypesText =
    pickupRouting.requiredPickupTypes.length > 0
      ? pickupRouting.requiredPickupTypes.join(", ")
      : "NONE";

  console.log(
    `[Pickup Routing Advisory] Order ${orderId}: required pickup types = ${requiredTypesText}; unknown item(s) = ${pickupRouting.unknownItemCount}.`
  );
};

const LOYALTY_FREE_DELIVERY_NOTE =
  "LOYALTY REWARD: Customer earned free delivery. Subtract $12 from this order and let the customer know delivery is free.";

const LOYALTY_TIME_ZONE = "America/Toronto";

const getCurrentLoyaltyMonth = (date: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LOYALTY_TIME_ZONE,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) {
    throw new Error("Unable to determine the current loyalty calendar month.");
  }

  return `${year}-${month}`;
};

const getItemPrice = (item: UpdateOrderItemInput): number => {
  return item.unitPrice ?? item.price ?? 0;
};

const expandCreateOrderItems = (
  items: CreateOrderItemInput[]
): CreateOrderItemInput[] => {
  const expandedItems: CreateOrderItemInput[] = [];

  for (const item of items) {
    if (!item.name || typeof item.name !== "string") continue;

    const splitNames = item.name
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    if (splitNames.length === 0) continue;

    for (const name of splitNames) {
      expandedItems.push({
        name,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice ?? 0,
        totalPrice: item.totalPrice ?? 0
      });
    }
  }

  return expandedItems;
};

const hasAppFcmToken = (fcmToken: string | null | undefined): boolean => {
  return typeof fcmToken === "string" && fcmToken.trim().length > 0;
};

const receiptTotalToNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue) || numberValue <= 0) {
    return null;
  }

  return Number(numberValue.toFixed(2));
};

const receiptTotalToCurrencyText = (value: unknown): string | null => {
  const numberValue = receiptTotalToNumber(value);

  if (numberValue === null) {
    return null;
  }

  return `$${numberValue.toFixed(2)}`;
};

const shouldSendDriverPush = (driver: DriverPushCandidate): boolean => {
  if (!driver.isOnline) return false;
  if (!driver.driverFcmToken) return false;

  return driver.driverAppState !== "FOREGROUND";
};

const sendDriverAssignedOrderPush = async (
  driverFcmToken: string,
  orderNumber: number,
  customerName: string,
  addressLine1: string,
  city?: string | null
): Promise<void> => {
  const address = [addressLine1, city].filter(Boolean).join(", ");

  try {
    await messaging.send({
      token: driverFcmToken,
      notification: {
        title: "New Speedy Sweeties Order",
        body: `Order #${orderNumber} assigned to you. ${customerName} - ${address}`
      },
      data: {
        type: "DRIVER_ORDER_ASSIGNED",
        orderNumber: String(orderNumber)
      },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_driver_orders",
          sound: "default"
        }
      }
    });

    console.log("Driver assigned order push sent");
  } catch (error) {
    console.error("Failed to send driver assigned order push:", error instanceof Error ? error.name : typeof error);
  }
};

const sendCustomerOutForDeliveryNotification = async (
  fcmToken: string | null,
  orderNumber?: number | null,
  receiptTotal?: unknown
): Promise<void> => {
  if (!fcmToken) {
    console.log("No customer FCM token found for this order");
    return;
  }

  const receiptTotalText = receiptTotalToCurrencyText(receiptTotal);

  const body = orderNumber
    ? receiptTotalText
      ? `Order #${orderNumber} is now out for delivery. Total: ${receiptTotalText}.`
      : `Order #${orderNumber} is now out for delivery.`
    : receiptTotalText
      ? `Your order is now out for delivery. Total: ${receiptTotalText}.`
      : "Your order is now out for delivery.";

  try {
    await messaging.send({
      token: fcmToken,
      notification: {
        title: "Speedy Sweeties",
        body
      },
      data: {
        type: "ORDER_STATUS_UPDATE",
        status: OrderStatus.OUT_FOR_DELIVERY,
        ...(receiptTotalText ? { receiptTotal: receiptTotalText } : {})
      },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_orders",
          sound: "default"
        }
      }
    });

    console.log("Customer OUT_FOR_DELIVERY notification sent");
  } catch (error) {
    console.error("Failed to send customer OUT_FOR_DELIVERY notification:", error instanceof Error ? error.name : typeof error);
  }
};

const sendCustomerRewardEarnedNotification = async (
  fcmToken: string | null
): Promise<void> => {
  if (!fcmToken) {
    console.log("No customer FCM token found for loyalty reward notification");
    return;
  }

  try {
    await messaging.send({
      token: fcmToken,
      notification: {
        title: "Speedy Sweeties 🎉",
        body: "You earned a free delivery on your next order!"
      },
      data: {
        type: "LOYALTY_REWARD_EARNED"
      },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_orders",
          sound: "default"
        }
      }
    });

    console.log("Customer loyalty reward notification sent");
  } catch (error) {
    console.error("Failed to send loyalty reward notification:", error instanceof Error ? error.name : typeof error);
  }
};

const sendCustomerRewardAppliedNotification = async (
  fcmToken: string | null
): Promise<void> => {
  if (!fcmToken) {
    console.log("No customer FCM token found for loyalty reward applied notification");
    return;
  }

  try {
    await messaging.send({
      token: fcmToken,
      notification: {
        title: "Speedy Sweeties 🎉",
        body: "Your free delivery reward has been applied to this order."
      },
      data: {
        type: "LOYALTY_REWARD_APPLIED"
      },
      android: {
        priority: "high",
        notification: {
          channelId: "speedy_sweeties_orders",
          sound: "default"
        }
      }
    });

    console.log("Customer loyalty reward applied notification sent");
  } catch (error) {
    console.error("Failed to send loyalty reward applied notification:", error instanceof Error ? error.name : typeof error);
  }
};

const applyCustomerLoyaltyForDeliveredOrder = async (
  customerId: string | null,
  fcmToken: string | null
): Promise<void> => {
  if (!customerId) {
    console.log("No customerId found for delivered order. Loyalty not updated.");
    return;
  }

  const currentLoyaltyMonth = getCurrentLoyaltyMonth();

  const loyaltyResult = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        loyaltyCompletedOrders: true,
        loyaltyProgressMonth: true,
        loyaltyRewardsEarned: true,
        loyaltyFreeDelivery: true
      }
    });

    if (!customer) {
      return null;
    }

    const completedOrdersThisMonth =
      customer.loyaltyProgressMonth === currentLoyaltyMonth
        ? customer.loyaltyCompletedOrders
        : 0;

    const nextCompletedOrders = completedOrdersThisMonth + 1;

    if (nextCompletedOrders >= 10) {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          loyaltyCompletedOrders: 0,
          loyaltyProgressMonth: currentLoyaltyMonth,
          loyaltyRewardsEarned: {
            increment: 1
          },
          loyaltyFreeDelivery: true
        }
      });

      return {
        rewardEarned: true,
        completedOrders: 0
      };
    }

    await tx.customer.update({
      where: { id: customerId },
      data: {
        loyaltyCompletedOrders: nextCompletedOrders,
        loyaltyProgressMonth: currentLoyaltyMonth
      }
    });

    return {
      rewardEarned: false,
      completedOrders: nextCompletedOrders
    };
  });

  if (!loyaltyResult) {
    console.log("Customer not found. Loyalty not updated.");
    return;
  }

  if (loyaltyResult.rewardEarned) {
    await sendCustomerRewardEarnedNotification(fcmToken);

    console.log("Customer earned a free delivery reward.");
    return;
  }

  console.log(
    `Customer loyalty updated: ${loyaltyResult.completedOrders}/10 completed deliveries for ${currentLoyaltyMonth}.`
  );
};

/* ================= AUTO DISPATCH ================= */

const AUTO_DISPATCH_SETTING_KEY = "autoDispatchEnabled";

const AUTO_DISPATCH_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.DISPATCHED,
  OrderStatus.ACCEPTED,
  OrderStatus.OUT_FOR_DELIVERY
];

const isAutoDispatchHardDisabledByEnv = (): boolean => {
  const value = process.env.AUTO_DISPATCH_ENABLED;

  if (!value) {
    return false;
  }

  return ["false", "0", "off", "no"].includes(value.trim().toLowerCase());
};

const settingValueToBoolean = (value: string | null | undefined): boolean => {
  if (!value) {
    return true;
  }

  return value.trim().toLowerCase() !== "false";
};

const getAutoDispatchEnabledForTransaction = async (
  tx: Prisma.TransactionClient
): Promise<boolean> => {
  if (isAutoDispatchHardDisabledByEnv()) {
    return false;
  }

  const setting = await tx.systemSetting.findUnique({
    where: { key: AUTO_DISPATCH_SETTING_KEY },
    select: { value: true }
  });

  return settingValueToBoolean(setting?.value);
};

const getAutoDispatchEnabled = async (): Promise<boolean> => {
  if (isAutoDispatchHardDisabledByEnv()) {
    return false;
  }

  const setting = await prisma.systemSetting.findUnique({
    where: { key: AUTO_DISPATCH_SETTING_KEY },
    select: { value: true }
  });

  return settingValueToBoolean(setting?.value);
};

const saveAutoDispatchEnabled = async (enabled: boolean): Promise<boolean> => {
  await prisma.systemSetting.upsert({
    where: { key: AUTO_DISPATCH_SETTING_KEY },
    update: { value: enabled ? "true" : "false" },
    create: {
      key: AUTO_DISPATCH_SETTING_KEY,
      value: enabled ? "true" : "false"
    }
  });

  return getAutoDispatchEnabled();
};

const autoAssignCreatedOrderToLeastBusyOnlineDriver = async (
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<DriverAssignedOrderPushPayload | null> => {
  const autoDispatchEnabled = await getAutoDispatchEnabledForTransaction(tx);

  if (!autoDispatchEnabled) {
    console.log("Auto-dispatch skipped: auto-dispatch is turned off.");
    return null;
  }

  const freshnessCutoff = getDriverFreshnessCutoff();

  const onlineDrivers = await tx.user.findMany({
    where: {
      role: UserRole.DRIVER,
      isActive: true,
      isVisibleInDispatch: true,
      isOnline: true,
      lastSeenAt: {
        gte: freshnessCutoff
      }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      isOnline: true,
      driverFcmToken: true,
      driverAppState: true
    },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "asc" }]
  });

  if (onlineDrivers.length === 0) {
    console.log("Auto-dispatch skipped: no online drivers.");
    return null;
  }

  const driverWorkloads = await Promise.all(
    onlineDrivers.map(async (driver) => {
      const activeOrderCount = await tx.order.count({
        where: {
          assignedDriverId: driver.id,
          orderStatus: {
            in: AUTO_DISPATCH_ACTIVE_STATUSES
          }
        }
      });

      return {
        driver,
        activeOrderCount
      };
    })
  );

  driverWorkloads.sort((a, b) => {
    if (a.activeOrderCount !== b.activeOrderCount) {
      return a.activeOrderCount - b.activeOrderCount;
    }

    const aName = `${a.driver.firstName ?? ""} ${a.driver.lastName ?? ""}`.trim();
    const bName = `${b.driver.firstName ?? ""} ${b.driver.lastName ?? ""}`.trim();

    return aName.localeCompare(bName);
  });

  const selected = driverWorkloads[0];

  if (!selected) {
    console.log("Auto-dispatch skipped: no selected driver.");
    return null;
  }

  const now = new Date();

  const updatedOrder = await tx.order.update({
    where: { id: orderId },
    data: {
      assignedDriverId: selected.driver.id,
      assignedAt: now,
      dispatchedAt: now,
      orderStatus: OrderStatus.DISPATCHED
    },
    select: {
      orderNumber: true,
      customerName: true,
      addressLine1: true,
      city: true
    }
  });

  console.log(
    `Auto-dispatch selected an online driver with ${selected.activeOrderCount} active order(s).`
  );

  if (shouldSendDriverPush(selected.driver) && selected.driver.driverFcmToken) {
    return {
      driverFcmToken: selected.driver.driverFcmToken,
      orderNumber: updatedOrder.orderNumber,
      customerName: updatedOrder.customerName,
      addressLine1: updatedOrder.addressLine1,
      city: updatedOrder.city
    };
  }

  console.log(
    "Auto-dispatch driver push skipped: driver has no token, is offline, or app is foregrounded."
  );

  return null;
};

/* ================= CONTROLLERS ================= */

export const getAutoDispatchSettingsController = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const enabled = await getAutoDispatchEnabled();

  res.status(200).json({
    success: true,
    routeVersion: "orders-settings-auto-dispatch-v2",
    enabled,
    autoDispatchEnabled: enabled,
    autoDispatch: {
      enabled
    }
  });
};

export const updateAutoDispatchSettingsController = async (
  req: Request<{}, {}, AutoDispatchSettingsBody>,
  res: Response
): Promise<void> => {
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    res.status(400).json({
      success: false,
      message: "enabled must be true or false"
    });
    return;
  }

  const finalEnabled = await saveAutoDispatchEnabled(enabled);

  res.status(200).json({
    success: true,
    routeVersion: "orders-settings-auto-dispatch-v2",
    message: finalEnabled
      ? "Auto-dispatch is now turned on"
      : "Auto-dispatch is now turned off",
    enabled: finalEnabled,
    autoDispatchEnabled: finalEnabled,
    autoDispatch: {
      enabled: finalEnabled
    }
  });
};

export const createOrderController = async (
  req: Request,
  res: Response
) => {
  if (await isBusinessConfirmedClosed()) {
    res.status(409).json({
      success: false,
      message: "Ordering is currently unavailable while Speedy Sweeties is closed."
    });
    return;
  }

  const {
    customerName,
    customerPhone,
    customerEmail,
    addressLine1,
    city,
    province,
    postalCode,
    items,
    paymentMethod,
    additionalNotes,
    deliveryInstructions,
    notes,
    dispatcherNotes,
    fcmToken
  } = req.body;

  const appFcmToken = hasAppFcmToken(fcmToken) ? String(fcmToken).trim() : null;

  const baseNotes = [additionalNotes, deliveryInstructions, notes]
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter(Boolean);

  const normalizedEmail = customerEmail ? normalize(customerEmail) : null;
  const normalizedPhone = normalizePhone(customerPhone);
  const normalizedName = normalize(customerName);

  const incomingItems: CreateOrderItemInput[] = Array.isArray(items) ? items : [];
  const rawItems: CreateOrderItemInput[] = expandCreateOrderItems(incomingItems);

  let customer = await prisma.customer.findFirst({
    where: {
      OR: [{ normalizedPhone }, ...(normalizedEmail ? [{ normalizedEmail }] : [])]
    }
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        fullName: customerName.trim(),
        normalizedFullName: normalizedName,
        phone: customerPhone.trim(),
        normalizedPhone,
        email: normalizedEmail,
        normalizedEmail,
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim().toUpperCase(),
        loyaltyProgressMonth: getCurrentLoyaltyMonth(),
        dispatcherNotes:
          typeof dispatcherNotes === "string" ? dispatcherNotes.trim() : null
      }
    });
  }

  const shouldApplyFreeDeliveryReward = customer.loyaltyFreeDelivery === true;

  const finalNotes = shouldApplyFreeDeliveryReward
    ? [...baseNotes, LOYALTY_FREE_DELIVERY_NOTE].join(" | ")
    : baseNotes.join(" | ");

  const transactionResult = await prisma.$transaction(async (tx) => {
    if (shouldApplyFreeDeliveryReward) {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          loyaltyFreeDelivery: false,
          loyaltyRewardsUsed: {
            increment: 1
          }
        }
      });
    }

    const trackingCredential = createTrackingCredential();

    const createdOrder = await tx.order.create({
      data: {
        customerId: customer.id,
        customerName: customerName.trim(),
        phone: customerPhone.trim(),
        email: customerEmail.trim().toLowerCase(),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim().toUpperCase(),
        itemsText: rawItems.map((i) => `${i.quantity}x ${i.name}`).join(", "),
        additionalNotes: finalNotes || null,
        paymentMethod,
        orderStatus: OrderStatus.PLACED,
        priority: OrderPriority.NORMAL,
        fcmToken: appFcmToken,
        trackingTokenHash: trackingCredential.hash,
        trackingTokenExpiresAt: trackingCredential.expiresAt
      }
    });

    const orderItemPickupTypes: Array<string | null | undefined> = [];

    for (const item of rawItems) {
      if (!item.name) continue;

      const cleanedItemName = item.name.trim();
      const normalizedItemName = normalize(cleanedItemName);

      let catalogItem = await tx.itemCatalog.findFirst({
        where: { normalizedName: normalizedItemName }
      });

      if (!catalogItem) {
        catalogItem = await tx.itemCatalog.create({
          data: {
            name: cleanedItemName,
            normalizedName: normalizedItemName
          }
        });
      }

      orderItemPickupTypes.push(catalogItem.pickupType);

      await tx.orderItem.create({
        data: {
          orderId: createdOrder.id,
          itemCatalogId: catalogItem.id,
          name: cleanedItemName,
          quantity: item.quantity || 1,
          price: item.unitPrice ?? 0
        }
      });
    }

    const pickupRouting = summarizePickupRouting(orderItemPickupTypes);
    logPickupRoutingAdvisory(createdOrder.id, pickupRouting);

    const autoDispatchNotification =
      await autoAssignCreatedOrderToLeastBusyOnlineDriver(tx, createdOrder.id);

    const order = await tx.order.findUniqueOrThrow({
      where: { id: createdOrder.id },
      include: orderInclude
    });

    return {
      order,
      autoDispatchNotification,
      trackingToken: trackingCredential.token
    };
  });

  const { order, autoDispatchNotification, trackingToken } = transactionResult;
  const loyaltyAccessToken = signCustomerLoyaltyToken(customer.id);
  const {
    trackingTokenHash: _trackingTokenHash,
    trackingTokenExpiresAt: _trackingTokenExpiresAt,
    ...orderResponse
  } = order;

  if (autoDispatchNotification) {
    await sendDriverAssignedOrderPush(
      autoDispatchNotification.driverFcmToken,
      autoDispatchNotification.orderNumber,
      autoDispatchNotification.customerName,
      autoDispatchNotification.addressLine1,
      autoDispatchNotification.city
    );
  }

  if (shouldApplyFreeDeliveryReward) {
    await sendCustomerRewardAppliedNotification(appFcmToken);
  }

  res.status(201).json({
    success: true,
    message: "Order created successfully",
    order: orderResponse,
    trackingToken,
    loyaltyAccessToken
  });
};

export const getOrderByIdController = async (
  req: Request<IdParams>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: orderInclude
  });

  if (!order) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  res.status(200).json({
    success: true,
    order
  });
};

export const updateOrderDetailsController = async (
  req: Request<IdParams, {}, UpdateOrderDetailsBody>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const {
    customerName,
    customerPhone,
    customerEmail,
    addressLine1,
    city,
    province,
    postalCode,
    additionalNotes,
    paymentMethod,
    items
  } = req.body;

  const existingOrder = await prisma.order.findUnique({
    where: { id },
    include: { items: true }
  });

  if (!existingOrder) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  if (
    existingOrder.orderStatus === OrderStatus.DELIVERED ||
    existingOrder.orderStatus === OrderStatus.CANCELLED
  ) {
    res.status(400).json({
      success: false,
      message: "Delivered or cancelled orders cannot be edited"
    });
    return;
  }

  const normalizedEmail = customerEmail ? normalize(customerEmail) : null;
  const normalizedPhone = normalizePhone(customerPhone);
  const normalizedName = normalize(customerName);

  const updatedOrder = await prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({
      where: {
        OR: [{ normalizedPhone }, ...(normalizedEmail ? [{ normalizedEmail }] : [])]
      }
    });

    if (!customer) {
      customer = await tx.customer.create({
        data: {
          fullName: customerName.trim(),
          normalizedFullName: normalizedName,
          phone: customerPhone.trim(),
          normalizedPhone,
          email: normalizedEmail,
          normalizedEmail,
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          province: province.trim(),
          postalCode: postalCode.trim().toUpperCase(),
          loyaltyProgressMonth: getCurrentLoyaltyMonth()
        }
      });
    } else {
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          fullName: customerName.trim(),
          normalizedFullName: normalizedName,
          phone: customerPhone.trim(),
          normalizedPhone,
          email: normalizedEmail,
          normalizedEmail,
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          province: province.trim(),
          postalCode: postalCode.trim().toUpperCase()
        }
      });
    }

    await tx.orderItem.deleteMany({
      where: { orderId: id }
    });

    const orderItemPickupTypes: Array<string | null | undefined> = [];

    for (const item of items) {
      if (!item.name) continue;

      const normalizedItemName = normalize(item.name);

      let catalogItem = await tx.itemCatalog.findFirst({
        where: { normalizedName: normalizedItemName }
      });

      if (!catalogItem) {
        catalogItem = await tx.itemCatalog.create({
          data: {
            name: item.name.trim(),
            normalizedName: normalizedItemName
          }
        });
      }

      orderItemPickupTypes.push(catalogItem.pickupType);

      await tx.orderItem.create({
        data: {
          orderId: id,
          itemCatalogId: catalogItem.id,
          name: item.name.trim(),
          quantity: item.quantity || 1,
          price: getItemPrice(item)
        }
      });
    }

    const pickupRouting = summarizePickupRouting(orderItemPickupTypes);
    logPickupRoutingAdvisory(id, pickupRouting);

    await tx.order.update({
      where: { id },
      data: {
        customerId: customer.id,
        customerName: customerName.trim(),
        phone: customerPhone.trim(),
        email: customerEmail.trim().toLowerCase(),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim().toUpperCase(),
        itemsText: items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
        additionalNotes:
          typeof additionalNotes === "string" && additionalNotes.trim()
            ? additionalNotes.trim()
            : null,
        paymentMethod
      }
    });

    return tx.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude
    });
  });

  res.status(200).json({
    success: true,
    message: "Order updated successfully",
    order: updatedOrder
  });
};

export const updateOrderStatusController = async (
  req: Request<IdParams, {}, UpdateStatusBody>,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { orderStatus, cancellationReason } = req.body;
  const authUser = (req as any).user;

  const existingOrder = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderStatus: true,
      fcmToken: true,
      orderNumber: true,
      customerId: true,
      assignedDriverId: true,
      assignedAt: true,
      dispatchedAt: true,
      acceptedAt: true,
      outForDeliveryAt: true,
      deliveredAt: true,
      digitalReceipt: {
        select: {
          grandTotal: true
        }
      }
    }
  });

  if (!existingOrder) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    });
    return;
  }

  if (
    authUser?.role === UserRole.DRIVER &&
    existingOrder.assignedDriverId !== authUser.userId
  ) {
    res.status(403).json({
      success: false,
      message: "Forbidden"
    });
    return;
  }

  if (
    orderStatus === OrderStatus.CANCELLED &&
    existingOrder.orderStatus === OrderStatus.DELIVERED
  ) {
    res.status(400).json({
      success: false,
      message: "Delivered orders cannot be cancelled"
    });
    return;
  }

  if (
    orderStatus === OrderStatus.CANCELLED &&
    existingOrder.orderStatus === OrderStatus.CANCELLED
  ) {
    res.status(400).json({
      success: false,
      message: "Order is already cancelled"
    });
    return;
  }

  const now = new Date();

  const cleanedCancellationReason =
    typeof cancellationReason === "string" && cancellationReason.trim()
      ? cancellationReason.trim()
      : null;

  const statusTimestampData: Prisma.OrderUpdateInput = {};

  if (orderStatus === OrderStatus.DISPATCHED) {
    statusTimestampData.dispatchedAt = existingOrder.dispatchedAt ?? now;
  }

  if (orderStatus === OrderStatus.ACCEPTED) {
    statusTimestampData.dispatchedAt =
      existingOrder.dispatchedAt ?? existingOrder.assignedAt ?? now;
    statusTimestampData.acceptedAt = existingOrder.acceptedAt ?? now;
  }

  if (orderStatus === OrderStatus.OUT_FOR_DELIVERY) {
    statusTimestampData.dispatchedAt =
      existingOrder.dispatchedAt ?? existingOrder.assignedAt ?? now;
    statusTimestampData.acceptedAt = existingOrder.acceptedAt ?? now;
    statusTimestampData.outForDeliveryAt = existingOrder.outForDeliveryAt ?? now;
  }

  if (orderStatus === OrderStatus.DELIVERED) {
    statusTimestampData.dispatchedAt =
      existingOrder.dispatchedAt ?? existingOrder.assignedAt ?? now;
    statusTimestampData.acceptedAt = existingOrder.acceptedAt ?? now;
    statusTimestampData.outForDeliveryAt = existingOrder.outForDeliveryAt ?? now;
    statusTimestampData.deliveredAt = existingOrder.deliveredAt ?? now;
  }

  const updateData: Prisma.OrderUpdateInput =
    orderStatus === OrderStatus.CANCELLED
      ? {
          orderStatus: OrderStatus.CANCELLED,
          cancelledAt: now,
          cancelledFromStatus: existingOrder.orderStatus,
          cancellationReason: cleanedCancellationReason
        }
      : {
          orderStatus,
          ...statusTimestampData
        };

  const isNewOutForDeliveryTransition =
    orderStatus === OrderStatus.OUT_FOR_DELIVERY &&
    existingOrder.orderStatus !== OrderStatus.OUT_FOR_DELIVERY;

  const isNewDeliveryTransition =
    orderStatus === OrderStatus.DELIVERED &&
    existingOrder.orderStatus !== OrderStatus.DELIVERED;

  const transitionUpdate = await prisma.order.updateMany({
    where: {
      id,
      orderStatus: existingOrder.orderStatus
    },
    data: updateData
  });

  if (transitionUpdate.count === 0) {
    const currentOrder = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude
    });

    if (
      orderStatus !== OrderStatus.CANCELLED &&
      currentOrder.orderStatus === orderStatus
    ) {
      res.status(200).json({
        success: true,
        message: "Order status updated successfully",
        order: currentOrder
      });
      return;
    }

    if (
      orderStatus === OrderStatus.CANCELLED &&
      currentOrder.orderStatus === OrderStatus.DELIVERED
    ) {
      res.status(400).json({
        success: false,
        message: "Delivered orders cannot be cancelled"
      });
      return;
    }

    if (
      orderStatus === OrderStatus.CANCELLED &&
      currentOrder.orderStatus === OrderStatus.CANCELLED
    ) {
      res.status(400).json({
        success: false,
        message: "Order is already cancelled"
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: "Order status cannot be updated from its current status"
    });
    return;
  }

  const updatedOrder = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: orderInclude
  });

  const shouldNotifyCustomer =
    isNewOutForDeliveryTransition && transitionUpdate?.count === 1;

  if (shouldNotifyCustomer) {
    await sendCustomerOutForDeliveryNotification(
      existingOrder.fcmToken,
      existingOrder.orderNumber,
      existingOrder.digitalReceipt?.grandTotal ?? null
    );
  }

  const shouldApplyLoyalty =
    isNewDeliveryTransition && transitionUpdate?.count === 1;

  if (shouldApplyLoyalty) {
    await applyCustomerLoyaltyForDeliveredOrder(
      existingOrder.customerId,
      existingOrder.fcmToken
    );
  }

  res.status(200).json({
    success: true,
    message:
      orderStatus === OrderStatus.CANCELLED
        ? "Order cancelled successfully"
        : "Order status updated successfully",
    order: updatedOrder
  });
};

export const updateOrderPriorityController = async (
  req: Request<IdParams, {}, UpdatePriorityBody>,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { priority } = req.body;

  if (priority !== OrderPriority.NORMAL && priority !== OrderPriority.HIGH) {
    res.status(400).json({
      success: false,
      message: "Invalid priority"
    });
    return;
  }

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: { priority },
    include: orderInclude
  });

  res.status(200).json({
    success: true,
    message: "Order priority updated successfully",
    order: updatedOrder
  });
};

const sendPublicOrderTrackingResponse = (
  order: PublicTrackingOrder,
  res: Response
): void => {
  const driver = order.assignedDriver;
  const hasFreshLocation =
    order.orderStatus === OrderStatus.OUT_FOR_DELIVERY &&
    driver !== null &&
    isDriverLocationFresh(driver.lastSeenAt, driver.locationUpdatedAt);

  res.status(200).json({
    success: true,
    data: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      receiptTotal: receiptTotalToNumber(order.digitalReceipt?.grandTotal ?? null),
      driver: driver
        ? {
            name: `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim(),
            latitude: hasFreshLocation ? driver.latitude ?? null : null,
            longitude: hasFreshLocation ? driver.longitude ?? null : null,
            lastUpdated: hasFreshLocation ? driver.locationUpdatedAt ?? null : null
          }
        : null
    }
  });
};

const sendPublicTrackingNotFound = (res: Response): void => {
  res.status(404).json({
    success: false,
    message: "Order not found"
  });
};

export const getPublicOrderTrackingController = async (
  req: Request<IdParams>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: publicTrackingOrderInclude
    });

    if (!order) {
      sendPublicTrackingNotFound(res);
      return;
    }

    sendPublicOrderTrackingResponse(order, res);
  } catch (error) {
    console.error("Tracking error:", error instanceof Error ? error.name : typeof error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tracking info"
    });
  }
};

export const getPublicOrderTrackingByTokenController = async (
  req: Request<TrackingTokenParams>,
  res: Response
): Promise<void> => {
  const tokenHash = createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  try {
    const order = await prisma.order.findFirst({
      where: {
        trackingTokenHash: tokenHash,
        trackingTokenExpiresAt: {
          gt: new Date()
        }
      },
      include: publicTrackingOrderInclude
    });

    if (!order) {
      sendPublicTrackingNotFound(res);
      return;
    }

    sendPublicOrderTrackingResponse(order, res);
  } catch (error) {
    console.error("Tracking token error:", error instanceof Error ? error.name : typeof error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tracking info"
    });
  }
};
