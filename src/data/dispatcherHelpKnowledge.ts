export type HelpRole = "ADMIN" | "DISPATCHER";
export type HelpDestination = "CUSTOMERS" | "LIVE_ORDERS" | "CREATE_MANUAL_ORDER" |
  "DELIVERED_HISTORY" | "DISPATCHER_CHECKLIST" | "DRIVER_LOCATION" | "DISPATCHER_PERFORMANCE";

export interface HelpArticle {
  id: string;
  title: string;
  reviewedAt: string;
  roles: HelpRole[];
  destination: HelpDestination;
  evidence: string[];
  content: string;
}

// Reviewed against main 3bec1b0. Update these guides alongside workflow changes.
// Only add business policies after the business owner has confirmed them.
export const dispatcherHelpKnowledge: HelpArticle[] = [
  {
    id: "customer-profile", title: "Change a customer's saved profile or address",
    reviewedAt: "2026-09-30", roles: ["ADMIN", "DISPATCHER"], destination: "CUSTOMERS",
    evidence: ["speedy-dispatcher/src/App.tsx:renderCustomerProfiles", "src/controllers/customer.controller.ts:updateCustomerController"],
    content: "Open Customers. In Customer Profiles, search by name, phone, email, or city and press Search. Confirm the correct customer, then click Edit in the Actions column (scroll the table horizontally if necessary). Change Address Line 1, Apartment / Unit, Buzz Code, City, and Province as needed. Name, phone, and address are required. Click Save and check the refreshed row. Cancel exits without saving. You can also edit Customer Name, Customer Phone, Customer Email, Recurring Driver Notes, and Dispatcher Notes here. Updating this profile only updates the customer record: existing orders keep their own address. For an existing delivery also use Live Orders > Edit Order. Do not claim an address was changed by the help assistant."
  },
  {
    id: "edit-order", title: "Edit an existing delivery order",
    reviewedAt: "2026-09-30", roles: ["ADMIN", "DISPATCHER"], destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/App.tsx:renderEditOrderForm", "src/controllers/order.controller.ts:updateOrderDetailsController"],
    content: "Open Live Orders, find the correct order, and click Edit Order. Change the customer details, Address Line 1, Apartment / Unit, Buzz Code, City, Province, payment method, items, or Additional Notes as needed. Click Save Changes and verify the updated order. Cancel asks to discard edits. Delivered and cancelled orders cannot be edited. Order editing also creates or updates the matching customer profile by phone/email, but does not rewrite other existing orders. Civic-address edits are verified by the backend. If the address is rejected, check the street, municipality and Ontario province. If a delivery is underway, coordinate the change with the assigned driver."
  },
  {
    id: "manual-order", title: "Create a telephone order",
    reviewedAt: "2026-09-30", roles: ["ADMIN", "DISPATCHER"], destination: "CREATE_MANUAL_ORDER",
    evidence: ["speedy-dispatcher/src/App.tsx:handleManualOrderSubmit", "speedy-dispatcher/src/LoadPreviousOrder.tsx"],
    content: "Open Create Manual Order. Type the customer name or phone and select the correct customer suggestion when available. Verify the customer contact details and delivery address including unit and buzz code. Choose Cash, Debit, Visa, Mastercard, or E-Transfer. Enter item names and quantities, using item suggestions where available and Add Item for more items. Check Additional Notes, Recurring Driver Notes, and Dispatcher Notes before clicking Create Manual Order. Selecting a customer also enables Load Previous Order; review any loaded details before creating an order. The help assistant cannot create or submit an order."
  },
  {
    id: "driver-assignment", title: "Assign a driver or change priority",
    reviewedAt: "2026-09-30", roles: ["ADMIN", "DISPATCHER"], destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/App.tsx:renderDriverAssignmentSection", "README.md:Security and compatibility notes"],
    content: "Open Live Orders and find the order. Choose a driver from Select Driver and click Assign to Driver. Verify the Assigned name after saving. Only online drivers appear in the selector, with their active order count. Delivered and cancelled orders cannot be assigned. The Assign to Driver button is disabled until a different driver is selected. Change the Normal / High selector to update priority immediately. Drivers become stale/offline after one hour without a fresh heartbeat/location update. The help assistant cannot check who is online or perform an assignment."
  },
  {
    id: "order-lifecycle", title: "Understand order status and digital receipts",
    reviewedAt: "2026-09-30", roles: ["ADMIN", "DISPATCHER"], destination: "LIVE_ORDERS",
    evidence: ["docs/order-status-state-machine.md:Authorized transition matrix", "README.md:Roles and order workflow"],
    content: "The normal order lifecycle is PLACED, DISPATCHED, ACCEPTED, OUT_FOR_DELIVERY, DELIVERED. Assignment dispatches an order; the assigned driver accepts it. Moving to OUT_FOR_DELIVERY and completing delivery require a saved valid digital receipt. Driver-created digital receipts are the authoritative final-total record, not estimated client totals. Staff can cancel an active order using Cancel Order. DELIVERED and CANCELLED are terminal states; the staff interface cannot skip statuses or reopen them. If RECEIPT_REQUIRED appears, have the assigned driver complete the digital receipt workflow. Never suggest a database override or invent a dispatcher Mark Delivered button."
  },
  {
    id: "saved-notes", title: "Use recurring driver notes and dispatcher notes",
    reviewedAt: "2026-09-30", roles: ["ADMIN", "DISPATCHER"], destination: "CUSTOMERS",
    evidence: ["speedy-dispatcher/src/manualOrderNotes.ts", "src/services/recurringDriverNotes.service.ts", "speedy-dispatcher/src/App.tsx:renderCustomerProfiles"],
    content: "Open Customers, search for the customer, click Edit, change Recurring Driver Notes or Dispatcher Notes, then click Save. Recurring Driver Notes are reusable delivery instructions for manually entered orders, limited to 1000 characters; manual ordering can update them on the profile and includes a snapshot in that order. Customer-app orders do not automatically inherit recurring driver notes. Editing the saved notes does not retroactively rewrite existing order snapshots. Additional Notes are specific to an order. Dispatcher Notes are internal staff notes; keep them separate from driver instructions."
  },
  {
    id: "daily-checklist", title: "Complete daily dispatcher responsibilities",
    reviewedAt: "2026-09-30", roles: ["ADMIN", "DISPATCHER"], destination: "DISPATCHER_CHECKLIST",
    evidence: ["speedy-dispatcher/src/App.tsx:renderDispatcherChecklist"],
    content: "Open Daily Responsibilities. Check the Business date and Today's Checklist. Perform the task described on each item, then click Mark Done. Each click saves the dispatcher name and timestamp. Required Completed and Daily Status show progress; complete required tasks before the end of the day. For an already completed item, Update Timestamp records a new completion timestamp. Refresh Checklist reloads current information. Checklist History shows previous business dates and completion details. The help assistant does not mark tasks complete."
  },
  {
    id: "order-history", title: "Find delivered and cancelled orders",
    reviewedAt: "2026-09-30", roles: ["ADMIN", "DISPATCHER"], destination: "DELIVERED_HISTORY",
    evidence: ["speedy-dispatcher/src/App.tsx:renderDeliveredHistory", "speedy-dispatcher/src/App.tsx:fetchDeliveredOrders"],
    content: "Open Delivered History. The Order History view includes both delivered and cancelled orders. Use its date and driver filters to narrow the results. Review the order number and customer before using any available receipt or history controls. These are closed orders; do not try to edit, reassign, or reopen them. The help assistant explains how to find records but cannot retrieve individual customer/order records."
  },
  {
    id: "address-verification", title: "Resolve delivery-address verification problems",
    reviewedAt: "2026-09-30", roles: ["ADMIN", "DISPATCHER"], destination: "LIVE_ORDERS",
    evidence: ["docs/delivery-location.md"],
    content: "Order creation and civic-address edits are normalized and verified by the backend using Address Line 1, City, Province, and Canada. It requires a consistent Ontario civic address. There is no distance-radius restriction in this verification. Invalid or contradictory addresses are rejected; check the full street address, municipality and province with the customer. Apartment / Unit and Buzz Code have their own fields. If the geocoding provider is unavailable, order creation can continue with NEEDS_REVIEW and no verified coordinates; review the address before relying on map placement. This technical verification rule does not establish a business service-area or delivery-pricing policy."
  },
  {
    id: "dispatcher-performance", title: "Review dispatcher performance",
    reviewedAt: "2026-09-30", roles: ["ADMIN"], destination: "DISPATCHER_PERFORMANCE",
    evidence: ["speedy-dispatcher/src/DispatcherPerformance.tsx", "speedy-dispatcher/src/App.tsx:DispatcherPerformance"],
    content: "Administrators can open Dispatcher Performance. Select the date range, dispatchers, and order-source groups to compare dispatch times and manual-entry metrics. The over-five-minutes filter narrows the view to slower dispatches. Use Refresh to reload. Automatic and unattributed dispatches have separate coverage counts; do not assume every order was manually dispatched by a particular employee."
  }
];

export const helpArticlesForRole = (role: string): HelpArticle[] =>
  dispatcherHelpKnowledge.filter((article) => article.roles.includes(role as HelpRole));
