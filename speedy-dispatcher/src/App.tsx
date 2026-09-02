import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, API_V1_BASE_URL } from "./apiConfig";
import {
  getVerifiedDeliveryPosition,
  needsDeliveryLocationReview,
  shouldUseLegacyBrowserGeocoding,
  type DeliveryGeocodeStatus,
} from "./deliveryLocation";
import {
  buildAddressRequestFields,
  parseGoogleAutocompleteAddress,
  type GoogleAddressComponent,
  type GoogleAutocompletePlace,
} from "./addressFields";
import {
  buildManualOrderNotesPayload,
  recurringDriverNotesForCustomer,
} from "./manualOrderNotes";


type OrderStatus =
  | "PLACED"
  | "DISPATCHED"
  | "ACCEPTED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

type PaymentMethod = "CASH" | "DEBIT" | "VISA" | "MASTERCARD" | "ETRANSFER";

type OrderItem = {
  id?: string;
  name: string;
  quantity: number;
  price?: number | string;
};

type DigitalReceipt = {
  id?: string;
  receiptNumber?: string | null;
  orderId?: string | null;
  createdByDriverId?: string | null;
  itemTotal?: number | string | null;
  deliveryCharge?: number | string | null;
  taxOrFees?: number | string | null;
  grandTotal?: number | string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AssignedDriver = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
};

type DriverOption = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
  activeOrderCount: number;
  latitude?: number | null;
  longitude?: number | null;
  locationUpdatedAt?: string | null;
  locationAccuracyMeters?: number | null;
  locationSpeedMetersPerSecond?: number | null;
  locationHeadingDegrees?: number | null;
  locationRecordedAt?: string | null;
  driverAppState?: string | null;
  driverAppStateUpdatedAt?: string | null;
};

type DriverManagementItem = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  isActive: boolean;
  isOnline: boolean;
  isVisibleInDispatch: boolean;
  createdAt?: string | null;
};

type DriverStat = {
  driverId: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  totalDeliveries: number;
  averageDeliveryMinutes: number | null;
  fastestDeliveryMinutes: number | null;
  slowestDeliveryMinutes: number | null;
};

type Order = {
  id: string;
  orderNumber: number;
  customerName: string;
  addressLine1: string;
  city?: string;
  province?: string;
  phone?: string;
  email?: string;
  paymentMethod?: PaymentMethod;
  additionalNotes?: string | null;
  dispatcherNotes?: string | null;
  orderStatus: OrderStatus;
  priority?: "HIGH" | "NORMAL";
  items?: OrderItem[];
  digitalReceipt?: DigitalReceipt | null;
  assignedDriver?: AssignedDriver | null;
  createdAt?: string;
  dispatchedAt?: string;
  acceptedAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelledFromStatus?: OrderStatus | null;
  cancellationReason?: string | null;
  updatedAt?: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  geocodeStatus?: DeliveryGeocodeStatus | null;
  geocodedAddress?: string | null;
  geocodePlaceId?: string | null;
  geocodeAddressFingerprint?: string | null;
};

type ActiveTab =
  | "LIVE_ORDERS"
  | "CREATE_MANUAL_ORDER"
  | "DRIVER_LOCATION"
  | "DELIVERED_HISTORY"
  | "CUSTOMER_RETENTION"
  | "DRIVER_STATS"
  | "CATALOG"
  | "PICKUP_LOCATIONS"
  | "CUSTOMERS"
  | "QR_TRACKING"
  | "DISPATCHER_CHECKLIST";

type ManualOrderItem = {
  itemName: string;
  quantity: string;
};

type ManualOrderForm = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  addressLine1: string;
  city: string;
  province: string;
  paymentMethod: PaymentMethod;
  additionalNotes: string;
  recurringDriverNotes: string;
  dispatcherNotes: string;
  items: ManualOrderItem[];
};

type EditOrderForm = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  addressLine1: string;
  city: string;
  province: string;
  paymentMethod: PaymentMethod;
  additionalNotes: string;
  items: ManualOrderItem[];
};

type CustomerSuggestion = {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  addressLine1: string;
  city: string;
  province: string;
  dispatcherNotes?: string | null;
  recurringDriverNotes?: string | null;
};

type ItemSuggestion = {
  id: string;
  name: string;
  normalizedName: string;
  size?: string | null;
  category?: string | null;
  brand?: string | null;
  source?: string | null;
  pickupType?: string | null;
  isActive: boolean;
  popularityScore?: number;
};

type CatalogItem = {
  id: string;
  name: string;
  normalizedName?: string;
  brand?: string | null;
  normalizedBrand?: string | null;
  size?: string | null;
  category?: string | null;
  source?: string | null;
  pickupType?: string | null;
  isActive: boolean;
  popularityScore: number;
  createdAt?: string;
  updatedAt?: string;
};

type CatalogEditForm = {
  name: string;
  brand: string;
  size: string;
  category: string;
  source: string;
  pickupType: string;
  isActive: boolean;
};

const CATALOG_PICKUP_TYPE_OPTIONS = [
  "UNKNOWN",
  "CONVENIENCE",
  "BEER_STORE",
  "LCBO",
  "VAPE",
  "DISPENSARY",
] as const;

type PickupLocation = {
  id: string;
  name: string;
  pickupType: string;
  addressLine1: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type PickupLocationForm = {
  name: string;
  pickupType: string;
  addressLine1: string;
  city: string;
  province: string;
  latitude: string;
  longitude: string;
  isActive: boolean;
};

type CustomerProfile = {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  addressLine1: string;
  city: string;
  province: string;
  dispatcherNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    orders?: number;
  };
};

type CustomerRetentionStatus = "ACTIVE" | "AT_RISK" | "LAPSED" | "WIN_BACK";

type CustomerRetentionFilter =
  | "ALL"
  | "ACTIVE"
  | "30_PLUS"
  | "60_PLUS"
  | "90_PLUS";

type CustomerRetentionItem = {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  addressLine1: string;
  city: string;
  province: string;
  dispatcherNotes?: string | null;
  lastOrderAt: string;
  daysSinceLastOrder: number;
  completedOrders: number;
  retentionStatus: CustomerRetentionStatus;
};

type CustomerRetentionHistoryOrder = {
  id: string;
  orderNumber: number;
  orderStatus: OrderStatus;
  paymentMethod?: PaymentMethod;
  itemsText?: string | null;
  additionalNotes?: string | null;
  createdAt?: string | null;
  deliveredAt?: string | null;
  items?: OrderItem[];
};

type CustomerRetentionHistoryProfile = {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  orders?: CustomerRetentionHistoryOrder[];
};

type CustomerEditForm = {
  fullName: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  province: string;
  dispatcherNotes: string;
};

type QrTrackingCampaign = {
  campaign: string;
  label: string;
  totalScans: number;
  trackingUrl: string;
  statsUrl: string;
};

type ChecklistUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

type DispatcherChecklistItem = {
  id: string;
  label: string;
  description?: string | null;
  isRequired: boolean;
  sortOrder: number;
  isCompleted: boolean;
  completedAt?: string | null;
  completedBy?: ChecklistUser | null;
};

type DispatcherChecklistHistoryDay = {
  businessDate: string;
  totalRequired: number;
  completedRequired: number;
  isComplete: boolean;
  items: DispatcherChecklistItem[];
};

type DispatcherChecklistSummary = {
  businessDate: string | null;
  totalRequired: number;
  completedRequired: number;
  isComplete: boolean;
};

const createEmptyManualOrderItem = (): ManualOrderItem => ({
  itemName: "",
  quantity: "1",
});

const createDefaultManualOrderItem = (): ManualOrderItem => ({
  itemName: "Flyer",
  quantity: "1",
});

const getApiErrorMessage = (data: any, fallbackMessage: string) => {
  if (!data) return fallbackMessage;

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }

  if (typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const firstError = data.errors[0];

    if (typeof firstError === "string" && firstError.trim()) {
      return firstError.trim();
    }

    if (typeof firstError?.message === "string" && firstError.message.trim()) {
      return firstError.message.trim();
    }

    if (typeof firstError?.msg === "string" && firstError.msg.trim()) {
      return firstError.msg.trim();
    }
  }

  if (Array.isArray(data.details) && data.details.length > 0) {
    const firstDetail = data.details[0];

    if (typeof firstDetail === "string" && firstDetail.trim()) {
      return firstDetail.trim();
    }

    if (typeof firstDetail?.message === "string" && firstDetail.message.trim()) {
      return firstDetail.message.trim();
    }
  }

  return fallbackMessage;
};

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

type GoogleGeocodeResult = {
  address_components?: GoogleAddressComponent[];
  partial_match?: boolean;
  types?: string[];
  geometry?: {
    location?: unknown;
    location_type?: string;
  };
};

type GoogleMapsEventListener = {
  remove?: () => void;
};

type GooglePlacesAutocompleteInstance = {
  addListener: (
    eventName: "place_changed",
    callback: () => void
  ) => GoogleMapsEventListener;
  getPlace: () => GoogleAutocompletePlace;
};

type GooglePlacesNamespace = {
  Autocomplete: new (
    input: HTMLInputElement,
    options: {
      componentRestrictions: { country: string };
      fields: string[];
      types: string[];
    }
  ) => GooglePlacesAutocompleteInstance;
};

type GooglePlacesWindow = Window & {
  google?: {
    maps?: {
      places?: GooglePlacesNamespace;
    };
  };
};

const normalizeGeocodeText = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const civicStreetSuffixPattern =
  /\b(?:street|st|road|rd|drive|dr|avenue|ave|lane|ln|boulevard|blvd|highway|hwy|court|ct|crescent|cres|way|trail|trl|terrace|ter|place|pl|circle|cir|parkway|pkwy|line|concession)\b/i;

const trailingDeliveryInstructionPattern =
  /\s+(?:[-–—,;|:]\s*)?(?:(?:please\s+)?(?:use\s+)?(?:side|back|rear|front)\s+(?:door|entrance)|basement(?:\s+(?:door|entrance|unit))?|buzz(?:\s+(?:code|unit|apartment|apt|suite))?|call\b|ring\s+(?:the\s+)?(?:doorbell|bell)|leave\s+(?:it\s+)?(?:at|by|near|beside)\b|door\s+code\b)/i;

const sanitizeAddressLineForGeocoding = (addressLine1: string) => {
  const normalizedAddress = addressLine1.trim().replace(/\s+/g, " ");
  const instructionIndex = normalizedAddress.search(
    trailingDeliveryInstructionPattern
  );

  if (instructionIndex <= 0) return normalizedAddress;

  const civicAddress = normalizedAddress
    .slice(0, instructionIndex)
    .replace(/[\s,–—;|:-]+$/g, "")
    .trim();

  if (!/\d/.test(civicAddress) || !civicStreetSuffixPattern.test(civicAddress)) {
    return normalizedAddress;
  }

  return civicAddress;
};

const getGeocodeComponent = (
  result: GoogleGeocodeResult,
  componentTypes: string[]
) =>
  result.address_components?.find((component) =>
    component.types?.some((type) => componentTypes.includes(type))
  );

const geocodeComponentMatches = (
  component: GoogleAddressComponent | undefined,
  allowedValues: Set<string>
) => {
  if (!component) return false;

  return [component.long_name, component.short_name]
    .map(normalizeGeocodeText)
    .some((value) => allowedValues.has(value));
};

const selectValidatedOrderGeocodeResult = (
  results: GoogleGeocodeResult[] | null,
  order: Order
) => {
  const submittedMunicipality = normalizeGeocodeText(order.city);
  const allowedMunicipalities = new Set(
    [submittedMunicipality, "guelph"].filter(Boolean)
  );

  const validCandidates = (results || []).flatMap((result) => {
    const country = getGeocodeComponent(result, ["country"]);
    const province = getGeocodeComponent(result, [
      "administrative_area_level_1",
    ]);
    const municipality = getGeocodeComponent(result, [
      "locality",
      "postal_town",
      "administrative_area_level_3",
      "sublocality_level_1",
    ]);
    const locationType = result.geometry?.location_type || "";
    const resultTypes = result.types || [];
    const hasStreetNumber = Boolean(
      getGeocodeComponent(result, ["street_number"])
    );
    const hasCivicResultType = resultTypes.some((type) =>
      ["street_address", "premise", "subpremise", "establishment"].includes(
        type
      )
    );

    if (!result.geometry?.location || result.partial_match === true) return [];
    if (locationType === "APPROXIMATE") return [];
    if (!hasStreetNumber && !hasCivicResultType) return [];
    if (!geocodeComponentMatches(country, new Set(["ca", "canada"]))) return [];
    if (!geocodeComponentMatches(province, new Set(["on", "ontario"]))) return [];
    if (!geocodeComponentMatches(municipality, allowedMunicipalities)) return [];
    const municipalityValues = new Set(
      [municipality?.long_name, municipality?.short_name].map(
        normalizeGeocodeText
      )
    );
    const score =
      (submittedMunicipality && municipalityValues.has(submittedMunicipality)
        ? 4
        : 2) +
      (locationType === "ROOFTOP"
        ? 4
        : locationType === "RANGE_INTERPOLATED"
          ? 3
          : 1) +
      (resultTypes.includes("street_address") ? 2 : 0) +
      (hasStreetNumber ? 1 : 0);

    return [{ result, score }];
  });

  return validCandidates.sort((a, b) => b.score - a.score)[0]?.result || null;
};

const isValidPhone = (phone: string) => {
  const digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.length === 10 || digitsOnly.length === 11;
};

const initialManualOrderForm: ManualOrderForm = {
  customerName: "",
  customerPhone: "",
  customerEmail: "example@yahoo.com",
  addressLine1: "",
  dispatcherNotes: "",
  recurringDriverNotes: "",
  city: "Guelph",
  province: "ON",
  paymentMethod: "CASH",
  additionalNotes: "",
  items: [createDefaultManualOrderItem()],
};

const initialPickupLocationForm: PickupLocationForm = {
  name: "",
  pickupType: "",
  addressLine1: "",
  city: "Guelph",
  province: "ON",
  latitude: "",
  longitude: "",
  isActive: true,
};

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [manualOrderLoading, setManualOrderLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [driverStatsLoading, setDriverStatsLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [pickupLocationsLoading, setPickupLocationsLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerRetentionLoading, setCustomerRetentionLoading] = useState(false);
  const [qrTrackingLoading, setQrTrackingLoading] = useState(false);
  const [dispatcherChecklistLoading, setDispatcherChecklistLoading] = useState(false);
  const [autoDispatchEnabled, setAutoDispatchEnabled] = useState<boolean | null>(null);
  const [autoDispatchLoading, setAutoDispatchLoading] = useState(false);
  const [autoDispatchUpdating, setAutoDispatchUpdating] = useState(false);
  const [completingChecklistItemId, setCompletingChecklistItemId] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  const [driverStats, setDriverStats] = useState<DriverStat[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [managedDrivers, setManagedDrivers] = useState<DriverManagementItem[]>([]);
  const [driverManagementLoading, setDriverManagementLoading] = useState(false);
  const [updatingDriverVisibilityId, setUpdatingDriverVisibilityId] =
    useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogActiveFilter, setCatalogActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(50);
  const [catalogTotalItems, setCatalogTotalItems] = useState(0);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [editingCatalogItemId, setEditingCatalogItemId] = useState<string | null>(null);
  const [catalogEditForm, setCatalogEditForm] = useState<CatalogEditForm | null>(null);
  const [updatingCatalogPickupTypeId, setUpdatingCatalogPickupTypeId] =
    useState<string | null>(null);

  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [pickupLocationForm, setPickupLocationForm] = useState<PickupLocationForm>(
    initialPickupLocationForm
  );
  const [editingPickupLocationId, setEditingPickupLocationId] = useState<string | null>(null);
  const [pickupLocationEditForm, setPickupLocationEditForm] =
    useState<PickupLocationForm | null>(null);

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [customerProfileSearch, setCustomerProfileSearch] = useState("");
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerEditForm, setCustomerEditForm] = useState<CustomerEditForm | null>(null);

  const [retentionCustomers, setRetentionCustomers] = useState<CustomerRetentionItem[]>([]);
  const [retentionFilter, setRetentionFilter] =
    useState<CustomerRetentionFilter>("30_PLUS");
  const [retentionSearch, setRetentionSearch] = useState("");
  const [retentionHistoryCustomer, setRetentionHistoryCustomer] =
    useState<CustomerRetentionHistoryProfile | null>(null);
  const [retentionHistoryLoadingCustomerId, setRetentionHistoryLoadingCustomerId] =
    useState<string | null>(null);

  const [qrTrackingCampaigns, setQrTrackingCampaigns] = useState<QrTrackingCampaign[]>([
    {
      campaign: "lighter",
      label: "Bic Lighter",
      totalScans: 0,
      trackingUrl: `${API_BASE_URL}/q/lighter`,
      statsUrl: `${API_BASE_URL}/q/lighter/stats`,
    },
  ]);

  const [dispatcherChecklistItems, setDispatcherChecklistItems] = useState<DispatcherChecklistItem[]>([]);
  const [dispatcherChecklistHistory, setDispatcherChecklistHistory] = useState<DispatcherChecklistHistoryDay[]>([]);
  const [dispatcherChecklistSummary, setDispatcherChecklistSummary] = useState<DispatcherChecklistSummary>({
    businessDate: null,
    totalRequired: 0,
    completedRequired: 0,
    isComplete: false,
  });

  const [driverSelections, setDriverSelections] = useState<Record<string, string>>({});
  const [historyDriverIds, setHistoryDriverIds] = useState<string[]>([]);
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  const [statsDriverIds, setStatsDriverIds] = useState<string[]>([]);
  const [statsStartDate, setStatsStartDate] = useState("");
  const [statsEndDate, setStatsEndDate] = useState("");

  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("LIVE_ORDERS");
  const [showDriverPanel, setShowDriverPanel] = useState(false);

  const [manualOrderForm, setManualOrderForm] = useState<ManualOrderForm>(
    initialManualOrderForm
  );

  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editOrderForm, setEditOrderForm] = useState<EditOrderForm | null>(null);
  const [editItemSuggestions, setEditItemSuggestions] = useState<
    Record<number, ItemSuggestion[]>
  >({});

  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>(
    []
  );

  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSuggestion | null>(null);

const [activeCustomerSearchField, setActiveCustomerSearchField] =
  useState<"customerName" | "customerPhone" | null>(null);

  const [itemSuggestions, setItemSuggestions] = useState<
    Record<number, ItemSuggestion[]>
  >({});

  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasCompletedInitialLoadRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const manualFormIsDirty = useMemo(() => {
    return JSON.stringify(manualOrderForm) !== JSON.stringify(initialManualOrderForm);
  }, [manualOrderForm]);

  const autoRefreshPaused =
    activeTab === "CREATE_MANUAL_ORDER" ||
    activeTab === "DRIVER_LOCATION" ||
    activeTab === "DELIVERED_HISTORY" ||
    activeTab === "CUSTOMER_RETENTION" ||
    activeTab === "DRIVER_STATS" ||
    activeTab === "CATALOG" ||
    activeTab === "PICKUP_LOCATIONS" ||
    activeTab === "CUSTOMERS" ||
    activeTab === "QR_TRACKING" ||
    activeTab === "DISPATCHER_CHECKLIST" ||
    manualFormIsDirty ||
    manualOrderLoading ||
    editingOrderId !== null ||
    editOrderForm !== null;

  const filteredDeliveredOrders = deliveredOrders;

  const normalizeCustomerSearchText = (value?: string | null) => {
    return (value || "").trim().toLowerCase();
  };

  const normalizeCustomerSearchDigits = (value?: string | null) => {
    return (value || "").replace(/\D/g, "");
  };

  const customerMatchesSearch = (customer: CustomerProfile, searchTerm: string) => {
    const cleanSearchTerm = normalizeCustomerSearchText(searchTerm);
    const digitSearchTerm = normalizeCustomerSearchDigits(searchTerm);

    if (!cleanSearchTerm && !digitSearchTerm) return true;

    const searchableText = [
      customer.fullName,
      customer.phone,
      customer.email,
      customer.addressLine1,
      customer.city,
      customer.province,
      customer.dispatcherNotes,
    ]
      .map(normalizeCustomerSearchText)
      .join(" ");

    const searchableDigits = normalizeCustomerSearchDigits(customer.phone);

    return (
      searchableText.includes(cleanSearchTerm) ||
      (!!digitSearchTerm && searchableDigits.includes(digitSearchTerm))
    );
  };


  const retentionSummary = useMemo(() => {
    return retentionCustomers.reduce(
      (totals, customer) => {
        totals.total += 1;

        if (customer.retentionStatus === "ACTIVE") totals.active += 1;
        if (customer.retentionStatus === "AT_RISK") totals.atRisk += 1;
        if (customer.retentionStatus === "LAPSED") totals.lapsed += 1;
        if (customer.retentionStatus === "WIN_BACK") totals.winBack += 1;

        return totals;
      },
      {
        total: 0,
        active: 0,
        atRisk: 0,
        lapsed: 0,
        winBack: 0,
      }
    );
  }, [retentionCustomers]);

  const filteredRetentionCustomers = useMemo(() => {
    const cleanSearchTerm = normalizeCustomerSearchText(retentionSearch);
    const digitSearchTerm = normalizeCustomerSearchDigits(retentionSearch);

    return retentionCustomers
      .filter((customer) => {
        const matchesFilter =
          retentionFilter === "ALL"
            ? true
            : retentionFilter === "ACTIVE"
              ? customer.daysSinceLastOrder < 30
              : retentionFilter === "30_PLUS"
                ? customer.daysSinceLastOrder >= 30
                : retentionFilter === "60_PLUS"
                  ? customer.daysSinceLastOrder >= 60
                  : customer.daysSinceLastOrder >= 90;

        if (!matchesFilter) return false;

        if (!cleanSearchTerm && !digitSearchTerm) return true;

        const searchableText = [
          customer.fullName,
          customer.phone,
          customer.email,
          customer.addressLine1,
          customer.city,
          customer.province,
          customer.dispatcherNotes,
        ]
          .map(normalizeCustomerSearchText)
          .join(" ");

        const searchableDigits = normalizeCustomerSearchDigits(customer.phone);

        return (
          searchableText.includes(cleanSearchTerm) ||
          (!!digitSearchTerm && searchableDigits.includes(digitSearchTerm))
        );
      })
      .sort((a, b) => {
        if (b.daysSinceLastOrder !== a.daysSinceLastOrder) {
          return b.daysSinceLastOrder - a.daysSinceLastOrder;
        }

        return b.completedOrders - a.completedOrders;
      });
  }, [retentionCustomers, retentionFilter, retentionSearch]);

  const totalStatsDeliveries = useMemo(() => {
    return driverStats.reduce((total, stat) => total + stat.totalDeliveries, 0);
  }, [driverStats]);

  const topDriver = useMemo(() => {
    if (driverStats.length === 0) return null;
    return [...driverStats].sort((a, b) => b.totalDeliveries - a.totalDeliveries)[0];
  }, [driverStats]);

  const bestAverageDriver = useMemo(() => {
    const driversWithAverage = driverStats.filter(
      (stat) => stat.averageDeliveryMinutes !== null
    );

    if (driversWithAverage.length === 0) return null;

    return [...driversWithAverage].sort(
      (a, b) =>
        (a.averageDeliveryMinutes || 0) - (b.averageDeliveryMinutes || 0)
    )[0];
  }, [driverStats]);

  useEffect(() => {
    const savedToken = localStorage.getItem("token");

    if (savedToken) {
      setToken(savedToken);
      void fetchOrders(savedToken, false);
      void fetchDrivers(savedToken);
      void fetchAutoDispatchSetting(savedToken, false);
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    if (autoRefreshPaused) return;

    const intervalId = window.setInterval(() => {
      void fetchOrders(token, false);
      void fetchDrivers(token);

    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    token,
    autoRefreshPaused,
    activeTab,
    statsStartDate,
    statsEndDate,
    statsDriverIds,
  ]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "DRIVER_LOCATION") return;

    void fetchDrivers(token);
    void fetchOrders(token, false);

    const intervalId = window.setInterval(() => {
      void fetchDrivers(token);
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, activeTab]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "DELIVERED_HISTORY") return;

    void fetchDeliveredOrders(token, true);
    void fetchDrivers(token);
 }, [activeTab, token, historyPage, historyStartDate, historyEndDate, historyDriverIds]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "CUSTOMER_RETENTION") return;

    void fetchCustomerRetention(token, true);
  }, [activeTab, token]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "DRIVER_STATS") return;

    void fetchDriverStats(token, true);
    void fetchDrivers(token);
  }, [activeTab, token]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "CATALOG") return;

    void fetchCatalogItems(token, true, catalogPage, catalogPageSize);
  }, [activeTab, token, catalogActiveFilter, catalogPage, catalogPageSize]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "PICKUP_LOCATIONS") return;

    void fetchPickupLocations(token, true);
  }, [activeTab, token]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "CUSTOMERS") return;

    void fetchCustomers(token, true);
  }, [activeTab, token]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "QR_TRACKING") return;

    void fetchQrTrackingStats(true);
  }, [activeTab, token]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "DISPATCHER_CHECKLIST") return;

    void fetchDispatcherChecklist(token, true);
    void fetchDispatcherChecklistHistory(token, false);
  }, [activeTab, token]);

  useEffect(() => {
    if (!token || !showDriverPanel) return;

    void fetchDriverManagement(token, true);
  }, [token, showDriverPanel]);

  useEffect(() => {
    if (newOrderIds.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      setNewOrderIds([]);
    }, 12000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [newOrderIds]);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const manualAddressInputRef = useRef<HTMLInputElement | null>(null);
  const editAddressInputRef = useRef<HTMLInputElement | null>(null);
  const googleMapRef = useRef<any>(null);
  const driverMarkersRef = useRef<Record<string, any>>({});
  const orderMarkersRef = useRef<Record<string, any>>({});
  const orderMarkerAddressesRef = useRef<Record<string, string>>({});
  const orderAuthoritativeGeocodeKeysRef = useRef<Record<string, string>>({});
  const orderGeocodingInFlightRef = useRef<Set<string>>(new Set());
  const orderGeocodingFailedRef = useRef<Set<string>>(new Set());
  const orderInfoWindowRef = useRef<any>(null);
  const ordersRequestSequenceRef = useRef(0);

  useEffect(() => {
    if (activeTab !== "CREATE_MANUAL_ORDER") return;

    let placeChangedListener: GoogleMapsEventListener | null = null;
    let retryTimer: number | null = null;

    const installAutocomplete = () => {
      const input = manualAddressInputRef.current;
      const googleMaps = (window as GooglePlacesWindow).google?.maps;

      if (!input || !googleMaps?.places?.Autocomplete) return false;

      const autocomplete = new googleMaps.places.Autocomplete(input, {
        componentRestrictions: { country: "ca" },
        fields: ["address_components"],
        types: ["address"],
      });

      placeChangedListener = autocomplete.addListener("place_changed", () => {
        const selectedAddress = parseGoogleAutocompleteAddress(
          autocomplete.getPlace()
        );

        if (!selectedAddress) return;
        setManualOrderForm((current) => ({
          ...current,
          ...selectedAddress,
        }));
      });
      return true;
    };

    if (!installAutocomplete()) {
      retryTimer = window.setInterval(() => {
        if (installAutocomplete() && retryTimer !== null) {
          window.clearInterval(retryTimer);
          retryTimer = null;
        }
      }, 250);
    }

    return () => {
      if (retryTimer !== null) window.clearInterval(retryTimer);
      placeChangedListener?.remove?.();
    };
  }, [activeTab]);

  useEffect(() => {
    if (!editingOrderId) return;

    let placeChangedListener: GoogleMapsEventListener | null = null;
    let retryTimer: number | null = null;

    const installAutocomplete = () => {
      const input = editAddressInputRef.current;
      const googleMaps = (window as GooglePlacesWindow).google?.maps;

      if (!input || !googleMaps?.places?.Autocomplete) return false;

      const autocomplete = new googleMaps.places.Autocomplete(input, {
        componentRestrictions: { country: "ca" },
        fields: ["address_components"],
        types: ["address"],
      });

      placeChangedListener = autocomplete.addListener("place_changed", () => {
        const selectedAddress = parseGoogleAutocompleteAddress(
          autocomplete.getPlace()
        );

        if (!selectedAddress) return;
        setEditOrderForm((current) =>
          current ? { ...current, ...selectedAddress } : current
        );
      });
      return true;
    };

    if (!installAutocomplete()) {
      retryTimer = window.setInterval(() => {
        if (installAutocomplete() && retryTimer !== null) {
          window.clearInterval(retryTimer);
          retryTimer = null;
        }
      }, 250);
    }

    return () => {
      if (retryTimer !== null) window.clearInterval(retryTimer);
      placeChangedListener?.remove?.();
    };
  }, [editingOrderId]);

  useEffect(() => {
    if (newOrderIds.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      setNewOrderIds([]);
    }, 12000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [newOrderIds]);


  useEffect(() => {
    const clearMap = () => {
      Object.values(driverMarkersRef.current).forEach((marker) => {
        marker.setMap(null);
      });

      Object.values(orderMarkersRef.current).forEach((marker) => {
        marker.setMap(null);
      });

      driverMarkersRef.current = {};
      orderMarkersRef.current = {};
      orderMarkerAddressesRef.current = {};
      orderAuthoritativeGeocodeKeysRef.current = {};
      orderGeocodingInFlightRef.current = new Set();
      orderGeocodingFailedRef.current = new Set();

      if (orderInfoWindowRef.current) {
        orderInfoWindowRef.current.close();
        orderInfoWindowRef.current = null;
      }

      googleMapRef.current = null;

      if (mapRef.current) {
        mapRef.current.innerHTML = "";
      }
    };

    if (activeTab !== "DRIVER_LOCATION") {
      clearMap();
      return;
    }

    const googleMaps = (window as any).google?.maps;

    if (!mapRef.current || !googleMaps) return;

    const driversWithLocation = drivers.filter(
      (driver) =>
        driver.isOnline &&
        typeof driver.latitude === "number" &&
        typeof driver.longitude === "number"
    );

    const activeOrders = orders.filter((order) =>
      ["PLACED", "DISPATCHED", "ACCEPTED", "OUT_FOR_DELIVERY"].includes(
        order.orderStatus
      )
    );

    if (driversWithLocation.length === 0 && activeOrders.length === 0) {
      clearMap();
      return;
    }

    if (!googleMapRef.current) {
      googleMapRef.current = new googleMaps.Map(mapRef.current, {
        center:
          driversWithLocation.length > 0
            ? {
                lat: driversWithLocation[0].latitude as number,
                lng: driversWithLocation[0].longitude as number,
              }
            : {
                lat: 43.5448,
                lng: -80.2482,
              },
        zoom: 13,
      });
    }

    const map = googleMapRef.current;
    const activeDriverIds = new Set(driversWithLocation.map((driver) => driver.id));

    Object.entries(driverMarkersRef.current).forEach(([driverId, marker]) => {
      if (!activeDriverIds.has(driverId)) {
        marker.setMap(null);
        delete driverMarkersRef.current[driverId];
      }
    });

    driversWithLocation.forEach((driver) => {
      const existingMarker = driverMarkersRef.current[driver.id];
      const driverDisplayName = getDriverDisplayName(driver);
      const isRobDriver =
        driverDisplayName.replace(/\s+/g, "").toLowerCase() === "robdriver";

      const position = {
        lat: driver.latitude as number,
        lng: driver.longitude as number,
      };

      const robDriverIcon = isRobDriver
        ? {
            url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            scaledSize: new googleMaps.Size(32, 32),
            labelOrigin: new googleMaps.Point(16, 10),
          }
        : null;

      const title = [
        driverDisplayName,
        `Status: ${getDriverLocationStatus(driver)}`,
        `Updated: ${formatDriverLocationAge(driver)}`,
        `Accuracy: ${formatDriverAccuracy(driver.locationAccuracyMeters)}`,
        `Speed: ${formatDriverSpeed(driver.locationSpeedMetersPerSecond)}`,
        `Orders: ${driver.activeOrderCount}`,
      ].join("\n");

      const label = {
        text: driverDisplayName.charAt(0).toUpperCase(),
        ...(isRobDriver ? { color: "#ffffff", fontWeight: "700" } : {}),
      };

      if (existingMarker) {
        existingMarker.setPosition(position);
        existingMarker.setTitle(title);
        existingMarker.setIcon(robDriverIcon);
        existingMarker.setLabel(label);
      } else {
        const marker = new googleMaps.Marker({
          position,
          map,
          title,
          icon: robDriverIcon,
          label,
        });

        driverMarkersRef.current[driver.id] = marker;
      }
    });

    const activeOrderIds = new Set(activeOrders.map((order) => order.id));

    Object.keys(orderAuthoritativeGeocodeKeysRef.current).forEach((orderId) => {
      if (!activeOrderIds.has(orderId)) {
        delete orderAuthoritativeGeocodeKeysRef.current[orderId];
      }
    });

    Object.entries(orderMarkersRef.current).forEach(([orderId, marker]) => {
      if (!activeOrderIds.has(orderId)) {
        marker.setMap(null);

        if (orderInfoWindowRef.current?.__orderId === orderId) {
          orderInfoWindowRef.current.close();
          orderInfoWindowRef.current.__orderId = null;
        }

        delete orderMarkersRef.current[orderId];
        delete orderMarkerAddressesRef.current[orderId];
        delete orderAuthoritativeGeocodeKeysRef.current[orderId];
      }
    });

    activeOrders.forEach((order) => {
      const fullAddress = [
        order.addressLine1,
        order.city,
        order.province,
        "Canada",
      ]
        .filter(Boolean)
        .join(", ");
      const geocodingAddress = [
        sanitizeAddressLineForGeocoding(order.addressLine1),
        order.city?.trim(),
        order.province?.trim(),
        "Canada",
      ]
        .filter(Boolean)
        .join(", ");
      const geocodeKey = `${order.id}|${geocodingAddress.toLowerCase()}`;
      const verifiedPosition = getVerifiedDeliveryPosition(order);
      const useLegacyBrowserGeocoding =
        shouldUseLegacyBrowserGeocoding(order);
      const markerLocationKey = verifiedPosition
        ? [
            "verified",
            order.geocodeAddressFingerprint || "no-fingerprint",
            verifiedPosition.lat,
            verifiedPosition.lng,
          ].join("|")
        : geocodeKey;

      orderAuthoritativeGeocodeKeysRef.current[order.id] = markerLocationKey;

      const driverName = getDriverDisplayName(order.assignedDriver);
      const orderTime = formatOrderAge(order.createdAt);
      const displayStatus = order.orderStatus.replace(/_/g, " ");

      const title = [
        `Order #${order.orderNumber}`,
        order.customerName,
        fullAddress,
        `Status: ${displayStatus}`,
        `Driver: ${driverName}`,
        `Order Time: ${orderTime}`,
      ].join("\n");

      const escapeMapInfoText = (value: unknown) =>
        String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");

      const infoWindowContent = `
        <div style="min-width:220px;max-width:300px;padding:4px 2px;color:#18181b;font-family:Arial,sans-serif;line-height:1.4;">
          <div style="font-size:17px;font-weight:700;margin-bottom:6px;">
            Order #${escapeMapInfoText(order.orderNumber)}
          </div>
          <div style="font-weight:700;margin-bottom:4px;">
            ${escapeMapInfoText(order.customerName)}
          </div>
          <div style="margin-bottom:8px;">
            ${escapeMapInfoText(fullAddress)}
          </div>
          <div><strong>Status:</strong> ${escapeMapInfoText(displayStatus)}</div>
          <div><strong>Driver:</strong> ${escapeMapInfoText(driverName)}</div>
          <div><strong>Order Time:</strong> ${escapeMapInfoText(orderTime)}</div>
        </div>
      `;

      const existingMarker = orderMarkersRef.current[order.id];
      const existingAddress = orderMarkerAddressesRef.current[order.id];

      if (existingMarker && existingAddress === markerLocationKey) {
        existingMarker.setTitle(title);
        existingMarker.setLabel({
          text: String(order.orderNumber),
          fontWeight: "700",
        });
        existingMarker.__orderInfoContent = infoWindowContent;

        if (orderInfoWindowRef.current?.__orderId === order.id) {
          orderInfoWindowRef.current.setContent(infoWindowContent);
        }

        return;
      }

      if (existingMarker && existingAddress !== markerLocationKey) {
        existingMarker.setMap(null);

        if (orderInfoWindowRef.current?.__orderId === order.id) {
          orderInfoWindowRef.current.close();
          orderInfoWindowRef.current.__orderId = null;
        }

        delete orderMarkersRef.current[order.id];
        delete orderMarkerAddressesRef.current[order.id];
      }

      const installOrderMarker = (position: unknown, locationKey: string) => {
        const marker = new googleMaps.Marker({
          position,
          map,
          title,
          label: {
            text: String(order.orderNumber),
            fontWeight: "700",
          },
        });

        marker.__orderInfoContent = infoWindowContent;
        marker.addListener("click", () => {
          if (!orderInfoWindowRef.current) {
            orderInfoWindowRef.current = new googleMaps.InfoWindow();
          }

          orderInfoWindowRef.current.__orderId = order.id;
          orderInfoWindowRef.current.setContent(marker.__orderInfoContent);
          orderInfoWindowRef.current.open(map, marker);
        });

        orderMarkersRef.current[order.id] = marker;
        orderMarkerAddressesRef.current[order.id] = locationKey;

        if (
          driversWithLocation.length === 0 &&
          Object.keys(orderMarkersRef.current).length === 1
        ) {
          map.setCenter(position);
        }
      };

      if (verifiedPosition) {
        installOrderMarker(verifiedPosition, markerLocationKey);
        return;
      }

      if (!useLegacyBrowserGeocoding) {
        if (!orderGeocodingFailedRef.current.has(markerLocationKey)) {
          console.warn(
            `Order ${order.id} was left unmapped because its delivery location is not verified.`
          );
          orderGeocodingFailedRef.current.add(markerLocationKey);
        }
        return;
      }

      if (orderGeocodingInFlightRef.current.has(geocodeKey)) return;
      if (orderGeocodingFailedRef.current.has(geocodeKey)) return;

      orderGeocodingInFlightRef.current.add(geocodeKey);

      const geocoder = new googleMaps.Geocoder();

      geocoder.geocode(
        {
          address: geocodingAddress,
          componentRestrictions: {
            country: "CA",
          },
          region: "CA",
        },
        (results: GoogleGeocodeResult[] | null, status: string) => {
          orderGeocodingInFlightRef.current.delete(geocodeKey);

          if (googleMapRef.current !== map) return;
          if (
            orderAuthoritativeGeocodeKeysRef.current[order.id] !== geocodeKey
          ) {
            return;
          }

          const selectedResult =
            status === "OK"
              ? selectValidatedOrderGeocodeResult(results, order)
              : null;
          const location = selectedResult?.geometry?.location;

          if (!location) {
            console.warn(
              `Order ${order.id} was left unmapped: the rolling-deployment fallback found no validated result (${status}).`
            );
            orderGeocodingFailedRef.current.add(geocodeKey);
            return;
          }

          const markerToReplace = orderMarkersRef.current[order.id];

          if (markerToReplace) {
            markerToReplace.setMap(null);
          }

          installOrderMarker(location, geocodeKey);
        }
      );
    });
  }, [activeTab, drivers, orders, nowMs]);

  const playNewOrderSound = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioCtx) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }

      const ctx = audioContextRef.current;

      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(988, ctx.currentTime + 0.12);

      gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.36);
    } catch (error) {
      console.error("Failed to play new order sound:", error);
    }
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const renderStackedDateTime = (value?: string | null) => {
    if (!value) return <span>—</span>;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return <span>—</span>;

    const dateText = date.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });

    const timeText = date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    return (
      <div className="leading-tight text-[11px]">
        <div className="whitespace-nowrap">{dateText}</div>
        <div className="text-zinc-400 whitespace-nowrap">{timeText}</div>
      </div>
    );
  };

  const formatMinutes = (value?: number | null) => {
    if (value === null || value === undefined) return "—";

    if (value < 60) {
      return `${value} min`;
    }

    const hours = Math.floor(value / 60);
    const minutes = value % 60;

    if (minutes === 0) {
      return `${hours} hr`;
    }

    return `${hours} hr ${minutes} min`;
  };

  const formatOrderAge = (createdAt?: string) => {
    if (!createdAt) return "—";

    const createdTime = new Date(createdAt).getTime();
    if (Number.isNaN(createdTime)) return "—";

    const ageMinutes = Math.max(0, Math.floor((nowMs - createdTime) / 60000));

    if (ageMinutes < 60) {
      return `${ageMinutes} min`;
    }

    const hours = Math.floor(ageMinutes / 60);
    const minutes = ageMinutes % 60;

    if (minutes === 0) {
      return `${hours} hr`;
    }

    return `${hours} hr ${minutes} min`;
  };

  const getDriverLocationAgeSeconds = (driver: DriverOption) => {
    const locationTime = new Date(
      driver.locationRecordedAt ||
        driver.locationUpdatedAt ||
        driver.lastSeenAt ||
        ""
    ).getTime();

    if (Number.isNaN(locationTime)) return null;

    return Math.max(0, Math.floor((nowMs - locationTime) / 1000));
  };

  const formatDriverLocationAge = (driver: DriverOption) => {
    const ageSeconds = getDriverLocationAgeSeconds(driver);

    if (ageSeconds === null) return "No GPS yet";

    if (ageSeconds < 60) {
      return `${ageSeconds}s ago`;
    }

    const ageMinutes = Math.floor(ageSeconds / 60);

    if (ageMinutes < 60) {
      return `${ageMinutes} min ago`;
    }

    const ageHours = Math.floor(ageMinutes / 60);
    const remainingMinutes = ageMinutes % 60;

    if (remainingMinutes === 0) {
      return `${ageHours} hr ago`;
    }

    return `${ageHours} hr ${remainingMinutes} min ago`;
  };

  const getDriverLocationStatus = (driver: DriverOption) => {
    const ageSeconds = getDriverLocationAgeSeconds(driver);

    if (!driver.isOnline) return "Offline";
    if (ageSeconds === null) return "No GPS";
    if (ageSeconds <= 20) return "Live";
    if (ageSeconds <= 60) return "Slow";
    return "Stale";
  };

  const formatDriverSpeed = (speedMetersPerSecond?: number | null) => {
    if (speedMetersPerSecond === null || speedMetersPerSecond === undefined) {
      return "—";
    }

    const kmPerHour = Math.round(speedMetersPerSecond * 3.6);

    return `${kmPerHour} km/h`;
  };

  const formatDriverAccuracy = (accuracyMeters?: number | null) => {
    if (accuracyMeters === null || accuracyMeters === undefined) {
      return "—";
    }

    return `${Math.round(accuracyMeters)} m`;
  };

  const formatCompletedDeliveryTime = (
    createdAt?: string | null,
    deliveredAt?: string | null
  ) => {
    if (!createdAt || !deliveredAt) return "—";

    const createdTime = new Date(createdAt).getTime();
    const deliveredTime = new Date(deliveredAt).getTime();

    if (Number.isNaN(createdTime) || Number.isNaN(deliveredTime)) return "—";

    const deliveryMinutes = Math.max(
      0,
      Math.floor((deliveredTime - createdTime) / 60000)
    );

    return `${deliveryMinutes} min`;
  };

  const formatReceiptMoney = (value?: number | string | null) => {
    const numberValue = Number(value || 0);

    if (!Number.isFinite(numberValue)) {
      return "$0.00";
    }

    return numberValue.toLocaleString("en-CA", {
      style: "currency",
      currency: "CAD",
    });
  };

  const getReceiptNoteAmount = (notes: string | null | undefined, label: string) => {
    if (!notes) return 0;

    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const match = notes.match(new RegExp(`${escapedLabel}: \\$?([0-9]+(?:\\.[0-9]{1,2})?)`, "i"));
    const amount = Number(match?.[1] || 0);

    return Number.isFinite(amount) ? amount : 0;
  };

  const getReceiptExtraStops = (notes: string | null | undefined) => {
    if (!notes) return 0;

    const match = notes.match(/Extra stops:\s*([0-9]+)/i);
    const stopCount = Number(match?.[1] || 0);

    return Number.isFinite(stopCount) ? stopCount : 0;
  };

  const buildReceiptText = (order: Order) => {
    const receipt = order.digitalReceipt;

    if (!receipt) {
      return "";
    }

    const itemLines =
      order.items && order.items.length > 0
        ? order.items
            .map((item) => `${item.quantity}x ${item.name}`)
            .join("\n")
        : "No item details available";

    const deliveryAmount = 4.0;
    const hstAmount = 0.52;
    const driverTipAmount = 7.5;
    const extraStopCharge = getReceiptNoteAmount(receipt.notes, "Extra stop charge");
    const distanceSurcharge = getReceiptNoteAmount(receipt.notes, "Distance surcharge");

    return [
      "Speedy Sweeties Digital Receipt",
      "",
      `Receipt #: ${receipt.receiptNumber || "—"}`,
      `Order #: ${order.orderNumber}`,
      `Customer: ${order.customerName}`,
      `Driver: ${getDriverDisplayName(order.assignedDriver)}`,
      `Date: ${formatDateTime(order.deliveredAt || order.updatedAt || order.createdAt)}`,
      "HST #: 822528436RT0001",
      "",
      "Items:",
      itemLines,
      "",
      `Item Total: ${formatReceiptMoney(receipt.itemTotal)}`,
      `Delivery: ${formatReceiptMoney(deliveryAmount)}`,
      `HST: ${formatReceiptMoney(hstAmount)}`,
      `Driver Tip: ${formatReceiptMoney(driverTipAmount)}`,
      extraStopCharge > 0 ? `Extra Stop Charge: ${formatReceiptMoney(extraStopCharge)}` : "",
      `Distance Surcharge: ${formatReceiptMoney(distanceSurcharge)}`,
      `Grand Total: ${formatReceiptMoney(receipt.grandTotal)}`,
      "",
      "I hereby acknowledge receipt of all mentioned goods, any cost of service, and certify I am of the full age of 19 years.",
      "",
      "Thank you for ordering with Speedy Sweeties.",
    ]
      .filter((line) => line !== "")
      .join("\n");
  };

  const viewReceipt = (order: Order) => {
    if (!order.digitalReceipt) {
      alert("No digital receipt saved for this order.");
      return;
    }

    alert(buildReceiptText(order));
  };

  const sendReceiptToCustomer = (order: Order) => {
    if (!order.digitalReceipt) {
      alert("No digital receipt saved for this order.");
      return;
    }

    if (!order.email) {
      alert("This order does not have a customer email address.");
      return;
    }

    const subject = `Speedy Sweeties Receipt #${order.digitalReceipt.receiptNumber || order.orderNumber}`;
    const body = buildReceiptText(order);

    window.location.href = `mailto:${encodeURIComponent(order.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const getDriverDisplayName = (
    driver?: AssignedDriver | DriverOption | DriverManagementItem | DriverStat | null
  ) => {
    if (!driver) return "Unassigned";

    const fullName = `${driver.firstName || ""} ${driver.lastName || ""}`.trim();

    if (fullName) {
      return fullName;
    }

    return driver.email;
  };

  const getChecklistUserDisplayName = (user?: ChecklistUser | null) => {
    if (!user) return "—";

    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();

    return fullName || user.email;
  };

  const formatBusinessDate = (value?: string | null) => {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  const fetchDispatcherChecklist = async (authToken: string, showLoader = true) => {
    try {
      if (showLoader) {
        setDispatcherChecklistLoading(true);
      }

      const response = await fetch(`${API_V1_BASE_URL}/dispatcher-checklist/today`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setDispatcherChecklistItems(data.items || []);
        setDispatcherChecklistSummary({
          businessDate: data.businessDate || null,
          totalRequired: Number(data.totalRequired || 0),
          completedRequired: Number(data.completedRequired || 0),
          isComplete: Boolean(data.isComplete),
        });
      } else {
        alert(getApiErrorMessage(data, "Failed to load daily responsibilities"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading daily responsibilities");
    } finally {
      if (showLoader) {
        setDispatcherChecklistLoading(false);
      }
    }
  };

  const fetchDispatcherChecklistHistory = async (authToken: string, showLoader = true) => {
    try {
      if (showLoader) {
        setDispatcherChecklistLoading(true);
      }

      const response = await fetch(`${API_V1_BASE_URL}/dispatcher-checklist/history?limit=14`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setDispatcherChecklistHistory(data.history || []);
      } else {
        alert(getApiErrorMessage(data, "Failed to load daily responsibilities history"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading daily responsibilities history");
    } finally {
      if (showLoader) {
        setDispatcherChecklistLoading(false);
      }
    }
  };

  const completeDispatcherChecklistItem = async (itemId: string) => {
    if (!token) return;

    try {
      setCompletingChecklistItemId(itemId);

      const response = await fetch(
        `${API_V1_BASE_URL}/dispatcher-checklist/items/${itemId}/complete`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        await fetchDispatcherChecklist(token, false);
        await fetchDispatcherChecklistHistory(token, false);
      } else {
        alert(getApiErrorMessage(data, "Failed to complete checklist item"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while completing checklist item");
    } finally {
      setCompletingChecklistItemId(null);
    }
  };

  const fetchQrTrackingStats = async (showLoader = true) => {
    try {
      if (showLoader) {
        setQrTrackingLoading(true);
      }

      const response = await fetch(`${API_BASE_URL}/q/lighter/stats`);
      const data = await response.json();

      if (response.ok) {
        setQrTrackingCampaigns([
          {
            campaign: data.campaign || "lighter",
            label: "Bic Lighter",
            totalScans: Number(data.totalScans || 0),
            trackingUrl: `${API_BASE_URL}/q/lighter`,
            statsUrl: `${API_BASE_URL}/q/lighter/stats`,
          },
        ]);
      } else {
        alert(getApiErrorMessage(data, "Failed to load QR code tracking stats"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading QR code tracking stats");
    } finally {
      if (showLoader) {
        setQrTrackingLoading(false);
      }
    }
  };

  const getAutoDispatchEnabledFromResponse = (data: any): boolean | null => {
    const rawValue =
      data?.autoDispatchEnabled ??
      data?.enabled ??
      data?.setting?.enabled ??
      data?.setting?.value ??
      data?.value;

    if (typeof rawValue === "boolean") {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      const cleanValue = rawValue.trim().toLowerCase();

      if (cleanValue === "true") return true;
      if (cleanValue === "false") return false;
    }

    return null;
  };

  const fetchAutoDispatchSetting = async (
    authToken: string,
    showLoader = true
  ) => {
    try {
      if (showLoader) {
        setAutoDispatchLoading(true);
      }

      const response = await fetch(`${API_V1_BASE_URL}/orders/auto-dispatch`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        const enabled = getAutoDispatchEnabledFromResponse(data);

        if (enabled !== null) {
          setAutoDispatchEnabled(enabled);
        }
      } else if (showLoader) {
        alert(getApiErrorMessage(data, "Failed to load auto dispatch setting"));
      }
    } catch (error) {
      console.error("Failed to load auto dispatch setting:", error);

      if (showLoader) {
        alert("Server error while loading auto dispatch setting");
      }
    } finally {
      if (showLoader) {
        setAutoDispatchLoading(false);
      }
    }
  };

  const toggleAutoDispatch = async () => {
    if (!token) return;

    if (autoDispatchEnabled === null) {
      alert("Auto Dispatch setting has not loaded yet. Please refresh and try again.");
      return;
    }

    const nextEnabled = !autoDispatchEnabled;

    try {
      setAutoDispatchUpdating(true);

      const response = await fetch(`${API_V1_BASE_URL}/orders/auto-dispatch`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: nextEnabled,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const savedEnabled = getAutoDispatchEnabledFromResponse(data);
        const finalEnabled = savedEnabled === null ? nextEnabled : savedEnabled;

        setAutoDispatchEnabled(finalEnabled);
        alert(`Auto Dispatch is now ${finalEnabled ? "ON" : "OFF"}.`);
      } else {
        alert(getApiErrorMessage(data, "Failed to update auto dispatch setting"));
      }
    } catch (error) {
      console.error("Failed to update auto dispatch setting:", error);
      alert("Server error while updating auto dispatch setting");
    } finally {
      setAutoDispatchUpdating(false);
    }
  };

  const fetchDrivers = async (authToken: string) => {
    try {
     const response = await fetch(`${API_V1_BASE_URL}/auth/drivers`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setDrivers(data.drivers || []);
      }
    } catch (error) {
      console.error("Failed to load drivers:", error);
    }
  };

  const fetchDriverManagement = async (
    authToken: string,
    showLoader = true
  ) => {
    try {
      if (showLoader) {
        setDriverManagementLoading(true);
      }

      const response = await fetch(
        `${API_V1_BASE_URL}/auth/drivers/manage`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setManagedDrivers(data.drivers || []);
      } else {
        alert(getApiErrorMessage(data, "Failed to load driver management"));
      }
    } catch (error) {
      console.error("Failed to load driver management:", error);
      alert("Server error while loading driver management");
    } finally {
      if (showLoader) {
        setDriverManagementLoading(false);
      }
    }
  };

  const updateDriverDispatchVisibility = async (
    driver: DriverManagementItem,
    isVisibleInDispatch: boolean
  ) => {
    if (!token) return;

    if (!isVisibleInDispatch) {
      const confirmed = window.confirm(
        `Hide ${getDriverDisplayName(driver)} from dispatch?\n\nThis will log the driver out and prevent new order assignments. Historical orders, receipts, and statistics will remain available.`
      );

      if (!confirmed) return;
    }

    try {
      setUpdatingDriverVisibilityId(driver.id);

      const response = await fetch(
        `${API_V1_BASE_URL}/auth/drivers/${driver.id}/dispatch-visibility`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            isVisibleInDispatch,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        await fetchDriverManagement(token, false);
        await fetchDrivers(token);
        alert(
          isVisibleInDispatch
            ? "Driver is now visible in dispatch."
            : "Driver is now hidden from dispatch."
        );
      } else {
        alert(getApiErrorMessage(data, "Failed to update driver visibility"));
      }
    } catch (error) {
      console.error("Failed to update driver visibility:", error);
      alert("Server error while updating driver visibility");
    } finally {
      setUpdatingDriverVisibilityId(null);
    }
  };

  const fetchCatalogItems = async (
    authToken: string,
    showLoader = true,
    pageOverride?: number,
    pageSizeOverride?: number
  ) => {
    try {
      if (showLoader) {
        setCatalogLoading(true);
      }

      const requestedPage = Math.max(1, pageOverride ?? catalogPage);
      const requestedPageSize = Math.min(
        100,
        Math.max(1, pageSizeOverride ?? catalogPageSize)
      );

      let url = `${API_V1_BASE_URL}/items`;
      const params = new URLSearchParams();

      params.append("page", String(requestedPage));
      params.append("limit", String(requestedPageSize));

      if (catalogSearch.trim()) {
        params.append("query", catalogSearch.trim());
      }

      if (catalogActiveFilter === "active") {
        params.append("isActive", "true");
      }

      if (catalogActiveFilter === "inactive") {
        params.append("isActive", "false");
      }

      url += `?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        const loadedItems: CatalogItem[] = data.items || [];
        const returnedPage = Math.max(1, Number(data.page) || requestedPage);
        const returnedPageSize = Math.max(
          1,
          Number(data.pageSize) || requestedPageSize
        );
        const returnedTotal = Math.max(
          0,
          Number(data.total ?? data.count ?? loadedItems.length) || 0
        );
        const returnedTotalPages = Math.max(
          1,
          Number(data.totalPages) || Math.ceil(returnedTotal / returnedPageSize) || 1
        );

        setCatalogItems(loadedItems);
        setCatalogTotalItems(returnedTotal);
        setCatalogTotalPages(returnedTotalPages);

        if (returnedPage !== catalogPage) {
          setCatalogPage(returnedPage);
        }

        if (returnedPageSize !== catalogPageSize) {
          setCatalogPageSize(returnedPageSize);
        }
      } else {
        alert(getApiErrorMessage(data, "Failed to load catalog items"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading catalog items");
    } finally {
      if (showLoader) {
        setCatalogLoading(false);
      }
    }
  };

  const handleCatalogSearch = () => {
    if (!token) return;

    setEditingCatalogItemId(null);
    setCatalogEditForm(null);

    if (catalogPage === 1) {
      void fetchCatalogItems(token, true, 1, catalogPageSize);
      return;
    }

    setCatalogPage(1);
  };

  const handleCatalogPageChange = (nextPage: number) => {
    const safePage = Math.min(
      Math.max(1, nextPage),
      Math.max(1, catalogTotalPages)
    );

    if (safePage === catalogPage) return;

    setEditingCatalogItemId(null);
    setCatalogEditForm(null);
    setCatalogPage(safePage);
  };

  const fetchPickupLocations = async (
    authToken: string,
    showLoader = true
  ) => {
    try {
      if (showLoader) {
        setPickupLocationsLoading(true);
      }

      const response = await fetch(
        `${API_V1_BASE_URL}/pickup-locations`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setPickupLocations(data.locations || []);
      } else {
        alert(getApiErrorMessage(data, "Failed to load pickup locations"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading pickup locations");
    } finally {
      if (showLoader) {
        setPickupLocationsLoading(false);
      }
    }
  };

  const handlePickupLocationFormChange = (
    field: keyof PickupLocationForm,
    value: string | boolean
  ) => {
    setPickupLocationForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validatePickupLocationForm = (form: PickupLocationForm) => {
    if (!form.name.trim()) return "Location name is required";
    if (!form.pickupType.trim()) return "Pickup type is required";
    if (!form.addressLine1.trim()) return "Street address is required";
    if (!form.city.trim()) return "City is required";
    if (!form.province.trim()) return "Province is required";

    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return "Latitude must be a number between -90 and 90";
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return "Longitude must be a number between -180 and 180";
    }

    return null;
  };

  const createPickupLocation = async () => {
    if (!token) return;

    const validationMessage = validatePickupLocationForm(pickupLocationForm);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setPickupLocationsLoading(true);

      const response = await fetch(
        `${API_V1_BASE_URL}/pickup-locations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: pickupLocationForm.name.trim(),
            pickupType: pickupLocationForm.pickupType.trim(),
            ...buildAddressRequestFields(pickupLocationForm),
            latitude: Number(pickupLocationForm.latitude),
            longitude: Number(pickupLocationForm.longitude),
            isActive: pickupLocationForm.isActive,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setPickupLocationForm(initialPickupLocationForm);
        await fetchPickupLocations(token, false);
      } else {
        alert(getApiErrorMessage(data, "Failed to create pickup location"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while creating pickup location");
    } finally {
      setPickupLocationsLoading(false);
    }
  };

  const handleStartEditPickupLocation = (location: PickupLocation) => {
    setEditingPickupLocationId(location.id);
    setPickupLocationEditForm({
      name: location.name || "",
      pickupType: location.pickupType || "",
      addressLine1: location.addressLine1 || "",
      city: location.city || "",
      province: location.province || "",
      latitude: String(location.latitude ?? ""),
      longitude: String(location.longitude ?? ""),
      isActive: location.isActive,
    });
  };

  const handlePickupLocationEditFieldChange = (
    field: keyof PickupLocationForm,
    value: string | boolean
  ) => {
    setPickupLocationEditForm((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleCancelPickupLocationEdit = () => {
    setEditingPickupLocationId(null);
    setPickupLocationEditForm(null);
  };

  const handleSavePickupLocation = async (locationId: string) => {
    if (!token || !pickupLocationEditForm) return;

    const validationMessage = validatePickupLocationForm(pickupLocationEditForm);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setPickupLocationsLoading(true);

      const response = await fetch(
        `${API_V1_BASE_URL}/pickup-locations/${locationId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: pickupLocationEditForm.name.trim(),
            pickupType: pickupLocationEditForm.pickupType.trim(),
            ...buildAddressRequestFields(pickupLocationEditForm),
            latitude: Number(pickupLocationEditForm.latitude),
            longitude: Number(pickupLocationEditForm.longitude),
            isActive: pickupLocationEditForm.isActive,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setEditingPickupLocationId(null);
        setPickupLocationEditForm(null);
        await fetchPickupLocations(token, false);
      } else {
        alert(getApiErrorMessage(data, "Failed to update pickup location"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while updating pickup location");
    } finally {
      setPickupLocationsLoading(false);
    }
  };

  const handleDeactivatePickupLocation = async (location: PickupLocation) => {
    if (!token) return;

    const shouldDeactivate = window.confirm(
      `Deactivate "${location.name}"? Existing data will remain saved.`
    );

    if (!shouldDeactivate) return;

    try {
      setPickupLocationsLoading(true);

      const response = await fetch(
        `${API_V1_BASE_URL}/pickup-locations/${location.id}/deactivate`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        await fetchPickupLocations(token, false);
      } else {
        alert(getApiErrorMessage(data, "Failed to deactivate pickup location"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while deactivating pickup location");
    } finally {
      setPickupLocationsLoading(false);
    }
  };

  const fetchCustomers = async (
    authToken: string,
    showLoader = true,
    searchOverride?: string
  ) => {
    try {
      if (showLoader) {
        setCustomersLoading(true);
      }

      const searchTerm = (searchOverride ?? customerProfileSearch).trim();
      const params = new URLSearchParams();

      let url = searchTerm
        ? `${API_V1_BASE_URL}/customers/search`
        : `${API_V1_BASE_URL}/customers`;

      if (searchTerm) {
        params.append("query", searchTerm);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        const loadedCustomers: CustomerProfile[] = data.customers || [];

        setCustomers(
          searchTerm
            ? loadedCustomers.filter((customer) =>
                customerMatchesSearch(customer, searchTerm)
              )
            : loadedCustomers
        );
      } else {
        alert(getApiErrorMessage(data, "Failed to load customers"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading customers");
    } finally {
      if (showLoader) {
        setCustomersLoading(false);
      }
    }
  };

  const fetchCustomerRetention = async (
    authToken: string,
    showLoader = true
  ) => {
    try {
      if (showLoader) {
        setCustomerRetentionLoading(true);
      }

      const response = await fetch(
        `${API_V1_BASE_URL}/customers/retention`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setRetentionCustomers(data.customers || []);
      } else {
        alert(getApiErrorMessage(data, "Failed to load customer retention"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading customer retention");
    } finally {
      if (showLoader) {
        setCustomerRetentionLoading(false);
      }
    }
  };

  const fetchRetentionCustomerHistory = async (
    authToken: string,
    customerId: string
  ) => {
    if (retentionHistoryCustomer?.id === customerId) {
      setRetentionHistoryCustomer(null);
      return;
    }

    try {
      setRetentionHistoryLoadingCustomerId(customerId);

      const response = await fetch(
        `${API_V1_BASE_URL}/customers/${customerId}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setRetentionHistoryCustomer(data.customer || null);
      } else {
        alert(getApiErrorMessage(data, "Failed to load customer order history"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading customer order history");
    } finally {
      setRetentionHistoryLoadingCustomerId(null);
    }
  };

  const fetchDriverStats = async (authToken: string, showLoader = true) => {
    try {
      if (showLoader) {
        setDriverStatsLoading(true);
      }

      let url = `${API_V1_BASE_URL}/orders/driver-stats`;

      const params = new URLSearchParams();

      if (statsStartDate) {
        params.append("startDate", statsStartDate);
      }

      if (statsEndDate) {
        params.append("endDate", statsEndDate);
      }

      if (statsDriverIds.length > 0) {
        params.append("driverIds", statsDriverIds.join(","));
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setDriverStats(data.stats || []);
      } else {
        alert(getApiErrorMessage(data, "Failed to load driver stats"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading driver stats");
    } finally {
      if (showLoader) {
        setDriverStatsLoading(false);
      }
    }
  };

  const fetchDeliveredOrders = async (authToken: string, showLoader = true) => {
    try {
      if (showLoader) {
        setHistoryLoading(true);
      }

      const buildHistoryUrl = (status: "DELIVERED" | "CANCELLED") => {
        let url = `${API_V1_BASE_URL}/orders?status=${status}&page=${historyPage}`;
        const params = new URLSearchParams();

        if (historyStartDate) {
          params.append("startDate", historyStartDate);
        }

        if (historyEndDate) {
          params.append("endDate", historyEndDate);
        }

        if (historyDriverIds.length > 0) {
          params.append("driverId", historyDriverIds.join(","));
        }

        if (params.toString()) {
          url += `&${params.toString()}`;
        }

        return url;
      };

      const [deliveredResponse, cancelledResponse] = await Promise.all([
        fetch(buildHistoryUrl("DELIVERED"), {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }),
        fetch(buildHistoryUrl("CANCELLED"), {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }),
      ]);

      const deliveredData = await deliveredResponse.json();
      const cancelledData = await cancelledResponse.json();

      if (!deliveredResponse.ok) {
        alert(getApiErrorMessage(deliveredData, "Failed to load delivered orders"));
        return;
      }

      if (!cancelledResponse.ok) {
        alert(getApiErrorMessage(cancelledData, "Failed to load cancelled orders"));
        return;
      }

      const combinedOrders: Order[] = [
        ...(deliveredData.orders || []),
        ...(cancelledData.orders || []),
      ];

      combinedOrders.sort((a, b) => {
        const aTime = new Date(
          a.cancelledAt || a.deliveredAt || a.updatedAt || a.createdAt || 0
        ).getTime();
        const bTime = new Date(
          b.cancelledAt || b.deliveredAt || b.updatedAt || b.createdAt || 0
        ).getTime();

        return bTime - aTime;
      });

      setDeliveredOrders(combinedOrders);
      setHistoryTotalPages(
        Math.max(deliveredData.totalPages || 1, cancelledData.totalPages || 1)
      );
    } catch (error) {
      console.error(error);
      alert("Server error while loading order history");
    } finally {
      if (showLoader) {
        setHistoryLoading(false);
      }
    }
  };

  const fetchOrders = async (authToken: string, showLoader = true) => {
    const requestSequence = ++ordersRequestSequenceRef.current;

    try {
      if (showLoader) {
        setDashboardLoading(true);
      }

      const response = await fetch(`${API_V1_BASE_URL}/orders`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (requestSequence !== ordersRequestSequenceRef.current) return;

      if (response.ok) {
        const fetchedOrders: Order[] = data.orders || [];
        const fetchedIds = fetchedOrders.map((order) => order.id);

        if (!hasCompletedInitialLoadRef.current) {
          knownOrderIdsRef.current = new Set(fetchedIds);
          hasCompletedInitialLoadRef.current = true;
        } else {
          const freshOrderIds = fetchedIds.filter(
            (id) => !knownOrderIdsRef.current.has(id)
          );

          if (freshOrderIds.length > 0) {
            setNewOrderIds((prev) => Array.from(new Set([...freshOrderIds, ...prev])));
            playNewOrderSound();
          }

          knownOrderIdsRef.current = new Set(fetchedIds);
        }

        setOrders(fetchedOrders);

        setDriverSelections((prev) => {
          const nextSelections = { ...prev };

          for (const order of fetchedOrders) {
            if (!nextSelections[order.id]) {
              nextSelections[order.id] = order.assignedDriver?.id || "";
            }
          }

          return nextSelections;
        });
      } else {
        alert(getApiErrorMessage(data, "Failed to load orders"));
      }
    } catch (error) {
      if (requestSequence !== ordersRequestSequenceRef.current) return;

      console.error(error);
      alert("Server error while loading orders");
    } finally {
      if (showLoader) {
        setDashboardLoading(false);
      }
    }
  };

  const handleLogin = async () => {
    try {
      setLoginLoading(true);

      const response = await fetch(`${API_V1_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("token", data.token);
        setToken(data.token);
        await fetchOrders(data.token, true);
        await fetchDrivers(data.token);
        await fetchAutoDispatchSetting(data.token, false);
      } else {
        alert(getApiErrorMessage(data, "Login failed"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error during login");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setOrders([]);
    setDeliveredOrders([]);
    setDriverStats([]);
    setDrivers([]);
    setManagedDrivers([]);
    setDriverSelections({});
    setHistoryDriverIds([]);
    setHistoryStartDate("");
    setHistoryEndDate("");
    setStatsDriverIds([]);
    setStatsStartDate("");
    setStatsEndDate("");
    setShowDriverPanel(false);
    setEmail("");
    setPassword("");
    setActiveTab("LIVE_ORDERS");
    setManualOrderForm(initialManualOrderForm);
    setEditingOrderId(null);
    setEditOrderForm(null);
    setEditItemSuggestions({});
    setNewOrderIds([]);
    setCustomerSuggestions([]);
    setItemSuggestions({});
    setCatalogItems([]);
    setCatalogSearch("");
    setCatalogActiveFilter("all");
    setCatalogPage(1);
    setCatalogPageSize(50);
    setCatalogTotalItems(0);
    setCatalogTotalPages(1);
    setEditingCatalogItemId(null);
    setCatalogEditForm(null);
    setUpdatingCatalogPickupTypeId(null);
    setPickupLocations([]);
    setPickupLocationForm(initialPickupLocationForm);
    setEditingPickupLocationId(null);
    setPickupLocationEditForm(null);
    setPickupLocationsLoading(false);
    setCustomers([]);
    setCustomerProfileSearch("");
    setEditingCustomerId(null);
    setCustomerEditForm(null);
    setQrTrackingCampaigns([
      {
        campaign: "lighter",
        label: "Bic Lighter",
        totalScans: 0,
        trackingUrl: `${API_BASE_URL}/q/lighter`,
        statsUrl: `${API_BASE_URL}/q/lighter/stats`,
      },
    ]);
    setAutoDispatchEnabled(null);
    setAutoDispatchLoading(false);
    setAutoDispatchUpdating(false);
    setDispatcherChecklistItems([]);
    setDispatcherChecklistHistory([]);
    setDispatcherChecklistSummary({
      businessDate: null,
      totalRequired: 0,
      completedRequired: 0,
      isComplete: false,
    });
    setCompletingChecklistItemId(null);
    knownOrderIdsRef.current = new Set();
    hasCompletedInitialLoadRef.current = false;
  };

const updateOrderStatus = async (
  orderId: string,
  orderStatus: OrderStatus,
  cancellationReason?: string
) => {
  if (!token) return;

  try {
    setUpdatingOrderId(orderId);

    const response = await fetch(
      `${API_V1_BASE_URL}/orders/${orderId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderStatus,
          cancellationReason,
        }),
      }
    );

    const data = await response.json();

    if (response.ok) {
      await fetchOrders(token, false);
      await fetchDrivers(token);

      if (activeTab === "DELIVERED_HISTORY") {
        await fetchDeliveredOrders(token, false);
      }
    } else {
      alert(getApiErrorMessage(data, "Failed to update order"));
    }
  } catch (error) {
    console.error(error);
    alert("Server error while updating order");
  } finally {
    setUpdatingOrderId(null);
  }
};

const cancelOrder = async (order: Order) => {
  if (order.orderStatus === "DELIVERED") {
    alert("Delivered orders cannot be cancelled.");
    return;
  }

  if (order.orderStatus === "CANCELLED") {
    alert("This order is already cancelled.");
    return;
  }

  const reason = window.prompt(
    `Cancel Order #${order.orderNumber}?

Optional: enter a cancellation reason.`,
    "Cancelled by dispatcher"
  );

  if (reason === null) return;

  const shouldCancel = window.confirm(
    `Are you sure you want to cancel Order #${order.orderNumber}?

This keeps the order in history as CANCELLED and does not count toward loyalty or completed deliveries.`
  );

  if (!shouldCancel) return;

  await updateOrderStatus(
    order.id,
    "CANCELLED",
    reason.trim() || "Cancelled by dispatcher"
  );
};


const updateOrderPriority = async (
  orderId: string,
  priority: "HIGH" | "NORMAL"
) => {
  if (!token) return;

  try {
    setUpdatingOrderId(orderId);

    const response = await fetch(
      `${API_V1_BASE_URL}/orders/${orderId}/priority`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priority }),
      }
    );

    const data = await response.json();

    if (response.ok) {
      await fetchOrders(token, false);
    } else {
      alert(getApiErrorMessage(data, "Failed to update priority"));
    }
  } catch (error) {
    console.error(error);
    alert("Server error while updating priority");
  } finally {
    setUpdatingOrderId(null);
  }
};


const createEditFormFromOrder = (order: Order): EditOrderForm => ({
  customerName: order.customerName || "",
  customerPhone: order.phone || "",
  customerEmail: order.email || "",
  addressLine1: order.addressLine1 || "",
  city: order.city || "Guelph",
  province: order.province || "ON",
  paymentMethod: order.paymentMethod || "CASH",
  additionalNotes: order.additionalNotes || "",
  items:
    order.items && order.items.length > 0
      ? order.items.map((item) => ({
          itemName: item.name || "",
          quantity: String(item.quantity || 1),
        }))
      : [createEmptyManualOrderItem()],
});

const handleStartEditOrder = (order: Order) => {
  if (order.orderStatus === "DELIVERED" || order.orderStatus === "CANCELLED") {
    alert("Delivered or cancelled orders cannot be edited.");
    return;
  }

  setEditingOrderId(order.id);
  setEditOrderForm(createEditFormFromOrder(order));
  setEditItemSuggestions({});
};

const handleCancelEditOrder = () => {
  const shouldDiscard = window.confirm("Discard these order edits?");
  if (!shouldDiscard) return;

  setEditingOrderId(null);
  setEditOrderForm(null);
  setEditItemSuggestions({});
};

const handleEditOrderFieldChange = (
  field: keyof Omit<EditOrderForm, "items">,
  value: string
) => {
  setEditOrderForm((prev) => {
    if (!prev) return prev;

    return {
      ...prev,
      [field]: value,
    };
  });
};

const handleEditOrderItemChange = (
  index: number,
  field: keyof ManualOrderItem,
  value: string
) => {
  setEditOrderForm((prev) => {
    if (!prev) return prev;

    const updatedItems = [...prev.items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };

    return {
      ...prev,
      items: updatedItems,
    };
  });
};

const handleEditItemNameChange = async (index: number, value: string) => {
  handleEditOrderItemChange(index, "itemName", value);

  if (!token || value.trim().length < 2) {
    setEditItemSuggestions((prev) => ({
      ...prev,
      [index]: [],
    }));
    return;
  }

  try {
    const response = await fetch(
      `${API_V1_BASE_URL}/items/search?query=${encodeURIComponent(value)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (response.ok) {
      setEditItemSuggestions((prev) => ({
        ...prev,
        [index]: data.items || [],
      }));
    } else {
      setEditItemSuggestions((prev) => ({
        ...prev,
        [index]: [],
      }));
    }
  } catch (error) {
    console.error(error);
    setEditItemSuggestions((prev) => ({
      ...prev,
      [index]: [],
    }));
  }
};

const selectEditItemSuggestion = (index: number, itemOption: ItemSuggestion) => {
  setEditOrderForm((prev) => {
    if (!prev) return prev;

    const updatedItems = [...prev.items];
    updatedItems[index] = {
      ...updatedItems[index],
      itemName: itemOption.name,
    };

    return {
      ...prev,
      items: updatedItems,
    };
  });

  setEditItemSuggestions((prev) => ({
    ...prev,
    [index]: [],
  }));
};

const handleAddEditOrderItem = () => {
  setEditOrderForm((prev) => {
    if (!prev) return prev;

    return {
      ...prev,
      items: [...prev.items, createEmptyManualOrderItem()],
    };
  });
};

const handleRemoveEditOrderItem = (index: number) => {
  setEditOrderForm((prev) => {
    if (!prev) return prev;

    if (prev.items.length === 1) {
      return {
        ...prev,
        items: [createEmptyManualOrderItem()],
      };
    }

    return {
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    };
  });

  setEditItemSuggestions((prev) => {
    const updated = { ...prev };
    delete updated[index];
    return updated;
  });
};

const handleSaveEditedOrder = async (orderId: string) => {
  if (!token || !editOrderForm) return;

  if (!editOrderForm.customerName.trim()) {
    alert("Customer name is required");
    return;
  }

  if (!editOrderForm.customerPhone.trim()) {
    alert("Customer phone is required");
    return;
  }

  if (!editOrderForm.customerEmail.trim()) {
    alert("Customer email is required");
    return;
  }

  if (!editOrderForm.addressLine1.trim()) {
    alert("Address is required");
    return;
  }

  const cleanedItems = editOrderForm.items
    .map((item) => ({
      name: item.itemName.trim(),
      quantity: Number(item.quantity) || 0,
    }))
    .filter((item) => item.name && item.quantity > 0);

  if (cleanedItems.length === 0) {
    alert("At least one valid item is required");
    return;
  }

  try {
    setUpdatingOrderId(orderId);

    const response = await fetch(
      `${API_V1_BASE_URL}/orders/${orderId}/edit`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerName: editOrderForm.customerName.trim(),
          customerPhone: editOrderForm.customerPhone.trim(),
          customerEmail: editOrderForm.customerEmail.trim(),
          ...buildAddressRequestFields(editOrderForm),
          paymentMethod: editOrderForm.paymentMethod,
          additionalNotes: editOrderForm.additionalNotes.trim(),
          items: cleanedItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: 0,
            totalPrice: 0,
          })),
        }),
      }
    );

    const data = await response.json();

    if (response.ok) {
      setEditingOrderId(null);
      setEditOrderForm(null);
      setEditItemSuggestions({});
      await fetchOrders(token, false);
      await fetchDrivers(token);
      alert("Order updated. The driver app will receive the new order information on its next refresh.");
    } else {
      alert(getApiErrorMessage(data, "Failed to update order"));
    }
  } catch (error) {
    console.error(error);
    alert("Server error while updating order");
  } finally {
    setUpdatingOrderId(null);
  }
};

  const assignDriverToOrder = async (orderId: string, driverId: string | null) => {
    if (!token) return;

    try {
      setUpdatingOrderId(orderId);

      const response = await fetch(
        `${API_V1_BASE_URL}/orders/${orderId}/assign-driver`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            driverId,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        await fetchOrders(token, false);
        await fetchDrivers(token);
      } else {
        alert(getApiErrorMessage(data, "Failed to assign driver"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while assigning driver");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const forceLogoutDriver = async (driverId: string) => {
    if (!token) return;

    const confirmLogout = window.confirm("Force logout this driver?");
    if (!confirmLogout) return;

    try {
      const response = await fetch(
        `${API_V1_BASE_URL}/auth/drivers/${driverId}/force-logout`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        await fetchDrivers(token);
        await fetchDriverManagement(token, false);
        alert("Driver logged out");
      } else {
        alert(getApiErrorMessage(data, "Failed to logout driver"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error");
    }
  };

  const toggleHistoryDriver = (driverId: string) => {
    setHistoryDriverIds((prev) => {
      if (prev.includes(driverId)) {
        return prev.filter((id) => id !== driverId);
      }

      return [...prev, driverId];
    });
  };

  const selectAllHistoryDrivers = () => {
    setHistoryDriverIds(drivers.map((driver) => driver.id));
  };

  const clearHistoryDrivers = () => {
    setHistoryDriverIds([]);
  };

  const clearHistoryFilters = () => {
    setHistoryDriverIds([]);
    setHistoryStartDate("");
    setHistoryEndDate("");
  };

  const toggleStatsDriver = (driverId: string) => {
    setStatsDriverIds((prev) => {
      if (prev.includes(driverId)) {
        return prev.filter((id) => id !== driverId);
      }

      return [...prev, driverId];
    });
  };

  const selectAllStatsDrivers = () => {
    setStatsDriverIds(drivers.map((driver) => driver.id));
  };

  const clearStatsDrivers = () => {
    setStatsDriverIds([]);
  };

  const clearStatsFilters = () => {
    setStatsDriverIds([]);
    setStatsStartDate("");
    setStatsEndDate("");
  };

  const handleManualOrderFieldChange = (
    field: keyof Omit<ManualOrderForm, "items">,
    value: string
  ) => {
    setManualOrderForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const selectCustomerSuggestion = (customer: CustomerSuggestion) => {
    setSelectedCustomer(customer);
    setManualOrderForm((prev) => ({
      ...prev,
      customerName: customer.fullName || "",
      customerPhone: customer.phone || "",
      customerEmail: customer.email || "",
      addressLine1: customer.addressLine1 || "",
      city: customer.city || "Guelph",
      province: customer.province || "ON",
      recurringDriverNotes: recurringDriverNotesForCustomer(
        customer.recurringDriverNotes
      ),
      dispatcherNotes: customer.dispatcherNotes || ""
    }));

    setCustomerSuggestions([]);

    setTimeout(() => {
      const el = document.querySelector(
        'input[placeholder="Item Name"]'
      ) as HTMLInputElement | null;

      if (el) el.focus();
    }, 50);
  };

 const handleCustomerSearchChange = async (
   field: "customerName" | "customerPhone",
   value: string
 ) => {
   handleManualOrderFieldChange(field, value);
   setSelectedCustomer(null);
   setActiveCustomerSearchField(field);

   if (!token || value.trim().length < 3) {
     setCustomerSuggestions([]);
     return;
   }

   try {
     const response = await fetch(
       `${API_V1_BASE_URL}/customers/search?query=${encodeURIComponent(
         value
       )}`,
       {
         headers: {
           Authorization: `Bearer ${token}`,
         },
       }
     );

     const data = await response.json();

     if (response.ok) {
       const customers: CustomerSuggestion[] = data.customers || [];
       const cleanValue = value.trim().toLowerCase();
       const normalizedValue = value.replace(/\D/g, "");

       const filteredCustomers = customers.filter((customer) => {
         if (field === "customerName") {
           return customer.fullName.toLowerCase().includes(cleanValue);
         }

         return customer.phone.replace(/\D/g, "").includes(normalizedValue);
       });

       const sortedCustomers = [...filteredCustomers].sort((a, b) => {
         if (field === "customerName") {
           const aName = a.fullName.toLowerCase();
           const bName = b.fullName.toLowerCase();

           const aStarts = aName.startsWith(cleanValue);
           const bStarts = bName.startsWith(cleanValue);

           if (aStarts && !bStarts) return -1;
           if (!aStarts && bStarts) return 1;

           return aName.localeCompare(bName);
         }

         const aPhone = a.phone.replace(/\D/g, "");
         const bPhone = b.phone.replace(/\D/g, "");

         const aStarts = aPhone.startsWith(normalizedValue);
         const bStarts = bPhone.startsWith(normalizedValue);

         if (aStarts && !bStarts) return -1;
         if (!aStarts && bStarts) return 1;

         return aPhone.localeCompare(bPhone);
       });

       if (field === "customerPhone") {
         const exactPhoneMatch = sortedCustomers.find(
           (customer) => customer.phone.replace(/\D/g, "") === normalizedValue
         );

         if (exactPhoneMatch) {
           selectCustomerSuggestion(exactPhoneMatch);
           return;
         }
       }

       setCustomerSuggestions(sortedCustomers);
     } else {
       setCustomerSuggestions([]);
     }
   } catch (error) {
     console.error(error);
     setCustomerSuggestions([]);
   }
 };


  const handleManualOrderItemChange = (
    index: number,
    field: keyof ManualOrderItem,
    value: string
  ) => {
    setManualOrderForm((prev) => {
      const updatedItems = [...prev.items];
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: value,
      };

      return {
        ...prev,
        items: updatedItems,
      };
    });
  };

  const handleItemNameChange = async (index: number, value: string) => {
    handleManualOrderItemChange(index, "itemName", value);

    if (!token || value.trim().length < 2) {
      setItemSuggestions((prev) => ({
        ...prev,
        [index]: [],
      }));
      return;
    }

    try {
      const response = await fetch(
        `${API_V1_BASE_URL}/items/search?query=${encodeURIComponent(value)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setItemSuggestions((prev) => ({
          ...prev,
          [index]: data.items || [],
        }));
      } else {
        setItemSuggestions((prev) => ({
          ...prev,
          [index]: [],
        }));
      }
    } catch (error) {
      console.error(error);
      setItemSuggestions((prev) => ({
        ...prev,
        [index]: [],
      }));
    }
  };

  const selectItemSuggestion = (index: number, itemOption: ItemSuggestion) => {
    setManualOrderForm((prev) => {
      const updatedItems = [...prev.items];
      updatedItems[index] = {
        ...updatedItems[index],
        itemName: itemOption.name,
      };

      return {
        ...prev,
        items: updatedItems,
      };
    });

    setItemSuggestions((prev) => ({
      ...prev,
      [index]: [],
    }));
  };

  const handleAddAnotherItem = () => {
    setManualOrderForm((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyManualOrderItem()],
    }));
  };

  const handleRemoveItem = (index: number) => {
    setManualOrderForm((prev) => {
      if (prev.items.length === 1) {
        return {
          ...prev,
          items: [createEmptyManualOrderItem()],
        };
      }

      return {
        ...prev,
        items: prev.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });

    setItemSuggestions((prev) => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  };

  const handleManualOrderSubmit = async () => {
    const customerName = manualOrderForm.customerName.trim();
    const customerPhone = manualOrderForm.customerPhone.trim();
    const customerEmail = manualOrderForm.customerEmail.trim();
    const addressLine1 = manualOrderForm.addressLine1.trim();
    const city = manualOrderForm.city.trim();
    const province = manualOrderForm.province.trim();
    const manualOrderNotes = buildManualOrderNotesPayload(
      manualOrderForm.additionalNotes,
      manualOrderForm.recurringDriverNotes
    );
    const dispatcherNotes = manualOrderForm.dispatcherNotes.trim();

    if (!customerName) {
      alert("Customer name is required.");
      return;
    }

    if (!customerPhone) {
      alert("Customer phone number is required.");
      return;
    }

    if (!isValidPhone(customerPhone)) {
      alert("Customer phone number must be 10 digits, or 11 digits if it starts with 1.");
      return;
    }

    if (!customerEmail) {
      alert("Customer email is required.");
      return;
    }

    if (!isValidEmail(customerEmail)) {
      alert("Please enter a valid customer email address.");
      return;
    }

    if (!addressLine1) {
      alert("Customer address is required.");
      return;
    }

    if (!city) {
      alert("City is required.");
      return;
    }

    if (!province) {
      alert("Province is required.");
      return;
    }

    const cleanedItems = manualOrderForm.items.map((item, index) => ({
      name: item.itemName.trim(),
      quantity: Number(item.quantity),
      itemNumber: index + 1,
    }));

    const hasAnyItemName = cleanedItems.some((item) => item.name);

    if (!hasAnyItemName) {
      alert("At least one item name is required.");
      return;
    }

    const missingItemName = cleanedItems.find(
      (item) => !item.name && item.quantity > 0
    );

    if (missingItemName) {
      alert(`Item ${missingItemName.itemNumber} is missing an item name.`);
      return;
    }

    const invalidQuantityItem = cleanedItems.find(
      (item) => item.name && (!Number.isFinite(item.quantity) || item.quantity <= 0)
    );

    if (invalidQuantityItem) {
      alert(`Item ${invalidQuantityItem.itemNumber} needs a quantity of 1 or more.`);
      return;
    }

    const validItems = cleanedItems
      .filter((item) => item.name && item.quantity > 0)
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
      }));

    if (validItems.length === 0) {
      alert("At least one valid item is required.");
      return;
    }

    try {
      setManualOrderLoading(true);

      const response = await fetch(`${API_V1_BASE_URL}/orders/manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail,
          ...buildAddressRequestFields({ addressLine1, city, province }),
          items: validItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: 0,
            totalPrice: 0,
          })),
          subtotal: 0,
          deliveryFee: 0,
          tax: 0,
          tip: 0,
          discount: 0,
          total: 0,
          paymentMethod: manualOrderForm.paymentMethod,
          ...manualOrderNotes,
          dispatcherNotes,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert("Manual order created successfully");
        setManualOrderForm(initialManualOrderForm);
        setCustomerSuggestions([]);
        setItemSuggestions({});
        setActiveTab("LIVE_ORDERS");

        if (token) {
          await fetchOrders(token, false);
          await fetchDrivers(token);
        }
      } else {
        alert(getApiErrorMessage(data, "Failed to create manual order. Please check the order information and try again."));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while creating manual order. Please try again.");
    } finally {
      setManualOrderLoading(false);
    }
  };

  const handleManualOrderCancel = () => {
    const shouldDiscard =
      !manualFormIsDirty || window.confirm("Discard the manual order form?");

    if (!shouldDiscard) return;

    setManualOrderForm(initialManualOrderForm);
    setCustomerSuggestions([]);
    setItemSuggestions({});
    setActiveTab("LIVE_ORDERS");
  };

  const handleStartEditCatalogItem = (item: CatalogItem) => {
    setEditingCatalogItemId(item.id);
    setCatalogEditForm({
      name: item.name || "",
      brand: item.brand || "",
      size: item.size || "",
      category: item.category || "",
      source: item.source || "",
      pickupType: CATALOG_PICKUP_TYPE_OPTIONS.includes(
        (item.pickupType || "UNKNOWN").toUpperCase() as
          (typeof CATALOG_PICKUP_TYPE_OPTIONS)[number]
      )
        ? (item.pickupType || "UNKNOWN").toUpperCase()
        : "OTHER",
      isActive: item.isActive,
    });
  };

  const handleCatalogEditFieldChange = (
    field: keyof CatalogEditForm,
    value: string | boolean
  ) => {
    setCatalogEditForm((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleCancelCatalogEdit = () => {
    setEditingCatalogItemId(null);
    setCatalogEditForm(null);
  };

  const handleCatalogPickupTypeChange = async (
    item: CatalogItem,
    nextPickupType: string
  ) => {
    if (!token) return;

    const normalizedPickupType = CATALOG_PICKUP_TYPE_OPTIONS.includes(
      nextPickupType.toUpperCase() as
        (typeof CATALOG_PICKUP_TYPE_OPTIONS)[number]
    )
      ? nextPickupType.toUpperCase()
      : "UNKNOWN";

    const currentPickupType = CATALOG_PICKUP_TYPE_OPTIONS.includes(
      (item.pickupType || "UNKNOWN").toUpperCase() as
        (typeof CATALOG_PICKUP_TYPE_OPTIONS)[number]
    )
      ? (item.pickupType || "UNKNOWN").toUpperCase()
      : "OTHER";

    if (normalizedPickupType === currentPickupType) return;

    try {
      setUpdatingCatalogPickupTypeId(item.id);

      const response = await fetch(
        `${API_V1_BASE_URL}/items/${item.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            pickupType: normalizedPickupType,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setCatalogItems((prev) =>
          prev.map((catalogItem) =>
            catalogItem.id === item.id
              ? { ...catalogItem, pickupType: normalizedPickupType }
              : catalogItem
          )
        );

        if (editingCatalogItemId === item.id && catalogEditForm) {
          setCatalogEditForm((prev) =>
            prev
              ? {
                  ...prev,
                  pickupType: normalizedPickupType,
                }
              : prev
          );
        }
      } else {
        alert(getApiErrorMessage(data, "Failed to update pickup type"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while updating pickup type");
    } finally {
      setUpdatingCatalogPickupTypeId(null);
    }
  };

  const handleSaveCatalogItem = async (itemId: string) => {
    if (!token || !catalogEditForm) return;

    if (!catalogEditForm.name.trim()) {
      alert("Catalog item name is required");
      return;
    }

    try {
      setCatalogLoading(true);

      const response = await fetch(
        `${API_V1_BASE_URL}/items/${itemId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: catalogEditForm.name.trim(),
            brand: catalogEditForm.brand.trim(),
            size: catalogEditForm.size.trim(),
            category: catalogEditForm.category.trim(),
            source: catalogEditForm.source.trim(),
            pickupType: (catalogEditForm.pickupType.trim() || "UNKNOWN").toUpperCase(),
            isActive: catalogEditForm.isActive,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setEditingCatalogItemId(null);
        setCatalogEditForm(null);
        await fetchCatalogItems(token, false);
      } else {
        alert(getApiErrorMessage(data, "Failed to update catalog item"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while updating catalog item");
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleDeactivateCatalogItem = async (item: CatalogItem) => {
    if (!token) return;

    const shouldDeactivate = window.confirm(
      `Deactivate "${item.name}"? It will stop showing in autocomplete, but old orders will stay safe.`
    );

    if (!shouldDeactivate) return;

    try {
      setCatalogLoading(true);

      const response = await fetch(
        `${API_V1_BASE_URL}/items/${item.id}/deactivate`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        await fetchCatalogItems(token, false);
      } else {
        alert(getApiErrorMessage(data, "Failed to deactivate catalog item"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while deactivating catalog item");
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleStartEditCustomer = (customer: CustomerProfile) => {
    setEditingCustomerId(customer.id);
    setCustomerEditForm({
      fullName: customer.fullName || "",
      phone: customer.phone || "",
      email: customer.email || "",
      addressLine1: customer.addressLine1 || "",
      city: customer.city || "Guelph",
      province: customer.province || "ON",
      dispatcherNotes: customer.dispatcherNotes || "",
    });
  };

  const handleCustomerEditFieldChange = (
    field: keyof CustomerEditForm,
    value: string
  ) => {
    setCustomerEditForm((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleCancelCustomerEdit = () => {
    setEditingCustomerId(null);
    setCustomerEditForm(null);
  };

  const handleSaveCustomer = async (customerId: string) => {
    if (!token || !customerEditForm) return;

    if (!customerEditForm.fullName.trim()) {
      alert("Customer name is required");
      return;
    }

    if (!customerEditForm.phone.trim()) {
      alert("Customer phone is required");
      return;
    }

    if (!customerEditForm.addressLine1.trim()) {
      alert("Customer address is required");
      return;
    }

    try {
      setCustomersLoading(true);

      const response = await fetch(
        `${API_V1_BASE_URL}/customers/${customerId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName: customerEditForm.fullName.trim(),
            phone: customerEditForm.phone.trim(),
            email: customerEditForm.email.trim(),
            ...buildAddressRequestFields(customerEditForm),
            dispatcherNotes: customerEditForm.dispatcherNotes.trim(),
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setEditingCustomerId(null);
        setCustomerEditForm(null);
        await fetchCustomers(token, false);
      } else {
        alert(getApiErrorMessage(data, "Failed to update customer"));
      }
    } catch (error) {
      console.error(error);
      alert("Server error while updating customer");
    } finally {
      setCustomersLoading(false);
    }
  };

  const getStatusClasses = (status: OrderStatus) => {
    switch (status) {
      case "PLACED":
        return "bg-red-500/20 text-red-200 border border-red-400/40 shadow-[0_0_0_1px_rgba(248,113,113,0.15)]";
      case "DISPATCHED":
        return "bg-indigo-500/20 text-indigo-200 border border-indigo-400/40 shadow-[0_0_0_1px_rgba(129,140,248,0.15)]";
      case "ACCEPTED":
        return "bg-yellow-500/20 text-yellow-200 border border-yellow-400/40 shadow-[0_0_0_1px_rgba(250,204,21,0.15)]";
      case "OUT_FOR_DELIVERY":
        return "bg-purple-500/20 text-purple-200 border border-purple-400/40 shadow-[0_0_0_1px_rgba(192,132,252,0.15)]";
      case "DELIVERED":
        return "bg-green-500/20 text-green-200 border border-green-400/40 shadow-[0_0_0_1px_rgba(74,222,128,0.15)]";
      case "CANCELLED":
        return "bg-red-500/20 text-red-200 border border-red-400/40 shadow-[0_0_0_1px_rgba(248,113,113,0.15)]";
      default:
        return "bg-zinc-700 text-zinc-200 border border-zinc-600";
    }
  };

  const getStatusLabel = (status: OrderStatus) => {
    switch (status) {
      case "PLACED":
        return "NEW ORDER";
      case "DISPATCHED":
        return "DISPATCHED";
      case "OUT_FOR_DELIVERY":
        return "OUT FOR DELIVERY";
      default:
        return status;
    }
  };


  const renderDispatcherChecklist = () => {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Daily Dispatcher Responsibilities</h2>
              <p className="text-zinc-400 mt-1">
                Complete each required task before the end of the day. Each click is saved with the dispatcher name and timestamp.
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                Business date: {formatBusinessDate(dispatcherChecklistSummary.businessDate)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!token) return;
                void fetchDispatcherChecklist(token, true);
                void fetchDispatcherChecklistHistory(token, false);
              }}
              disabled={dispatcherChecklistLoading}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
            >
              {dispatcherChecklistLoading ? "Refreshing..." : "Refresh Checklist"}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3 mt-6">
            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <p className="text-zinc-400 text-sm">Required Completed</p>
              <p className="text-2xl font-bold mt-1">
                {dispatcherChecklistSummary.completedRequired} / {dispatcherChecklistSummary.totalRequired}
              </p>
            </div>

            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <p className="text-zinc-400 text-sm">Daily Status</p>
              <p className={`text-2xl font-bold mt-1 ${dispatcherChecklistSummary.isComplete ? "text-green-300" : "text-yellow-300"}`}>
                {dispatcherChecklistSummary.isComplete ? "Complete" : "Incomplete"}
              </p>
            </div>

            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <p className="text-zinc-400 text-sm">Daily Accountability</p>
              <p className="text-sm text-zinc-300 mt-1">
                Checklist completion is saved with dispatcher name and timestamp for daily review.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <h3 className="text-xl font-bold mb-4">Today&apos;s Checklist</h3>

          {dispatcherChecklistItems.length === 0 ? (
            <p className="text-zinc-400">No checklist items loaded yet.</p>
          ) : (
            <div className="space-y-3">
              {dispatcherChecklistItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${
                          item.isCompleted
                            ? "bg-green-500/20 text-green-200 border-green-400/40"
                            : "bg-yellow-500/20 text-yellow-200 border-yellow-400/40"
                        }`}
                      >
                        {item.isCompleted ? "DONE" : "NOT DONE"}
                      </span>

                    </div>

                    <p className="font-semibold text-white mt-3">{item.label}</p>
                    {item.description && (
                      <p className="text-zinc-400 text-sm mt-1">{item.description}</p>
                    )}

                    <p className="text-zinc-500 text-xs mt-2">
                      Completed by: {getChecklistUserDisplayName(item.completedBy)}
                      {" • "}
                      Timestamp: {formatDateTime(item.completedAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void completeDispatcherChecklistItem(item.id)}
                    disabled={completingChecklistItemId === item.id}
                    className={`px-4 py-2 rounded-lg font-semibold transition disabled:opacity-50 ${
                      item.isCompleted
                        ? "bg-zinc-700 hover:bg-zinc-600"
                        : "bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    {completingChecklistItemId === item.id
                      ? "Saving..."
                      : item.isCompleted
                        ? "Update Timestamp"
                        : "Mark Done"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <h3 className="text-xl font-bold mb-4">Checklist History</h3>

          {dispatcherChecklistHistory.length === 0 ? (
            <p className="text-zinc-400">No checklist history loaded yet.</p>
          ) : (
            <div className="space-y-4">
              {dispatcherChecklistHistory.map((day) => (
                <div key={day.businessDate} className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-bold text-white">{formatBusinessDate(day.businessDate)}</p>
                      <p className="text-zinc-400 text-sm">
                        {day.completedRequired} / {day.totalRequired} required completed
                      </p>
                    </div>

                    <span
                      className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold border ${
                        day.isComplete
                          ? "bg-green-500/20 text-green-200 border-green-400/40"
                          : "bg-yellow-500/20 text-yellow-200 border-yellow-400/40"
                      }`}
                    >
                      {day.isComplete ? "COMPLETE" : "INCOMPLETE"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {day.items.map((item) => (
                      <div key={`${day.businessDate}-${item.id}`} className="flex flex-col gap-1 border-t border-zinc-700 pt-2 text-sm md:flex-row md:items-center md:justify-between">
                        <span className={item.isCompleted ? "text-zinc-200" : "text-zinc-500"}>
                          {item.isCompleted ? "✅" : "⬜"} {item.label}
                        </span>
                        <span className="text-zinc-500">
                          {item.isCompleted
                            ? `${getChecklistUserDisplayName(item.completedBy)} • ${formatDateTime(item.completedAt)}`
                            : "Not completed"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQrTracking = () => {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">QR Code Tracking</h2>
              <p className="text-zinc-400 mt-1">
                Track scans from printed marketing campaigns.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void fetchQrTrackingStats(true)}
              disabled={qrTrackingLoading}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
            >
              {qrTrackingLoading ? "Refreshing..." : "Refresh QR Stats"}
            </button>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-zinc-800 text-zinc-300">
                <tr>
                  <th className="text-left p-3">Campaign</th>
                  <th className="text-left p-3">Total Scans</th>
                  <th className="text-left p-3">QR Link</th>
                  <th className="text-left p-3">Stats Link</th>
                </tr>
              </thead>

              <tbody>
                {qrTrackingCampaigns.map((campaign) => (
                  <tr
                    key={campaign.campaign}
                    className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                  >
                    <td className="p-3 font-semibold text-white">{campaign.label}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center rounded-full bg-red-500/20 border border-red-400/40 px-3 py-1 text-red-100 font-bold">
                        {campaign.totalScans}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-300 break-all">{campaign.trackingUrl}</td>
                    <td className="p-3 text-zinc-300 break-all">{campaign.statsUrl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderCatalogAdmin = () => {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Catalog</h2>
              <p className="text-zinc-400 mt-1">
                Search, edit, and deactivate learned catalog items.
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                {catalogTotalItems === 0
                  ? "Showing 0 catalog items."
                  : `Showing ${(catalogPage - 1) * catalogPageSize + 1}-${Math.min(
                      catalogPage * catalogPageSize,
                      catalogTotalItems
                    )} of ${catalogTotalItems} catalog items. Page ${catalogPage} of ${catalogTotalPages}.`}
              </p>
            </div>

            <button
              onClick={() => token && void fetchCatalogItems(token, true)}
              disabled={catalogLoading}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
            >
              {catalogLoading ? "Refreshing..." : "Refresh Catalog"}
            </button>
          </div>

          <form
            className="grid gap-3 md:grid-cols-[1fr_220px_160px_auto] mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              handleCatalogSearch();
            }}
          >
            <input
              type="text"
              placeholder="Search catalog by name, brand, category, or source"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />

            <select
              value={catalogActiveFilter}
              onChange={(e) => {
                setCatalogActiveFilter(
                  e.target.value as "all" | "active" | "inactive"
                );
                setCatalogPage(1);
                setEditingCatalogItemId(null);
                setCatalogEditForm(null);
              }}
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
            >
              <option value="all">All items</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>

            <select
              value={catalogPageSize}
              onChange={(e) => {
                setCatalogPageSize(Number(e.target.value));
                setCatalogPage(1);
                setEditingCatalogItemId(null);
                setCatalogEditForm(null);
              }}
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
              aria-label="Catalog items per page"
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>

            <button
              type="submit"
              disabled={catalogLoading}
              className="px-5 py-3 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
            >
              Search
            </button>
          </form>
        </div>

        {catalogLoading && catalogItems.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            Loading catalog items...
          </div>
        ) : catalogItems.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            No catalog items found.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="text-left p-3">Item</th>
                    <th className="text-left p-3">Pickup Type</th>
                    <th className="text-left p-3">Brand</th>
                    <th className="text-left p-3">Size</th>
                    <th className="text-left p-3">Category</th>
                    <th className="text-left p-3">Source</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Popularity</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {catalogItems.map((item) => {
                    const isEditing = editingCatalogItemId === item.id && catalogEditForm;

                    return (
                      <tr
                        key={item.id}
                        className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                      >
                        {isEditing ? (
                          <>
                            <td className="p-2 align-top">
                              <input
                                type="text"
                                value={catalogEditForm.name}
                                onChange={(e) =>
                                  handleCatalogEditFieldChange("name", e.target.value)
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <select
                                value={catalogEditForm.pickupType}
                                onChange={(e) =>
                                  handleCatalogEditFieldChange("pickupType", e.target.value)
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              >
                                {CATALOG_PICKUP_TYPE_OPTIONS.map((pickupType) => (
                                  <option key={pickupType} value={pickupType}>
                                    {pickupType.replace(/_/g, " ")}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-2 align-top">
                              <input
                                type="text"
                                value={catalogEditForm.brand}
                                onChange={(e) =>
                                  handleCatalogEditFieldChange("brand", e.target.value)
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <input
                                type="text"
                                value={catalogEditForm.size}
                                onChange={(e) =>
                                  handleCatalogEditFieldChange("size", e.target.value)
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <input
                                type="text"
                                value={catalogEditForm.category}
                                onChange={(e) =>
                                  handleCatalogEditFieldChange("category", e.target.value)
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <input
                                type="text"
                                value={catalogEditForm.source}
                                onChange={(e) =>
                                  handleCatalogEditFieldChange("source", e.target.value)
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <label className="flex items-center gap-2 text-zinc-300">
                                <input
                                  type="checkbox"
                                  checked={catalogEditForm.isActive}
                                  onChange={(e) =>
                                    handleCatalogEditFieldChange("isActive", e.target.checked)
                                  }
                                />
                                Active
                              </label>
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              {item.popularityScore || 0}
                            </td>

                            <td className="p-2 align-top">
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveCatalogItem(item.id)}
                                  disabled={catalogLoading}
                                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
                                >
                                  Save
                                </button>

                                <button
                                  type="button"
                                  onClick={handleCancelCatalogEdit}
                                  disabled={catalogLoading}
                                  className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition disabled:opacity-50 font-semibold"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-2 align-top">
                              <p className="font-semibold text-zinc-100">{item.name}</p>
                              <p className="text-zinc-500 text-xs break-all">{item.id}</p>
                            </td>

                            <td className="p-2 align-top">
                              <select
                                value={
                                  CATALOG_PICKUP_TYPE_OPTIONS.includes(
                                    (item.pickupType || "UNKNOWN").toUpperCase() as
                                      (typeof CATALOG_PICKUP_TYPE_OPTIONS)[number]
                                  )
                                    ? (item.pickupType || "UNKNOWN").toUpperCase()
                                    : "OTHER"
                                }
                                onChange={(e) =>
                                  void handleCatalogPickupTypeChange(
                                    item,
                                    e.target.value
                                  )
                                }
                                disabled={
                                  catalogLoading ||
                                  updatingCatalogPickupTypeId === item.id
                                }
                                className="w-full min-w-[150px] p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500 disabled:opacity-50"
                                aria-label={`Pickup type for ${item.name}`}
                              >
                                {CATALOG_PICKUP_TYPE_OPTIONS.map((pickupType) => (
                                  <option key={pickupType} value={pickupType}>
                                    {pickupType.replace(/_/g, " ")}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              {item.brand || "—"}
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              {item.size || "—"}
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              {item.category || "—"}
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              {item.source || "—"}
                            </td>

                            <td className="p-2 align-top">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold border ${
                                  item.isActive
                                    ? "bg-green-500/20 text-green-200 border-green-400/40"
                                    : "bg-red-500/20 text-red-200 border-red-400/40"
                                }`}
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              {item.popularityScore || 0}
                            </td>

                            <td className="p-2 align-top">
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditCatalogItem(item)}
                                  className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition font-semibold"
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void handleDeactivateCatalogItem(item)}
                                  disabled={!item.isActive || catalogLoading}
                                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
                                >
                                  Deactivate
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4 border-t border-zinc-800 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-400">
                Page {catalogPage} of {catalogTotalPages} · {catalogTotalItems} total items
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCatalogPageChange(1)}
                  disabled={catalogLoading || catalogPage <= 1}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40 font-semibold"
                >
                  First
                </button>

                <button
                  type="button"
                  onClick={() => handleCatalogPageChange(catalogPage - 1)}
                  disabled={catalogLoading || catalogPage <= 1}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40 font-semibold"
                >
                  Previous
                </button>

                <span className="px-3 py-2 text-sm font-semibold text-zinc-200">
                  {catalogPage} / {catalogTotalPages}
                </span>

                <button
                  type="button"
                  onClick={() => handleCatalogPageChange(catalogPage + 1)}
                  disabled={catalogLoading || catalogPage >= catalogTotalPages}
                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-40 font-semibold"
                >
                  Next
                </button>

                <button
                  type="button"
                  onClick={() => handleCatalogPageChange(catalogTotalPages)}
                  disabled={catalogLoading || catalogPage >= catalogTotalPages}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40 font-semibold"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPickupLocations = () => {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Pickup Locations</h2>
              <p className="text-zinc-400 mt-1">
                Add and manage frequently used pickup points for future dispatch planning.
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                {pickupLocations.length} saved location
                {pickupLocations.length === 1 ? "" : "s"}.
              </p>
            </div>

            <button
              type="button"
              onClick={() => token && void fetchPickupLocations(token, true)}
              disabled={pickupLocationsLoading}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
            >
              {pickupLocationsLoading ? "Refreshing..." : "Refresh Locations"}
            </button>
          </div>

          <div className="grid gap-3 mt-6 md:grid-cols-2 lg:grid-cols-4">
            <input
              type="text"
              placeholder="Location Name"
              value={pickupLocationForm.name}
              onChange={(e) =>
                handlePickupLocationFormChange("name", e.target.value)
              }
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />

           <select
  value={pickupLocationForm.pickupType}
  onChange={(e) =>
    handlePickupLocationFormChange("pickupType", e.target.value)
  }
  className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
>
  <option value="">Select Pickup Type</option>
  <option value="UNKNOWN">UNKNOWN</option>
  <option value="CONVENIENCE">CONVENIENCE</option>
  <option value="BEER_STORE">Beer Store</option>
  <option value="LCBO">LCBO</option>
  <option value="VAPE">Vape</option>
  <option value="DISPENSARY">Dispensary</option>
</select>

            <input
              type="text"
              placeholder="Street Address"
              value={pickupLocationForm.addressLine1}
              onChange={(e) =>
                handlePickupLocationFormChange("addressLine1", e.target.value)
              }
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />

            <input
              type="text"
              placeholder="City"
              value={pickupLocationForm.city}
              onChange={(e) =>
                handlePickupLocationFormChange("city", e.target.value)
              }
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />

            <input
              type="text"
              placeholder="Province"
              value={pickupLocationForm.province}
              onChange={(e) =>
                handlePickupLocationFormChange("province", e.target.value)
              }
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />

            <input
              type="number"
              step="any"
              placeholder="Latitude"
              value={pickupLocationForm.latitude}
              onChange={(e) =>
                handlePickupLocationFormChange("latitude", e.target.value)
              }
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />

            <input
              type="number"
              step="any"
              placeholder="Longitude"
              value={pickupLocationForm.longitude}
              onChange={(e) =>
                handlePickupLocationFormChange("longitude", e.target.value)
              }
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-4">
            <label className="flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={pickupLocationForm.isActive}
                onChange={(e) =>
                  handlePickupLocationFormChange("isActive", e.target.checked)
                }
              />
              Active
            </label>

            <button
              type="button"
              onClick={() => void createPickupLocation()}
              disabled={pickupLocationsLoading}
              className="px-5 py-3 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
            >
              {pickupLocationsLoading ? "Saving..." : "Add Pickup Location"}
            </button>
          </div>
        </div>

        {pickupLocationsLoading && pickupLocations.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            Loading pickup locations...
          </div>
        ) : pickupLocations.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            No pickup locations have been added yet.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="text-left p-3">Location</th>
                    <th className="text-left p-3">Pickup Type</th>
                    <th className="text-left p-3">Address</th>
                    <th className="text-left p-3">Latitude</th>
                    <th className="text-left p-3">Longitude</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {pickupLocations.map((location) => {
                    const isEditing =
                      editingPickupLocationId === location.id &&
                      pickupLocationEditForm;

                    return (
                      <tr
                        key={location.id}
                        className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                      >
                        {isEditing ? (
                          <>
                            <td className="p-2 align-top">
				<select
  				value={pickupLocationEditForm.pickupType}
 				onChange={(e) =>
   			 	handlePickupLocationEditFieldChange(
      				"pickupType",
      				e.target.value
    				)
  				}
  				className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
				>
  				<option value="">Select Pickup Type</option>
  				<option value="UNKNOWN">UNKNOWN</option>
  				<option value="CONVENIENCE">CONVENIENCE</option>
  				<option value="BEER_STORE">Beer Store</option>
  				<option value="LCBO">LCBO</option>
  				<option value="VAPE">Vape</option>
  				<option value="DISPENSARY">Dispensary</option>
				</select>
                              

                            </td>

                            <td className="p-2 align-top">
                              <input
                                type="text"
                                value={pickupLocationEditForm.pickupType}
                                onChange={(e) =>
                                  handlePickupLocationEditFieldChange(
                                    "pickupType",
                                    e.target.value
                                  )
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <div className="grid gap-2">
                                <input
                                  type="text"
                                  value={pickupLocationEditForm.addressLine1}
                                  onChange={(e) =>
                                    handlePickupLocationEditFieldChange(
                                      "addressLine1",
                                      e.target.value
                                    )
                                  }
                                  className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    value={pickupLocationEditForm.city}
                                    onChange={(e) =>
                                      handlePickupLocationEditFieldChange(
                                        "city",
                                        e.target.value
                                      )
                                    }
                                    className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                                  />
                                  <input
                                    type="text"
                                    value={pickupLocationEditForm.province}
                                    onChange={(e) =>
                                      handlePickupLocationEditFieldChange(
                                        "province",
                                        e.target.value
                                      )
                                    }
                                    className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="p-2 align-top">
                              <input
                                type="number"
                                step="any"
                                value={pickupLocationEditForm.latitude}
                                onChange={(e) =>
                                  handlePickupLocationEditFieldChange(
                                    "latitude",
                                    e.target.value
                                  )
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <input
                                type="number"
                                step="any"
                                value={pickupLocationEditForm.longitude}
                                onChange={(e) =>
                                  handlePickupLocationEditFieldChange(
                                    "longitude",
                                    e.target.value
                                  )
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <label className="flex items-center gap-2 text-zinc-300">
                                <input
                                  type="checkbox"
                                  checked={pickupLocationEditForm.isActive}
                                  onChange={(e) =>
                                    handlePickupLocationEditFieldChange(
                                      "isActive",
                                      e.target.checked
                                    )
                                  }
                                />
                                Active
                              </label>
                            </td>

                            <td className="p-2 align-top">
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleSavePickupLocation(location.id)
                                  }
                                  disabled={pickupLocationsLoading}
                                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
                                >
                                  Save
                                </button>

                                <button
                                  type="button"
                                  onClick={handleCancelPickupLocationEdit}
                                  disabled={pickupLocationsLoading}
                                  className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition disabled:opacity-50 font-semibold"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 align-top">
                              <p className="font-semibold text-zinc-100">
                                {location.name}
                              </p>
                              <p className="text-zinc-500 text-xs break-all">
                                {location.id}
                              </p>
                            </td>

                            <td className="p-3 align-top text-zinc-300">
                              {location.pickupType}
                            </td>

                            <td className="p-3 align-top text-zinc-300">
                              <div>{location.addressLine1}</div>
                              <div className="text-zinc-500 text-xs">
                                {location.city}, {location.province}
                              </div>
                            </td>

                            <td className="p-3 align-top text-zinc-300">
                              {location.latitude}
                            </td>

                            <td className="p-3 align-top text-zinc-300">
                              {location.longitude}
                            </td>

                            <td className="p-3 align-top">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold border ${
                                  location.isActive
                                    ? "bg-green-500/20 text-green-200 border-green-400/40"
                                    : "bg-red-500/20 text-red-200 border-red-400/40"
                                }`}
                              >
                                {location.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>

                            <td className="p-3 align-top">
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartEditPickupLocation(location)
                                  }
                                  className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition font-semibold"
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDeactivatePickupLocation(location)
                                  }
                                  disabled={
                                    !location.isActive || pickupLocationsLoading
                                  }
                                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
                                >
                                  Deactivate
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCustomerRetention = () => {
    const getRetentionStatusLabel = (status: CustomerRetentionStatus) => {
      if (status === "ACTIVE") return "Active";
      if (status === "AT_RISK") return "At Risk";
      if (status === "LAPSED") return "Lapsed";
      return "Win Back";
    };

    const getRetentionStatusClass = (status: CustomerRetentionStatus) => {
      if (status === "ACTIVE") {
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
      }

      if (status === "AT_RISK") {
        return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
      }

      if (status === "LAPSED") {
        return "bg-orange-500/15 text-orange-300 border-orange-500/30";
      }

      return "bg-red-500/15 text-red-300 border-red-500/30";
    };

    const retentionFilterButtons: Array<{
      value: CustomerRetentionFilter;
      label: string;
      count: number;
    }> = [
      {
        value: "ALL",
        label: "All Customers",
        count: retentionSummary.total,
      },
      {
        value: "ACTIVE",
        label: "Active 0–29 Days",
        count: retentionSummary.active,
      },
      {
        value: "30_PLUS",
        label: "30+ Days",
        count:
          retentionSummary.atRisk +
          retentionSummary.lapsed +
          retentionSummary.winBack,
      },
      {
        value: "60_PLUS",
        label: "60+ Days",
        count: retentionSummary.lapsed + retentionSummary.winBack,
      },
      {
        value: "90_PLUS",
        label: "90+ Days",
        count: retentionSummary.winBack,
      },
    ];

    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Customer Retention</h2>
              <p className="text-zinc-400 mt-1">
                Find customers who have stopped ordering and contact them directly.
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                Showing {filteredRetentionCustomers.length} customers for the current filter.
              </p>
            </div>

            <button
              onClick={() => token && void fetchCustomerRetention(token, true)}
              disabled={customerRetentionLoading}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
            >
              {customerRetentionLoading ? "Refreshing..." : "Refresh Retention"}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mt-6">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-300">Active 0–29 Days</p>
              <p className="text-3xl font-bold mt-1">{retentionSummary.active}</p>
            </div>

            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <p className="text-sm text-yellow-300">At Risk 30–59 Days</p>
              <p className="text-3xl font-bold mt-1">{retentionSummary.atRisk}</p>
            </div>

            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
              <p className="text-sm text-orange-300">Lapsed 60–89 Days</p>
              <p className="text-3xl font-bold mt-1">{retentionSummary.lapsed}</p>
            </div>

            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-300">Win Back 90+ Days</p>
              <p className="text-3xl font-bold mt-1">{retentionSummary.winBack}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-6">
            {retentionFilterButtons.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setRetentionFilter(filter.value)}
                className={`px-4 py-2 rounded-lg border font-semibold transition ${
                  retentionFilter === filter.value
                    ? "bg-red-600 border-red-500 text-white"
                    : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {filter.label} ({filter.count})
              </button>
            ))}
          </div>

          <div className="mt-4">
            <input
              type="text"
              placeholder="Search retention customers by name, phone, email, address, or notes"
              value={retentionSearch}
              onChange={(e) => setRetentionSearch(e.target.value)}
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {customerRetentionLoading && retentionCustomers.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            Loading customer retention...
          </div>
        ) : filteredRetentionCustomers.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            No customers match this retention filter.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">Last Order</th>
                    <th className="text-left p-3">Days Since</th>
                    <th className="text-left p-3">Completed Orders</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Phone / Email</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRetentionCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                    >
                      <td className="p-3 align-top">
                        <p className="font-semibold text-zinc-100">{customer.fullName}</p>
                        <p className="text-zinc-500 text-xs mt-1">
                          {customer.addressLine1}, {customer.city}, {customer.province}
                        </p>
                        {customer.dispatcherNotes ? (
                          <p className="text-zinc-400 text-xs mt-2">
                            Notes: {customer.dispatcherNotes}
                          </p>
                        ) : null}
                      </td>

                      <td className="p-3 align-top text-zinc-300">
                        {renderStackedDateTime(customer.lastOrderAt)}
                      </td>

                      <td className="p-3 align-top">
                        <span
                          className={`font-bold ${
                            customer.daysSinceLastOrder >= 90
                              ? "text-red-300"
                              : customer.daysSinceLastOrder >= 60
                                ? "text-orange-300"
                                : customer.daysSinceLastOrder >= 30
                                  ? "text-yellow-300"
                                  : "text-emerald-300"
                          }`}
                        >
                          {customer.daysSinceLastOrder} days
                        </span>
                      </td>

                      <td className="p-3 align-top text-zinc-200 font-semibold">
                        {customer.completedOrders}
                      </td>

                      <td className="p-3 align-top">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${getRetentionStatusClass(
                            customer.retentionStatus
                          )}`}
                        >
                          {getRetentionStatusLabel(customer.retentionStatus)}
                        </span>
                      </td>

                      <td className="p-3 align-top text-zinc-300">
                        <p>{customer.phone}</p>
                        <p className="text-zinc-500 text-xs mt-1 break-all">
                          {customer.email || "No email"}
                        </p>
                      </td>

                      <td className="p-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`tel:${customer.phone}`}
                            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition font-semibold"
                          >
                            Call
                          </a>

                          <a
                            href={`sms:${customer.phone}`}
                            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition font-semibold"
                          >
                            Text
                          </a>

                          {customer.email ? (
                            <a
                              href={`mailto:${customer.email}`}
                              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition font-semibold"
                            >
                              Email
                            </a>
                          ) : null}

                          <button
                            type="button"
                            onClick={() =>
                              token &&
                              void fetchRetentionCustomerHistory(token, customer.id)
                            }
                            disabled={retentionHistoryLoadingCustomerId === customer.id}
                            className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
                          >
                            {retentionHistoryLoadingCustomerId === customer.id
                              ? "Loading..."
                              : retentionHistoryCustomer?.id === customer.id
                                ? "Hide History"
                                : "View History"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {retentionHistoryCustomer ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-bold">
                  Recent Order History — {retentionHistoryCustomer.fullName}
                </h3>
                <p className="text-zinc-400 text-sm mt-1">
                  Up to the 20 most recent orders already stored on this customer profile.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setRetentionHistoryCustomer(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition font-semibold"
              >
                Close History
              </button>
            </div>

            {!retentionHistoryCustomer.orders ||
            retentionHistoryCustomer.orders.length === 0 ? (
              <p className="text-zinc-400 mt-5">No recent order history found.</p>
            ) : (
              <div className="overflow-x-auto mt-5">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-zinc-800 text-zinc-300">
                    <tr>
                      <th className="text-left p-3">Order</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Placed</th>
                      <th className="text-left p-3">Delivered</th>
                      <th className="text-left p-3">Items</th>
                    </tr>
                  </thead>

                  <tbody>
                    {retentionHistoryCustomer.orders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-t border-zinc-800"
                      >
                        <td className="p-3 font-semibold">#{order.orderNumber}</td>
                        <td className="p-3 text-zinc-300">
                          {order.orderStatus.replace(/_/g, " ")}
                        </td>
                        <td className="p-3 text-zinc-300">
                          {renderStackedDateTime(order.createdAt)}
                        </td>
                        <td className="p-3 text-zinc-300">
                          {renderStackedDateTime(order.deliveredAt)}
                        </td>
                        <td className="p-3 text-zinc-300">
                          {order.items && order.items.length > 0
                            ? order.items
                                .map((item) => `${item.quantity} × ${item.name}`)
                                .join(", ")
                            : order.itemsText || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderCustomerProfiles = () => {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Customer Profiles</h2>
              <p className="text-zinc-400 mt-1">
                Search and edit customer profile information and dispatcher notes.
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                Showing {customers.length} customers.
              </p>
            </div>

            <button
              onClick={() => token && void fetchCustomers(token, true)}
              disabled={customersLoading}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
            >
              {customersLoading ? "Refreshing..." : "Refresh Customers"}
            </button>
          </div>

          <form
            className="grid gap-3 md:grid-cols-[1fr_auto_auto] mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (token) {
                void fetchCustomers(token, true, customerProfileSearch);
              }
            }}
          >
            <input
              type="text"
              placeholder="Search customers by name, phone, email, or city"
              value={customerProfileSearch}
              onChange={(e) => setCustomerProfileSearch(e.target.value)}
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />

            <button
              type="submit"
              disabled={customersLoading}
              className="px-5 py-3 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
            >
              {customersLoading ? "Searching..." : "Search"}
            </button>

            <button
              type="button"
              onClick={() => {
                setCustomerProfileSearch("");
                if (token) {
                  void fetchCustomers(token, true, "");
                }
              }}
              disabled={customersLoading}
              className="px-5 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
            >
              Clear
            </button>
          </form>
        </div>

        {customersLoading && customers.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            Loading customers...
          </div>
        ) : customers.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            No customers found.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">Phone</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Address</th>
                    <th className="text-left p-3">Dispatcher Notes</th>
                    <th className="text-left p-3">Orders</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {customers.map((customer) => {
                    const isEditing = editingCustomerId === customer.id && customerEditForm;

                    return (
                      <tr
                        key={customer.id}
                        className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                      >
                        {isEditing ? (
                          <>
                            <td className="p-2 align-top">
                              <input
                                type="text"
                                value={customerEditForm.fullName}
                                onChange={(e) =>
                                  handleCustomerEditFieldChange("fullName", e.target.value)
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <input
                                type="text"
                                value={customerEditForm.phone}
                                onChange={(e) =>
                                  handleCustomerEditFieldChange("phone", e.target.value)
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top">
                              <input
                                type="email"
                                value={customerEditForm.email}
                                onChange={(e) =>
                                  handleCustomerEditFieldChange("email", e.target.value)
                                }
                                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top min-w-[280px]">
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={customerEditForm.addressLine1}
                                  onChange={(e) =>
                                    handleCustomerEditFieldChange("addressLine1", e.target.value)
                                  }
                                  className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                                />

                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    value={customerEditForm.city}
                                    onChange={(e) =>
                                      handleCustomerEditFieldChange("city", e.target.value)
                                    }
                                    className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                                  />

                                  <input
                                    type="text"
                                    value={customerEditForm.province}
                                    onChange={(e) =>
                                      handleCustomerEditFieldChange("province", e.target.value)
                                    }
                                    className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                                  />

                                </div>
                              </div>
                            </td>

                            <td className="p-2 align-top min-w-[260px]">
                              <textarea
                                value={customerEditForm.dispatcherNotes}
                                onChange={(e) =>
                                  handleCustomerEditFieldChange("dispatcherNotes", e.target.value)
                                }
                                className="w-full min-h-[90px] p-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                              />
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              {customer._count?.orders || 0}
                            </td>

                            <td className="p-2 align-top">
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveCustomer(customer.id)}
                                  disabled={customersLoading}
                                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
                                >
                                  Save
                                </button>

                                <button
                                  type="button"
                                  onClick={handleCancelCustomerEdit}
                                  disabled={customersLoading}
                                  className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition disabled:opacity-50 font-semibold"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-2 align-top">
                              <p className="font-semibold text-zinc-100">{customer.fullName}</p>
                              <p className="text-zinc-500 text-xs break-all">{customer.id}</p>
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              {customer.phone}
                            </td>

                            <td className="p-2 align-top text-zinc-300 break-all">
                              {customer.email || "—"}
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              <p>{customer.addressLine1}</p>
                              <p className="text-zinc-500 text-xs mt-1">
                                {[customer.city, customer.province]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            </td>

                            <td className="p-2 align-top">
                              {customer.dispatcherNotes ? (
                                <div className="bg-red-900 border border-red-500 rounded-xl p-3">
                                  <p className="text-red-300 text-xs mb-1">
                                    Dispatcher Warning
                                  </p>
                                  <p className="text-red-100 font-semibold">
                                    ⚠ {customer.dispatcherNotes}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-zinc-500">—</span>
                              )}
                            </td>

                            <td className="p-2 align-top text-zinc-300">
                              {customer._count?.orders || 0}
                            </td>

                            <td className="p-2 align-top">
                              <button
                                type="button"
                                onClick={() => handleStartEditCustomer(customer)}
                                className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition font-semibold"
                              >
                                Edit
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderEditOrderForm = (order: Order) => {
    if (!editOrderForm) return null;

    const isUpdating = updatingOrderId === order.id;

    return (
      <div className="bg-zinc-800/80 border border-red-500 rounded-xl p-3 space-y-4 text-sm">
        <div>
          <p className="text-red-300 font-bold">Editing Order #{order.orderNumber}</p>
          <p className="text-zinc-400 text-xs mt-1">
            Save changes to update the order for the dispatcher and driver app.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="text"
            placeholder="Customer Name"
            value={editOrderForm.customerName}
            onChange={(e) => handleEditOrderFieldChange("customerName", e.target.value)}
            className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
          />

          <input
            type="text"
            placeholder="Customer Phone"
            value={editOrderForm.customerPhone}
            onChange={(e) => handleEditOrderFieldChange("customerPhone", e.target.value)}
            className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
          />

          <input
            type="email"
            placeholder="Customer Email"
            value={editOrderForm.customerEmail}
            onChange={(e) => handleEditOrderFieldChange("customerEmail", e.target.value)}
            className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500 md:col-span-2"
          />

          <input
            ref={editAddressInputRef}
            type="text"
            placeholder="Address Line 1"
            value={editOrderForm.addressLine1}
            onChange={(e) => handleEditOrderFieldChange("addressLine1", e.target.value)}
            className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500 md:col-span-2"
          />

          <p className="text-zinc-500 text-xs md:col-span-2 -mt-2">
            Select a suggestion to fill the civic address, or enter an unusual valid address manually. Put access instructions in Additional Notes.
          </p>

          <input
            type="text"
            placeholder="City"
            value={editOrderForm.city}
            onChange={(e) => handleEditOrderFieldChange("city", e.target.value)}
            className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
          />

          <input
            type="text"
            placeholder="Province"
            value={editOrderForm.province}
            onChange={(e) => handleEditOrderFieldChange("province", e.target.value)}
            className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
          />

          <select
            value={editOrderForm.paymentMethod}
            onChange={(e) =>
              handleEditOrderFieldChange("paymentMethod", e.target.value as PaymentMethod)
            }
            className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
          >
            <option value="CASH">Cash</option>
            <option value="DEBIT">Debit</option>
            <option value="VISA">Visa</option>
            <option value="MASTERCARD">Mastercard</option>
            <option value="ETRANSFER">E-transfer</option>
          </select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-zinc-300 font-semibold">Items</p>
            <button
              type="button"
              onClick={handleAddEditOrderItem}
              className="px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition text-xs font-semibold"
            >
              Add Item
            </button>
          </div>

          {editOrderForm.items.map((item, index) => (
            <div key={`edit-item-${index}`} className="grid gap-2 md:grid-cols-[1fr_80px_auto]">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Item Name"
                  value={item.itemName}
                  onChange={(e) => void handleEditItemNameChange(index, e.target.value)}
                  className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
                />

                {editItemSuggestions[index]?.length > 0 && (
                  <div className="absolute z-30 mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
                    {editItemSuggestions[index].map((itemOption) => (
                      <button
                        key={itemOption.id}
                        type="button"
                        onClick={() => selectEditItemSuggestion(index, itemOption)}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition border-b border-zinc-800 last:border-b-0"
                      >
                        <div className="text-white font-medium">{itemOption.name}</div>
                        {(itemOption.brand || itemOption.category || itemOption.size) && (
                          <div className="text-zinc-500 text-xs">
                            {[itemOption.brand, itemOption.category, itemOption.size]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="number"
                min="1"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Qty"
                value={item.quantity}
                onWheel={(e) => e.currentTarget.blur()}
                onKeyDown={(e) => {
                  if (["e", "E", "+", "-", "."].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => handleEditOrderItemChange(index, "quantity", e.target.value.replace(/\D/g, ""))}
                className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
              />

              <button
                type="button"
                onClick={() => handleRemoveEditOrderItem(index)}
                className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition text-xs font-semibold"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <textarea
          placeholder="Additional Notes"
          value={editOrderForm.additionalNotes}
          onChange={(e) => handleEditOrderFieldChange("additionalNotes", e.target.value)}
          className="w-full min-h-[90px] p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => void handleSaveEditedOrder(order.id)}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
          >
            {isUpdating ? "Saving..." : "Save Changes"}
          </button>

          <button
            type="button"
            disabled={isUpdating}
            onClick={handleCancelEditOrder}
            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition disabled:opacity-50 font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderOrderItems = (order: Order) => {
    if (!order.items || order.items.length === 0) {
      return <p className="text-zinc-500 text-sm">No items listed.</p>;
    }

    return (
      <div className="bg-zinc-800/80 border border-zinc-700 rounded-xl p-3">
        <p className="text-zinc-400 text-xs mb-2">Items</p>
        <div className="space-y-2">
          {order.items.map((item, index) => (
            <div
              key={item.id || `${order.id}-item-${index}`}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-zinc-100 break-words">{item.name}</span>
              <span className="text-zinc-400 whitespace-nowrap">
                Qty: {item.quantity}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

 const renderDriverAssignmentSection = (order: Order) => {
   const isUpdating = updatingOrderId === order.id;
   const isClosed =
     order.orderStatus === "DELIVERED" || order.orderStatus === "CANCELLED";

   return (
     <div className="bg-zinc-800/80 border border-zinc-700 rounded-xl p-3 space-y-3">

       {/* TOP ROW — DRIVER + PRIORITY */}
       <div className="grid grid-cols-2 gap-2">

        {/* DRIVER SELECT */}
        <select
          value={driverSelections[order.id] ?? order.assignedDriver?.id ?? ""}
          disabled={isUpdating || isClosed}
          onChange={(e) =>
            setDriverSelections((prev) => ({
              ...prev,
              [order.id]: e.target.value,
            }))
          }
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-red-500 disabled:opacity-50"
        >
          <option value="">Select Driver</option>
          {drivers
            .filter((driver) => driver.isOnline)
            .map((driver) => (
              <option key={driver.id} value={driver.id}>
                {getDriverDisplayName(driver)} ({driver.activeOrderCount})
              </option>
            ))}
        </select>
         {/* PRIORITY SELECT — NOW SMALL + INLINE */}
         <select
           value={order.priority || "NORMAL"}
           disabled={isUpdating}
           onChange={(e) =>
             void updateOrderPriority(
               order.id,
               e.target.value as "HIGH" | "NORMAL"
             )
           }
           className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-red-500 disabled:opacity-50"
         >
           <option value="NORMAL">Normal</option>
           <option value="HIGH">High</option>
         </select>

       </div>

       {/* ASSIGN BUTTON */}
       <button
         type="button"
         disabled={
           isUpdating ||
           isClosed ||
           !driverSelections[order.id] ||
           driverSelections[order.id] === order.assignedDriver?.id
         }
         onClick={() =>
           void assignDriverToOrder(order.id, driverSelections[order.id] || null)
         }
         className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-50 font-semibold text-sm"
       >
         {isUpdating ? "Saving..." : "Assign to Driver"}
       </button>

       {/* CURRENT DRIVER DISPLAY */}
       <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
         <div>
           Assigned:{" "}
           <span className="text-zinc-200">
             {getDriverDisplayName(order.assignedDriver)}
           </span>
         </div>

         <div>
           Order Time:{" "}
           <span className="text-amber-300 font-semibold">
             {formatOrderAge(order.createdAt)}
           </span>
         </div>
       </div>

     </div>
   );
 };

  const renderDeliveredHistory = () => {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Order History</h2>
              <p className="text-zinc-400 mt-1">
                Search delivered and cancelled orders by driver and date.
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                Showing {filteredDeliveredOrders.length} of{" "}
                {deliveredOrders.length} history orders.
              </p>
            </div>

            <button
              onClick={() => token && void fetchDeliveredOrders(token, true)}
              disabled={historyLoading}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
            >
              {historyLoading ? "Refreshing..." : "Refresh History"}
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 mt-6">
            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4 lg:col-span-2">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="font-semibold">Filter by Driver</h3>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllHistoryDrivers}
                    className="text-xs px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600"
                  >
                    Select All
                  </button>

                  <button
                    type="button"
                    onClick={clearHistoryDrivers}
                    className="text-xs px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {drivers.length === 0 ? (
                <p className="text-zinc-400 text-sm">No drivers found.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {drivers.map((driver) => (
                    <label
                      key={driver.id}
                      className="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-lg p-3 cursor-pointer hover:border-red-500 transition"
                    >
                      <input
                        type="checkbox"
                        checked={historyDriverIds.includes(driver.id)}
                        onChange={() => toggleHistoryDriver(driver.id)}
                        className="h-4 w-4"
                      />

                      <div>
                        <p className="font-medium">{getDriverDisplayName(driver)}</p>
                        <p className="text-zinc-500 text-xs break-all">
                          {driver.email}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <h3 className="font-semibold mb-3">Filter by Date</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-zinc-400 text-xs mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={(e) => setHistoryStartDate(e.target.value)}
                    className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-xs mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={(e) => setHistoryEndDate(e.target.value)}
                    className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={clearHistoryFilters}
                  className="w-full px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition font-semibold"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        </div>

        {historyLoading && deliveredOrders.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            Loading order history...
          </div>
        ) : filteredDeliveredOrders.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            No delivered or cancelled orders match these filters.
          </div>
        ) : (

             <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-xs">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="text-left p-2">Order #</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">Driver</th>
                    <th className="text-left p-2">Address</th>
                    <th className="text-left p-2">Placed</th>
                    <th className="text-left p-2">Dispatched</th>
                    <th className="text-left p-2">Accepted</th>
                    <th className="text-left p-2">Out For Delivery</th>
                    <th className="text-left p-2">Completed / Cancelled</th>
                    <th className="text-left p-2">Total Time</th>
                    <th className="text-left p-2">Final Receipt</th>
                    <th className="text-left p-2">Items</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDeliveredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                    >
                      <td className="p-2 align-top font-bold text-red-300">
                        #{order.orderNumber}
                      </td>

                      <td className="p-2 align-top">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(order.orderStatus)}`}>
                          {getStatusLabel(order.orderStatus)}
                        </span>
                      </td>

                      <td className="p-2 align-top">
                        <p className="font-semibold">{order.customerName}</p>
                        {order.phone && (
                          <p className="text-zinc-500 text-xs mt-1">
                            {order.phone}
                          </p>
                        )}
                      </td>

                      <td className="p-2 align-top">
                        <p>{getDriverDisplayName(order.assignedDriver)}</p>
                        {order.assignedDriver?.email && (
                          <p className="text-zinc-500 text-xs break-all mt-1">
                            {order.assignedDriver.email}
                          </p>
                        )}
                      </td>

                      <td className="p-2 align-top text-zinc-300">
                        <p>{order.addressLine1}</p>
                        <p className="text-zinc-500 text-xs mt-1">
                          {[order.city, order.province]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </td>

                      <td className="p-2 align-top">
                        {renderStackedDateTime(order.createdAt)}
                      </td>

                      <td className="p-2 align-top">
                        {renderStackedDateTime(order.dispatchedAt)}
                      </td>

                      <td className="p-2 align-top">
                        {renderStackedDateTime(order.acceptedAt)}
                      </td>

                      <td className="p-2 align-top">
                        {renderStackedDateTime(order.outForDeliveryAt)}
                      </td>

                      <td className="p-2 align-top">
                        {order.orderStatus === "CANCELLED" ? (
                          <div>
                            <p className="font-semibold text-red-300">
                              Cancelled:
                            </p>
                            {renderStackedDateTime(order.cancelledAt)}

                            {order.cancelledFromStatus && (
                              <p className="text-zinc-500 text-xs mt-1">
                                Cancelled from: {getStatusLabel(order.cancelledFromStatus)}
                              </p>
                            )}

                            {order.cancellationReason && (
                              <p className="text-zinc-500 text-xs mt-1">
                                Reason: {order.cancellationReason}
                              </p>
                            )}
                          </div>
                        ) : (
                          renderStackedDateTime(order.deliveredAt)
                        )}
                      </td>

                      <td className="p-2 align-top whitespace-nowrap font-semibold text-amber-300">
                        {formatCompletedDeliveryTime(
                          order.createdAt,
                          order.orderStatus === "CANCELLED" ? order.cancelledAt : order.deliveredAt
                        )}
                      </td>

                      <td className="p-2 align-top">
                        {order.digitalReceipt ? (
                          <div className="space-y-2 min-w-[150px]">
                            <p className="font-semibold text-green-300 whitespace-nowrap">
                              Final Receipt: {formatReceiptMoney(order.digitalReceipt.grandTotal)}
                              {getReceiptExtraStops(order.digitalReceipt.notes) > 0 && (
                                <span className="ml-1 text-xs font-semibold text-zinc-300">
                                  • {getReceiptExtraStops(order.digitalReceipt.notes)} stops
                                </span>
                              )}
                            </p>
                            <p className="text-zinc-500 text-xs">
                              {order.digitalReceipt.receiptNumber || "Receipt saved"}
                            </p>

                            <button
                              type="button"
                              onClick={() => viewReceipt(order)}
                              className="w-full px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition font-semibold text-xs"
                            >
                              View
                            </button>

                            <button
                              type="button"
                              onClick={() => sendReceiptToCustomer(order)}
                              disabled={!order.email}
                              className="w-full px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold text-xs"
                            >
                              Send
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-500">No receipt</span>
                        )}
                      </td>

                      <td className="p-2 align-top">
                        {order.items && order.items.length > 0 ? (
                          <div className="space-y-1">
                            {order.items.map((item, index) => (
                              <p
                                key={item.id || `${order.id}-history-item-${index}`}
                                className="text-zinc-300"
                              >
                                {item.quantity}x {item.name}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-500">No items</span>
                        )}

                        {order.additionalNotes && (
                          <p className="text-zinc-500 text-xs mt-2">
                            Notes: {order.additionalNotes}
                          </p>
                        )}

                    {order.dispatcherNotes && (
                      <div className="bg-red-900 border border-red-500 rounded-xl p-3">
                        <p className="text-red-300 text-xs mb-1">Dispatcher Warning</p>
                        <p className="text-red-100 font-semibold">
                          ⚠ {order.dispatcherNotes}
                        </p>
                      </div>
                    )}

                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <button
              disabled={historyPage <= 1}
              onClick={() => setHistoryPage((prev) => Math.max(prev - 1, 1))}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
            >
              Previous
            </button>

            <p className="text-sm text-zinc-400">
              Page {historyPage} of {historyTotalPages}
            </p>

            <button
              disabled={historyPage >= historyTotalPages}
              onClick={() =>
                setHistoryPage((prev) => Math.min(prev + 1, historyTotalPages))
              }
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          </>
        )}
      </div>
    );
  };

  const renderDriverStats = () => {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Driver Stats</h2>
              <p className="text-zinc-400 mt-1">
                Performance analytics based on completed deliveries.
              </p>
            </div>

            <button
              onClick={() => token && void fetchDriverStats(token, true)}
              disabled={driverStatsLoading}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
            >
              {driverStatsLoading ? "Refreshing..." : "Refresh Stats"}
            </button>
          </div>

          <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4 mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Filter by Driver</h3>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllStatsDrivers}
                  className="text-xs px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600"
                >
                  Select All
                </button>

                <button
                  type="button"
                  onClick={clearStatsDrivers}
                  className="text-xs px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600"
                >
                  Clear
                </button>
              </div>
            </div>

            {drivers.length === 0 ? (
              <p className="text-zinc-400 text-sm">No drivers found.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {drivers.map((driver) => (
                  <label
                    key={driver.id}
                    className="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-lg p-3 cursor-pointer hover:border-red-500 transition"
                  >
                    <input
                      type="checkbox"
                      checked={statsDriverIds.includes(driver.id)}
                      onChange={() => toggleStatsDriver(driver.id)}
                      className="h-4 w-4"
                    />

                    <div>
                      <p className="font-medium">{getDriverDisplayName(driver)}</p>
                      <p className="text-zinc-500 text-xs break-all">
                        {driver.email}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3 mt-6">
            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <label className="block text-zinc-400 text-xs mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={statsStartDate}
                onChange={(e) => setStatsStartDate(e.target.value)}
                className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <label className="block text-zinc-400 text-xs mb-1">End Date</label>
              <input
                type="date"
                value={statsEndDate}
                onChange={(e) => setStatsEndDate(e.target.value)}
                className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex flex-col justify-end gap-2">
              <button
                onClick={() => token && void fetchDriverStats(token, true)}
                className="px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 transition font-semibold"
              >
                Apply Filters
              </button>

              <button
                onClick={clearStatsFilters}
                className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition font-semibold"
              >
                Clear Filters
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mt-6">
            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <p className="text-zinc-400 text-sm">Total Deliveries</p>
              <p className="text-3xl font-bold mt-2">{totalStatsDeliveries}</p>
            </div>

            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <p className="text-zinc-400 text-sm">Drivers With Deliveries</p>
              <p className="text-3xl font-bold mt-2">{driverStats.length}</p>
            </div>

            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <p className="text-zinc-400 text-sm">Most Deliveries</p>
              <p className="text-xl font-bold mt-2">
                {topDriver ? getDriverDisplayName(topDriver) : "—"}
              </p>
              <p className="text-zinc-400 text-sm mt-1">
                {topDriver ? `${topDriver.totalDeliveries} deliveries` : "No data"}
              </p>
            </div>

            <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4">
              <p className="text-zinc-400 text-sm">Best Avg Time</p>
              <p className="text-xl font-bold mt-2">
                {bestAverageDriver ? getDriverDisplayName(bestAverageDriver) : "—"}
              </p>
              <p className="text-zinc-400 text-sm mt-1">
                {bestAverageDriver
                  ? formatMinutes(bestAverageDriver.averageDeliveryMinutes)
                  : "No data"}
              </p>
            </div>
          </div>
        </div>

        {driverStatsLoading && driverStats.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            Loading driver stats...
          </div>
        ) : driverStats.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            No completed delivery stats found yet.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="text-left p-3">Rank</th>
                    <th className="text-left p-3">Driver</th>
                    <th className="text-left p-3">Total Deliveries</th>
                    <th className="text-left p-3">Average Time</th>
                    <th className="text-left p-3">Fastest Time</th>
                    <th className="text-left p-3">Slowest Time</th>
                  </tr>
                </thead>

                <tbody>
                  {driverStats.map((stat, index) => (
                    <tr
                      key={stat.driverId}
                      className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                    >
                      <td className="p-3 align-top font-bold">#{index + 1}</td>

                      <td className="p-3 align-top">
                        <p className="font-semibold">{getDriverDisplayName(stat)}</p>
                        <p className="text-zinc-500 text-xs break-all mt-1">
                          {stat.email}
                        </p>
                      </td>

                      <td className="p-3 align-top">
                        <span className="inline-flex rounded-full bg-green-500/20 text-green-200 border border-green-400/40 px-3 py-1 font-semibold">
                          {stat.totalDeliveries}
                        </span>
                      </td>

                      <td className="p-3 align-top">
                        {formatMinutes(stat.averageDeliveryMinutes)}
                      </td>

                      <td className="p-3 align-top">
                        {formatMinutes(stat.fastestDeliveryMinutes)}
                      </td>

                      <td className="p-3 align-top">
                        {formatMinutes(stat.slowestDeliveryMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white px-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-3xl font-bold mb-2 text-center">Dispatcher Login</h1>
          <p className="text-zinc-400 text-center mb-6">
            Sign in to manage live delivery orders.
          </p>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className="w-full p-3 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
            >
              {loginLoading ? "Logging in..." : "Login"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="border-b border-zinc-800 bg-zinc-900/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Dispatcher Dashboard</h1>
              <p className="text-zinc-400 text-sm mt-1">
                Manage incoming orders and delivery status.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setActiveTab("LIVE_ORDERS")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "LIVE_ORDERS"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Live Orders
              </button>

              <button
                onClick={() => setActiveTab("CREATE_MANUAL_ORDER")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "CREATE_MANUAL_ORDER"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Create Manual Order
              </button>

              <button
                onClick={() => setActiveTab("DELIVERED_HISTORY")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "DELIVERED_HISTORY"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Delivered History
              </button>

              <button
                onClick={() => setActiveTab("CUSTOMER_RETENTION")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "CUSTOMER_RETENTION"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Customer Retention
              </button>

              <button
                onClick={() => setActiveTab("DRIVER_STATS")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "DRIVER_STATS"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Driver Stats
              </button>

              <button
                onClick={() => setActiveTab("CATALOG")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "CATALOG"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Catalog
              </button>

              <button
                onClick={() => setActiveTab("PICKUP_LOCATIONS")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "PICKUP_LOCATIONS"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Pickup Locations
              </button>

              <button
                onClick={() => setActiveTab("CUSTOMERS")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "CUSTOMERS"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Customers
              </button>

              <button
                onClick={() => setShowDriverPanel((prev) => !prev)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition font-semibold"
              >
                Drivers
              </button>

              <button
                onClick={() => {
                  if (!token) return;
                  void fetchOrders(token, true);
                  void fetchDrivers(token);
                  void fetchAutoDispatchSetting(token, true);

                  if (showDriverPanel) {
                    void fetchDriverManagement(token, true);
                  }

                  if (activeTab === "DELIVERED_HISTORY") {
                    void fetchDeliveredOrders(token, true);
                  }

                  if (activeTab === "CUSTOMER_RETENTION") {
                    void fetchCustomerRetention(token, true);
                  }

                  if (activeTab === "DRIVER_STATS") {
                    void fetchDriverStats(token, true);
                  }

                  if (activeTab === "CATALOG") {
                    void fetchCatalogItems(token, true);
                  }

                  if (activeTab === "PICKUP_LOCATIONS") {
                    void fetchPickupLocations(token, true);
                  }

                  if (activeTab === "CUSTOMERS") {
                    void fetchCustomers(token, true);
                  }

                  if (activeTab === "QR_TRACKING") {
                    void fetchQrTrackingStats(true);
                  }

                  if (activeTab === "DISPATCHER_CHECKLIST") {
                    void fetchDispatcherChecklist(token, true);
                    void fetchDispatcherChecklistHistory(token, false);
                  }
                }}
                disabled={dashboardLoading || historyLoading || driverStatsLoading || catalogLoading || pickupLocationsLoading || customersLoading || qrTrackingLoading || dispatcherChecklistLoading || autoDispatchLoading}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
              >
                {dashboardLoading || historyLoading || driverStatsLoading || catalogLoading || pickupLocationsLoading || customersLoading || qrTrackingLoading || dispatcherChecklistLoading || autoDispatchLoading
                  ? "Refreshing..."
                  : "Refresh"}
              </button>

              <button
                onClick={() => setActiveTab("DRIVER_LOCATION")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "DRIVER_LOCATION"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Driver Location
              </button>

              <button
                onClick={() => setActiveTab("QR_TRACKING")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "QR_TRACKING"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                QR Code Tracking
              </button>

              <button
                onClick={() => setActiveTab("DISPATCHER_CHECKLIST")}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === "DISPATCHER_CHECKLIST"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                Daily Responsibilities
              </button>

              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition font-semibold"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="text-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              {activeTab === "DRIVER_LOCATION" ? (
                <p className="text-green-300">
                  Driver GPS and active delivery locations refresh every 3 seconds.
                </p>
              ) : autoRefreshPaused ? (
                <p className="text-amber-300">
                  Auto-refresh is paused on this page to prevent the screen from jumping or resetting.
                </p>
              ) : (
                <p className="text-green-300">
                  Auto-refresh is active every 5 seconds.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold ${
                  autoDispatchEnabled === true
                    ? "bg-green-500/20 text-green-200 border-green-400/40"
                    : autoDispatchEnabled === false
                    ? "bg-red-500/20 text-red-200 border-red-400/40"
                    : "bg-zinc-800 text-zinc-300 border-zinc-700"
                }`}
              >
                Auto Dispatch: {autoDispatchLoading && autoDispatchEnabled === null
                  ? "Loading..."
                  : autoDispatchEnabled === true
                  ? "ON"
                  : autoDispatchEnabled === false
                  ? "OFF"
                  : "Unknown"}
              </span>

              <button
                onClick={() => void toggleAutoDispatch()}
                disabled={autoDispatchLoading || autoDispatchUpdating || autoDispatchEnabled === null}
                className={`px-4 py-2 rounded-lg font-semibold transition disabled:opacity-50 ${
                  autoDispatchEnabled === true
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {autoDispatchUpdating
                  ? "Saving..."
                  : autoDispatchEnabled === true
                  ? "Turn Auto Dispatch Off"
                  : "Turn Auto Dispatch On"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDriverPanel && (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">Online Drivers</h2>

            {drivers.filter((driver) => driver.isOnline).length === 0 ? (
              <p className="text-zinc-400">No drivers currently online</p>
            ) : (
              <div className="space-y-3">
                {drivers
                  .filter((driver) => driver.isOnline)
                  .map((driver) => (
                    <div
                      key={driver.id}
                      className="flex items-center justify-between bg-zinc-800 p-4 rounded-xl border border-zinc-700"
                    >
                      <div>
                        <p className="font-semibold">{getDriverDisplayName(driver)}</p>
                        <p className="text-zinc-400 text-sm">
                          Active Orders: {driver.activeOrderCount}
                        </p>
                      </div>

                      <button
                        onClick={() => void forceLogoutDriver(driver.id)}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition font-semibold"
                      >
                        Force Logout
                      </button>
                    </div>
                ))}
              </div>
            )}

            <div className="border-t border-zinc-700 mt-6 pt-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">Driver Management</h2>
                  <p className="text-zinc-400 text-sm mt-1">
                    Select the drivers who should appear throughout the live dispatch system.
                    Hidden drivers keep their historical orders, receipts, and statistics.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => token && void fetchDriverManagement(token, true)}
                  disabled={driverManagementLoading}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold whitespace-nowrap"
                >
                  {driverManagementLoading ? "Refreshing..." : "Refresh Drivers"}
                </button>
              </div>

              {driverManagementLoading && managedDrivers.length === 0 ? (
                <p className="text-zinc-400">Loading all drivers...</p>
              ) : managedDrivers.length === 0 ? (
                <p className="text-zinc-400">No driver accounts found.</p>
              ) : (
                <div className="space-y-3">
                  {managedDrivers.map((driver) => {
                    const isUpdating = updatingDriverVisibilityId === driver.id;

                    return (
                      <label
                        key={driver.id}
                        className={`flex items-center justify-between gap-4 bg-zinc-800 p-4 rounded-xl border transition ${
                          driver.isVisibleInDispatch
                            ? "border-green-700/70"
                            : "border-zinc-700 opacity-75"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">
                              {getDriverDisplayName(driver)}
                            </p>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-bold ${
                                driver.isVisibleInDispatch
                                  ? "bg-green-900 text-green-200"
                                  : "bg-zinc-700 text-zinc-300"
                              }`}
                            >
                              {driver.isVisibleInDispatch
                                ? "Visible in Dispatch"
                                : "Hidden from Dispatch"}
                            </span>
                            {driver.isOnline && driver.isVisibleInDispatch ? (
                              <span className="px-2 py-1 rounded-full text-xs font-bold bg-blue-900 text-blue-200">
                                Online
                              </span>
                            ) : null}
                          </div>

                          <p className="text-zinc-400 text-sm break-all mt-1">
                            {driver.email}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm text-zinc-300">
                            {isUpdating
                              ? "Saving..."
                              : driver.isVisibleInDispatch
                              ? "Shown"
                              : "Hidden"}
                          </span>
                          <input
                            type="checkbox"
                            checked={driver.isVisibleInDispatch}
                            disabled={isUpdating}
                            onChange={(event) =>
                              void updateDriverDispatchVisibility(
                                driver,
                                event.target.checked
                              )
                            }
                            className="h-6 w-6 accent-green-600 cursor-pointer disabled:cursor-wait"
                            aria-label={`Show ${getDriverDisplayName(driver)} in dispatch`}
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div key={activeTab} className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "LIVE_ORDERS" ? (
          dashboardLoading && orders.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
              No orders found yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => {
                const isNewOrder = newOrderIds.includes(order.id);
                const isHighPriority = order.priority === "HIGH";

                const now = Date.now();

                const createdTime = order.createdAt
                  ? new Date(order.createdAt).getTime()
                  : 0;

                const isUnacceptedLate =
                  order.orderStatus === "PLACED" &&
                  createdTime > 0 &&
                  now - createdTime > 5 * 60 * 1000;

                const isDeliveryLate =
                  order.orderStatus !== "DELIVERED" &&
                  createdTime > 0 &&
                  now - createdTime > 40 * 60 * 1000;
                return (
                  <div
                    key={order.id}
                   className={`bg-zinc-900 border rounded-xl p-3 shadow-lg transition-all duration-500 ${
                      isUnacceptedLate
                        ? "border-yellow-400 ring-2 ring-yellow-500/60"
                        : isDeliveryLate
                        ? "border-red-500 ring-2 ring-red-600/70"
                        : isNewOrder || isHighPriority
                        ? "border-red-400 ring-2 ring-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.35)]"
                        : "border-zinc-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>

                      <p className="text-red-300 text-sm font-bold mb-1">
                        Order #{order.orderNumber}
                      </p>

                      {isUnacceptedLate && (
                        <p className="text-yellow-400 text-sm font-semibold mt-1">
                          ⚠ Not accepted (5+ min)
                        </p>
                      )}

                      {isDeliveryLate && (
                        <p className="text-red-400 text-sm font-semibold mt-1">
                          🚨 Delivery overdue (40+ min)
                        </p>
                      )}

                        <h2 className="text-xl font-semibold">{order.customerName}</h2>
                        <p className="text-zinc-400 mt-1">{order.addressLine1}</p>
                        {(order.city || order.province) && (
                          <p className="text-zinc-500 text-sm mt-1">
                            {[order.city, order.province]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                        {needsDeliveryLocationReview(order) && (
                          <p className="text-amber-300 text-sm font-semibold mt-2">
                            ⚠ Map location could not be verified
                          </p>
                        )}
                      </div>

                      <span
                        className={`text-xs px-3 py-1 rounded-full whitespace-nowrap font-semibold ${getStatusClasses(
                          order.orderStatus
                        )}`}
                      >
                        {getStatusLabel(order.orderStatus)}
                      </span>
                    </div>

                    {editingOrderId === order.id && editOrderForm ? (
                      renderEditOrderForm(order)
                    ) : (
                      <div className="space-y-3 mb-4 text-sm">
                        {order.phone && (
                          <p className="text-zinc-300">
                            <span className="text-zinc-500">Phone:</span>{" "}
                            {order.phone}
                          </p>
                        )}

                        {order.email && (
                          <p className="text-zinc-300 break-all">
                            <span className="text-zinc-500">Email:</span>{" "}
                            {order.email}
                          </p>
                        )}

                        {renderOrderItems(order)}

                        <button
                          type="button"
                          disabled={
                            updatingOrderId === order.id ||
                            order.orderStatus === "DELIVERED" ||
                            order.orderStatus === "CANCELLED"
                          }
                          onClick={() => handleStartEditOrder(order)}
                          className="w-full px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold text-sm"
                        >
                          Edit Order
                        </button>

                        {renderDriverAssignmentSection(order)}

                        {order.orderStatus !== "DELIVERED" && order.orderStatus !== "CANCELLED" && (
                          <button
                            type="button"
                            disabled={updatingOrderId === order.id}
                            onClick={() => void cancelOrder(order)}
                            className="w-full px-4 py-2 rounded-lg bg-zinc-800 hover:bg-red-700 border border-red-700 text-red-200 transition disabled:opacity-50 font-semibold text-sm"
                          >
                            Cancel Order
                          </button>
                        )}

                        {order.additionalNotes && (
                          <div className="bg-zinc-800/80 border border-zinc-700 rounded-xl p-3">
                            <p className="text-zinc-400 text-xs mb-1">
                              Additional Notes
                            </p>
                            <p className="text-zinc-200">
                              {order.additionalNotes}
                            </p>
                          </div>
                        )}

                        {order.dispatcherNotes && (
                          <div className="bg-red-900 border border-red-500 rounded-xl p-3">
                            <p className="text-red-300 text-xs mb-1">
                              Dispatcher Warning
                            </p>
                            <p className="text-red-100 font-semibold">
                              ⚠ {order.dispatcherNotes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );

              })}
            </div>
          )
        ) : activeTab === "DRIVER_LOCATION" ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Driver Location</h2>
              <p className="text-zinc-400 mt-1">
                Live driver GPS positions and active delivery locations. This page refreshes every 3 seconds.
              </p>
            </div>

            <div
              ref={mapRef}
              style={{
                width: "100%",
                height: "500px",
                borderRadius: "12px",
              }}
            />

            {orders.some(
              (order) =>
                ["PLACED", "DISPATCHED", "ACCEPTED", "OUT_FOR_DELIVERY"].includes(
                  order.orderStatus
                ) && needsDeliveryLocationReview(order)
            ) && (
              <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/40 p-4">
                <p className="font-semibold text-amber-200">
                  ⚠ Active orders requiring map-location review
                </p>
                <div className="mt-2 space-y-2 text-sm text-amber-100">
                  {orders
                    .filter(
                      (order) =>
                        [
                          "PLACED",
                          "DISPATCHED",
                          "ACCEPTED",
                          "OUT_FOR_DELIVERY",
                        ].includes(order.orderStatus) &&
                        needsDeliveryLocationReview(order)
                    )
                    .map((order) => (
                      <p key={`unmapped-${order.id}`}>
                        Order #{order.orderNumber}: {order.addressLine1},{" "}
                        {[order.city, order.province]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-lg font-bold mb-3">Driver GPS Details</h3>

              {drivers.filter((driver) => driver.isOnline).length === 0 ? (
                <p className="text-zinc-400">No drivers are online.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-zinc-400 border-b border-zinc-700">
                        <th className="py-2 pr-4">Driver</th>
                        <th className="py-2 pr-4">GPS</th>
                        <th className="py-2 pr-4">Updated</th>
                        <th className="py-2 pr-4">Accuracy</th>
                        <th className="py-2 pr-4">Speed</th>
                        <th className="py-2 pr-4">Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drivers
                        .filter((driver) => driver.isOnline)
                        .map((driver) => {
                          const hasLocation =
                            typeof driver.latitude === "number" &&
                            typeof driver.longitude === "number";

                          const gpsStatus = getDriverLocationStatus(driver);

                          return (
                            <tr
                              key={driver.id}
                              className="border-b border-zinc-800"
                            >
                              <td className="py-3 pr-4 font-semibold">
                                {getDriverDisplayName(driver)}
                              </td>
                              <td className="py-3 pr-4">
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    gpsStatus === "Live"
                                      ? "bg-green-900 text-green-200"
                                      : gpsStatus === "Slow"
                                        ? "bg-amber-900 text-amber-200"
                                        : "bg-red-900 text-red-200"
                                  }`}
                                >
                                  {hasLocation ? gpsStatus : "No GPS"}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-zinc-300">
                                {hasLocation ? formatDriverLocationAge(driver) : "No GPS yet"}
                              </td>
                              <td className="py-3 pr-4 text-zinc-300">
                                {formatDriverAccuracy(driver.locationAccuracyMeters)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-300">
                                {formatDriverSpeed(driver.locationSpeedMetersPerSecond)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-300">
                                {driver.activeOrderCount}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "DELIVERED_HISTORY" ? (
          renderDeliveredHistory()
        ) : activeTab === "CUSTOMER_RETENTION" ? (
          renderCustomerRetention()
        ) : activeTab === "DRIVER_STATS" ? (
          renderDriverStats()
        ) : activeTab === "CATALOG" ? (
          renderCatalogAdmin()
        ) : activeTab === "PICKUP_LOCATIONS" ? (
          renderPickupLocations()
        ) : activeTab === "CUSTOMERS" ? (
          renderCustomerProfiles()
        ) : activeTab === "QR_TRACKING" ? (
          renderQrTracking()
        ) : activeTab === "DISPATCHER_CHECKLIST" ? (
          renderDispatcherChecklist()
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Create Manual Order</h2>
              <p className="text-zinc-400 mt-1">
                Use this form for customer phone-in orders.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Customer Name"
                  className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                  value={manualOrderForm.customerName}
                  onChange={(e) =>
                    void handleCustomerSearchChange("customerName", e.target.value)
                  }
                />

                {activeCustomerSearchField === "customerName" &&
                  customerSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
                    {customerSuggestions.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => selectCustomerSuggestion(customer)}
                        className="w-full text-left px-3 py-3 hover:bg-zinc-800 transition border-b border-zinc-800 last:border-b-0"
                      >
                        <div className="text-white font-medium">
                          {customer.fullName}
                        </div>
                        <div className="text-zinc-400 text-sm">
                          {customer.phone}
                        </div>
                        <div className="text-zinc-500 text-xs">
                          {customer.addressLine1}, {customer.city},{" "}
                          {customer.province}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Customer Phone"
                  className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                  value={manualOrderForm.customerPhone}
                  onChange={(e) =>
                    void handleCustomerSearchChange("customerPhone", e.target.value)
                  }
                />

                {activeCustomerSearchField === "customerPhone" &&
                  customerSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
                    {customerSuggestions.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => selectCustomerSuggestion(customer)}
                        className="w-full text-left px-3 py-3 hover:bg-zinc-800 transition border-b border-zinc-800 last:border-b-0"
                      >
                        <div className="text-white font-medium">
                          {customer.fullName}
                        </div>
                        <div className="text-zinc-400 text-sm">
                          {customer.phone}
                        </div>
                        <div className="text-zinc-500 text-xs">
                          {customer.addressLine1}, {customer.city},{" "}
                          {customer.province}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="email"
                placeholder="Customer Email"
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500 md:col-span-2"
                value={manualOrderForm.customerEmail}
                onChange={(e) =>
                  handleManualOrderFieldChange("customerEmail", e.target.value)
                }
              />

              <input
                ref={manualAddressInputRef}
                type="text"
                placeholder="Address Line 1"
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500 md:col-span-2"
                value={manualOrderForm.addressLine1}
                onChange={(e) =>
                  handleManualOrderFieldChange("addressLine1", e.target.value)
                }
              />

              <p className="text-zinc-500 text-xs -mt-2 md:col-span-2">
                Select a suggestion to fill the civic address, or type an unusual valid address manually. Keep delivery instructions in Additional Notes.
              </p>

              <input
                type="text"
                placeholder="City"
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                value={manualOrderForm.city}
                onChange={(e) => handleManualOrderFieldChange("city", e.target.value)}
              />

              <input
                type="text"
                placeholder="Province"
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                value={manualOrderForm.province}
                onChange={(e) =>
                  handleManualOrderFieldChange("province", e.target.value)
                }
              />

              <select
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
                value={manualOrderForm.paymentMethod}
                onChange={(e) =>
                  handleManualOrderFieldChange(
                    "paymentMethod",
                    e.target.value as PaymentMethod
                  )
                }
              >
                <option value="CASH">Cash</option>
                <option value="DEBIT">Debit</option>
                <option value="VISA">Visa</option>
                <option value="MASTERCARD">Mastercard</option>
                <option value="ETRANSFER">E-Transfer</option>
              </select>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-xl font-semibold">Items</h3>
                <button
                  type="button"
                  onClick={handleAddAnotherItem}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition font-semibold"
                >
                  Add Another Item
                </button>
              </div>

              <div className="space-y-4">
                {manualOrderForm.items.map((item, index) => (
                  <div
                    key={index}
                    className="bg-zinc-800/70 border border-zinc-700 rounded-2xl p-4"
                  >
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h4 className="text-lg font-semibold">Item {index + 1}</h4>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition font-semibold"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Item Name"
                          className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                          value={item.itemName}
                          onChange={(e) =>
                            void handleItemNameChange(index, e.target.value)
                          }
                        />

                        {itemSuggestions[index]?.length > 0 && (
                          <div className="absolute z-20 mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
                            {itemSuggestions[index].map((itemOption) => (
                              <button
                                key={itemOption.id}
                                type="button"
                                onClick={() => selectItemSuggestion(index, itemOption)}
                                className="w-full text-left px-3 py-3 hover:bg-zinc-800 transition border-b border-zinc-800 last:border-b-0"
                              >
                                <div className="text-white font-medium">
                                  {itemOption.name}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Quantity"
                        className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                        value={item.quantity}
                        onWheel={(e) => e.currentTarget.blur()}
                        onKeyDown={(e) => {
                          if (["e", "E", "+", "-", "."].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) =>
                          handleManualOrderItemChange(index, "quantity", e.target.value.replace(/\D/g, ""))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <textarea
                placeholder="Additional Notes"
                rows={4}
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500 resize-none"
                value={manualOrderForm.additionalNotes}
                onChange={(e) =>
                  handleManualOrderFieldChange("additionalNotes", e.target.value)
                }
              />
            </div>

            <div className="mt-4">
              <label className="block text-zinc-400 text-xs mb-1">
                Recurring Driver Notes
              </label>

              <textarea
                value={manualOrderForm.recurringDriverNotes}
                placeholder="Recurring driver-visible notes (e.g. $10 distance charge)"
                rows={3}
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500 resize-none"
                onChange={(e) =>
                  handleManualOrderFieldChange(
                    "recurringDriverNotes",
                    e.target.value
                  )
                }
              />
            </div>

<div className="mt-4">
  <label className="block text-zinc-400 text-xs mb-1">
    Dispatcher Notes (Internal)
  </label>

  <textarea
    value={manualOrderForm.dispatcherNotes || ""}
    placeholder="Internal notes (e.g. Do NOT assign to driver, DO NOT DELIVER, etc...)"
    className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
    onChange={async (e) => {
      const value = e.target.value;

      handleManualOrderFieldChange("dispatcherNotes", value);

      if (selectedCustomer?.id && token) {
        try {
          await fetch(
           `${API_V1_BASE_URL}/customers/${selectedCustomer.id}/dispatcher-notes`,
           {
             method: "PATCH",
             headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`
             },
             body: JSON.stringify({
               dispatcherNotes: value
             })
           }
         );
       } catch (err) {
         console.error("Failed to save dispatcher notes", err);
       }
     }
   }}
  />
</div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleManualOrderSubmit}
                disabled={manualOrderLoading}
                className="px-5 py-3 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
              >
                {manualOrderLoading ? "Creating Order..." : "Create Manual Order"}
              </button>

              <button
                onClick={handleManualOrderCancel}
                disabled={manualOrderLoading}
                className="px-5 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
