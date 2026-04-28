import { useEffect, useMemo, useRef, useState } from "react";


type OrderStatus =
  | "PLACED"
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
  additionalNotes?: string | null;
  dispatcherNotes?: string | null;
  orderStatus: OrderStatus;
  priority?: "HIGH" | "NORMAL";
  items?: OrderItem[];
  assignedDriver?: AssignedDriver | null;
  createdAt?: string;
  acceptedAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
};

type ActiveTab =
  | "LIVE_ORDERS"
  | "CREATE_MANUAL_ORDER"
  | "DRIVER_LOCATION"
  | "DELIVERED_HISTORY"
  | "DRIVER_STATS";

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
  isActive: boolean;
};

const createEmptyManualOrderItem = (): ManualOrderItem => ({
  itemName: "",
  quantity: "1",
});

const initialManualOrderForm: ManualOrderForm = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  addressLine1: "",
  dispatcherNotes: "",
  city: "Guelph",
  province: "ON",
  postalCode: "",
  paymentMethod: "CASH",
  additionalNotes: "",
  items: [createEmptyManualOrderItem()],
};

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [manualOrderLoading, setManualOrderLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [driverStatsLoading, setDriverStatsLoading] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  const [driverStats, setDriverStats] = useState<DriverStat[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);

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

  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>(
    []
  );

  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSuggestion | null>(null);

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
    activeTab === "CREATE_MANUAL_ORDER" || manualFormIsDirty || manualOrderLoading;

  const filteredDeliveredOrders = deliveredOrders;


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
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    if (autoRefreshPaused) return;

    const intervalId = window.setInterval(() => {
      void fetchOrders(token, false);
      void fetchDrivers(token);

      if (activeTab === "DELIVERED_HISTORY") {
        void fetchDeliveredOrders(token, false);
      }

      if (activeTab === "DRIVER_STATS") {
        void fetchDriverStats(token, false);
      }
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

    driversWithLocation.forEach((driver) => {
      const existingMarker = driverMarkersRef.current[driver.id];

      const position = {
        lat: driver.latitude as number,
        lng: driver.longitude as number,
      };

      if (existingMarker) {
        existingMarker.setPosition(position);
      } else {
        const marker = new googleMaps.Marker({
          position,
          map,
          title: getDriverDisplayName(driver),
        });

        driverMarkersRef.current[driver.id] = marker;
      }
    });

    return () => {
      clearMap();
    };
  }, [activeTab, drivers]);

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
        alert(data.message || "Failed to load driver stats");
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

      let url = `https://speedy-api-lbfe.onrender.com/api/v1/orders?status=DELIVERED&page=${historyPage}`;

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

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setDeliveredOrders(data.orders || []);
        setHistoryTotalPages(data.totalPages || 1);
      } else {
        alert(data.message || "Failed to load delivered orders");
      }
    } catch (error) {
      console.error(error);
      alert("Server error while loading delivered orders");
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
        alert(data.message || "Failed to load orders");
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
      } else {
        alert(data.message || "Login failed");
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
    setNewOrderIds([]);
    setCustomerSuggestions([]);
    setItemSuggestions({});
    knownOrderIdsRef.current = new Set();
    hasCompletedInitialLoadRef.current = false;
  };

const updateOrderStatus = async (orderId: string, orderStatus: OrderStatus) => {
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
        }),
      }
    );

    const data = await response.json();

    if (response.ok) {
      await fetchOrders(token, false);
      await fetchDrivers(token);
    } else {
      alert(data.message || "Failed to update order");
    }
  } catch (error) {
    console.error(error);
    alert("Server error while updating order");
  } finally {
    setUpdatingOrderId(null);
  }
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
      alert(data.message || "Failed to update priority");
    }
  } catch (error) {
    console.error(error);
    alert("Server error while updating priority");
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
        alert(data.message || "Failed to assign driver");
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
        alert(data.message || "Failed to logout driver");
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

 const handleCustomerPhoneChange = async (value: string) => {
   handleManualOrderFieldChange("customerPhone", value);
   setSelectedCustomer(null);

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
       const normalizedValue = value.replace(/\D/g, "");

       const exactPhoneMatch = customers.find(
         (customer) => customer.phone.replace(/\D/g, "") === normalizedValue
       );

       if (exactPhoneMatch) {
         selectCustomerSuggestion(exactPhoneMatch);
       } else {
         setCustomerSuggestions(customers);
       }
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
    if (!manualOrderForm.customerName.trim()) {
      alert("Customer name is required");
      return;
    }

    if (!manualOrderForm.customerPhone.trim()) {
      alert("Customer phone is required");
      return;
    }

    if (!manualOrderForm.customerEmail.trim()) {
      alert("Customer email is required");
      return;
    }

    if (!manualOrderForm.addressLine1.trim()) {
      alert("Address is required");
      return;
    }

    if (!manualOrderForm.postalCode.trim()) {
      alert("Postal code is required");
      return;
    }

    const cleanedItems = manualOrderForm.items
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
      setManualOrderLoading(true);

      const response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName: manualOrderForm.customerName.trim(),
          customerPhone: manualOrderForm.customerPhone.trim(),
          customerEmail: manualOrderForm.customerEmail.trim(),
          addressLine1: manualOrderForm.addressLine1.trim(),
          city: manualOrderForm.city.trim(),
          province: manualOrderForm.province.trim(),
          postalCode: manualOrderForm.postalCode.trim(),
          items: cleanedItems.map((item) => ({
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
          additionalNotes: manualOrderForm.additionalNotes.trim(),
          dispatcherNotes: manualOrderForm.dispatcherNotes.trim(),
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
        alert(data.message || "Failed to create manual order");
      }
    } catch (error) {
      console.error(error);
      alert("Server error while creating manual order");
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

  const getStatusClasses = (status: OrderStatus) => {
    switch (status) {
      case "PLACED":
        return "bg-blue-500/20 text-blue-200 border border-blue-400/40 shadow-[0_0_0_1px_rgba(96,165,250,0.15)]";
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
      case "OUT_FOR_DELIVERY":
        return "OUT FOR DELIVERY";
      default:
        return status;
    }
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
       <div className="text-xs text-zinc-400">
         Assigned:{" "}
         <span className="text-zinc-200">
           {getDriverDisplayName(order.assignedDriver)}
         </span>
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
              <h2 className="text-2xl font-bold">Delivered History</h2>
              <p className="text-zinc-400 mt-1">
                Search completed deliveries by driver and date.
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                Showing {filteredDeliveredOrders.length} of{" "}
                {deliveredOrders.length} delivered orders.
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
            Loading delivered orders...
          </div>
        ) : filteredDeliveredOrders.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-300">
            No delivered orders match these filters.
          </div>
        ) : (

             <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="text-left p-3">Order #</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">Driver</th>
                    <th className="text-left p-3">Address</th>
                    <th className="text-left p-3">Placed</th>
                    <th className="text-left p-3">Accepted</th>
                    <th className="text-left p-3">Out For Delivery</th>
                    <th className="text-left p-3">Delivered</th>
                    <th className="text-left p-3">Items</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDeliveredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                    >
                      <td className="p-3 align-top font-bold text-red-300">
                        #{order.orderNumber}
                      </td>

                      <td className="p-3 align-top">
                        <p className="font-semibold">{order.customerName}</p>
                        {order.phone && (
                          <p className="text-zinc-500 text-xs mt-1">
                            {order.phone}
                          </p>
                        )}
                      </td>

                      <td className="p-3 align-top">
                        <p>{getDriverDisplayName(order.assignedDriver)}</p>
                        {order.assignedDriver?.email && (
                          <p className="text-zinc-500 text-xs break-all mt-1">
                            {order.assignedDriver.email}
                          </p>
                        )}
                      </td>

                      <td className="p-3 align-top text-zinc-300">
                        <p>{order.addressLine1}</p>
                        <p className="text-zinc-500 text-xs mt-1">
                          {[order.city, order.province, order.postalCode]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </td>

                      <td className="p-3 align-top whitespace-nowrap">
                        {formatDateTime(order.createdAt)}
                      </td>

                      <td className="p-3 align-top whitespace-nowrap">
                        {formatDateTime(order.acceptedAt)}
                      </td>

                      <td className="p-3 align-top whitespace-nowrap">
                        {formatDateTime(order.outForDeliveryAt)}
                      </td>

                      <td className="p-3 align-top whitespace-nowrap">
                        {formatDateTime(order.deliveredAt)}
                      </td>

                      <td className="p-3 align-top">
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

                  if (activeTab === "DELIVERED_HISTORY") {
                    void fetchDeliveredOrders(token, true);
                  }

                  if (activeTab === "DRIVER_STATS") {
                    void fetchDriverStats(token, true);
                  }
                }}
                disabled={dashboardLoading || historyLoading || driverStatsLoading}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 font-semibold"
              >
                {dashboardLoading || historyLoading || driverStatsLoading
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
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition font-semibold"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="text-sm">
            {autoRefreshPaused ? (
              <p className="text-amber-300">
                Auto-refresh is paused while a manual order is being created.
              </p>
            ) : (
              <p className="text-green-300">
                Auto-refresh is active every 5 seconds.
              </p>
            )}
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

                      {renderDriverAssignmentSection(order)}

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
                  </div>
                );

              })}
            </div>
          )
        ) : activeTab === "DRIVER_LOCATION" ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Driver Location</h2>
              <p className="text-zinc-400 mt-1">Live driver GPS positions</p>
            </div>

            <div
              ref={mapRef}
              style={{
                width: "100%",
                height: "500px",
                borderRadius: "12px",
              }}
            />
          </div>
        ) : activeTab === "DELIVERED_HISTORY" ? (
          renderDeliveredHistory()
        ) : activeTab === "DRIVER_STATS" ? (
          renderDriverStats()
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Create Manual Order</h2>
              <p className="text-zinc-400 mt-1">
                Use this form for customer phone-in orders.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="text"
                placeholder="Customer Name"
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                value={manualOrderForm.customerName}
                onChange={(e) =>
                  handleManualOrderFieldChange("customerName", e.target.value)
                }
              />

              <div className="relative">
                <input
                  type="text"
                  placeholder="Customer Phone"
                  className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                  value={manualOrderForm.customerPhone}
                  onChange={(e) => void handleCustomerPhoneChange(e.target.value)}
                />

                {customerSuggestions.length > 0 && (
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
                        placeholder="Quantity"
                        className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500"
                        value={item.quantity}
                        onChange={(e) =>
                          handleManualOrderItemChange(index, "quantity", e.target.value)
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
