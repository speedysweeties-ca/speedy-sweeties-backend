from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# order.controller.ts: import the new pickup-aware dispatcher.
replace_once(
    "src/controllers/order.controller.ts",
    'import { resolveOrderSourceAttribution } from "../utils/orderSourceAttribution";\n',
    'import { resolveOrderSourceAttribution } from "../utils/orderSourceAttribution";\nimport { autoDispatchCreatedOrderWithPickupPlan } from "../services/autoDispatchPickupPlan.service";\n'
)

# Include persisted pickup stops in dispatcher/order responses without changing existing fields.
replace_once(
    "src/controllers/order.controller.ts",
    '''  dispatchedBy: {\n    select: {\n      firstName: true,\n      lastName: true\n    }\n  }\n} satisfies Prisma.OrderInclude;''',
    '''  dispatchedBy: {\n    select: {\n      firstName: true,\n      lastName: true\n    }\n  },\n  pickupStops: {\n    orderBy: { sequence: "asc" },\n    select: {\n      id: true,\n      pickupType: true,\n      sequence: true,\n      plannedForDriverId: true,\n      selectionSource: true,\n      storeName: true,\n      addressLine1: true,\n      city: true,\n      province: true,\n      latitude: true,\n      longitude: true,\n      etaSeconds: true,\n      distanceMeters: true,\n      projectedArrivalAt: true,\n      hoursSource: true,\n      closingDate: true,\n      closingTime: true,\n      closingBufferMinutes: true\n    }\n  }\n} satisfies Prisma.OrderInclude;'''
)

# Let the assignment push tell the driver which persisted store route was selected.
replace_once(
    "src/controllers/order.controller.ts",
    '''const sendDriverAssignedOrderPush = async (\n  driverFcmToken: string,\n  orderNumber: number,\n  customerName: string,\n  addressLine1: string,\n  city?: string | null\n): Promise<void> => {\n  const address = [addressLine1, city].filter(Boolean).join(", ");''',
    '''const sendDriverAssignedOrderPush = async (\n  driverFcmToken: string,\n  orderNumber: number,\n  customerName: string,\n  addressLine1: string,\n  city?: string | null,\n  pickupSummary?: string | null\n): Promise<void> => {\n  const address = [addressLine1, city].filter(Boolean).join(", ");'''
)
replace_once(
    "src/controllers/order.controller.ts",
    '''        body: `Order #${orderNumber} assigned to you. ${customerName} - ${address}`''',
    '''        body: pickupSummary\n          ? `Order #${orderNumber} assigned. Pickup: ${pickupSummary}. ${customerName} - ${address}`\n          : `Order #${orderNumber} assigned to you. ${customerName} - ${address}`'''
)

# Move automatic assignment outside the order-creation DB transaction. The new service
# only marks DISPATCHED after it has a complete, hours-safe pickup plan.
replace_once(
    "src/controllers/order.controller.ts",
    '''    const autoDispatchNotification =\n      await autoAssignCreatedOrderToLeastBusyOnlineDriver(tx, createdOrder.id);\n\n    const order = await tx.order.findUniqueOrThrow({\n      where: { id: createdOrder.id },\n      include: orderInclude\n    });\n\n    return {\n      order,\n      autoDispatchNotification,\n      trackingToken: trackingCredential.token,\n      customerId: customer.id\n    };\n  });\n\n  const { order, autoDispatchNotification, trackingToken, customerId } = transactionResult;\n  const loyaltyAccessToken = signCustomerLoyaltyToken(customerId);''',
    '''    const order = await tx.order.findUniqueOrThrow({\n      where: { id: createdOrder.id },\n      include: orderInclude\n    });\n\n    return {\n      order,\n      trackingToken: trackingCredential.token,\n      customerId: customer.id\n    };\n  });\n\n  const { order: createdOrder, trackingToken, customerId } = transactionResult;\n  const autoDispatchResult = await autoDispatchCreatedOrderWithPickupPlan(\n    createdOrder.id\n  );\n  const order = autoDispatchResult.dispatched\n    ? await prisma.order.findUniqueOrThrow({\n        where: { id: createdOrder.id },\n        include: orderInclude\n      })\n    : createdOrder;\n  const loyaltyAccessToken = signCustomerLoyaltyToken(customerId);'''
)
replace_once(
    "src/controllers/order.controller.ts",
    '''  if (autoDispatchNotification) {\n    await sendDriverAssignedOrderPush(\n      autoDispatchNotification.driverFcmToken,\n      autoDispatchNotification.orderNumber,\n      autoDispatchNotification.customerName,\n      autoDispatchNotification.addressLine1,\n      autoDispatchNotification.city\n    );\n  }''',
    '''  if (\n    autoDispatchResult.dispatched &&\n    autoDispatchResult.driverIsOnline &&\n    autoDispatchResult.driverFcmToken &&\n    autoDispatchResult.driverAppState !== "FOREGROUND" &&\n    typeof autoDispatchResult.orderNumber === "number" &&\n    autoDispatchResult.customerName &&\n    autoDispatchResult.addressLine1\n  ) {\n    await sendDriverAssignedOrderPush(\n      autoDispatchResult.driverFcmToken,\n      autoDispatchResult.orderNumber,\n      autoDispatchResult.customerName,\n      autoDispatchResult.addressLine1,\n      autoDispatchResult.city,\n      autoDispatchResult.pickupSummary\n    );\n  }'''
)

# Driver orders: expose the actual persisted route, and align routable types with the
# pickup-location database that is live today.
replace_once(
    "src/controllers/driverOrders.controller.ts",
    '''  assignedDriver: {\n    select: {\n      id: true,\n      firstName: true,\n      lastName: true,\n      email: true\n    }\n  }\n} satisfies Prisma.OrderInclude;''',
    '''  assignedDriver: {\n    select: {\n      id: true,\n      firstName: true,\n      lastName: true,\n      email: true\n    }\n  },\n  pickupStops: {\n    orderBy: { sequence: "asc" },\n    select: {\n      id: true,\n      pickupType: true,\n      sequence: true,\n      storeName: true,\n      addressLine1: true,\n      city: true,\n      province: true,\n      latitude: true,\n      longitude: true,\n      projectedArrivalAt: true,\n      closingTime: true,\n      closingBufferMinutes: true\n    }\n  }\n} satisfies Prisma.OrderInclude;'''
)
replace_once(
    "src/controllers/driverOrders.controller.ts",
    '''const ROUTABLE_PICKUP_TYPES = new Set([\n  "CONVENIENCE",\n  "GENERAL_RETAIL",\n  "GROCERY",\n  "PHARMACY",\n  "OTHER"\n]);''',
    '''const ROUTABLE_PICKUP_TYPES = new Set([\n  "BEER_STORE",\n  "CONVENIENCE",\n  "DISPENSARY",\n  "LCBO",\n  "VAPE"\n]);'''
)
replace_once(
    "src/controllers/driverOrders.controller.ts",
    '''        unsupportedPickupTypeCount:\n          pickupRequirement.unsupportedPickupTypeCount,\n        pickupLocationCandidates,''',
    '''        unsupportedPickupTypeCount:\n          pickupRequirement.unsupportedPickupTypeCount,\n        assignedPickupStops: order.pickupStops,\n        pickupLocationCandidates,'''
)

# A manual unassign/reassign invalidates an AUTO route planned from the old driver's GPS.
replace_once(
    "src/controllers/orderAssignment.controller.ts",
    '''    const updatedOrder = await prisma.order.findUniqueOrThrow({\n      where: { id },''',
    '''    await prisma.orderPickupStop.deleteMany({ where: { orderId: id } });\n\n    const updatedOrder = await prisma.order.findUniqueOrThrow({\n      where: { id },'''
)
replace_once(
    "src/controllers/orderAssignment.controller.ts",
    '''  const updatedOrder = await prisma.order.findUniqueOrThrow({\n    where: { id },''',
    '''  if (wasAssignedToDifferentDriver) {\n    await prisma.orderPickupStop.deleteMany({ where: { orderId: id } });\n  }\n\n  const updatedOrder = await prisma.order.findUniqueOrThrow({\n    where: { id },'''
)

print("Applied auto-dispatch pickup-stop integration patch successfully.")
