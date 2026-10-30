export type HelpRole = "ADMIN" | "DISPATCHER";
export type HelpDestination =
  "HELP" |
  "LIVE_ORDERS" |
  "CREATE_MANUAL_ORDER" |
  "CUSTOMERS" |
  "DELIVERED_HISTORY" |
  "DISPATCHER_CHECKLIST" |
  "DRIVER_LOCATION" |
  "DISPATCHER_PERFORMANCE" |
  "PRIVACY_REQUESTS" |
  "DRIVERS" |
  "DISPATCHER_PINBOARD" |
  "DISPATCHER_STANDARDS" |
  "CUSTOMER_FOLLOW_UPS" |
  "CATALOG" |
  "PICKUP_LOCATIONS" |
  "CUSTOMER_RETENTION" |
  "DRIVER_STATS" |
  "GROWTH_COMMAND_CENTRE" |
  "QR_TRACKING" |
  "LOGOUT_LOG";

export interface HelpArticle {
  id: string;
  title: string;
  reviewedAt: string;
  roles: HelpRole[];
  destination: HelpDestination;
  evidence: string[];
  content: string;
}

// Workflow audit: main 7bcaaf7 plus PR 93, 2026-10-26. Update affected guides in every workflow change.
// Published standards are live data; this guide explains their screen, never copies their policy.
// 2026-10-26 Node 24.22.1 security review: navigation, B&D email controls and
// customer-retention procedures remain unchanged. Runtime pins/build guards do
// not change polling, authorization, dispatch, messaging settings or the cron's
// DRY_RUN-only behavior. No published policy or live provider outcome is inferred.
// 2026-10-26 combined PR 93/security-main review: navigation, privacy-requests,
// receipts, bnd-emails and customer-retention remain accurate. Merging c5f249f
// changes the runtime/CI only; ADMIN privacy controls, retained receipt evidence,
// identity guards and all existing dispatch/notification controls are preserved.
// 2026-10-28 recovery review: existing controls and receipt redaction are unchanged;
// privacy decisions now fail closed without complete independent recovery history.
// 2026-10-28 follow-up: offline recovery additionally stops for missing scoped
// financial records or newer external-retention decisions. The privacy-requests
// guide's offline/operator-review instructions and existing controls stay accurate.
// 2026-10-28 S3 preparation review: the proposed conditional append store changes
// no visible controls or receipt erasure. Missing permissions/uncertain appends
// still require the privacy operator; do not bypass stops or retry uncertain work.
// 2026-10-30 isolated-email Stage A review: Resend acceptance now requires a
// bounded, well-formed provider acknowledgement and records only sanitized
// diagnostics. The ADMIN Privacy requests controls and procedure are unchanged.
// 2026-10-28 integration review: Hobby's existing IAM user is wired lazily with
// exact external pins, without JWT/storage fallback. Sealed predecessors and
// unfinished successor coverage require offline operator review. Deadlines,
// financial evidence and all visible controls remain unchanged; gates-off
// ordinary ordering does not depend on recovery-store availability.
// Same-day retirement review: operator-only removal validates successor coverage,
// the externally pinned active scope and the full retired-version inventory first;
// any partial deletion stops for review. No app delete permission or new UI.
// 2026-10-29 production operator review: enrollment and offline dry-run/apply use
// exact-resource/identity/plan/exclusion guards. Authenticated RESOLVE records need
// attributable original-DB before/after evidence; ambiguity remains stopped.
// Existing dispatcher controls, financial fields and customer dates are unchanged.
// 2026-10-29 API quiescence review: original normal startup/visible controls are
// unchanged. Explicit operator mode blocks ALL API routes (including write-capable
// GETs), not merely privacy. It starts no monitors/session writer; cron and other
// DB clients still need separate exclusion. It cannot reopen on a timeout/error.
export const dispatcherHelpKnowledge: HelpArticle[] = [
  {
    id: "navigation",
    title: "Find dispatcher pages and refresh information",
    reviewedAt: "2026-10-29",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/server.ts", "src/normalServer.ts", "src/quiescentServer.ts"],
    content: "The top buttons are Live Orders, Create Manual Order, Customer Follow-ups, Dispatcher Pinboard, Dispatcher Standards, Driver Location, Refresh, How do I…?, Logout, and Show more. Show more reveals Delivered History, Catalog, Customers, Staff, Daily Responsibilities, Growth, Customer Retention, Driver Stats, Pickup Locations and QR Code Tracking, plus dispatch and alert switches. Administrators also see Privacy requests. Some controls require an administrator. Hide more collapses these controls without deleting anything. Live Orders normally refreshes every 5 seconds. Page refresh pauses on working screens and during editing; incoming orders are still checked every 5 seconds. Driver Location refreshes every 3 seconds. Use the relevant screen's refresh control when information looks old. A connection warning means displayed information may be stale; the help assistant cannot verify live status.",
  },
  {
    id: "help-guide",
    title: "Use How do I…? and its source guides",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "HELP",
    evidence: ["speedy-dispatcher/src/DispatcherHelp.tsx", "src/services/dispatcherHelp.service.ts"],
    content: "Open How do I…?, type a workflow question and click Ask the guide, or choose a suggested question. Ask follow-up questions in the same conversation. Expand a Source guide to read the instructions and reviewed date, and use its navigation button to open that screen. New conversation clears the conversation. Chat survives switching dashboard tabs but clears on browser reload or logout. This AI explains the maintained guide; it does not watch screens, learn procedures from chats, read live records, or perform actions. New features need an updated guide released with the software. Do not enter private customer details, passwords or credentials. If a procedure or policy is undocumented, ask the manager or owner; the assistant must not invent it.",
  },
  {
    id: "dispatcher-standards",
    title: "Read dispatcher expectations and responsibilities",
    reviewedAt: "2026-10-28",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "DISPATCHER_STANDARDS",
    evidence: ["speedy-dispatcher/src/DispatcherStandards.tsx", "speedy-dispatcher/src/App.tsx", "src/routes/dispatcherStandards.routes.ts", "src/services/dispatcherStandards.service.ts"],
    content: "For expectations, responsibilities and consequences, open Dispatcher Standards in the top buttons. Read What is expected and What happens if this is missed on the published entries. Current version posted appears below each published title with the saved date and time in Guelph time. It identifies the most recent publication of the current entry, not its original first publication or proof that someone has read it. Refresh standards reloads the saved entries. Dispatchers see published entries only; administrators can also manage drafts and archived entries. The help assistant cannot read the current entries or know their count, wording, published status or consequences. Direct questions about current standards to the entries themselves; do not invent or quote a fee. Daily Responsibilities is a separate checklist still accessible under Show more; it is not the editor for Dispatcher Standards. If a checklist task conflicts with the published standards, ask the owner to clarify.",
  },
  {
    id: "manage-standards",
    title: "Add, publish, revise or archive a standard",
    reviewedAt: "2026-10-28",
    roles: ["ADMIN"],
    destination: "DISPATCHER_STANDARDS",
    evidence: ["speedy-dispatcher/src/DispatcherStandards.tsx", "src/routes/dispatcherStandards.routes.ts", "src/services/dispatcherStandards.service.ts"],
    content: "Administrators open Dispatcher Standards > Add entry. Enter Title, What is expected and What happens if this is missed, then Save draft. To publish, click Edit on the saved entry, choose Published — visible to dispatchers in Visibility, click Save and publish and confirm. Each Save and publish refreshes Current version posted using the server save time, including revisions and republication. Drafts and archived entries show Last updated instead when a saved date is available. Use Edit and Visibility to return an entry to Draft or Archived, then save. All entries, Published, Draft and Archived filter the administrator's list. Archived entries and drafts are private to administrators. A saved entry persists across devices and sign-ins. Unsaved editor text survives switching dashboard tabs but not a browser reload or logout. If another administrator changed the board or a save was interrupted, check Refresh standards before retrying; do not overwrite newer wording blindly. The help assistant cannot publish policy or determine whether a consequence is enforceable.",
  },
  {
    id: "dispatcher-pinboard",
    title: "Post and acknowledge dispatcher notes",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "DISPATCHER_PINBOARD",
    evidence: ["speedy-dispatcher/src/DispatcherPinboard.tsx", "src/controllers/dispatcherPinboard.controller.ts"],
    content: "Open Dispatcher Pinboard. Under Pin a new note, enter a Title and Message, optionally select Important — keep at the top, then Post note. Important active notes appear first, then the newest notes. Click I’ve read this to acknowledge a note; opening the board alone does not acknowledge other people's notes. Expand Read by to see acknowledgements. The top button shows unread active notes and checks every 15 seconds. Resolve note asks for confirmation and moves the note to Resolved notes; Reopen note restores it. Unresolved notes remain across shifts. Drafts survive dashboard tab changes but clear on reload or logout. Refresh notes reloads the board. This staff-only board is separate from customer notes and Dispatcher Standards; the help assistant cannot read or post its live notes.",
  },
  {
    id: "staff-accounts",
    title: "Create or change staff accounts and passwords",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN"],
    destination: "DRIVERS",
    evidence: ["speedy-dispatcher/src/StaffManagement.tsx", "speedy-dispatcher/src/CreateStaffProfile.tsx", "speedy-dispatcher/src/StaffPasswordPage.tsx", "src/controllers/staff.controller.ts"],
    content: "Administrators open Show more > Staff. Create Staff Profile adds a driver or dispatcher using first name, last name, email, role, password and confirmation. In Staff directory, use Search staff, Role and Account status. Edit profile > Save profile changes details; an email or role change signs the person out. Reset password > Set temporary password signs them out and requires a password change. Share the temporary password privately and use the Staff password page link shown in the directory; never paste passwords into help. Deactivate > Confirm deactivation blocks access; Reactivate > Confirm reactivation restores sign-in but does not automatically restore a driver's dispatch visibility. Finish or reassign unfinished deliveries before changing driver access. Administrator accounts are read-only here. Refresh staff reloads records; if a change may have saved after a connection interruption, cancel the editor and refresh before retrying.",
  },
  {
    id: "driver-availability",
    title: "Show drivers in dispatch or sign a driver out",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "DRIVERS",
    evidence: ["speedy-dispatcher/src/App.tsx", "speedy-dispatcher/src/StaffManagement.tsx", "src/controllers/adminDriver.controller.ts", "src/routes/auth.routes.ts"],
    content: "Open Show more > Staff. Online Drivers shows online drivers and active order counts. Force Logout asks for confirmation and signs that driver out; coordinate any active deliveries first. Dispatchers use Driver Management and its Show in dispatch checkbox; administrators use the driver's visibility controls in Staff directory. Hiding a driver removes them from live dispatch and signs them out while preserving historical orders, receipts and statistics. Showing them again restores visibility but does not sign them in automatically. The driver must have an active account and sign in through their driver app. If a driver is missing from Select Driver, check dispatch visibility and whether they are online; automatic dispatch additionally needs fresh GPS. The help assistant cannot check a particular driver's live status.",
  },
  {
    id: "dispatcher-logout",
    title: "Sign a dispatcher out of all devices",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN"],
    destination: "DRIVERS",
    evidence: ["speedy-dispatcher/src/DispatcherLogout.tsx", "src/controllers/staff.controller.ts", "speedy-dispatcher/src/App.tsx"],
    content: "Administrators open Show more > Staff > Dispatchers. Find the correct person, choose Force Logout and confirm. This invalidates their existing sessions on all devices; connected screens return to sign-in on their next refresh. The person can sign in again with their usual password. This is different from account deactivation or a password reset. Inactive accounts cannot use this action. Refresh dispatchers reloads the list. If the connection is interrupted and logout cannot be confirmed, check with the dispatcher before retrying. The top Logout button signs out your own dispatcher session.",
  },
  {
    id: "logout-log",
    title: "Find recorded logout reasons",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN"],
    destination: "LOGOUT_LOG",
    evidence: ["speedy-dispatcher/src/LogoutLog.tsx", "docs/logout-log.md"],
    content: "Administrators open Show more > Logout Log. Enter Staff name, select Role, then Apply filters. Refresh reloads the newest records; Newer and Older browse pages. Entries show staff name, role, Guelph time, reported reason, outcome, source and an acting administrator where recorded. A rejected session records what the server refused; an offline report or interrupted connection does not prove the app logged out. Older phone apps may not report a local timeout or offline logout. Recording starts with the feature's deployment, and earlier events are not reconstructed. No matching events does not prove that no logout occurred.",
  },
  {
    id: "customer-profile",
    title: "Change a customer’s saved profile or address",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "CUSTOMERS",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/customer.controller.ts"],
    content: "Open Show more > Customers. In Customer Profiles, search by name, phone, email or city and press Search. Confirm the correct customer, then click Edit in Actions; scroll the table horizontally if necessary. Change Customer Name, Customer Phone, Customer Email, Address Line 1, Apartment / Unit, Buzz Code, City, Province, Recurring Driver Notes or Dispatcher Notes, then Save and check the refreshed row. Name, phone and address are required. Cancel exits the profile editor without saving. Updating the profile only changes the customer record: existing orders keep their own address. For an existing delivery also use Live Orders > Edit Order and coordinate with the driver. The help assistant cannot change a profile.",
  },
  {
    id: "edit-order",
    title: "Edit an existing delivery order",
    reviewedAt: "2026-10-26",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/order.controller.ts"],
    content: "Open Live Orders, find the correct order and click Edit Order. Change customer contact details, Address Line 1, Apartment / Unit, Buzz Code, City, Province, payment method, items or Additional Notes. Use Add Item and the item removal controls as needed. Click Save Changes and verify the updated order. Cancel asks whether to discard the edits; cancelling the editor does not cancel the delivery. Delivered and cancelled orders cannot be edited. Saving an order edit also creates or updates the matching customer profile by phone/email, but does not rewrite other orders. Civic-address changes are verified. If the server says this customer identity requires verification, do not bypass the protection by substituting another phone number; stop and refer the case to the privacy administrator. For a delivery already underway, coordinate the change with the assigned driver.",
  },
  {
    id: "edit-timing",
    title: "Understand the dispatch timer while editing",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["docs/dispatcher-edit-pauses.md", "speedy-dispatcher/src/useOrderEditPause.ts", "speedy-dispatcher/src/App.tsx"],
    content: "Opening Edit Order before first dispatch starts a server-confirmed pause in dispatch waiting time. The Dispatch Wait display can show paused for editing. Save, cancel, leaving Live Orders, hiding/closing the browser tab or logout stops the pause. Only time before first dispatch is deducted; earlier waiting time is retained and overlapping editors are not double-counted. A disconnected editor's pause expires, and an unconfirmed pause shows a connection warning. Editing after dispatch does not change dispatch performance. This allowance affects dispatch timing and the acceptance warning, but does not reset order age or the 40-minute delivery warning. If the timer pause cannot be confirmed, do not assume the time was excluded.",
  },
  {
    id: "manual-order",
    title: "Create a telephone order",
    reviewedAt: "2026-10-26",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "CREATE_MANUAL_ORDER",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/order.controller.ts"],
    content: "Open Create Manual Order. Type the customer's name or phone and select the correct customer suggestion when available. Verify name, phone, email and street address, City and Province; the current form requires these. Apartment / Unit and Buzz Code are optional separate fields. Choose Cash, Debit, Visa, Mastercard or E-Transfer. Enter item names and positive whole-number quantities, select matching suggestions when available, and use Add Another Item or Remove as needed. Review Additional Notes, Recurring Driver Notes and Dispatcher Notes (Internal), then click Create Manual Order. Wait for success and check the resulting order in Live Orders before retrying an uncertain submission. If the server says this customer identity requires verification, do not change the phone number to work around it; stop and refer the case to the privacy administrator. Cancel asks to discard a changed form. Dispatcher Notes for a selected customer save while typing, so cancelling the order form does not undo those note changes. The help assistant cannot submit orders.",
  },
  {
    id: "previous-order",
    title: "Load a customer’s previous or different previous order",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "CREATE_MANUAL_ORDER",
    evidence: ["speedy-dispatcher/src/LoadPreviousOrder.tsx", "speedy-dispatcher/src/manualPreviousOrder.ts", "speedy-dispatcher/src/App.tsx"],
    content: "In Create Manual Order, first select the correct saved customer suggestion. Load Previous Order copies the latest usable basket's item names and quantities, plus its recognized payment method. Load Different Previous Order appears when a second different basket is found. Different means the items or quantities differ, not just payment, dates or item order. Review the displayed order number, items and delivery status; a previous order may have been cancelled or not yet delivered. Loading does not submit a new order or restore old prices, addresses or notes. Verify the current customer's address and notes, edit the basket as needed, then Create Manual Order. If history cannot load, use Try again or enter the items manually.",
  },
  {
    id: "driver-assignment",
    title: "Assign a driver or change order priority",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/orderAssignment.controller.ts", "docs/dispatch-reliability.md"],
    content: "In Live Orders, locate the order, choose an online driver from Select Driver and click Assign to Driver. Each driver's active order count is shown in the selector. Verify Assigned and the order status after saving. Choosing a name alone does not assign the order. The button stays disabled until a different driver is selected. Closed orders cannot be assigned. Changing Normal / High saves priority immediately. Assignment moves a new order to DISPATCHED; the driver still needs to accept it. A notification being sent is not proof that the driver saw it. Monitor acceptance and contact the driver or reassign if necessary. Check Staff for visibility and online status if a driver is missing.",
  },
  {
    id: "auto-dispatch",
    title: "Turn automatic dispatch on or off",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/services/autoDispatchPickupPlan.service.ts"],
    content: "Open Show more and find Auto Dispatch. Use Turn Auto Dispatch On or Turn Auto Dispatch Off, then check the saved ON/OFF status. This is a shared server setting, not just a sound preference for this browser. Automatic dispatch considers newly created eligible, unassigned orders and requires a verified delivery map location and an active, visible, online driver with fresh GPS. It chooses by the configured travel-time estimate directly to the customer; item pickup types, pickup stops and least-load balancing do not determine that selection. Live Traffic controls whether the estimate uses Google traffic or coordinates. Switching it on is not a promise that all existing waiting orders will immediately be assigned. If an order remains unassigned, check its address/map warning and driver availability and use manual assignment when appropriate.",
  },
  {
    id: "order-lifecycle",
    title: "Understand statuses, receipts and late-order warnings",
    // 2026-10-29: Website verification runs before creation; staff lifecycle and timers remain unchanged.
    reviewedAt: "2026-10-29",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/App.tsx", "docs/order-status-state-machine.md", "docs/dispatcher-edit-pauses.md", "src/middleware/websiteVerification.ts"],
    content: "The normal lifecycle is PLACED (shown as NEW ORDER), DISPATCHED, ACCEPTED, OUT_FOR_DELIVERY and DELIVERED. Assignment dispatches the order; the assigned driver accepts it. OUT_FOR_DELIVERY and DELIVERED require a saved valid digital receipt. Driver-created digital receipts are the final-total record, not the initial estimated totals. Staff cannot skip these steps or reopen DELIVERED/CANCELLED orders. If RECEIPT_REQUIRED appears, have the assigned driver complete the digital receipt workflow. Live Orders marks unaccepted orders at 5+ minutes, allowing for recorded pre-dispatch editing pauses, and shows Delivery overdue (40+ min) using time from creation. These warnings call for checking progress, not proof of the cause of a delay. The help assistant cannot inspect the order, mark it delivered or guarantee an arrival time.",
  },
  {
    id: "cancel-order",
    title: "Cancel an active order",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/App.tsx", "docs/order-status-state-machine.md"],
    content: "Open Live Orders, confirm the order number and customer, then Cancel Order. Enter the optional cancellation reason and confirm the second prompt. Cancelling either prompt leaves the order unchanged. A confirmed cancellation retains the order in history as CANCELLED and does not count it as a completed delivery or toward loyalty. Delivered and already cancelled orders cannot be cancelled again or reopened through this interface. Coordinate with the assigned driver when a delivery is underway. Cancelling an order does not itself establish a refund, fee or payment-reversal policy; check with the owner for those decisions.",
  },
  {
    id: "saved-notes",
    title: "Use order notes, recurring driver notes and internal notes",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "CUSTOMERS",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/services/recurringDriverNotes.service.ts", "speedy-dispatcher/src/manualOrderNotes.ts"],
    content: "Additional Notes belong to one order. Recurring Driver Notes are reusable driver-visible instructions for manually entered orders, limited to 1000 characters; the manual order saves a snapshot and can update the customer's saved recurring notes. Customer-app orders do not automatically inherit those recurring notes. Dispatcher Notes are internal staff notes, shown as Dispatcher Warning on live orders. Open Show more > Customers > Edit to change the saved notes, then Save. Changing saved notes does not rewrite existing order snapshots. In Create Manual Order, Dispatcher Notes (Internal) for a selected customer save as you type, independently of submitting or cancelling the order. Verify important changes in the saved customer profile. Avoid putting internal staff warnings into driver-visible instructions.",
  },
  {
    id: "daily-checklist",
    title: "Use the separate daily checklist",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "DISPATCHER_CHECKLIST",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/dispatcherChecklist.controller.ts"],
    content: "For current expectations and consequences, use Dispatcher Standards. The current dispatcher also still has Show more > Daily Responsibilities, a separate Daily Dispatcher Responsibilities checklist. Check Business date and Today's Checklist. Mark Done records the dispatcher and timestamp for that task; Update Timestamp records another completion time for a completed item. Required Completed and Daily Status summarize the recorded checklist, and Checklist History shows previous dates. Refresh Checklist reloads the information. Completing a checklist item does not edit or publish a Dispatcher Standard. The help assistant cannot read the current tasks, mark them done or decide which tasks the owner currently requires; ask the owner if the checklist and published standards differ.",
  },
  {
    id: "order-history",
    title: "Search delivered and cancelled order history",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "DELIVERED_HISTORY",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/orderList.controller.ts"],
    content: "Open Show more > Delivered History. In Order History, enter at least 2 characters in Search Customer using a name, phone number or street address, then Search. The search covers saved history with the selected driver and date filters, not only the current page. Leave driver and date filters clear to search all dates and drivers. Use Filter by Driver, Start Date and End Date to narrow results. Clear Search removes the text search; Clear Filters resets the driver/date filters. Refresh History reloads results. Use the page controls for more matches. Check the assigned driver, status and timestamps on the correct order. Delivered and cancelled records are closed: this screen does not edit, reassign or reopen them.",
  },
  {
    id: "address-verification",
    title: "Resolve delivery-address and map warnings",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["docs/delivery-location.md", "speedy-dispatcher/src/App.tsx", "src/services/autoDispatchPickupPlan.service.ts"],
    content: "Delivery address checks use Address Line 1, City, Province and Canada. Enter a consistent Ontario civic address; unit and buzz code have separate optional fields, and delivery forms do not require a postal code. Rejected or contradictory addresses need correction with the customer. This address verification does not establish business service-area or pricing policy and has no distance-radius restriction. If the geocoding provider is unavailable, an order may be saved as NEEDS_REVIEW without verified coordinates. Live Orders shows Map location could not be verified and Driver Location lists active orders needing map review. Verify the address before relying on map placement. Automatic dispatch requires verified coordinates; the help assistant cannot verify or repair a live order's location.",
  },
  {
    id: "dispatcher-performance",
    title: "Review dispatcher timing and attribution",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN"],
    destination: "DISPATCHER_PERFORMANCE",
    evidence: ["speedy-dispatcher/src/DispatcherPerformance.tsx", "src/controllers/dispatcherPerformance.controller.ts", "docs/dispatcher-edit-pauses.md"],
    content: "Administrators open Show more > Dispatcher Performance. Select dates, dispatchers and order-source groups, then Apply or Refresh Performance. Longer than five minutes filters to dispatch waits strictly greater than five minutes and applies immediately with the other filters. Recorded editing before first dispatch is deducted; editing after first dispatch does not alter the metric. Review Performance by Dispatcher, Dispatch Time by Order Source, Daily Dispatch Trend and Order-by-Order Evidence. Data Coverage separates automatic, driver, unattributed and undispatched activity; do not attribute all orders to a dispatcher. Historical missing measurements remain blank rather than becoming zero. Coverage has its own broader scope described on the page, so it need not equal the filtered performance total.",
  },
  {
    id: "customer-follow-ups",
    title: "Handle a customer’s request for help",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "CUSTOMER_FOLLOW_UPS",
    evidence: ["speedy-dispatcher/src/CustomerCare.tsx", "src/services/deliveryCheckIn.service.ts"],
    content: "Open Customer Follow-ups. Waiting for follow-up shows requests about completed deliveries; the badge counts waiting requests. Check the order number, customer and message, and use the phone link to contact the customer. After following up, enter what happened in How was this handled? (3–1000 characters), then Handled. This records the resolution note, staff member and handling time; it does not send a reply, issue a refund or change the delivery status. Select Handled to review completed follow-ups, or Waiting for follow-up to return to the queue. Use Previous/Next for pages and Refresh to reload; the queue normally checks every 15 seconds. If a refresh error appears, displayed requests may be stale.",
  },
  {
    id: "catalog",
    title: "Find, categorize, edit or deactivate catalog items",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "CATALOG",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/item.controller.ts", "src/constants/pickupTypes.ts"],
    content: "Open Show more > Catalog. Search by name, brand, category or source, choose All items / Active only / Inactive only and Pickup Type, then Search. Use 25/50/100 per page and First/Previous/Next/Last for more results. Items with Pickup Type UNKNOWN stay in Catalog but are hidden from order searches and AI catalog suggestions. To show one, set the correct Pickup Type and keep it Active. The row's Pickup Type dropdown saves immediately; Edit opens name, type, brand, size, category, source and Active fields, then Save or Cancel. Deactivate asks for confirmation and hides the item without deleting history; Edit and Active can reactivate it. Search first to avoid duplicates. Created by means the original creator; Unknown in that column means missing historical attribution and is different from Pickup Type UNKNOWN. Refresh Catalog reloads results.",
  },
  {
    id: "pickup-locations",
    title: "Maintain pickup locations and routing priority",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "PICKUP_LOCATIONS",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/pickupLocation.controller.ts", "src/services/pickupStoreRouting.service.ts"],
    content: "Open Show more > Pickup Locations. To add a location, enter Location Name, Select Pickup Type, Routing Priority, Street Address, City, Province and valid Latitude/Longitude; Postal Code is optional here. Choose Active and Add Pickup Location. Use a saved row's Edit, Save or Cancel to revise it. Deactivate asks for confirmation; inactive locations are excluded from pickup selection. Routing Priority applies to pickup-store selection and is different from an order's Normal/High priority. A saved active store is not a guarantee it is open or eligible at arrival. Refresh Locations reloads records. The current screen does not provide an opening-hours editor: ask the administrator to investigate incorrect store hours rather than inventing a button. The help assistant cannot supply unverified coordinates or change a live location.",
  },
  {
    id: "driver-location",
    title: "Read driver GPS and compare pickup routes",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "DRIVER_LOCATION",
    evidence: ["speedy-dispatcher/src/App.tsx", "speedy-dispatcher/src/RoutingPreviewEnhancerOriginalPins.tsx", "src/controllers/routingPreview.controller.ts"],
    content: "Open Driver Location. Driver GPS and active delivery locations refresh every 3 seconds. Driver GPS Details shows GPS status, Updated, Accuracy, Speed and active Orders; No GPS or an old update is not a confirmed live location. In the Routing Previewer, hover an order pin to compare driver ETAs and pickup-store recommendations. Click an order pin to keep the preview open; click the map or close the popup to clear it. Refresh ETA requests an updated estimate; previews may otherwise be cached. The preview includes selected pickup stops and the final customer leg and flags unknown item types or no eligible open store. It is an estimate, not a delivery promise or an assignment action. Assign the driver in Live Orders. Active orders requiring map-location review are listed separately.",
  },
  {
    id: "live-traffic",
    title: "Switch between traffic and coordinate route estimates",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "DRIVER_LOCATION",
    evidence: ["speedy-dispatcher/src/App.tsx", "speedy-dispatcher/src/RoutingPreviewEnhancerOriginalPins.tsx", "src/services/autoDispatchPickupPlan.service.ts"],
    content: "Open Show more > Live Traffic. Turn Live Traffic On enables Google traffic-aware routing, which may be billable. Turn Live Traffic Off makes new routing calculations use coordinate-based estimates without new Google Routes requests. Check the saved ON/OFF status and the routing-mode notice in the map preview. This is a shared server setting. Turning traffic off does not mean all Google services or the map are disabled or free. Route estimates and automatic dispatch use the configured routing mode, but the map preview includes pickup stops while automatic driver selection estimates the direct customer leg. Neither mode guarantees the real arrival time.",
  },
  {
    id: "privacy-requests",
    title: "Review and complete a verified privacy deletion request",
    reviewedAt: "2026-10-30",
    roles: ["ADMIN"],
    destination: "PRIVACY_REQUESTS",
    evidence: ["speedy-dispatcher/src/PrivacyRequests.tsx", "speedy-dispatcher/src/privacyRequest.ts", "src/routes/privacy.routes.ts", "src/services/privacyDeletion.service.ts", "src/services/privacyDelivery.service.ts", "src/services/privacyRecoveryJournal.ts", "src/services/privacyRecoveryS3.ts", "src/services/privacyRecoveryConfiguration.ts", "src/services/privacyRecoveryMaintenance.ts", "src/services/privacyRecoveryRetirement.ts", "src/services/privacyRecoveryOperator.ts", "scripts/privacyRecoveryOperator.cjs", "docs/account-deletion.md"],
    content: "Administrators open Privacy requests and select Load / refresh requests. General dispatcher access is insufficient. Check the request status and its individual due date; overdue means the recorded due date has passed, not that deletion completed automatically. Select the request and use Preview affected records (no deletion) to inspect the verified source order, linked/active orders, unlinked candidates, identity conflicts, removals, retained financial fields and external systems. Preview does not delete anything. Do not continue while active orders, unlinked candidates or identity conflicts remain. Confirm the adopted policy reference, document a business/legal justification without customer details, enter the applicable tax-year end and financial retain-until date, and review the server-calculated audit and anti-reactivation review dates. Confirm and begin fulfillment is irreversible and is rejected while fulfillment is disabled, the request is on hold, the preview is stale, or the retention decision is invalid. Privacy changes also stop if protected recovery history is unavailable, incomplete or has an unfinished operation; do not bypass that stop or repeatedly retry an uncertain result. Refer it to the privacy operator. A restored database must stay offline until decision reconciliation and external-copy review are complete. After database fulfillment, verify each listed external system and use Record verified external outcome; do not invent an expiry or evidence reference. Confirm completion only after all eligible deletion and external handling is verified. Completion makes the result available through authenticated in-app status and does not send an email or SMS. A request received, provider-accepted message, preview or database fulfillment alone is not completed deletion.",
  },
  {
    id: "order-alarms",
    title: "Enable and acknowledge order alarms",
    reviewedAt: "2026-10-26",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/IncomingOrderAlarmPanels.tsx", "speedy-dispatcher/src/useIncomingOrderAlarm.ts", "docs/dispatcher-edit-pauses.md"],
    content: "Open Show more > Alarm. Turn Alarm On enables new-order and overdue-acceptance sound/popups for this browser; Enable Sound unlocks browser audio and Test Alarm tests it without creating an order. New-order sound repeats every 10 seconds until Acknowledge; View Orders opens Live Orders. Acknowledging does not assign a driver. The Driver has not accepted — 5+ minutes alert repeats every 30 seconds while waiting and clears when accepted or cancelled; contact the driver or assign another driver. The acceptance timing allows for recorded pre-dispatch editing pauses. Turning Alarm Off disables these sounds and popups on this browser, not automatic dispatch. The help assistant cannot hear whether audio is working.",
  },
  {
    id: "bnd-alerts",
    title: "Respond to B&D waiting-call alerts",
    reviewedAt: "2026-10-26",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/BndOrderAlertPanels.tsx", "speedy-dispatcher/src/useBndOrderAlerts.ts", "speedy-dispatcher/src/bndStatusPolling.ts"],
    content: "Open Show more > B&D Alerts. Enable B&D Sound if browser audio needs enabling. A waiting-call popup lists order numbers and repeats sound every 10 seconds. Open or claim the call in B&D itself; the alert clears after the next successful check. This dashboard does not claim a B&D call for you. Turn B&D Alerts Off silences sound/popups for the current session; they turn on again at the next login. Checks pause outside the hours displayed by the monitor. If monitoring is interrupted or login needs attention, any displayed waiting calls are last-known information; check B&D directly and ask the administrator to investigate. Silencing browser alerts does not switch off the separate B&D email setting.",
  },
  {
    id: "bnd-emails",
    title: "Control B&D email notifications",
    reviewedAt: "2026-10-26",
    roles: ["ADMIN"],
    destination: "LIVE_ORDERS",
    evidence: ["speedy-dispatcher/src/BndEmailControls.tsx", "src/routes/bndAlerts.routes.ts"],
    content: "Administrators open Show more > B&D Emails and use Turn B&D Emails On or Turn B&D Emails Off. Check the displayed recipient and saved state. This separate server setting sends one email per waiting order during B&D's published opening hours and can work while the dispatcher page is closed. The control does not edit the recipient. Browser B&D Alerts and browser sound are separate controls. If Email setup needs attention or a loading/saving error appears, have the administrator check configuration; an unknown setting is not proof that emails are off. The help assistant cannot change the setting, inspect delivery or guarantee that an email reached the recipient.",
  },
  {
    id: "customer-retention",
    title: "Find customers who have not ordered recently",
    reviewedAt: "2026-10-26",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "CUSTOMER_RETENTION",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/customer.controller.ts"],
    content: "Open Show more > Customer Retention. Choose All Customers, Active 0–29 Days, 30+ Days, 60+ Days or 90+ Days. The 30+ and 60+ filters include the older groups too. Search by name, phone, email, address or notes. Review Last Order, Days Since, Completed Orders and Status. Call, Text and Email open the corresponding device application; clicking is not proof that a message was sent. Email appears only when an email is recorded. View History shows up to the 20 most recent stored orders; Hide History or Close History closes it. Refresh Retention reloads the data. This screen does not define a discount, automatically send a campaign or establish permission to contact someone; follow the owner's confirmed procedure.",
  },
  {
    id: "driver-stats",
    title: "Review driver delivery statistics",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "DRIVER_STATS",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/controllers/driverStats.controller.ts"],
    content: "Open Show more > Driver Stats. Select drivers in Filter by Driver, set Start Date and End Date, then Apply Filters. Select All, Clear and Clear Filters adjust the selection; Refresh Stats reloads results. The statistics concern completed deliveries and include historical drivers, so a past driver can remain in reporting while hidden from live dispatch. Read the selected date range and available timing samples before comparing drivers. Driver Stats is separate from administrator-only Dispatcher Performance, which measures dispatch work. The help assistant cannot retrieve live totals or infer why a particular driver was slow.",
  },
  {
    id: "growth",
    title: "Read the Growth Command Centre",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "GROWTH_COMMAND_CENTRE",
    evidence: ["speedy-dispatcher/src/GrowthCommandCentre.tsx", "src/controllers/growthDashboard.controller.ts", "speedy-dispatcher/src/App.tsx"],
    content: "Open Show more > Growth. Choose Last 7 days, Last 30 days, Last 90 days or Start date and End date, then Apply. Review completed orders, new/returning customers, second-order conversion, order sources, campaigns, trends, busiest times and operational timing. Comparisons use the displayed previous period. Data Confidence shows coverage for missing customer links, receipts, timestamps and source/campaign tags; blanks or unknown attribution are not confirmed zero performance. Delivery Fees Recorded totals the delivery-charge field on completed digital receipts. Receipt Sales Total includes purchased items and is not Speedy Sweeties profit. The help assistant can explain the screen but cannot read its current figures or claim a campaign caused a sale.",
  },
  {
    id: "check-in-results",
    title: "Interpret Sweetie Check-In results",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "GROWTH_COMMAND_CENTRE",
    evidence: ["speedy-dispatcher/src/CustomerCare.tsx", "src/services/deliveryCheckIn.service.ts", "speedy-dispatcher/src/App.tsx"],
    content: "Open Show more > Growth to see Sweetie Check-In results for the displayed dates. Refresh results reloads those cards. Help requests and Handled refer to requests received in the period; Still waiting covers all dates. Average time to handle includes closed hours. Google review clicks count clicks, not confirmed posted reviews. Share button used and reported shares/link copies do not prove receipt of a shared link. First-time customers ordering again counts linked customers with a second completed delivery by period end; newer customers have had less time to return. These results do not prove that check-ins caused repeat orders. Use Customer Follow-ups to handle an individual support request.",
  },
  {
    id: "qr-tracking",
    title: "View QR campaign scan counts",
    reviewedAt: "2026-10-24",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "QR_TRACKING",
    evidence: ["speedy-dispatcher/src/App.tsx", "src/app.ts"],
    content: "Open Show more > QR Code Tracking. The table lists Campaign, Total Scans, QR Link and Stats Link for configured printed marketing campaigns. Refresh QR Stats reloads the counts. Use the displayed QR Link when referring to that campaign's tracking destination; this screen does not create or edit a campaign. A scan count is not a unique-customer, placed-order or revenue count. Use Growth and its attribution coverage for recorded order-source/campaign results. The help assistant cannot read current scan totals.",
  },
  {
    id: "receipts",
    title: "View a receipt or prepare a receipt email",
    reviewedAt: "2026-10-26",
    roles: ["ADMIN", "DISPATCHER"],
    destination: "DELIVERED_HISTORY",
    evidence: ["speedy-dispatcher/src/App.tsx", "speedy-dispatcher/src/receiptEvidence.ts", "src/services/privacyDeletion.service.ts"],
    content: "Open Show more > Delivered History and find the correct order. Scroll across to Final Receipt. View opens a text receipt in a browser alert; No receipt means no saved digital receipt is shown. Send opens your device's email application with the order's customer email, subject and receipt text filled in. It does not send an email automatically: review the draft and send it from your email application. Send is disabled when the order has no email. The text uses the saved item descriptions, quantities and prices, delivery/service charge, tax/fees and grand total. Recognized extra-stop and distance-surcharge evidence comes from the original receipt note or its retained structured copy. After verified privacy fulfillment, a retained financial receipt can keep required transaction evidence while customer identity, arbitrary receipt notes and operational details are removed. Verify the saved breakdown before using it; do not invent a price, tax or fee. The help assistant cannot retrieve, correct or send a receipt.",
  },
];

export const helpArticlesForRole = (role: string): HelpArticle[] =>
  dispatcherHelpKnowledge.filter((article) => article.roles.includes(role as HelpRole));
