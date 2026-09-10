import { Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import {
  Prisma,
  OrderSource,
  OrderStatus,
  OrderPriority,
  PaymentMethod,
  UserRole
} from "@prisma/client";
import { messaging } from "../config/firebase";
import { normalizePickupTypeOrUnknown } from "../constants/pickupTypes";
import { prisma } from "../lib/prisma";
import { signCustomerLoyaltyToken } from "../utils/jwt";
import { isBusinessConfirmedClosed } from "./business.controller";
import {
  isDriverLocationFresh
} from "../utils/driverFreshness";
import {
  createDeliveryAddressFingerprint,
  DeliveryAddressInput,
  DeliveryAddressValidationError,
  DeliveryLocationData,
  geocodeDeliveryAddress
} from "../services/deliveryGeocoding.service";
import {
  combineOrderNotes,
  persistSubmittedRecurringDriverNotes,
  resolveRecurringDriverNotes
} from "../services/recurringDriverNotes.service";
import {
  getCurrentLoyaltyMonth,
  redeemFreeDeliveryRewardForOrder,
  sendCustomerLoyaltyNotification
} from "../services/loyalty.service";
import { getFirstDispatchAttribution } from "../utils/dispatchAttribution";
import { resolveOrderSourceAttribution } from "../utils/orderSourceAttribution";
import {
  autoDispatchCreatedOrderWithPickupPlan,
  shouldNotifyAutoDispatchedDriver
} from "../services/autoDispatchPickupPlan.service";
import {
  evaluateOrderStatusTransition,
  INITIAL_ORDER_STATUS
} from "../services/orderStateTransition.service";
import {
  CompatiblePaymentMethod,
  normalizePaymentMethod
} from "../utils/paymentMethod";
import { buildCustomerLookupWhere } from "../utils/customerIdentity";

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
  additionalNotes?: string | null;
  paymentMethod: CompatiblePaymentMethod;
  items: UpdateOrderItemInput[];
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
  },
  dispatchedBy: {
    select: {
      firstName: true,
      lastName: true
    }
  },
  pickupStops: {
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      pickupType: true,
      sequence: true,
      plannedForDriverId: true,
      selectionSource: true,
      storeName: true,
      addressLine1: true,
      city: true,
      province: true,
      latitude: true,
      longitude: true,
      etaSeconds: true,
      distanceMeters: true,
      projectedArrivalAt: true,
      hoursSource: true,
      closingDate: true,
      closingTime: true,
      closingBufferMinutes: true
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

const summarizePickupRouting = (
  pickupTypes: Array<string | null | undefined>
): PickupRoutingSummary => {
  const requiredPickupTypes = new Set<string>();
  let unknownItemCount = 0;

  for (const pickupTypeValue of pickupTypes) {
    const pickupType = normalizePickupTypeOrUnknown(pickupTypeValue);

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

const sendDriverAssignedOrderPush = async (
  driverFcmToken: string,
  orderNumber: number,
  customerName: string,
  addressLine1: string,
  city?: string | null,
  pickupSummary?: string | null
): Promise<void> => {
  const address = [addressLine1, city].filter(Boolean).join(", ");

  try {
    await messaging.send({
      token: driverFcmToken,
      notification: {
        title: "New Speedy Sweeties Order",
        body: pickupSummary
          ? `Order #${orderNumber} assigned. Pickup: ${pickupSummary}. ${customerName} - ${address}`
          : `Order #${orderNumber} assigned to you. ${customerName} - ${address}`
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

/* ================= AUTO DISPATCH ================= */

const AUTO_DISPATCH_SETTING_KEY = "autoDispatchEnabled";

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

type CreateOrderOptions = {
  bypassBusinessHours: boolean;
  acceptRecurringDriverNotes: boolean;
  orderSourceOverride?: OrderSource;
};

const normalizeAttributionValue = (
  value: unknown,
  lowercase = false
): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return lowercase ? cleaned.toLowerCase() : cleaned;
};

const sendDeliveryAddressValidationError = (
  error: unknown,
  res: Response
): boolean => {
  if (!(error instanceof DeliveryAddressValidationError)) return false;

  res.status(400).json({
    success: false,
    code: error.code,
    message: error.message
  });
  return true;
};

const createOrder = async (
  req: Request,
  res: Response,
  options: CreateOrderOptions
): Promise<void> => {
  if (
    !options.bypassBusinessHours &&
    (await isBusinessConfirmedClosed())
  ) {
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
    items,
    paymentMethod,
    additionalNotes,
    deliveryInstructions,
    notes,
    dispatcherNotes,
    recurringDriverNotes,
    fcmToken,
    orderSource,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    referralCode
  } = req.body;

  const recurringDriverNotesSubmitted =
    options.acceptRecurringDriverNotes &&
    Object.prototype.hasOwnProperty.call(req.body, "recurringDriverNotes");

  const appFcmToken = hasAppFcmToken(fcmToken) ? String(fcmToken).trim() : null;

  const deliveryAddress: DeliveryAddressInput = {
    addressLine1,
    city,
    province
  };
  let deliveryLocation: DeliveryLocationData;

  try {
    deliveryLocation = await geocodeDeliveryAddress(deliveryAddress);
  } catch (error) {
    if (sendDeliveryAddressValidationError(error, res)) return;
    throw error;
  }

  const normalizedEmail = customerEmail ? normalize(customerEmail) : null;
  const normalizedPhone = normalizePhone(customerPhone);
  const normalizedName = normalize(customerName);
  const orderAddressSnapshot = {
    addressLine1: addressLine1.trim(),
    city: city.trim(),
    province: province.trim()
  };

  const incomingItems: CreateOrderItemInput[] = Array.isArray(items) ? items : [];
  const rawItems: CreateOrderItemInput[] = expandCreateOrderItems(incomingItems);

  const matchedCustomer = await prisma.customer.findFirst({
    where: buildCustomerLookupWhere({ normalizedPhone, normalizedEmail }),
    select: { id: true }
  });

  const transactionResult = await prisma.$transaction(async (tx) => {
    const customerId =
      matchedCustomer?.id ??
      (await tx.customer.create({
        data: {
          fullName: customerName.trim(),
          normalizedFullName: normalizedName,
          phone: customerPhone.trim(),
          normalizedPhone,
          email: normalizedEmail,
          normalizedEmail,
          ...orderAddressSnapshot,
          loyaltyProgressMonth: getCurrentLoyaltyMonth(),
          dispatcherNotes:
            typeof dispatcherNotes === "string" ? dispatcherNotes.trim() : null
        }
      })).id;

    const loyaltyRedemption = await redeemFreeDeliveryRewardForOrder(tx, customerId);
    const customer = loyaltyRedemption.customer;

    if (!customer) {
      throw new Error("Customer disappeared before loyalty redemption could be completed.");
    }

    const recurringDriverNotesPlan = resolveRecurringDriverNotes({
      isManualOrder: options.acceptRecurringDriverNotes,
      submitted: recurringDriverNotesSubmitted,
      submittedValue: recurringDriverNotes,
      storedValue: customer.recurringDriverNotes
    });
    const finalNotes = combineOrderNotes(
      [
        recurringDriverNotesPlan.snapshot,
        additionalNotes,
        deliveryInstructions,
        notes,
        loyaltyRedemption.result.rewardRedeemed
          ? "LOYALTY REWARD: Customer earned free delivery. Subtract $12 from this order and let the customer know delivery is free."
          : null
      ],
      options.acceptRecurringDriverNotes
    );

    const trackingCredential = createTrackingCredential();

    const createdOrder = await tx.order.create({
      data: {
        customerId: customer.id,
        customerName: customerName.trim(),
        phone: customerPhone.trim(),
        email: customerEmail.trim().toLowerCase(),
        ...orderAddressSnapshot,
        itemsText: rawItems.map((i) => `${i.quantity}x ${i.name}`).join(", "),
        additionalNotes: finalNotes,
        paymentMethod: normalizePaymentMethod(paymentMethod),
        orderSource: resolveOrderSourceAttribution({
          requestedSource: orderSource,
          requestOrigin: req.headers?.origin,
          override: options.orderSourceOverride
        }),
        utmSource: normalizeAttributionValue(utmSource, true),
        utmMedium: normalizeAttributionValue(utmMedium, true),
        utmCampaign: normalizeAttributionValue(utmCampaign),
        utmContent: normalizeAttributionValue(utmContent),
        utmTerm: normalizeAttributionValue(utmTerm),
        referralCode: normalizeAttributionValue(referralCode, true),
        orderStatus: INITIAL_ORDER_STATUS,
        priority: OrderPriority.NORMAL,
        fcmToken: appFcmToken,
        trackingTokenHash: trackingCredential.hash,
        trackingTokenExpiresAt: trackingCredential.expiresAt,
        ...deliveryLocation
      }
    });

    await tx.customer.update({
      where: { id: customer.id },
      data: orderAddressSnapshot
    });

    await persistSubmittedRecurringDriverNotes(
      tx,
      customer.id,
      recurringDriverNotesPlan.customerUpdate
    );

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

    const order = await tx.order.findUniqueOrThrow({
      where: { id: createdOrder.id },
      include: orderInclude
    });

    return {
      order,
      trackingToken: trackingCredential.token,
      customerId: customer.id,
      loyaltyResult: loyaltyRedemption.result
    };
  });

  const { order: createdOrder, trackingToken, customerId, loyaltyResult } = transactionResult;
  const autoDispatchResult = await autoDispatchCreatedOrderWithPickupPlan(
    createdOrder.id
  );
  const order = autoDispatchResult.dispatched
    ? await prisma.order.findUniqueOrThrow({
        where: { id: createdOrder.id },
        include: orderInclude
      })
    : createdOrder;
  const loyaltyAccessToken = signCustomerLoyaltyToken(customerId);
  const {
    trackingTokenHash: _trackingTokenHash,
    trackingTokenExpiresAt: _trackingTokenExpiresAt,
    deliveryLatitude: _deliveryLatitude,
    deliveryLongitude: _deliveryLongitude,
    geocodeStatus: _geocodeStatus,
    geocodedAddress: _geocodedAddress,
    geocodePlaceId: _geocodePlaceId,
    geocodeAddressFingerprint: _geocodeAddressFingerprint,
    ...orderResponse
  } = order;

  if (shouldNotifyAutoDispatchedDriver(autoDispatchResult)) {
    await sendDriverAssignedOrderPush(
      autoDispatchResult.driverFcmToken,
      autoDispatchResult.orderNumber,
      autoDispatchResult.customerName,
      autoDispatchResult.addressLine1,
      autoDispatchResult.city,
      autoDispatchResult.pickupSummary
    );
  }

  await sendCustomerLoyaltyNotification(appFcmToken, loyaltyResult);

  res.status(201).json({
    success: true,
    message: "Order created successfully",
    order: orderResponse,
    trackingToken,
    loyaltyAccessToken
  });
};

export const createOrderController = async (
  req: Request,
  res: Response
): Promise<void> => {
  await createOrder(req, res, {
    bypassBusinessHours: false,
    acceptRecurringDriverNotes: false
  });
};

export const createManualOrderController = async (
  req: Request,
  res: Response
): Promise<void> => {
  await createOrder(req, res, {
    bypassBusinessHours: true,
    acceptRecurringDriverNotes: true,
    orderSourceOverride: OrderSource.DISPATCHER_MANUAL
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

  const nextDeliveryAddress: DeliveryAddressInput = {
    addressLine1,
    city,
    province
  };
  const existingAddressFingerprint = createDeliveryAddressFingerprint({
    addressLine1: existingOrder.addressLine1,
    city: existingOrder.city,
    province: existingOrder.province
  });
  const nextAddressFingerprint =
    createDeliveryAddressFingerprint(nextDeliveryAddress);
  const civicAddressChanged =
    existingAddressFingerprint !== nextAddressFingerprint;
  let replacementDeliveryLocation: DeliveryLocationData | null = null;

  if (civicAddressChanged) {
    try {
      replacementDeliveryLocation = await geocodeDeliveryAddress(
        nextDeliveryAddress
      );
    } catch (error) {
      if (sendDeliveryAddressValidationError(error, res)) return;
      throw error;
    }
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({
      where: buildCustomerLookupWhere({ normalizedPhone, normalizedEmail })
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
          province: province.trim()
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
        itemsText: items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
        additionalNotes:
          typeof additionalNotes === "string" && additionalNotes.trim()
            ? additionalNotes.trim()
            : null,
        paymentMethod: normalizePaymentMethod(paymentMethod),
        ...(replacementDeliveryLocation ?? {})
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

  if (
    authUser?.role !== UserRole.ADMIN &&
    authUser?.role !== UserRole.DISPATCHER
  ) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  if (orderStatus !== OrderStatus.CANCELLED) {
    res.status(409).json({
      success: false,
      code: "INVALID_ORDER_TRANSITION",
      message:
        "Operational status changes must be completed through the assigned driver workflow."
    });
    return;
  }

  const existingOrder = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderStatus: true,
      assignedDriverId: true,
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

  const cleanedCancellationReason =
    typeof cancellationReason === "string" && cancellationReason.trim()
      ? cancellationReason.trim()
      : null;
  const transition = evaluateOrderStatusTransition({
    actor: "STAFF_CANCELLATION",
    currentStatus: existingOrder.orderStatus,
    targetStatus: orderStatus
  });
  if ("code" in transition) {
    res.status(409).json({
      success: false,
      code: transition.code,
      message: transition.message
    });
    return;
  }

  const transitionUpdate = await prisma.order.updateMany({
    where: {
      id,
      orderStatus: existingOrder.orderStatus
    },
    data: {
      orderStatus: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledFromStatus: existingOrder.orderStatus,
      cancellationReason: cleanedCancellationReason
    }
  });

  if (transitionUpdate.count === 0) {
    res.status(409).json({
      success: false,
      code: "INVALID_ORDER_TRANSITION",
      message: "Order changed before cancellation could be completed."
    });
    return;
  }

  const updatedOrder = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: orderInclude
  });

  res.status(200).json({
    success: true,
    message: "Order cancelled successfully",
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
