import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

type SheetOrder = Record<string, string>;

const AUTO_LOAD_KEY = "shopify_auto_load_enabled";
const ACTIVE_FILTER_KEY = "shopify_active_filter";

type OrderStatus = "CARGAR" | "A DROPEAR" | "CARGADO" | "CARGADO_MANUAL" | "CANCELADO";
type FilterType = "TODOS" | "CARGAR" | "CARGADO" | "CARGADO_MANUAL" | "A DROPEAR" | "CANCELADO";

function extractPhoneNumber(value: any): string {
  if (!value) return "";
  let phone = String(value).replace(/[\s\-().+]/g, "").trim();
  if (phone.startsWith("595")) phone = "0" + phone.slice(3);
  if (phone.length === 9 && phone.match(/^\d+$/)) phone = "0" + phone;
  return phone;
}

// Normalización ESTRICTA
const strictNormalize = (text: string): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .trim();
};

// LISTA COMPLETA DE CIUDADES CON COBERTURA
const CITY_COVERAGE_MAP: Record<string, number> = {
  // Altos
  "altos": 55000,
  // Areguá
  "aregua": 45000,
  // Asunción
  "asuncion": 35000,
  // Atyrá
  "atyra": 55000,
  // Benjamín Aceval
  "benjaminaceval": 60000,
  // Caacupé
  "caacupe": 55000,
  // Capiatá
  "capiata": 45000,
  // Ciudad del Este
  "ciudaddeleste": 45000,
  // Colonia Yguazú
  "coloniyguazu": 50000,
  // Emboscada
  "emboscada": 55000,
  // Eusebio Ayala
  "eusebioayala": 55000,
  // Fernando de la Mora
  "fernandodelamora": 35000,
  // Guarambaré
  "guarambare": 50000,
  // Hernandarias
  "hernandarias": 50000,
  // INTERIOR PAGO ANTICIPADO (caso especial)
  "interiorpagoanticipado": 35000,
  // Itá
  "ita": 55000,
  // Itacurubí de la Cordillera
  "itacurubidelacordillera": 55000,
  // Itauguá
  "itaugua": 45000,
  // J. Augusto Saldívar
  "jaugustosaldivar": 45000,
  // Juan León Mallorquín
  "juanleonmalloriquin": 60000,
  // Lambaré
  "lambare": 35000,
  // Limpio
  "limpio": 40000,
  // Loma Grande
  "lomagrande": 55000,
  // Luque
  "luque": 35000,
  // Mariano Roque Alonso
  "marianoroquealonso": 40000,
  // Minga Guazú
  "mingaguazu": 50000,
  // Ñemby
  "ñemby": 40000,
  "nemby": 40000,
  // Nueva Italia
  "nuevaitalia": 55000,
  // Paraguarí
  "paraguari": 55000,
  // Pirayú
  "pirayu": 55000,
  // Piribebuy
  "piribebuy": 55000,
  // Presidente Franco
  "presidentefranco": 50000,
  // Puerto Presidente Franco
  "puertopresidentefranco": 50000,
  // Remansito
  "remansito": 60000,
  // San Alberto
  "sanalberto": 55000,
  // San Antonio (TODAS las variantes)
  "santonio": 45000,
  "sanantonio": 45000,
  "sanantonioi": 45000,
  // San Bernardino
  "sanbernardino": 55000,
  // San Lorenzo
  "sanlorenzo": 35000,
  // Santa Rita
  "santarita": 55000,
  // Tobatí
  "tobati": 55000,
  // Villa Elisa
  "villaelsa": 40000,
  "villa elisa": 40000,
  // Villa Hayes
  "villahayes": 60000,
  // Villarrica
  "villarrica": 50000,
  // Villeta
  "villeta": 55000,
  // Yaguarón
  "yaguaron": 55000,
  // Yguazú
  "yguazu": 60000,
  // Ypacaraí
  "ypacarai": 55000,
  // Ypané
  "ypane": 45000
};

// Función ESTRICTA para verificar cobertura
const hasCoverage = (cityName: string): boolean => {
  if (!cityName) return false;
  const normalized = strictNormalize(cityName);
  
  // Para "Interior Pago Anticipado"
  if (normalized.includes("interiorpagoanticipado") || normalized.includes("interior") || normalized.includes("pagoanticipado")) {
    return true;
  }
  
  // Para "Villa Elisa" - verificar específicamente
  if (normalized.includes("villaelsa") || normalized === "villaelsa") {
    return true;
  }
  
  return CITY_COVERAGE_MAP.hasOwnProperty(normalized);
};

const getCityDeliveryPrice = (cityName: string): number | null => {
  if (!cityName) return null;
  const normalized = strictNormalize(cityName);
  
  // Interior Pago Anticipado
  if (normalized.includes("interiorpagoanticipado") || normalized.includes("interior") || normalized.includes("pagoanticipado")) {
    return 35000;
  }
  
  // Villa Elisa
  if (normalized.includes("villaelsa") || normalized === "villaelsa") {
    return 40000;
  }
  
  return CITY_COVERAGE_MAP[normalized] || null;
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
  const [coverageFilter, setCoverageFilter] = useState<"all" | "covered" | "uncovered">("all");
  const [search, setSearch] = useState("");

  const autoLoadRef = useRef(autoLoad);

  // Detección de columnas
  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    const find = (...candidates: string[]) => {
      for (let i = 0; i < h.length; i++) {
        const normalizedHeader = strictNormalize(h[i]);
        for (const candidate of candidates) {
          const normalizedCandidate = strictNormalize(candidate);
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

  const matchProduct = useCallback((rawName: string) => {
    if (!rawName) return null;
    const cleanName = strictNormalize(rawName);
    return products.find(p => strictNormalize(p.title || "") === cleanName) ||
           products.find(p => strictNormalize(p.title || "").includes(cleanName) || cleanName.includes(strictNormalize(p.title || ""))) ||
           null;
  }, [products]);

  const loadOrder = useCallback(async (order: SheetOrder, idx: number, source: "auto" | "manual" = "auto") => {
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    if (!matched) { toast.error(`❌ Producto no detectado: "${productName}"`); return false; }
    
    const city = order[colKeys.city] || "";
    const deliveryPrice = getCityDeliveryPrice(city);
    if (!deliveryPrice) { toast.warning(`⚠️ Ciudad "${city}" sin cobertura`); return false; }
    
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
    toast.success(`✅ Pedido ${orderId} cargado | Delivery: ${nf(deliveryPrice)} Gs`);
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

  // Estadísticas completas
  const dashboardStats = useMemo(() => {
    let conCobertura = 0, sinCobertura = 0;
    let pendientes = 0, cargadoAuto = 0, cargadoManual = 0, aDropear = 0, cancelados = 0;
    let totalVentas = 0, totalDelivery = 0, totalCostoProductos = 0;
    let interiorPagoAnticipado = 0;
    
    sheetOrders.forEach((order, idx) => {
      const city = order[colKeys.city] || "";
      const covered = hasCoverage(city);
      const status = getRowStatus(idx);
      const salePrice = getAmountFromRow(order, colKeys.amount);
      const deliveryPrice = getCityDeliveryPrice(city) || 0;
      const productName = order[colKeys.product] || "";
      const matched = matchProduct(productName);
      const productCost = matched?.provider_price_gs || 0;
      
      // Detectar Interior Pago Anticipado
      if (city.toLowerCase().includes("interior") || city.toLowerCase().includes("pago anticipado")) {
        interiorPagoAnticipado++;
      }
      
      if (covered) {
        conCobertura++;
        if (status === "CARGAR") {
          pendientes++;
          totalVentas += salePrice;
          totalDelivery += deliveryPrice;
          totalCostoProductos += productCost;
        }
      } else {
        sinCobertura++;
      }
      
      if (status === "CARGADO") cargadoAuto++;
      else if (status === "CARGADO_MANUAL") cargadoManual++;
      else if (status === "A DROPEAR") aDropear++;
      else if (status === "CANCELADO") cancelados++;
    });
    
    const gananciaNeta = totalVentas - totalDelivery - totalCostoProductos;
    const totalPedidos = sheetOrders.length;
    const completados = cargadoAuto + cargadoManual;
    const tasaCompletados = conCobertura > 0 ? Math.round((completados / conCobertura) * 100) : 0;
    
    return {
      totalPedidos, conCobertura, sinCobertura, pendientes, cargadoAuto, cargadoManual, aDropear, cancelados,
      totalVentas, totalDelivery, totalCostoProductos, gananciaNeta, completados, tasaCompletados,
      interiorPagoAnticipado,
      tasaCobertura: totalPedidos > 0 ? Math.round((conCobertura / totalPedidos) * 100) : 0,
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
        if (activeFilter === "CANCELADO" && status !== "CANCELADO") return false;
        
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
    let cargar = 0, cargado = 0, cargadoManual = 0, aDropear = 0, cancelados = 0;
    sheetOrders.forEach((order, idx) => {
      const status = getRowStatus(idx);
      const city = order[colKeys.city] || "";
      const covered = hasCoverage(city);
      if (status === "CARGAR" && covered) cargar++;
      else if (status === "CARGADO") cargado++;
      else if (status === "CARGADO_MANUAL") cargadoManual++;
      else if (status === "A DROPEAR") aDropear++;
      else if (status === "CANCELADO") cancelados++;
    });
    return { cargar, cargado, cargadoManual, aDropear, cancelados, total: sheetOrders.length };
  }, [sheetOrders, colKeys, getRowStatus]);

  const changeFilter = (filter: FilterType) => setActiveFilter(filter);
  
  const getRowClassName = (status: OrderStatus, hasCoverageCity: boolean) => {
    if (status === "CARGADO" || status === "CARGADO_MANUAL") return "bg-gradient-to-r from-green-500/10 to-transparent";
    if (status === "A DROPEAR") return "bg-gradient-to-r from-yellow-500/10 to-transparent";
    if (status === "CANCELADO") return "bg-gradient-to-r from-red-500/10 to-transparent";
    if (!hasCoverageCity) return "bg-gradient-to-r from-orange-500/5 to-transparent";
    return "hover:bg-slate-800/50";
  };

  const getStatusLabel = (status: OrderStatus): string => {
    const labels = {
      CARGAR: "⏳ Pendiente",
      "A DROPEAR": "⚠️ Dropear",
      CARGADO: "✅ Auto",
      CARGADO_MANUAL: "✍️ Manual",
      CANCELADO: "❌ Cancelado"
    };
    return labels[status];
  };

  if (loadingStatuses) {
    return <div className="flex items-center justify-center h-64"><div className="btn-spinner mr-2" />Cargando...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Dashboard Elegante */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-3 shadow-lg border border-slate-700">
          <div className="text-2xl font-bold text-blue-400">{dashboardStats.totalPedidos}</div>
          <div className="text-xs text-slate-400">📦 Total Pedidos</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-3 shadow-lg border border-slate-700">
          <div className="text-2xl font-bold text-green-400">{dashboardStats.conCobertura}</div>
          <div className="text-xs text-slate-400">📍 Con cobertura</div>
          <div className="text-[10px] text-slate-500 mt-1">{dashboardStats.tasaCobertura}%</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-3 shadow-lg border border-slate-700">
          <div className="text-2xl font-bold text-red-400">{dashboardStats.sinCobertura}</div>
          <div className="text-xs text-slate-400">❌ Sin cobertura</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-3 shadow-lg border border-slate-700">
          <div className="text-2xl font-bold text-yellow-400">{dashboardStats.pendientes}</div>
          <div className="text-xs text-slate-400">⏳ Pendientes</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-3 shadow-lg border border-slate-700">
          <div className="text-2xl font-bold text-emerald-400">{dashboardStats.completados}</div>
          <div className="text-xs text-slate-400">✅ Completados</div>
          <div className="text-[10px] text-slate-500 mt-1">{dashboardStats.tasaCompletados}%</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-3 shadow-lg border border-slate-700">
          <div className="text-2xl font-bold text-orange-400">{dashboardStats.aDropear + dashboardStats.cancelados}</div>
          <div className="text-xs text-slate-400">⚠️ No procesados</div>
          <div className="text-[10px] text-slate-500">Dropear: {dashboardStats.aDropear} | Cancel: {dashboardStats.cancelados}</div>
        </div>
      </div>

      {/* Métricas financieras y especiales */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl bg-slate-800/50 p-2 border border-slate-700/50">
          <div className="text-[10px] text-slate-400">💰 Ventas</div>
          <div className="text-sm font-bold text-green-400">{nf(dashboardStats.totalVentas)} Gs</div>
        </div>
        <div className="rounded-xl bg-slate-800/50 p-2 border border-slate-700/50">
          <div className="text-[10px] text-slate-400">🚚 Delivery</div>
          <div className="text-sm font-bold text-orange-400">{nf(dashboardStats.totalDelivery)} Gs</div>
        </div>
        <div className="rounded-xl bg-slate-800/50 p-2 border border-slate-700/50">
          <div className="text-[10px] text-slate-400">📦 Costo</div>
          <div className="text-sm font-bold text-purple-400">{nf(dashboardStats.totalCostoProductos)} Gs</div>
        </div>
        <div className="rounded-xl bg-emerald-800/20 p-2 border border-emerald-700/50">
          <div className="text-[10px] text-slate-400">🏆 Ganancia</div>
          <div className="text-sm font-bold text-emerald-400">{nf(dashboardStats.gananciaNeta)} Gs</div>
        </div>
        <div className="rounded-xl bg-blue-800/20 p-2 border border-blue-700/50">
          <div className="text-[10px] text-slate-400">📬 Interior Pago Ant.</div>
          <div className="text-sm font-bold text-blue-400">{dashboardStats.interiorPagoAnticipado}</div>
        </div>
      </div>

      {/* Controles y tabla */}
      <div className="rounded-xl bg-slate-900/50 border border-slate-800 overflow-hidden">
        <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg transition" onClick={() => readSheet()} disabled={loading}>
              {loading ? "Leyendo..." : "📊 Leer Sheet"}
            </button>
            <button className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 rounded-lg transition" onClick={handleBulkLoad}>
              🚀 Cargar todos
            </button>
            <button className={`px-3 py-1.5 text-sm rounded-lg transition ${autoLoad ? "bg-green-600" : "bg-slate-700"}`} onClick={toggleAutoLoad}>
              {autoLoad ? "🤖 Auto ON" : "🤖 Auto OFF"}
            </button>
          </div>
          {lastSync && <div className="text-xs text-slate-500">🔄 {lastSync.toLocaleTimeString("es-PY")}</div>}
        </div>

        {/* Filtros */}
        <div className="p-2 border-b border-slate-800 flex flex-wrap gap-1">
          <button onClick={() => changeFilter("TODOS")} className={`px-2 py-1 rounded text-xs ${activeFilter === "TODOS" ? "bg-slate-700 text-white" : "text-slate-400"}`}>📋 Todos ({counts.total})</button>
          <button onClick={() => changeFilter("CARGAR")} className={`px-2 py-1 rounded text-xs ${activeFilter === "CARGAR" ? "bg-blue-600 text-white" : "text-slate-400"}`}>⏳ Pendientes ({counts.cargar})</button>
          <button onClick={() => changeFilter("CARGADO")} className={`px-2 py-1 rounded text-xs ${activeFilter === "CARGADO" ? "bg-green-600 text-white" : "text-slate-400"}`}>✅ Auto ({counts.cargado})</button>
          <button onClick={() => changeFilter("CARGADO_MANUAL")} className={`px-2 py-1 rounded text-xs ${activeFilter === "CARGADO_MANUAL" ? "bg-emerald-600 text-white" : "text-slate-400"}`}>✍️ Manual ({counts.cargadoManual})</button>
          <button onClick={() => changeFilter("A DROPEAR")} className={`px-2 py-1 rounded text-xs ${activeFilter === "A DROPEAR" ? "bg-yellow-600 text-white" : "text-slate-400"}`}>⚠️ Dropear ({counts.aDropear})</button>
          <button onClick={() => changeFilter("CANCELADO")} className={`px-2 py-1 rounded text-xs ${activeFilter === "CANCELADO" ? "bg-red-600 text-white" : "text-slate-400"}`}>❌ Cancelado ({counts.cancelados})</button>
          
          <div className="flex-1"></div>
          
          <div className="flex gap-1">
            <button onClick={() => setCoverageFilter("all")} className={`px-2 py-1 rounded text-xs ${coverageFilter === "all" ? "bg-slate-700" : "text-slate-500"}`}>🌍 Todas</button>
            <button onClick={() => setCoverageFilter("covered")} className={`px-2 py-1 rounded text-xs ${coverageFilter === "covered" ? "bg-green-600" : "text-slate-500"}`}>✅ Con cobertura</button>
            <button onClick={() => setCoverageFilter("uncovered")} className={`px-2 py-1 rounded text-xs ${coverageFilter === "uncovered" ? "bg-red-600" : "text-slate-500"}`}>❌ Sin cobertura</button>
          </div>
        </div>

        {/* Buscador */}
        <div className="p-2 border-b border-slate-800 flex gap-2">
          <div className="flex gap-1">
            <button onClick={() => setSearchType("product")} className={`px-2 py-1 rounded text-xs ${searchType === "product" ? "bg-blue-600" : "bg-slate-800"}`}>🏷️ Producto</button>
            <button onClick={() => setSearchType("city")} className={`px-2 py-1 rounded text-xs ${searchType === "city" ? "bg-blue-600" : "bg-slate-800"}`}>📍 Ciudad</button>
            <button onClick={() => setSearchType("all")} className={`px-2 py-1 rounded text-xs ${searchType === "all" ? "bg-blue-600" : "bg-slate-800"}`}>🔍 Todo</button>
          </div>
          <input
            className="flex-1 bg-slate-800 rounded-lg px-3 py-1.5 text-sm border border-slate-700 focus:outline-none focus:border-blue-500"
            placeholder={searchType === "product" ? "Buscar producto..." : searchType === "city" ? "Buscar ciudad..." : "Buscar en todos los campos..."}
            value={searchType === "product" ? productSearch : searchType === "city" ? cityFilter : search}
            onChange={(e) => {
              if (searchType === "product") setProductSearch(e.target.value);
              else if (searchType === "city") setCityFilter(e.target.value);
              else setSearch(e.target.value);
            }}
          />
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-slate-400">#</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-slate-400">ID</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-slate-400">Fecha</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-slate-400">Cliente</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-slate-400">Teléfono</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-slate-400">Ciudad / Delivery</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-slate-400">Producto</th>
                <th className="px-2 py-2 text-center text-xs font-medium text-slate-400">Cant</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-slate-400">Venta</th>
                <th className="px-2 py-2 text-center text-xs font-medium text-slate-400">Estado</th>
                <th className="px-2 py-2 text-center text-xs font-medium text-slate-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredOrders.map(({ order, idx }) => {
                const status = getRowStatus(idx);
                const city = order[colKeys.city] || "";
                const deliveryPrice = getCityDeliveryPrice(city);
                const covered = deliveryPrice !== null;
                const salePrice = getDisplayAmount(order);
                const orderDate = getOrderDate(order);
                const canLoad = status === "CARGAR" && covered && salePrice > 0;
                const orderNumber = getRowOrderNumber(idx);
                const isInterior = city.toLowerCase().includes("interior") || city.toLowerCase().includes("pago anticipado");

                return (
                  <tr key={idx} className={getRowClassName(status, covered)}>
                    <td className="px-2 py-2 text-xs text-slate-400">{idx + 1}</td>
                    <td className="px-2 py-2 text-xs font-mono">
                      {orderNumber ? <span className="text-green-400">{orderNumber}</span> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-2 py-2 text-xs">{orderDate}</td>
                    <td className="px-2 py-2 text-xs font-medium">{order[colKeys.name] || "—"}</td>
                    <td className="px-2 py-2 text-xs">{order[colKeys.phone] || "—"}</td>
                    <td className="px-2 py-2 text-xs">
                      <div className={covered ? "text-green-400" : isInterior ? "text-blue-400" : "text-red-400"}>
                        {city || "—"}
                        {deliveryPrice && <span className="text-[10px] text-slate-400 ml-1">({nf(deliveryPrice)} Gs)</span>}
                        {isInterior && !deliveryPrice && <span className="text-[10px] text-blue-400 ml-1">(Interior Pago Ant.)</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs max-w-[180px] truncate" title={order[colKeys.product] || ""}>
                      {order[colKeys.product] || "—"}
                    </td>
                    <td className="px-2 py-2 text-xs text-center">{parseQuantity(order[colKeys.qty])}</td>
                    <td className="px-2 py-2 text-xs text-right text-green-400">{salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}</td>
                    <td className="px-2 py-2 text-center">
                      <select
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                        value={status}
                        onChange={(e) => setRowStatus(String(idx), e.target.value as OrderStatus, orderNumber || undefined)}
                      >
                        <option value="CARGAR">⏳ Pendiente</option>
                        <option value="A DROPEAR">⚠️ Dropear</option>
                        <option value="CANCELADO">❌ Cancelado</option>
                        <option value="CARGADO">✅ Auto</option>
                        <option value="CARGADO_MANUAL">✍️ Manual</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        {canLoad && (
                          <button className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded" onClick={() => handleDirectSave(order, idx)} title="Cargar pedido">
                            💰
                          </button>
                        )}
                        <button className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded" onClick={() => handleOpenForm(order, idx)} title="Abrir formulario">
                          📝
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 text-slate-500">No hay pedidos para mostrar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
