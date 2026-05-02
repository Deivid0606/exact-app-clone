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

const normalizeText = (text: string): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
};

// LISTA COMPLETA DE CIUDADES CON COBERTURA (TODAS LAS VARIANTES NORMALIZADAS)
const COVERAGE_CITIES_NORMALIZED: string[] = [
  // Altos
  "altos",
  // Areguá
  "aregua",
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
  // Ñemby (con y sin ñ)
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
  "santonio", "sanantonioi",
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
  "sanantonioi": 45000, "sanbernardino": 55000, "sanlorenzo": 35000, "santarita": 55000,
  "tobati": 55000, "villaelsa": 40000, "villahayes": 60000, "villarrica": 50000,
  "villeta": 55000, "yaguaron": 55000, "yguazu": 60000, "ypacarai": 55000, "ypane": 45000
};

// Función EXACTA para verificar cobertura
const hasCoverage = (cityName: string): boolean => {
  if (!cityName) return false;
  const normalizedInput = normalizeText(cityName);
  
  // Verificar si está EXACTAMENTE en la lista
  for (const coverageCity of COVERAGE_CITIES_NORMALIZED) {
    if (normalizedInput === coverageCity) {
      return true;
    }
  }
  
  // Para casos como "sanantonioi" (con i al final)
  return false;
};

const getCityDeliveryPrice = (cityName: string): number | null => {
  if (!cityName) return null;
  const normalizedInput = normalizeText(cityName);
  
  for (const [key, price] of Object.entries(CITY_DELIVERY_PRICES)) {
    if (normalizedInput === key) return price;
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
  const [coverageFilter, setCoverageFilter] = useState<"all" | "covered" | "uncovered">("all");
  const [search, setSearch] = useState("");

  const autoLoadRef = useRef(autoLoad);

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
    toast.success(`✅ Pedido ${orderId} cargado`);
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

  // ESTADÍSTICAS
  const dashboardStats = useMemo(() => {
    let conCobertura = 0, sinCobertura = 0;
    let pendientes = 0, cargadoAuto = 0, cargadoManual = 0, aDropear = 0;
    let totalVentas = 0, totalDelivery = 0, totalCostoProductos = 0;
    
    sheetOrders.forEach((order, idx) => {
      const city = order[colKeys.city] || "";
      const covered = hasCoverage(city);
      const status = getRowStatus(idx);
      const salePrice = getAmountFromRow(order, colKeys.amount);
      const deliveryPrice = getCityDeliveryPrice(city) || 0;
      const productName = order[colKeys.product] || "";
      const matched = matchProduct(productName);
      const productCost = matched?.provider_price_gs || 0;
      
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
    });
    
    const gananciaNeta = totalVentas - totalDelivery - totalCostoProductos;
    const totalPedidos = sheetOrders.length;
    
    return {
      totalPedidos, conCobertura, sinCobertura, pendientes, cargadoAuto, cargadoManual, aDropear,
      totalVentas, totalDelivery, totalCostoProductos, gananciaNeta,
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
    if (status === "CARGADO" || status === "CARGADO_MANUAL") return "bg-gradient-to-r from-green-500/10 to-transparent";
    if (status === "A DROPEAR") return "bg-gradient-to-r from-yellow-500/10 to-transparent";
    if (!hasCoverageCity) return "bg-gradient-to-r from-red-500/5 to-transparent";
    return "hover:bg-muted/30";
  };

  if (loadingStatuses) {
    return <div className="flex items-center justify-center h-64"><div className="btn-spinner mr-2" />Cargando...</div>;
  }

  return (
    <div className="space-y-4">
      {/* DASHBOARD ELEGANTE */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tarjeta Total Pedidos */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-lg border border-slate-700">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10"></div>
          <div className="relative z-10">
            <div className="text-3xl font-bold text-blue-400">{dashboardStats.totalPedidos}</div>
            <div className="text-sm text-slate-400 mt-1">Total Pedidos</div>
            <div className="mt-2 text-xs text-slate-500">📦 En el sheet</div>
          </div>
        </div>

        {/* Tarjeta Cobertura */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-lg border border-slate-700">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full -mr-10 -mt-10"></div>
          <div className="relative z-10">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-green-400">{dashboardStats.conCobertura}</span>
              <span className="text-lg text-slate-500">/ {dashboardStats.totalPedidos}</span>
            </div>
            <div className="text-sm text-slate-400 mt-1">Con cobertura</div>
            <div className="mt-2">
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div className="bg-green-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${dashboardStats.tasaCobertura}%` }} />
              </div>
              <div className="text-xs text-slate-500 mt-1">{dashboardStats.tasaCobertura}% del total</div>
            </div>
          </div>
        </div>

        {/* Tarjeta Pendientes */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-lg border border-slate-700">
          <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-500/10 rounded-full -mr-10 -mt-10"></div>
          <div className="relative z-10">
            <div className="text-3xl font-bold text-yellow-400">{dashboardStats.pendientes}</div>
            <div className="text-sm text-slate-400 mt-1">Pendientes de carga</div>
            <div className="mt-2 text-xs text-slate-500">⏳ Listos para procesar</div>
          </div>
        </div>

        {/* Tarjeta Completados */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-lg border border-slate-700">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full -mr-10 -mt-10"></div>
          <div className="relative z-10">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-400">{dashboardStats.cargadoAuto + dashboardStats.cargadoManual}</span>
              <span className="text-lg text-slate-500">/ {dashboardStats.conCobertura}</span>
            </div>
            <div className="text-sm text-slate-400 mt-1">Pedidos cargados</div>
            <div className="mt-2 text-xs text-slate-500">
              ✅ Auto: {dashboardStats.cargadoAuto} | ✍️ Manual: {dashboardStats.cargadoManual}
            </div>
          </div>
        </div>
      </div>

      {/* Fila 2 del Dashboard - Métricas financieras */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400">💰 Total Ventas</div>
          <div className="text-lg font-bold text-green-400">{nf(dashboardStats.totalVentas)} Gs</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400">🚚 Delivery</div>
          <div className="text-lg font-bold text-orange-400">{nf(dashboardStats.totalDelivery)} Gs</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400">📦 Costo Productos</div>
          <div className="text-lg font-bold text-purple-400">{nf(dashboardStats.totalCostoProductos)} Gs</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-800/30 to-emerald-900/30 p-3 border border-emerald-700/50">
          <div className="text-xs text-slate-400">🏆 Ganancia Neta</div>
          <div className="text-lg font-bold text-emerald-400">{nf(dashboardStats.gananciaNeta)} Gs</div>
        </div>
      </div>

      {/* Tabla de Pedidos */}
      <div className="rounded-2xl bg-slate-900/50 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold">📋 Pedidos Shopify + WhatsApp</h3>
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
          </div>
          {lastSync && <div className="text-xs text-slate-500 mt-2">🔄 Última sync: {lastSync.toLocaleTimeString("es-PY")}</div>}
        </div>

        {/* Filtros */}
        <div className="p-3 border-b border-slate-800 flex flex-wrap gap-2">
          <button onClick={() => changeFilter("TODOS")} className={`px-3 py-1 rounded-lg text-sm ${activeFilter === "TODOS" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>📋 Todos ({counts.total})</button>
          <button onClick={() => changeFilter("CARGAR")} className={`px-3 py-1 rounded-lg text-sm ${activeFilter === "CARGAR" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>⏳ Pendientes ({counts.cargar})</button>
          <button onClick={() => changeFilter("CARGADO")} className={`px-3 py-1 rounded-lg text-sm ${activeFilter === "CARGADO" ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"}`}>✅ Auto ({counts.cargado})</button>
          <button onClick={() => changeFilter("CARGADO_MANUAL")} className={`px-3 py-1 rounded-lg text-sm ${activeFilter === "CARGADO_MANUAL" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}>✍️ Manual ({counts.cargadoManual})</button>
          <button onClick={() => changeFilter("A DROPEAR")} className={`px-3 py-1 rounded-lg text-sm ${activeFilter === "A DROPEAR" ? "bg-yellow-600 text-white" : "text-slate-400 hover:text-white"}`}>⚠️ Dropear ({counts.aDropear})</button>
          
          <div className="flex-1"></div>
          
          <div className="flex gap-2">
            <button onClick={() => setCoverageFilter("all")} className={`px-2 py-1 rounded text-xs ${coverageFilter === "all" ? "bg-slate-700" : "text-slate-500"}`}>Todas</button>
            <button onClick={() => setCoverageFilter("covered")} className={`px-2 py-1 rounded text-xs ${coverageFilter === "covered" ? "bg-green-600" : "text-slate-500"}`}>Con cobertura</button>
            <button onClick={() => setCoverageFilter("uncovered")} className={`px-2 py-1 rounded text-xs ${coverageFilter === "uncovered" ? "bg-red-600" : "text-slate-500"}`}>Sin cobertura</button>
          </div>
        </div>

        {/* Buscador */}
        <div className="p-3 border-b border-slate-800 flex flex-wrap gap-2">
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">ID Pedido</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Fecha</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Cliente</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Teléfono</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Ciudad</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Producto</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">Cant</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Venta</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">Estado</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredOrders.map(({ order, idx }) => {
                const status = getRowStatus(idx);
                const city = order[colKeys.city] || "";
                const covered = hasCoverage(city);
                const salePrice = getDisplayAmount(order);
                const orderDate = getOrderDate(order);
                const canLoad = status === "CARGAR" && covered && salePrice > 0;
                const orderNumber = getRowOrderNumber(idx);

                return (
                  <tr key={idx} className={getRowClassName(status, covered)}>
                    <td className="px-3 py-2 text-xs text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2 text-xs font-mono">
                      {orderNumber ? <span className="text-green-400">{orderNumber}</span> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{orderDate}</td>
                    <td className="px-3 py-2 text-xs font-medium">{order[colKeys.name] || "—"}</td>
                    <td className="px-3 py-2 text-xs">{order[colKeys.phone] || "—"}</td>
                    <td className={`px-3 py-2 text-xs ${!covered && city ? "text-red-400" : "text-green-400"}`}>
                      {city || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={order[colKeys.product] || ""}>
                      {order[colKeys.product] || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-center">{parseQuantity(order[colKeys.qty])}</td>
                    <td className="px-3 py-2 text-xs text-right text-green-400">{salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <select
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                        value={status}
                        onChange={(e) => setRowStatus(String(idx), e.target.value as OrderStatus, orderNumber || undefined)}
                      >
                        <option value="CARGAR">⏳ Pendiente</option>
                        <option value="A DROPEAR">⚠️ Dropear</option>
                        <option value="CARGADO">✅ Auto</option>
                        <option value="CARGADO_MANUAL">✍️ Manual</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        {canLoad && (
                          <button className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded" onClick={() => handleDirectSave(order, idx)}>
                            💰
                          </button>
                        )}
                        <button className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded" onClick={() => handleOpenForm(order, idx)}>
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
