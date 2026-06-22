import { useEffect, useMemo, useRef, useState } from "react";


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
  postalCode?: string;
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
};

type ActiveTab =
  | "LIVE_ORDERS"
  | "CREATE_MANUAL_ORDER"
  | "DRIVER_LOCATION"
  | "DELIVERED_HISTORY"
  | "DRIVER_STATS"
  | "CATALOG"
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
  postalCode: string;
  paymentMethod: PaymentMethod;
  additionalNotes: string;
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
  postalCode: string;
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
  postalCode: string;
  dispatcherNotes?: string | null;
};

type ItemSuggestion = {
  id: string;
  name: string;
  normalizedName: string;
  size?: string | null;
  category?: string | null;
  brand?: string | null;
  source?: string | null;
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
  postalCode: string;
  dispatcherNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    orders?: number;
  };
};

type CustomerEditForm = {
  fullName: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
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

const isValidCanadianPostalCode = (postalCode: string) => {
  return /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(postalCode.trim());
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
  city: "Guelph",
  province: "ON",
  postalCode: "N1G 4N3",
  paymentMethod: "CASH",
  additionalNotes: "",
  items: [createDefaultManualOrderItem()],
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
  const [customersLoading, setCustomersLoading] = useState(false);
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
  const [nowMs, setNowMs] = useState(Date.now());

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogActiveFilter, setCatalogActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [editingCatalogItemId, setEditingCatalogItemId] = useState<string | null>(null);
  const [catalogEditForm, setCatalogEditForm] = useState<CatalogEditForm | null>(null);

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [customerProfileSearch, setCustomerProfileSearch] = useState("");
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerEditForm, setCustomerEditForm] = useState<CustomerEditForm | null>(null);

  const [qrTrackingCampaigns, setQrTrackingCampaigns] = useState<QrTrackingCampaign[]>([
    {
      campaign: "lighter",
      label: "Bic Lighter",
      totalScans: 0,
      trackingUrl: "https://speedy-api-lbfe.onrender.com/q/lighter",
      statsUrl: "https://speedy-api-lbfe.onrender.com/q/lighter/stats",
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
    activeTab === "DRIVER_STATS" ||
    activeTab === "CATALOG" ||
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
      customer.postalCode,
      customer.dispatcherNotes,
    ]
      .map(normalizeCustomerSearchText)
      .join(" ");

    const searchableDigits = [customer.phone, customer.postalCode]
      .map(normalizeCustomerSearchDigits)
      .join(" ");

    return (
      searchableText.includes(cleanSearchTerm) ||
      (!!digitSearchTerm && searchableDigits.includes(digitSearchTerm))
    );
  };


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
    if (activeTab !== "DRIVER_STATS") return;

    void fetchDriverStats(token, true);
    void fetchDrivers(token);
  }, [activeTab, token]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "CATALOG") return;

    void fetchCatalogItems(token, true);
  }, [activeTab, token, catalogActiveFilter]);

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
    if (newOrderIds.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      setNewOrderIds([]);
    }, 12000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [newOrderIds]);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<any>(null);
  const driverMarkersRef = useRef<Record<string, any>>({});

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

      driverMarkersRef.current = {};
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

    if (driversWithLocation.length === 0) {
      clearMap();
      return;
    }

    if (!googleMapRef.current) {
      googleMapRef.current = new googleMaps.Map(mapRef.current, {
        center: {
          lat: driversWithLocation[0].latitude as number,
          lng: driversWithLocation[0].longitude as number,
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

      const position = {
        lat: driver.latitude as number,
        lng: driver.longitude as number,
      };

      const title = [
        getDriverDisplayName(driver),
        `Status: ${getDriverLocationStatus(driver)}`,
        `Updated: ${formatDriverLocationAge(driver)}`,
        `Accuracy: ${formatDriverAccuracy(driver.locationAccuracyMeters)}`,
        `Speed: ${formatDriverSpeed(driver.locationSpeedMetersPerSecond)}`,
        `Orders: ${driver.activeOrderCount}`,
      ].join("\n");

      if (existingMarker) {
        existingMarker.setPosition(position);
        existingMarker.setTitle(title);
      } else {
        const marker = new googleMaps.Marker({
          position,
          map,
          title,
          label: {
            text: getDriverDisplayName(driver).charAt(0).toUpperCase(),
          },
        });

        driverMarkersRef.current[driver.id] = marker;
      }
    });
  }, [activeTab, drivers, nowMs]);

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
    driver?: AssignedDriver | DriverOption | DriverStat | null
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

      const response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/dispatcher-checklist/today", {
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

      const response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/dispatcher-checklist/history?limit=28", {
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
        `https://speedy-api-lbfe.onrender.com/api/v1/dispatcher-checklist/items/${itemId}/complete`,
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

      const response = await fetch("https://speedy-api-lbfe.onrender.com/q/lighter/stats");
      const data = await response.json();

      if (response.ok) {
        setQrTrackingCampaigns([
          {
            campaign: data.campaign || "lighter",
            label: "Bic Lighter",
            totalScans: Number(data.totalScans || 0),
            trackingUrl: "https://speedy-api-lbfe.onrender.com/q/lighter",
            statsUrl: "https://speedy-api-lbfe.onrender.com/q/lighter/stats",
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

      const response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/orders/settings/auto-dispatch", {
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

      const response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/orders/settings/auto-dispatch", {
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
     const response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/auth/drivers", {
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

  const fetchCatalogItems = async (authToken: string, showLoader = true) => {
    try {
      if (showLoader) {
        setCatalogLoading(true);
      }

      let url = "https://speedy-api-lbfe.onrender.com/api/v1/items";
      const params = new URLSearchParams();

      if (catalogSearch.trim()) {
        params.append("query", catalogSearch.trim());
      }

      if (catalogActiveFilter === "active") {
        params.append("isActive", "true");
      }

      if (catalogActiveFilter === "inactive") {
        params.append("isActive", "false");
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
        setCatalogItems(data.items || []);
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
        ? "https://speedy-api-lbfe.onrender.com/api/v1/customers/search"
        : "https://speedy-api-lbfe.onrender.com/api/v1/customers";

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

  const fetchDriverStats = async (authToken: string, showLoader = true) => {
    try {
      if (showLoader) {
        setDriverStatsLoading(true);
      }

      let url = "https://speedy-api-lbfe.onrender.com/api/v1/orders/driver-stats";

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
        let url = `https://speedy-api-lbfe.onrender.com/api/v1/orders?status=${status}&page=${historyPage}`;
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
    try {
      if (showLoader) {
        setDashboardLoading(true);
      }

      const response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/orders", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      console.log("ORDERS:", data);

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

      const response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/auth/login", {
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
    setEditingCatalogItemId(null);
    setCatalogEditForm(null);
    setCustomers([]);
    setCustomerProfileSearch("");
    setEditingCustomerId(null);
    setCustomerEditForm(null);
    setQrTrackingCampaigns([
      {
        campaign: "lighter",
        label: "Bic Lighter",
        totalScans: 0,
        trackingUrl: "https://speedy-api-lbfe.onrender.com/q/lighter",
        statsUrl: "https://speedy-api-lbfe.onrender.com/q/lighter/stats",
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
      `https://speedy-api-lbfe.onrender.com/api/v1/orders/${orderId}/status`,
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
      `https://speedy-api-lbfe.onrender.com/api/v1/orders/${orderId}/priority`,
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
  postalCode: order.postalCode || "",
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
      `https://speedy-api-lbfe.onrender.com/api/v1/items/search?query=${encodeURIComponent(value)}`,
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

  if (!editOrderForm.postalCode.trim()) {
    alert("Postal code is required");
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
      `https://speedy-api-lbfe.onrender.com/api/v1/orders/${orderId}/edit`,
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
          addressLine1: editOrderForm.addressLine1.trim(),
          city: editOrderForm.city.trim(),
          province: editOrderForm.province.trim(),
          postalCode: editOrderForm.postalCode.trim(),
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
        `https://speedy-api-lbfe.onrender.com/api/v1/orders/${orderId}/assign-driver`,
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
        `https://speedy-api-lbfe.onrender.com/api/v1/auth/drivers/${driverId}/force-logout`,
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
        console.log("SELECTED CUSTOMER:", customer);
      setSelectedCustomer(customer);
    setManualOrderForm((prev) => ({
      ...prev,
      customerName: customer.fullName || "",
      customerPhone: customer.phone || "",
      customerEmail: customer.email || "",
      addressLine1: customer.addressLine1 || "",
      city: customer.city || "Guelph",
      province: customer.province || "ON",
      postalCode: customer.postalCode || "",
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
       `https://speedy-api-lbfe.onrender.com/api/v1/customers/search?query=${encodeURIComponent(
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
        `https://speedy-api-lbfe.onrender.com/api/v1/items/search?query=${encodeURIComponent(value)}`,
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
    const postalCode = manualOrderForm.postalCode.trim();
    const additionalNotes = manualOrderForm.additionalNotes.trim();
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

    if (!postalCode) {
      alert("Postal code is required.");
      return;
    }

    if (!isValidCanadianPostalCode(postalCode)) {
      alert("Please enter a valid Canadian postal code, like N1H 1A1.");
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

      const response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail,
          addressLine1,
          city,
          province,
          postalCode,
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
          additionalNotes,
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

  const handleSaveCatalogItem = async (itemId: string) => {
    if (!token || !catalogEditForm) return;

    if (!catalogEditForm.name.trim()) {
      alert("Catalog item name is required");
      return;
    }

    try {
      setCatalogLoading(true);

      const response = await fetch(
        `https://speedy-api-lbfe.onrender.com/api/v1/items/${itemId}`,
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
        `https://speedy-api-lbfe.onrender.com/api/v1/items/${item.id}/deactivate`,
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
      postalCode: customer.postalCode || "",
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
        `https://speedy-api-lbfe.onrender.com/api/v1/customers/${customerId}`,
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
            addressLine1: customerEditForm.addressLine1.trim(),
            city: customerEditForm.city.trim(),
            province: customerEditForm.province.trim(),
            postalCode: customerEditForm.postalCode.trim(),
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
                Showing {catalogItems.length} catalog items.
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

          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] mt-6">
            <input
              type="text"
              placeholder="Search catalog by name, brand, category, or source"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
            />

            <select
              value={catalogActiveFilter}
              onChange={(e) =>
                setCatalogActiveFilter(e.target.value as "all" | "active" | "inactive")
              }
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-red-500"
            >
              <option value="all">All items</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>

            <button
              type="button"
              onClick={() => token && void fetchCatalogItems(token, true)}
              disabled={catalogLoading}
              className="px-5 py-3 rounded-lg bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-semibold"
            >
              Search
            </button>
          </div>
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
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="text-left p-3">Item</th>
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
          </div>
        )}
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
              placeholder="Search customers by name, phone, email, city, or postal code"
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

                                <div className="grid grid-cols-3 gap-2">
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

                                  <input
                                    type="text"
                                    value={customerEditForm.postalCode}
                                    onChange={(e) =>
                                      handleCustomerEditFieldChange("postalCode", e.target.value)
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
                                {[customer.city, customer.province, customer.postalCode]
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
            type="text"
            placeholder="Address Line 1"
            value={editOrderForm.addressLine1}
            onChange={(e) => handleEditOrderFieldChange("addressLine1", e.target.value)}
            className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500 md:col-span-2"
          />

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

          <input
            type="text"
            placeholder="Postal Code"
            value={editOrderForm.postalCode}
            onChange={(e) => handleEditOrderFieldChange("postalCode", e.target.value)}
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
                    <th className="text-left p-2">Receipt</th>
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
                          {[order.city, order.province, order.postalCode]
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
                              {formatReceiptMoney(order.digitalReceipt.grandTotal)}
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

                  if (activeTab === "DELIVERED_HISTORY") {
                    void fetchDeliveredOrders(token, true);
                  }

                  if (activeTab === "DRIVER_STATS") {
                    void fetchDriverStats(token, true);
                  }

                  if (activeTab === "CATALOG") {
                    void fetchCatalogItems(token, true);
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
                disabled={dashboardLoading || historyLoading || driverStatsLoading || catalogLoading || customersLoading || qrTrackingLoading || dispatcherChecklistLoading || autoDispatchLoading}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
              >
                {dashboardLoading || historyLoading || driverStatsLoading || catalogLoading || customersLoading || qrTrackingLoading || dispatcherChecklistLoading || autoDispatchLoading
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
                  Driver GPS refresh is active every 3 seconds.
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
                        {(order.city || order.province || order.postalCode) && (
                          <p className="text-zinc-500 text-sm mt-1">
                            {[order.city, order.province, order.postalCode]
                              .filter(Boolean)
                              .join(", ")}
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
                Live driver GPS positions. This page refreshes every 3 seconds.
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
        ) : activeTab === "DRIVER_STATS" ? (
          renderDriverStats()
        ) : activeTab === "CATALOG" ? (
          renderCatalogAdmin()
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
                          {customer.province} {customer.postalCode}
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
                          {customer.province} {customer.postalCode}
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
                type="text"
                placeholder="Address Line 1"
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500 md:col-span-2"
                value={manualOrderForm.addressLine1}
                onChange={(e) =>
                  handleManualOrderFieldChange("addressLine1", e.target.value)
                }
              />

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

              <input
                type="text"
                placeholder="Postal Code"
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                value={manualOrderForm.postalCode}
                onChange={(e) =>
                  handleManualOrderFieldChange("postalCode", e.target.value)
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
           `https://speedy-api-lbfe.onrender.com/api/v1/customers/${selectedCustomer.id}/dispatcher-notes`,
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
