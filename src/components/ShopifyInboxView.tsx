import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

type SheetOrder = Record<string, string>;

const AUTO_LOAD_KEY = "shopify_auto_load_enabled";
const ACTIVE_FILTER_KEY = "shopify_active_filter";

type OrderStatus = "CARGAR" | "A DROPEAR" | "CARGADO" | "CARGADO_MANUAL";
type FilterType = "TODOS" | "CARGAR" | "CARGADO" | "CARGADO_MANUAL" | "A DROPEAR";

function extractPhoneNumber(value: any): string {
  if (!value) return "";
  let phone = String(value).replace(/[\s\-().+]/g, "").trim();
  if (phone.startsWith("595")) phone = "0" + phone.slice(3);
  if (phone.length === 9 && phone.match(/^\d+$/)) phone = "0" + phone;
  return phone;
}

// Normalización: elimina acentos, mayúsculas, espacios, guiones
const normalizeText = (text: string): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
};

// LISTA COMPLETA DE CIUDADES CON COBERTURA (TODAS LAS VARIANTES)
const COVERAGE_CITIES_NORMALIZED: string[] = [
  // Altos
  "altos",
  // Areguá
  "aregua", "aregua",
  // Asunción
  "asuncion",
  // Atyrá
  "atyra",
  // Benjamín Aceval
  "benjaminaceval",
  // Caacupé
  "caacupe",
  // Capiatá
  "capiata",
  // Ciudad del Este
  "ciudaddeleste",
  // Colonia Yguazú
  "coloniyguazu",
  // Emboscada
  "emboscada",
  // Eusebio Ayala
  "eusebioayala",
  // Fernando de la Mora
  "fernandodelamora",
  // Guarambaré
  "guarambare",
  // Hernandarias
  "hernandarias",
  // INTERIOR PAGO ANTICIPADO
  "interiorpagoanticipado",
  // Itá
  "ita",
  // Itacurubí de la Cordillera
  "itacurubidelacordillera",
  // Itauguá
  "itaugua",
  // J. Augusto Saldívar
  "jaugustosaldívar",
  // Juan León Mallorquín
  "juanleonmallorquin",
  // Lambaré
  "lambare",
  // Limpio
  "limpio",
  // Loma Grande
  "lomagrande",
  // Luque
  "luque",
  // Mariano Roque Alonso
  "marianoroquealonso",
  // Minga Guazú
  "mingaguazu",
  // Ñemby
  "ñemby", "nemby",
  // Nueva Italia
  "nuevaitalia",
  // Paraguarí
  "paraguari",
  // Pirayú
  "pirayu",
  // Piribebuy
  "piribebuy",
  // Presidente Franco
  "presidentefranco",
  // Puerto Presidente Franco
  "puertopresidentefranco", "puertopdtefranco",
  // Remansito
  "remansito",
  // San Alberto
  "sanalberto",
  // San Antonio
  "santonio", "santoni", "sanantonioi",
  // San Bernardino
  "sanbernardino",
  // San Lorenzo
  "sanlorenzo",
  // Santa Rita
  "santarita",
  // Tobatí
  "tobati",
  // Villa Elisa
  "villaelsa",
  // Villa Hayes
  "villahayes",
  // Villarrica
  "villarrica",
  // Villeta
  "villeta",
  // Yaguarón
  "yaguaron",
  // Yguazú
  "yguazu",
  // Ypacaraí
  "ypacarai",
  // Ypané
  "ypane"
];

// Precios de delivery
const CITY_DELIVERY_PRICES: Record<string, number> = {
  "altos": 55000, "aregua": 45000, "asuncion": 35000, "atyra": 55000,
  "benjaminaceval": 60000, "caacupe": 55000, "capiata": 45000, "ciudaddeleste": 45000,
  "coloniyguazu": 50000, "emboscada": 55000, "eusebioayala": 55000, "fernandodelamora": 35000,
  "guarambare": 50000, "hernandarias": 50000, "interiorpagoanticipado": 35000, "ita": 55000,
  "itacurubidelacordillera": 55000, "itaugua": 45000, "jaugustosaldívar": 45000,
  "juanleonmallorquin": 60000, "lambare": 35000, "limpio": 40000, "lomagrande": 55000,
  "luque": 35000, "marianoroquealonso": 40000, "mingaguazu": 50000, "ñemby": 40000,
  "nemby": 40000, "nuevaitalia": 55000, "paraguari": 55000, "pirayu": 55000,
  "piribebuy": 55000, "presidentefranco": 50000, "puertopresidentefranco": 50000,
  "puertopdtefranco": 50000, "remansito": 60000, "sanalberto": 55000, "santonio": 45000,
  "sanantonioi": 45000, "santoni": 45000, "sanbernardino": 55000, "sanlorenzo": 35000,
  "santarita": 55000, "tobati": 55000, "villaelsa": 40000, "villahayes": 60000,
  "villarrica": 50000, "villeta": 55000, "yaguaron": 55000, "yguazu": 60000,
  "ypacarai": 55000, "ypane": 45000
};

// Función ESTRICTA para verificar cobertura
const hasCoverage = (cityName: string): boolean => {
  if (!cityName) return false;
  
  const normalizedInput = normalizeText(cityName);
  
  // Coincidencia exacta o parcial
  for (const coverageCity of COVERAGE_CITIES_NORMALIZED) {
    if (normalizedInput === coverageCity) return true;
    if (coverageCity.includes(normalizedInput) && normalizedInput.length >= 4) return true;
    if (normalizedInput.includes(coverageCity) && coverageCity.length >= 4) return true;
  }
  
  return false;
};

// Función para obtener precio de delivery
const getCityDeliveryPrice = (cityName: string): number | null => {
  if (!cityName) return null;
  
  const normalizedInput = normalizeText(cityName);
  
  // Coincidencia exacta
  if (CITY_DELIVERY_PRICES[normalizedInput]) {
    return CITY_DELIVERY_PRICES[normalizedInput];
  }
  
  // Búsqueda flexible
  for (const [key, price] of Object.entries(CITY_DELIVERY_PRICES)) {
    if (key === normalizedInput) return price;
    if (key.includes(normalizedInput) && normalizedInput.length >= 4) return price;
    if (normalizedInput.includes(key) && key.length >= 4) return price;
  }
  
  return null;
};

function parseQuantity(value: any): number {
  if (!value) return 1;
  let str = String(value).trim();
  if (str.includes('\n')) str = str.split('\n')[0].trim();
  str = str.replace(/["']/g, '');
  const numMatch = str.match(/\d+/);
  if (!numMatch) return 1;
  const num = parseInt(numMatch[0], 10);
  return isNaN(num) ? 1 : num;
}

function parseMoney(v: string): number {
  if (!v) return 0;
  let cleanValue = String(v);
  if (cleanValue.includes('\n')) cleanValue = cleanValue.split('\n')[0].trim();
  cleanValue = cleanValue.replace(/["']/g, '');
  let cleaned = cleanValue.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(cleaned) || 0);
}

const findAmountInRow = (row: SheetOrder): number => {
  const excludeColumns = ["telefono", "phone", "tel", "celular", "whatsapp", "cantidad", "qty", "quantity", "fecha", "date", "estado", "status"];
  for (const key in row) {
    const value = row[key];
    if (!value) continue;
    const keyLower = key.toLowerCase();
    if (excludeColumns.some(ex => keyLower.includes(ex))) continue;
    const str = String(value).trim();
    const priceMatches = str.match(/\b\d{4,7}\b/g);
    if (priceMatches && priceMatches.length > 0) {
      for (const match of priceMatches) {
        const num = parseInt(match, 10);
        if (num >= 10000 && num <= 5000000) return num;
      }
    }
  }
  return 0;
};

const getAmountFromRow = (order: SheetOrder, amountColumn: string): number => {
  if (amountColumn && order[amountColumn]) {
    const parsed = parseMoney(order[amountColumn]);
    if (parsed > 0) return parsed;
  }
  for (const key in order) {
    if (key === "TOTAL A PAGAR" || key === "total a pagar") {
      const parsed = parseMoney(order[key]);
      if (parsed > 0) return parsed;
    }
  }
  const fallbackAmount = findAmountInRow(order);
  if (fallbackAmount > 0) return fallbackAmount;
  return 0;
};

const generateShopifyOrderId = async (): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('get_next_shopify_order_number');
    if (!error && data) return data;
    return `SHOPIFY${Date.now()}`;
  } catch (err) {
    return `SHOPIFY${Date.now()}`;
  }
};

interface ShopifyInboxProps {
  onSheetConfirm?: (prefill: {
    customer?: string; phone?: string; city?: string; street?: string;
    district?: string; productTitle?: string; totalGs?: number; qty?: number;
  }) => void;
}

export default function ShopifyInboxView({ onSheetConfirm }: ShopifyInboxProps) {
  const { profile } = useAuth();
  const myEmail = profile?.email || "";
  const sheetUrl = profile?.sheet_url || "";

  const [sheetOrders, setSheetOrders] = useState<SheetOrder[]>([]);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [rowStatuses, setRowStatuses] = useState<Record<string, OrderStatus>>({});
  const [rowOrderNumbers, setRowOrderNumbers] = useState<Record<string, string>>({});
  const [autoLoad, setAutoLoad] = useState<boolean>(() => localStorage.getItem(AUTO_LOAD_KEY) === "true");
  const [activeFilter, setActiveFilter] = useState<FilterType>(() => {
    const saved = localStorage.getItem(ACTIVE_FILTER_KEY) as FilterType;
    return saved || "CARGAR";
  });
  const [searchType, setSearchType] = useState<"all" | "product" | "city">("product");
  const [productSearch, setProductSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [coverageFilter, setCoverageFilter] = useState<"all" | "covered" | "uncovered">("all");
  const [search, setSearch] = useState("");

  const autoLoadRef = useRef(autoLoad);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detección de columnas
  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    const find = (...candidates: string[]) => {
      for (let i = 0; i < h.length; i++) {
        const normalizedHeader = normalizeText(h[i]);
        for (const candidate of candidates) {
          const normalizedCandidate = normalizeText(candidate);
          if (normalizedHeader === normalizedCandidate || normalizedHeader.includes(normalizedCandidate)) {
            return h[i];
          }
        }
      }
      return "";
    };
    
    return {
      name: find("nombre", "cliente", "customer", "name"),
      phone: find("telefono", "phone", "tel", "celular", "whatsapp"),
      street: find("calle", "direccion", "address", "street"),
      city: find("ciudad", "city", "localidad", "distrito"),
      product: find("producto", "product", "articulo"),
      qty: find("cantidad", "qty", "quantity", "unidades"),
      amount: find("total", "monto", "precio", "importe", "venta"),
      date: find("fecha", "date"),
    };
  }, [sheetHeaders]);

  const getRowStatus = useCallback((idx: number): OrderStatus => {
    return rowStatuses[String(idx)] || "CARGAR";
  }, [rowStatuses]);

  const getRowOrderNumber = useCallback((idx: number): string | null => {
    return rowOrderNumbers[String(idx)] || null;
  }, [rowOrderNumbers]);

  const loadStatusesFromDatabase = useCallback(async () => {
    if (!myEmail || !sheetUrl) return;
    setLoadingStatuses(true);
    try {
      const { data, error } = await supabase
        .from("sheet_row_statuses")
        .select("row_index, status, order_number")
        .eq("user_email", myEmail)
        .eq("sheet_url", sheetUrl);
      
      if (!error && data) {
        const statusMap: Record<string, OrderStatus> = {};
        const orderNumberMap: Record<string, string> = {};
        data.forEach(item => { 
          statusMap[String(item.row_index)] = item.status as OrderStatus;
          if (item.order_number) {
            orderNumberMap[String(item.row_index)] = item.order_number;
          }
        });
        setRowStatuses(statusMap);
        setRowOrderNumbers(orderNumberMap);
      }
    } catch (err) { console.error(err); }
    finally { setLoadingStatuses(false); }
  }, [myEmail, sheetUrl]);

  const setRowStatus = useCallback(async (key: string, status: OrderStatus, orderNumber?: string) => {
    if (!myEmail || !sheetUrl) return;
    const rowIndex = parseInt(key);
    
    setRowStatuses(prev => ({ ...prev, [key]: status }));
    if (orderNumber) {
      setRowOrderNumbers(prev => ({ ...prev, [key]: orderNumber }));
    }
    
    if (status !== "CARGAR") {
      await supabase.from("sheet_row_statuses").upsert({
        user_email: myEmail, sheet_url: sheetUrl, row_index: rowIndex,
        status: status, order_number: orderNumber || null, updated_at: new Date().toISOString()
      }, { onConflict: 'user_email,sheet_url,row_index' });
    } else {
      await supabase
        .from("sheet_row_statuses")
        .delete()
        .eq("user_email", myEmail)
        .eq("sheet_url", sheetUrl)
        .eq("row_index", rowIndex);
      
      setRowStatuses(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
      setRowOrderNumbers(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
    }
  }, [myEmail, sheetUrl]);

  useEffect(() => {
    localStorage.setItem(AUTO_LOAD_KEY, autoLoad.toString());
    autoLoadRef.current = autoLoad;
  }, [autoLoad]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_FILTER_KEY, activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    supabase.from("products").select("*").then(({ data }) => setProducts(data || []));
  }, []);

  useEffect(() => {
    if (myEmail && sheetUrl) loadStatusesFromDatabase();
  }, [myEmail, sheetUrl, loadStatusesFromDatabase]);

  useEffect(() => {
    if (sheetUrl && !initialLoadDone) { readSheet(); setInitialLoadDone(true); }
  }, [sheetUrl]);

  const readSheet = useCallback(async () => {
    if (!sheetUrl) { toast.error("Configurá tu URL de Google Sheet"); return; }
    setLoading(true);
    try {
      const resp = await fetch(`/api/read-sheet?url=${encodeURIComponent(sheetUrl)}&t=${Date.now()}`);
      const json = await resp.json();
      if (json.error) toast.error(json.error);
      else {
        setSheetHeaders(json.headers || []);
        setSheetOrders(json.orders || []);
        setLastSync(new Date());
        toast.success(`📊 Sheet cargado: ${json.orders?.length || 0} filas`);
      }
    } catch (err: any) { toast.error("Error: " + err.message); }
    setLoading(false);
  }, [sheetUrl]);

  useEffect(() => {
    if (productSearch.length > 1 && searchType === "product") {
      const searchLower = productSearch.toLowerCase();
      setProductSuggestions(products.filter(p => p.title?.toLowerCase().includes(searchLower)).map(p => p.title).slice(0, 5));
    } else setProductSuggestions([]);
  }, [productSearch, products, searchType]);

  useEffect(() => {
    if (cityFilter.length > 1 && searchType === "city" && colKeys.city) {
      const uniqueCities = new Set(sheetOrders.map(o => o[colKeys.city]).filter(c => c?.trim()));
      const searchLower = cityFilter.toLowerCase();
      setCitySuggestions(Array.from(uniqueCities).filter(c => c.toLowerCase().includes(searchLower)).slice(0, 5));
    } else setCitySuggestions([]);
  }, [cityFilter, sheetOrders, colKeys.city, searchType]);

  const matchProduct = useCallback((rawName: string) => {
    if (!rawName) return null;
    const cleanName = normalizeText(rawName);
    return products.find(p => normalizeText(p.title || "") === cleanName) ||
           products.find(p => normalizeText(p.title || "").includes(cleanName) || cleanName.includes(normalizeText(p.title || ""))) ||
           null;
  }, [products]);

  const loadOrder = useCallback(async (order: SheetOrder, idx: number, source: "auto" | "manual" = "auto") => {
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    if (!matched) { toast.error(`❌ Producto no detectado: "${productName}"`); return false; }
    
    const city = order[colKeys.city] || "";
    const deliveryPrice = getCityDeliveryPrice(city);
    if (!deliveryPrice) { toast.warning(`⚠️ Ciudad "${city}" sin cobertura de delivery`); return false; }
    
    const salePrice = getAmountFromRow(order, colKeys.amount);
    if (salePrice === 0) { toast.warning(`⚠️ No se detectó monto`); return false; }
    
    const orderId = await generateShopifyOrderId();
    const newStatus: OrderStatus = source === "auto" ? "CARGADO" : "CARGADO_MANUAL";
    const productCost = matched.provider_price_gs || 0;
    const commission = salePrice - (productCost + deliveryPrice);
    
    const payload = {
      order_number: orderId, created_by: myEmail,
      customer_name: order[colKeys.name] || "", phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: city, street: order[colKeys.street] || "", district: "", email: "", obs: "",
      items_json: [{ sku: matched.sku || "", title: matched.title, qty: parseQuantity(order[colKeys.qty]), sale_gs: salePrice, provider_price_gs: productCost, provider_email: matched.provider_email || "" }],
      total_gs: salePrice, delivery_gs: deliveryPrice, commission_gs: commission,
      provider_emails_list: matched.provider_email || "",
    };
    
    const { error } = await supabase.from("orders").insert(payload);
    if (error) { toast.error("Error: " + error.message); return false; }
    
    await setRowStatus(String(idx), newStatus, orderId);
    toast.success(`✅ Pedido ${orderId} cargado | Comisión: ${nf(commission)} Gs`);
    return true;
  }, [colKeys, matchProduct, myEmail, setRowStatus]);

  const handleDirectSave = (order: SheetOrder, idx: number) => loadOrder(order, idx, "auto");
  const handleOpenForm = (order: SheetOrder, idx: number) => {
    if (onSheetConfirm) onSheetConfirm({
      customer: order[colKeys.name] || "", phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: order[colKeys.city] || "", street: order[colKeys.street] || "",
      productTitle: order[colKeys.product] || "", totalGs: getAmountFromRow(order, colKeys.amount),
      qty: parseQuantity(order[colKeys.qty]),
    });
  };

  const handleBulkLoad = async () => {
    let count = 0, errors = 0;
    for (let i = 0; i < sheetOrders.length; i++) {
      const status = getRowStatus(i);
      if (status !== "CARGAR") continue;
      
      const city = sheetOrders[i][colKeys.city] || "";
      if (!hasCoverage(city)) continue;
      
      const success = await loadOrder(sheetOrders[i], i, "auto");
      if (success) count++; else errors++;
      if (count % 3 === 0) await new Promise(r => setTimeout(r, 100));
    }
    toast.success(`✅ ${count} cargados | ❌ ${errors} errores`);
  };

  const toggleAutoLoad = () => { setAutoLoad(!autoLoad); toast.info(!autoLoad ? "🤖 Auto-carga activada" : "⏹️ Auto-carga desactivada"); };

  const getDisplayAmount = (order: SheetOrder) => getAmountFromRow(order, colKeys.amount);
  const getOrderDate = (order: SheetOrder) => {
    const dateValue = order[colKeys.date];
    if (!dateValue) return "—";
    try { const d = new Date(dateValue); if (!isNaN(d.getTime())) return d.toLocaleDateString("es-PY"); } catch {}
    return String(dateValue).split(' ')[0];
  };

  // Dashboard stats
  const dashboardStats = useMemo(() => {
    let totalVentas = 0, totalDelivery = 0, totalCostoProductos = 0, totalComisiones = 0;
    let pedidosEnCobertura = 0;
    const ciudadesUnicas = new Set<string>();
    
    sheetOrders.forEach((order, idx) => {
      const city = order[colKeys.city] || "";
      const deliveryPrice = getCityDeliveryPrice(city);
      
      if (!deliveryPrice) return;
      
      const status = getRowStatus(idx);
      if (status !== "CARGAR") return;
      
      ciudadesUnicas.add(city);
      pedidosEnCobertura++;
      
      const salePrice = getAmountFromRow(order, colKeys.amount);
      if (salePrice > 0) {
        totalVentas += salePrice;
        totalDelivery += deliveryPrice;
        
        const productName = order[colKeys.product] || "";
        const matched = matchProduct(productName);
        const productCost = matched?.provider_price_gs || 0;
        totalCostoProductos += productCost;
        
        const commission = salePrice - (productCost + deliveryPrice);
        if (commission > 0) totalComisiones += commission;
      }
    });
    
    const gananciaNeta = totalVentas - totalDelivery - totalCostoProductos;
    
    return {
      pedidosEnCobertura,
      totalVentas,
      totalDelivery,
      totalCostoProductos,
      totalComisiones,
      gananciaNeta,
      ciudadesCubiertas: ciudadesUnicas.size,
      tasaConversion: sheetOrders.length > 0 ? Math.round((pedidosEnCobertura / sheetOrders.length) * 100) : 0,
    };
  }, [sheetOrders, colKeys, matchProduct, getRowStatus]);

  // Filtros
  const filterByProduct = (order: SheetOrder, term: string) => {
    if (!term.trim()) return true;
    return (order[colKeys.product] || "").toLowerCase().includes(term.toLowerCase());
  };

  const filterByCity = (order: SheetOrder, term: string) => {
    if (!term.trim()) return true;
    return (order[colKeys.city] || "").toLowerCase().includes(term.toLowerCase());
  };

  const filteredOrders = useMemo(() => {
    return sheetOrders
      .map((o, i) => ({ order: o, idx: i }))
      .filter(({ order, idx }) => {
        const status = getRowStatus(idx);
        const city = order[colKeys.city] || "";
        const covered = hasCoverage(city);
        
        if (activeFilter === "CARGAR" && (status !== "CARGAR" || !covered)) return false;
        if (activeFilter === "CARGADO" && status !== "CARGADO") return false;
        if (activeFilter === "CARGADO_MANUAL" && status !== "CARGADO_MANUAL") return false;
        if (activeFilter === "A DROPEAR" && status !== "A DROPEAR") return false;
        
        if (coverageFilter !== "all") {
          if (coverageFilter === "covered" && !covered) return false;
          if (coverageFilter === "uncovered" && covered) return false;
        }
        
        if (searchType === "product" && productSearch) return filterByProduct(order, productSearch);
        if (searchType === "city" && cityFilter) return filterByCity(order, cityFilter);
        if (searchType === "all" && search) {
          const vals = Object.values(order).join(" ").toLowerCase();
          if (!vals.includes(search.toLowerCase())) return false;
        }
        
        return true;
      });
  }, [sheetOrders, activeFilter, search, productSearch, cityFilter, searchType, coverageFilter, colKeys, getRowStatus]);

  const counts = useMemo(() => {
    let cargar = 0, cargado = 0, cargadoManual = 0, aDropear = 0;
    sheetOrders.forEach((order, idx) => {
      const status = getRowStatus(idx);
      const city = order[colKeys.city] || "";
      const covered = hasCoverage(city);
      
      if (status === "CARGAR" && covered) cargar++;
      else if (status === "CARGADO") cargado++;
      else if (status === "CARGADO_MANUAL") cargadoManual++;
      else if (status === "A DROPEAR") aDropear++;
    });
    return { cargar, cargado, cargadoManual, aDropear, total: sheetOrders.length };
  }, [sheetOrders, colKeys, getRowStatus]);

  const changeFilter = (filter: FilterType) => setActiveFilter(filter);
  
  const getRowClassName = (status: OrderStatus, hasCoverageCity: boolean) => {
    if (status === "CARGADO" || status === "CARGADO_MANUAL") return "bg-green-500/10";
    if (status === "A DROPEAR") return "bg-yellow-500/10";
    if (!hasCoverageCity) return "bg-red-500/5 hover:bg-red-500/10";
    return "hover:bg-muted/50";
  };

  if (loadingStatuses) {
    return <div className="app-card"><div className="flex justify-center py-8"><div className="btn-spinner mr-2" />Cargando...</div></div>;
  }

  return (
    <div className="app-card">
      {/* Dashboard PRO */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold">📦 Shopify Inbox — Lectura de Sheet</h3>
          {lastSync && <span className="text-xs text-muted-foreground">🔄 Última sync: {lastSync.toLocaleTimeString("es-PY")}</span>}
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/5 p-3 border border-blue-500/20">
            <div className="absolute top-0 right-0 text-4xl opacity-10">📍</div>
            <div className="text-2xl font-bold text-blue-400">{dashboardStats.pedidosEnCobertura}</div>
            <div className="text-xs text-muted-foreground">Pedidos con cobertura</div>
          </div>
          
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/5 p-3 border border-green-500/20">
            <div className="absolute top-0 right-0 text-4xl opacity-10">💰</div>
            <div className="text-lg font-bold text-green-400">{nf(dashboardStats.totalVentas)} Gs</div>
            <div className="text-xs text-muted-foreground">Total Ventas</div>
          </div>
          
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/5 p-3 border border-orange-500/20">
            <div className="absolute top-0 right-0 text-4xl opacity-10">🚚</div>
            <div className="text-lg font-bold text-orange-400">{nf(dashboardStats.totalDelivery)} Gs</div>
            <div className="text-xs text-muted-foreground">Total Delivery</div>
          </div>
          
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/5 p-3 border border-purple-500/20">
            <div className="absolute top-0 right-0 text-4xl opacity-10">📦</div>
            <div className="text-lg font-bold text-purple-400">{nf(dashboardStats.totalCostoProductos)} Gs</div>
            <div className="text-xs text-muted-foreground">Costo Productos</div>
          </div>
          
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-600/5 p-3 border border-pink-500/20">
            <div className="absolute top-0 right-0 text-4xl opacity-10">💎</div>
            <div className="text-lg font-bold text-pink-400">{nf(dashboardStats.totalComisiones)} Gs</div>
            <div className="text-xs text-muted-foreground">Comisiones</div>
          </div>
          
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 p-3 border border-emerald-500/20">
            <div className="absolute top-0 right-0 text-4xl opacity-10">🏆</div>
            <div className="text-lg font-bold text-emerald-400">{nf(dashboardStats.gananciaNeta)} Gs</div>
            <div className="text-xs text-muted-foreground">Ganancia Neta</div>
          </div>
          
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/5 p-3 border border-cyan-500/20">
            <div className="absolute top-0 right-0 text-4xl opacity-10">📊</div>
            <div className="text-2xl font-bold text-cyan-400">{dashboardStats.tasaConversion}%</div>
            <div className="text-xs text-muted-foreground">Tasa conversión</div>
          </div>
        </div>
      </div>

      {/* Controles principales */}
      <div className="app-card !p-4 mb-4">
        <div className="flex flex-wrap gap-2">
          <button className="nav-btn active" onClick={() => readSheet()} disabled={loading}>
            {loading ? "Leyendo..." : "📊 Leer Sheet"}
          </button>
          <button className="nav-btn active" onClick={handleBulkLoad} disabled={!sheetOrders.length}>
            🚀 Cargar todos (solo con cobertura)
          </button>
          <button className={`nav-btn ${autoLoad ? "!bg-green-600 !text-white" : ""}`} onClick={toggleAutoLoad}>
            {autoLoad ? "🤖 Auto-carga ON" : "🤖 Auto-carga OFF"}
          </button>
        </div>
      </div>

      {/* Filtros de estado */}
      <div className="flex flex-wrap gap-2 mb-4 border-b border-border pb-3">
        <button onClick={() => changeFilter("TODOS")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${activeFilter === "TODOS" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>📋 Todos ({counts.total})</button>
        <button onClick={() => changeFilter("CARGAR")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${activeFilter === "CARGAR" ? "bg-blue-500 text-white" : "bg-blue-500/10 text-blue-400"}`}>⏳ Pendientes ({counts.cargar})</button>
        <button onClick={() => changeFilter("CARGADO")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${activeFilter === "CARGADO" ? "bg-green-500 text-white" : "bg-green-500/10 text-green-400"}`}>✅ Auto ({counts.cargado})</button>
        <button onClick={() => changeFilter("CARGADO_MANUAL")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${activeFilter === "CARGADO_MANUAL" ? "bg-emerald-500 text-white" : "bg-emerald-500/10 text-emerald-400"}`}>✍️ Manual ({counts.cargadoManual})</button>
        <button onClick={() => changeFilter("A DROPEAR")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${activeFilter === "A DROPEAR" ? "bg-yellow-500 text-white" : "bg-yellow-500/10 text-yellow-400"}`}>⚠️ Dropear ({counts.aDropear})</button>
      </div>

      {/* Filtro de cobertura */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <span className="text-xs text-muted-foreground">📍 Filtrar por cobertura:</span>
        <button onClick={() => setCoverageFilter("all")} className={`px-2 py-1 rounded text-xs ${coverageFilter === "all" ? "bg-primary" : "bg-muted"}`}>Todas</button>
        <button onClick={() => setCoverageFilter("covered")} className={`px-2 py-1 rounded text-xs ${coverageFilter === "covered" ? "bg-green-500 text-white" : "bg-green-500/10 text-green-400"}`}>✅ Con cobertura</button>
        <button onClick={() => setCoverageFilter("uncovered")} className={`px-2 py-1 rounded text-xs ${coverageFilter === "uncovered" ? "bg-red-500 text-white" : "bg-red-500/10 text-red-400"}`}>❌ Sin cobertura</button>
      </div>

      {/* Búsqueda */}
      <div className="space-y-2 mb-3">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setSearchType("product")} className={`px-3 py-1.5 rounded-lg text-sm ${searchType === "product" ? "bg-blue-500 text-white" : "bg-muted"}`}>🏷️ Producto</button>
          <button onClick={() => setSearchType("city")} className={`px-3 py-1.5 rounded-lg text-sm ${searchType === "city" ? "bg-emerald-500 text-white" : "bg-muted"}`}>📍 Ciudad</button>
          <button onClick={() => setSearchType("all")} className={`px-3 py-1.5 rounded-lg text-sm ${searchType === "all" ? "bg-primary text-white" : "bg-muted"}`}>🔍 Todo</button>
        </div>
        
        {searchType === "product" && (
          <div className="relative">
            <input className="app-input w-full" placeholder={`Buscar en ${colKeys.product || "PRODUCTO"}...`} value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
            {productSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-background border rounded-lg shadow-lg">
                {productSuggestions.map((s, i) => (<button key={i} className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => setProductSearch(s)}>{s}</button>))}
              </div>
            )}
          </div>
        )}

        {searchType === "city" && (
          <div className="relative">
            <input className="app-input w-full" placeholder="Buscar por ciudad..." value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />
            {citySuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-background border rounded-lg shadow-lg">
                {citySuggestions.map((s, i) => (<button key={i} className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => setCityFilter(s)}>📍 {s}</button>))}
              </div>
            )}
          </div>
        )}

        {searchType === "all" && (
          <input className="app-input w-full" placeholder="Buscar en todos los campos..." value={search} onChange={(e) => setSearch(e.target.value)} />
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-2">Mostrando {filteredOrders.length} de {sheetOrders.length} filas</div>

      {/* Tabla */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1500px]">
          <thead>
            <tr>
              <th>#</th>
              <th>ID Pedido</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Ciudad</th>
              <th>Calle</th>
              <th>Producto</th>
              <th>Cant</th>
              <th className="text-right">Venta</th>
              <th className="text-right">Delivery</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(({ order, idx }) => {
              const status = getRowStatus(idx);
              const city = order[colKeys.city] || "";
              const deliveryPrice = getCityDeliveryPrice(city);
              const covered = deliveryPrice !== null;
              const salePrice = getDisplayAmount(order);
              const orderDate = getOrderDate(order);
              const canLoad = status === "CARGAR" && covered && salePrice > 0;
              const orderNumber = getRowOrderNumber(idx);

              return (
                <tr key={idx} className={getRowClassName(status, covered)}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs font-mono font-bold">
                    {orderNumber ? (
                      <span className="text-green-400">{orderNumber}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-xs whitespace-nowrap">{orderDate}</td>
                  <td className="text-xs font-medium">{order[colKeys.name] || "—"}</td>
                  <td className="text-xs">{order[colKeys.phone] || "—"}</td>
                  <td className={`text-xs ${!covered && city ? "text-red-400 font-semibold" : "text-green-400"}`}>
                    {city || "—"}
                    {deliveryPrice && <span className="text-[10px] ml-1">({nf(deliveryPrice)} Gs)</span>}
                    {!covered && city && <span className="text-[10px] ml-1">⚠️</span>}
                  </td>
                  <td className="text-xs">{order[colKeys.street] || "—"}</td>
                  <td className="text-xs truncate max-w-[180px]" title={order[colKeys.product] || ""}>
                    {order[colKeys.product] || "—"}
                  </td>
                  <td className="text-xs">{parseQuantity(order[colKeys.qty])}</td>
                  <td className="text-right text-xs text-green-400">{salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}</td>
                  <td className="text-right text-xs text-orange-400">{deliveryPrice ? `${nf(deliveryPrice)} Gs` : "—"}</td>
                  <td className="min-w-[130px]">
                    <select
                      className="app-input !py-1 !px-2 !text-[11px] !w-full"
                      value={status}
                      onChange={(e) => setRowStatus(String(idx), e.target.value as OrderStatus, orderNumber || undefined)}
                    >
                      <option value="CARGAR">⏳ Pendiente</option>
                      <option value="A DROPEAR">⚠️ A Dropear</option>
                      <option value="CARGADO">✅ Cargado (Auto)</option>
                      <option value="CARGADO_MANUAL">✍️ Cargado (Manual)</option>
                    </select>
                  </td>
                  <td className="min-w-[180px] flex gap-1 flex-wrap">
                    {canLoad && (
                      <button className="nav-btn active !py-1 !px-2 !text-[11px]" onClick={() => handleDirectSave(order, idx)}>
                        💰 Cargar
                      </button>
                    )}
                    <button className="nav-btn !py-1 !px-2 !text-[11px]" onClick={() => handleOpenForm(order, idx)}>
                      📝 Formulario
                    </button>
                    {status === "CARGAR" && !covered && (
                      <span className="text-[10px] text-red-400 self-center">🚫 Sin cobertura</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr><td colSpan={13} className="text-center text-muted-foreground py-8">No hay pedidos para mostrar</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
