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

const normalizeText = (text: string): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/-/g, "")
    .trim();
};

const CITY_COVERAGE_MAP: Record<string, number> = {
  "altos": 55000, "aregua": 45000, "asuncion": 35000, "atyra": 55000,
  "benjaminaceval": 60000, "caacupe": 55000, "capiata": 45000, "ciudaddeleste": 45000,
  "coloniyguazu": 50000, "emboscada": 55000, "eusebioayala": 55000, "fernandodelamora": 35000,
  "guarambare": 50000, "hernandarias": 50000, "interiorpagoanticipado": 35000, "ita": 55000,
  "itacurubidelacordillera": 55000, "itaugua": 45000,
  "jaugustosaldivar": 45000, "jaugustosaldívar": 45000, "jagugustosaldivar": 45000,
  "jagugustosaldívar": 45000, "jagustosaldivar": 45000, "augustosaldivar": 45000, "saldivar": 45000,
  "juanleonmalloriquin": 60000, "lambare": 35000, "limpio": 40000, "lomagrande": 55000,
  "luque": 35000, "marianoroquealonso": 40000, "mingaguazu": 50000, "ñemby": 40000, "nemby": 40000,
  "nuevaitalia": 55000, "paraguari": 55000, "pirayu": 55000, "piribebuy": 55000,
  "presidentefranco": 50000, "puertopresidentefranco": 50000, "remansito": 60000, "sanalberto": 55000,
  "santonio": 45000, "sanantonio": 45000, "sanantonioi": 45000, "santoni": 45000,
  "sanbernardino": 55000, "sanlorenzo": 35000, "santarita": 55000, "tobati": 55000,
  "villaelsa": 40000, "villaelisa": 40000, "villahayes": 60000, "villarrica": 50000,
  "villeta": 55000, "villela": 55000, "yaguaron": 55000, "yguazu": 60000,
  "ypacarai": 55000, "ypane": 45000
};

const CITY_DEPARTMENT_MAP: Record<string, string> = {
  "altos": "Cordillera",
  "aregua": "Central",
  "asuncion": "Central",
  "atyra": "Cordillera",
  "benjaminaceval": "Presidente Hayes",
  "caacupe": "Cordillera",
  "caaguazu": "Caaguazú",
  "capiata": "Central",
  "carapegua": "Paraguarí",
  "ciudaddeleste": "Alto Paraná",
  "coloniyguazu": "Alto Paraná",
  "coronelbogado": "Itapúa",
  "coroneloviedo": "Caaguazú",
  "emboscada": "Cordillera",
  "encarnacion": "Itapúa",
  "escobar": "Paraguarí",
  "eusebioayala": "Cordillera",
  "felixperezcardozo": "Caaguazú",
  "fernandodelamora": "Central",
  "generalbernardinocaballero": "Paraguarí",
  "guarambare": "Central",
  "hernandarias": "Alto Paraná",
  "interiorpagoanticipado": "Varios",
  "ita": "Central",
  "itacurubidelacordillera": "Cordillera",
  "itaugua": "Central",
  "jaugustosaldivar": "Central",
  "jaugustosaldívar": "Central",
  "jagugustosaldivar": "Central",
  "juanleonmalloriquin": "Alto Paraná",
  "karaguatay": "Cordillera",
  "lambare": "Central",
  "limpio": "Central",
  "lomagrande": "Cordillera",
  "luque": "Central",
  "marianoroquealonso": "Central",
  "mauriciojosetroche": "Caaguazú",
  "mbocayaty": "Guairá",
  "mingaguazu": "Alto Paraná",
  "nataliciotalavera": "Caaguazú",
  "ñemby": "Central",
  "nemby": "Central",
  "nuevaitalia": "Cordillera",
  "paraguari": "Paraguarí",
  "pedrojuancaballero": "Amambay",
  "pirayu": "Paraguarí",
  "piribebuy": "Cordillera",
  "presidentefranco": "Alto Paraná",
  "puertopresidentefranco": "Alto Paraná",
  "remansito": "Presidente Hayes",
  "repatriacion": "Caaguazú",
  "sanalberto": "Alto Paraná",
  "santonio": "Central",
  "sanantonio": "Central",
  "sanbernardino": "Cordillera",
  "sanestanislao": "San Pedro",
  "sanjosedelosarroyos": "Caaguazú",
  "sanlorenzo": "Central",
  "santahelena": "Cordillera",
  "santarita": "Alto Paraná",
  "sapucai": "Paraguarí",
  "tobati": "Cordillera",
  "villaelsa": "Central",
  "villaelisa": "Central",
  "villahayes": "Presidente Hayes",
  "villarrica": "Guairá",
  "villeta": "Central",
  "yaguaron": "Paraguarí",
  "yataitydelnorte": "Caaguazú",
  "yguazu": "Alto Paraná",
  "ypacarai": "Cordillera",
  "ypane": "Central"
};

const hasCoverage = (cityName: string): boolean => {
  if (!cityName) return false;
  const normalized = normalizeText(cityName);
  if (normalized.includes("interior") || normalized.includes("pagoanticipado")) return true;
  if (normalized.includes("villaelsa") || normalized.includes("villaelisa")) return true;
  if (normalized.includes("augusto") || (normalized.includes("saldivar") && normalized.length < 20)) return true;
  return CITY_COVERAGE_MAP.hasOwnProperty(normalized);
};

const getCityDeliveryPrice = (cityName: string): number | null => {
  if (!cityName) return null;
  const normalized = normalizeText(cityName);
  if (normalized.includes("interior") || normalized.includes("pagoanticipado")) return 35000;
  if (normalized.includes("augusto") || (normalized.includes("saldivar") && normalized.length < 20)) return 45000;
  return CITY_COVERAGE_MAP[normalized] || null;
};

const getCityDepartment = (cityName: string): string | null => {
  if (!cityName) return null;
  const normalized = normalizeText(cityName);
  if (normalized.includes("interior") || normalized.includes("pagoanticipado")) return "Varios";
  if (normalized.includes("augusto") || (normalized.includes("saldivar") && normalized.length < 20)) return "Central";
  if (normalized.includes("villaelsa") || normalized.includes("villaelisa")) return "Central";
  if (normalized.includes("ciudaddeleste") || normalized.includes("cdedeleste")) return "Alto Paraná";
  return CITY_DEPARTMENT_MAP[normalized] || null;
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

const generateUniqueOrderId = async (): Promise<string> => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const newOrderNumber = `SHOPIFY${timestamp}${random}`;
  const { data: existing } = await supabase
    .from('orders')
    .select('order_number')
    .eq('order_number', newOrderNumber)
    .maybeSingle();
  if (!existing) return newOrderNumber;
  return generateUniqueOrderId();
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
  
  // 🔥 CAMBIO CRÍTICO: usar __row (número de fila real) como clave, NO idx
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
  const [selectedOrder, setSelectedOrder] = useState<{ order: SheetOrder; rowKey: string } | null>(null);
  const [showGuideModal, setShowGuideModal] = useState(false);

  // ─── NUEVO: Estado para selección múltiple ───
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

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
      name: find("nombre", "cliente", "customer", "name", "NOMBRE"),
      phone: find("telefono", "phone", "tel", "celular", "whatsapp", "Teléfono"),
      street: find("calle", "direccion", "address", "street", "CALLE"),
      city: find("ciudad", "city", "localidad", "distrito", "CIUDAD"),
      product: find("producto", "product", "articulo", "PRODUCTO"),
      qty: find("cantidad", "qty", "quantity", "unidades", "CANTIDAD"),
      amount: find("total", "monto", "precio", "importe", "venta", "MONTO"),
      date: find("fecha", "date", "FECHA"),
    };
  }, [sheetHeaders]);

  // ─── FUNCIONES CON __row COMO CLAVE ───
  
  // Obtener la clave estable de una fila: usa __row del sheet, fallback a idx
  const getRowKey = useCallback((order: SheetOrder, idx: number): string => {
    if (order.__row) {
      return String(order.__row);
    }
    console.warn(`⚠️ Fila ${idx} sin __row, usando idx como fallback`);
    return String(idx);
  }, []);

  const getRowStatus = useCallback((rowKey: string): OrderStatus => {
    return rowStatuses[rowKey] || "CARGAR";
  }, [rowStatuses]);

  const getRowOrderNumber = useCallback((rowKey: string): string | null => {
    return rowOrderNumbers[rowKey] || null;
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
          const rowKey = String(item.row_index);
          statusMap[rowKey] = item.status as OrderStatus;
          if (item.order_number) orderNumberMap[rowKey] = item.order_number;
        });
        setRowStatuses(statusMap);
        setRowOrderNumbers(orderNumberMap);
        console.log("📊 Estados cargados desde BD (usando __row):", statusMap);
      } else if (error) {
        console.error("Error cargando estados:", error);
      }
    } catch (err) { console.error(err); }
    finally { setLoadingStatuses(false); }
  }, [myEmail, sheetUrl]);

  const persistRowStatus = useCallback(async (rowKey: string, status: OrderStatus, orderNumber?: string) => {
    if (!myEmail || !sheetUrl) {
      toast.error("Falta email o URL del sheet");
      return;
    }
    console.log(`📝 Persistiendo estado: Fila ${rowKey} -> "${status}"`);
    try {
      if (status !== "CARGAR") {
        const { error } = await supabase
          .from("sheet_row_statuses")
          .upsert({
            user_email: myEmail,
            sheet_url: sheetUrl,
            row_index: rowKey,
            status: status,
            order_number: orderNumber || null,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_email,sheet_url,row_index'
          });
        if (error) throw error;
        console.log(`✅ Estado persistido: ${status}`);
        const statusMessages: Record<OrderStatus, string> = {
          "CANCELADO": "❌ Cancelado",
          "A DROPEAR": "⚠️ A Dropear",
          "CARGADO": "✅ Cargado Auto",
          "CARGADO_MANUAL": "✍️ Cargado Manual",
          "CARGAR": "⏳ Pendiente"
        };
        toast.success(`✅ Estado: ${statusMessages[status] || status}`);
      } else {
        const { error } = await supabase
          .from("sheet_row_statuses")
          .delete()
          .eq("user_email", myEmail)
          .eq("sheet_url", sheetUrl)
          .eq("row_index", rowKey);
        if (error) throw error;
        console.log(`✅ Estado eliminado (Pendiente)`);
        toast.success(`✅ Estado: ⏳ Pendiente`);
      }
    } catch (error: any) {
      console.error("❌ Error al persistir estado:", error);
      toast.error(`Error: ${error.message}`);
      await loadStatusesFromDatabase();
    }
  }, [myEmail, sheetUrl, loadStatusesFromDatabase]);

  const setRowStatus = useCallback(async (rowKey: string, status: OrderStatus, orderNumber?: string) => {
    if (status === "CARGAR") {
      setRowStatuses(prev => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
      setRowOrderNumbers(prev => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
    } else {
      setRowStatuses(prev => ({ ...prev, [rowKey]: status }));
      if (orderNumber) {
        setRowOrderNumbers(prev => ({ ...prev, [rowKey]: orderNumber }));
      }
    }
    await persistRowStatus(rowKey, status, orderNumber);
  }, [persistRowStatus]);

  // ─── REALTIME ───
  useEffect(() => {
    if (!myEmail || !sheetUrl) return;
    const channel = supabase
      .channel('sheet_row_statuses_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sheet_row_statuses', filter: `user_email=eq.${myEmail}` },
        (payload) => {
          console.log('🔄 Cambio en tiempo real:', payload);
          loadStatusesFromDatabase();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myEmail, sheetUrl, loadStatusesFromDatabase]);

  // ─── EFFECTS ───
  useEffect(() => { localStorage.setItem(AUTO_LOAD_KEY, autoLoad.toString()); }, [autoLoad]);
  useEffect(() => { localStorage.setItem(ACTIVE_FILTER_KEY, activeFilter); }, [activeFilter]);
  useEffect(() => { supabase.from("products").select("*").then(({ data }) => setProducts(data || [])); }, []);
  useEffect(() => { if (myEmail && sheetUrl) loadStatusesFromDatabase(); }, [myEmail, sheetUrl, loadStatusesFromDatabase]);
  useEffect(() => { if (sheetUrl && !initialLoadDone) { readSheet(); setInitialLoadDone(true); } }, [sheetUrl]);

  useEffect(() => {
    if (sheetOrders.length > 0 && colKeys.city) {
      const uniqueCities = [...new Set(sheetOrders.map(o => o[colKeys.city]).filter(c => c))];
      console.log("🏙️ CIUDADES ENCONTRADAS EN EL SHEET:");
      uniqueCities.forEach(city => {
        const depto = getCityDepartment(city);
        console.log(`  - "${city}" → Depto: ${depto || "❌ NO ENCONTRADO"}`);
      });
    }
  }, [sheetOrders, colKeys.city]);

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

  const loadOrder = useCallback(async (order: SheetOrder, rowKey: string, source: "auto" | "manual" = "auto") => {
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    if (!matched) { toast.error(`❌ Producto no detectado: "${productName}"`); return false; }

    const city = order[colKeys.city] || "";
    const deliveryPrice = getCityDeliveryPrice(city);
    if (!deliveryPrice) { toast.warning(`⚠️ Ciudad "${city}" sin cobertura`); return false; }

    const departamento = getCityDepartment(city);
    if (!departamento) toast.warning(`⚠️ No se pudo determinar el departamento para "${city}"`);

    const salePrice = getAmountFromRow(order, colKeys.amount);
    if (salePrice === 0) { toast.warning(`⚠️ No se detectó monto en fila ${rowKey}`); return false; }

    const orderId = await generateUniqueOrderId();
    const newStatus: OrderStatus = source === "auto" ? "CARGADO" : "CARGADO_MANUAL";
    const productCost = matched.provider_price_gs || 0;
    const commission = salePrice - (productCost + deliveryPrice);

    const payload = {
      order_number: orderId,
      created_by: myEmail,
      customer_name: order[colKeys.name] || "",
      phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: city,
      departamento: departamento || "",
      street: order[colKeys.street] || "",
      district: "", email: "", obs: "",
      items_json: [{
        sku: matched.sku || "",
        title: matched.title,
        qty: parseQuantity(order[colKeys.qty]),
        sale_gs: salePrice,
        provider_price_gs: productCost,
        provider_email: matched.provider_email || ""
      }],
      total_gs: salePrice,
      delivery_gs: deliveryPrice,
      commission_gs: commission,
      provider_emails_list: matched.provider_email || "",
    };

    const { error } = await supabase.from("orders").insert(payload);
    if (error) { toast.error("Error al guardar: " + error.message); console.error("Error detallado:", error); return false; }

    await setRowStatus(rowKey, newStatus, orderId);
    toast.success(`✅ Pedido ${orderId} cargado | Delivery: ${nf(deliveryPrice)} Gs | Depto: ${departamento || "?"}`);
    return true;
  }, [colKeys, matchProduct, myEmail, setRowStatus]);

  const handleDirectSave = (order: SheetOrder, rowKey: string) => loadOrder(order, rowKey, "auto");

  const handleOpenForm = (order: SheetOrder, rowKey: string) => {
    if (onSheetConfirm) onSheetConfirm({
      customer: order[colKeys.name] || "",
      phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: order[colKeys.city] || "",
      street: order[colKeys.street] || "",
      productTitle: order[colKeys.product] || "",
      totalGs: getAmountFromRow(order, colKeys.amount),
      qty: parseQuantity(order[colKeys.qty]),
    });
  };

  const handleBulkLoad = async () => {
    let count = 0, errors = 0;
    for (let i = 0; i < sheetOrders.length; i++) {
      const order = sheetOrders[i];
      const rowKey = getRowKey(order, i);
      const status = getRowStatus(rowKey);
      if (status !== "CARGAR") continue;
      const city = order[colKeys.city] || "";
      if (!hasCoverage(city)) continue;
      const success = await loadOrder(order, rowKey, "auto");
      if (success) count++; else errors++;
      if (count % 3 === 0) await new Promise(r => setTimeout(r, 100));
    }
    toast.success(`✅ ${count} cargados | ❌ ${errors} errores`);
  };

  // ─── NUEVO: Funciones para selección múltiple ───

  // Toggle selección de una fila
  const toggleRowSelection = (rowKey: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowKey)) {
        newSet.delete(rowKey);
      } else {
        newSet.add(rowKey);
      }
      return newSet;
    });
  };

  // Seleccionar/Deseleccionar todos
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedRows(new Set());
    } else {
      const allKeys = filteredOrders.map(item => item.rowKey);
      setSelectedRows(new Set(allKeys));
    }
    setSelectAll(!selectAll);
  };

  // Acción en lote: Cambiar estado de múltiples filas
  const bulkChangeStatus = async (newStatus: OrderStatus) => {
    if (selectedRows.size === 0) {
      toast.warning("⚠️ Seleccioná al menos una fila");
      return;
    }

    setBulkActionLoading(true);
    let successCount = 0;
    let errorCount = 0;

    const statusMessages: Record<OrderStatus, string> = {
      "CANCELADO": "❌ Cancelado",
      "A DROPEAR": "⚠️ A Dropear",
      "CARGADO": "✅ Cargado Auto",
      "CARGADO_MANUAL": "✍️ Cargado Manual",
      "CARGAR": "⏳ Pendiente"
    };

    // Procesar en lotes de 10 para no sobrecargar
    const rows = Array.from(selectedRows);
    const batchSize = 10;
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const promises = batch.map(async (rowKey) => {
        try {
          // Obtener el orderNumber actual si existe
          const orderNumber = getRowOrderNumber(rowKey);
          
          // Actualizar UI localmente
          if (newStatus === "CARGAR") {
            setRowStatuses(prev => {
              const next = { ...prev };
              delete next[rowKey];
              return next;
            });
            setRowOrderNumbers(prev => {
              const next = { ...prev };
              delete next[rowKey];
              return next;
            });
          } else {
            setRowStatuses(prev => ({ ...prev, [rowKey]: newStatus }));
          }

          // Persistir en BD
          await persistRowStatus(rowKey, newStatus, orderNumber || undefined);
          successCount++;
        } catch (error) {
          console.error(`Error al cambiar estado de fila ${rowKey}:`, error);
          errorCount++;
        }
      });

      await Promise.all(promises);
      
      // Mostrar progreso
      toast.info(`⏳ Procesando... ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
    }

    // Limpiar selección
    setSelectedRows(new Set());
    setSelectAll(false);
    setBulkActionLoading(false);

    toast.success(`✅ Estados actualizados: ${successCount} exitosos, ${errorCount} errores`);
  };

  // Acción en lote: Cargar múltiples pedidos
  const bulkLoadOrders = async () => {
    if (selectedRows.size === 0) {
      toast.warning("⚠️ Seleccioná al menos una fila");
      return;
    }

    setBulkActionLoading(true);
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    const rows = Array.from(selectedRows);
    
    // Primero, verificar qué filas son cargables
    const loadableRows: { rowKey: string; order: SheetOrder }[] = [];
    
    for (const rowKey of rows) {
      const status = getRowStatus(rowKey);
      if (status !== "CARGAR") {
        skippedCount++;
        continue;
      }
      
      // Encontrar el order correspondiente
      const order = sheetOrders.find((o, idx) => getRowKey(o, idx) === rowKey);
      if (!order) {
        errorCount++;
        continue;
      }
      
      const city = order[colKeys.city] || "";
      if (!hasCoverage(city)) {
        skippedCount++;
        continue;
      }
      
      loadableRows.push({ rowKey, order });
    }

    if (loadableRows.length === 0) {
      toast.warning(`⚠️ Ninguna fila seleccionada es cargable (${skippedCount} no cargables)`);
      setBulkActionLoading(false);
      return;
    }

    toast.info(`⏳ Cargando ${loadableRows.length} pedidos...`);

    // Procesar en lotes de 5 para no sobrecargar
    const batchSize = 5;
    for (let i = 0; i < loadableRows.length; i += batchSize) {
      const batch = loadableRows.slice(i, i + batchSize);
      const promises = batch.map(async ({ rowKey, order }) => {
        try {
          const success = await loadOrder(order, rowKey, "auto");
          if (success) successCount++;
          else errorCount++;
        } catch (error) {
          console.error(`Error al cargar pedido ${rowKey}:`, error);
          errorCount++;
        }
      });

      await Promise.all(promises);
      
      // Mostrar progreso
      toast.info(`⏳ Progreso: ${Math.min(i + batchSize, loadableRows.length)}/${loadableRows.length}`);
    }

    // Limpiar selección
    setSelectedRows(new Set());
    setSelectAll(false);
    setBulkActionLoading(false);

    toast.success(`✅ Pedidos cargados: ${successCount} exitosos, ${errorCount} errores, ${skippedCount} omitidos`);
  };

  const toggleAutoLoad = () => {
    setAutoLoad(!autoLoad);
    toast.info(!autoLoad ? "🤖 Auto-carga activada" : "⏹️ Auto-carga desactivada");
  };

  const getDisplayAmount = (order: SheetOrder) => getAmountFromRow(order, colKeys.amount);

  const getOrderDate = (order: SheetOrder) => {
    const dateValue = order[colKeys.date];
    if (!dateValue) return "—";
    try { const d = new Date(dateValue); if (!isNaN(d.getTime())) return d.toLocaleDateString("es-PY"); } catch {}
    return String(dateValue).split(' ')[0];
  };

  const getAllFields = (order: SheetOrder) => {
    const camposPrincipales = ['FECHA', 'NOMBRE', 'Teléfono', 'CIUDAD', 'PRODUCTO', 'CANTIDAD', 'MONTO', 'REFERENCIA', 'CALLE'];
    const principales: Record<string, string> = {};
    const extras: Record<string, string> = {};
    for (const key in order) {
      const valor = order[key];
      if (!valor || valor.trim() === "") continue;
      if (camposPrincipales.some(campo => campo.toLowerCase() === key.toLowerCase())) {
        principales[key] = valor;
      } else {
        extras[key] = valor;
      }
    }
    return { principales, extras };
  };

  // ─── ESTADÍSTICAS CON __row ───
  const dashboardStats = useMemo(() => {
    let pendientesConCobertura = 0, pendientesSinCobertura = 0, cargados = 0, dropeados = 0, cancelados = 0;
    sheetOrders.forEach((order, idx) => {
      const rowKey = getRowKey(order, idx);
      const city = order[colKeys.city] || "";
      const covered = hasCoverage(city);
      const status = getRowStatus(rowKey);
      if (status === "CARGAR") {
        if (covered) pendientesConCobertura++; else pendientesSinCobertura++;
      } else if (status === "CARGADO" || status === "CARGADO_MANUAL") {
        cargados++;
      } else if (status === "A DROPEAR") {
        dropeados++;
      } else if (status === "CANCELADO") {
        cancelados++;
      }
    });
    return { pendientesConCobertura, pendientesSinCobertura, cargados, dropeados, cancelados, totalPedidos: sheetOrders.length };
  }, [sheetOrders, colKeys, getRowKey, getRowStatus]);

  const counts = useMemo(() => {
    let cargarConCobertura = 0, cargarSinCobertura = 0, cargados = 0, aDropear = 0, cancelados = 0;
    sheetOrders.forEach((order, idx) => {
      const rowKey = getRowKey(order, idx);
      const status = getRowStatus(rowKey);
      const city = order[colKeys.city] || "";
      const covered = hasCoverage(city);
      if (status === "CARGAR") {
        if (covered) cargarConCobertura++; else cargarSinCobertura++;
      } else if (status === "CARGADO" || status === "CARGADO_MANUAL") {
        cargados++;
      } else if (status === "A DROPEAR") {
        aDropear++;
      } else if (status === "CANCELADO") {
        cancelados++;
      }
    });
    return { cargarConCobertura, cargarSinCobertura, cargados, aDropear, cancelados, total: sheetOrders.length };
  }, [sheetOrders, colKeys, getRowKey, getRowStatus]);

  // ─── FILTERED ORDERS CON __row ───
  const filteredOrders = useMemo(() => {
    return sheetOrders
      .map((order, idx) => ({ order, idx, rowKey: getRowKey(order, idx) }))
      .filter(({ order, rowKey }) => {
        const status = getRowStatus(rowKey);
        const city = order[colKeys.city] || "";
        const covered = hasCoverage(city);

        let estadoMatch = true;
        switch (activeFilter) {
          case "CARGAR":    estadoMatch = status === "CARGAR"; break;
          case "CARGADO":   estadoMatch = status === "CARGADO" || status === "CARGADO_MANUAL"; break;
          case "A DROPEAR": estadoMatch = status === "A DROPEAR"; break;
          case "CANCELADO": estadoMatch = status === "CANCELADO"; break;
          case "TODOS":     estadoMatch = true; break;
        }
        if (!estadoMatch) return false;

        let coberturaMatch = true;
        switch (coverageFilter) {
          case "covered":   coberturaMatch = covered === true; break;
          case "uncovered": coberturaMatch = covered === false; break;
          case "all":       coberturaMatch = true; break;
        }
        if (!coberturaMatch) return false;

        if (searchType === "product" && productSearch.trim()) {
          const product = order[colKeys.product] || "";
          return product.toLowerCase().includes(productSearch.toLowerCase());
        }
        if (searchType === "city" && cityFilter.trim()) {
          const cityName = order[colKeys.city] || "";
          return cityName.toLowerCase().includes(cityFilter.toLowerCase());
        }
        if (searchType === "all" && search.trim()) {
          const allText = Object.values(order).join(" ").toLowerCase();
          return allText.includes(search.toLowerCase());
        }
        return true;
      });
  }, [sheetOrders, activeFilter, search, productSearch, cityFilter, searchType, coverageFilter, colKeys, getRowKey, getRowStatus]);

  // ─── NUEVO: Efecto para mantener selectAll sincronizado ───
  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectAll(false);
      return;
    }
    const allKeys = filteredOrders.map(item => item.rowKey);
    const allSelected = allKeys.every(key => selectedRows.has(key));
    setSelectAll(allSelected);
  }, [filteredOrders, selectedRows]);

  const changeFilter = (filter: FilterType) => setActiveFilter(filter);

  const getRowClassName = (status: OrderStatus, hasCoverageCity: boolean) => {
    if (status === "CARGADO" || status === "CARGADO_MANUAL") return "bg-green-500/5";
    if (status === "A DROPEAR") return "bg-yellow-500/5";
    if (status === "CANCELADO") return "bg-red-500/5";
    if (!hasCoverageCity && status === "CARGAR") return "bg-orange-500/5";
    return "hover:bg-slate-800/30";
  };

  const renderGuideModal = () => {
    if (!showGuideModal || !selectedOrder) return null;
    const { order, rowKey } = selectedOrder;
    const status = getRowStatus(rowKey);
    const city = order[colKeys.city] || "";
    const covered = hasCoverage(city);
    const deliveryPrice = getCityDeliveryPrice(city);
    const departamento = getCityDepartment(city);
    const salePrice = getDisplayAmount(order);
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    const quantity = parseQuantity(order[colKeys.qty]);
    const orderNumber = getRowOrderNumber(rowKey);
    const { extras } = getAllFields(order);
    const totalConEnvio = salePrice + (deliveryPrice || 0);
    const unitPrice = quantity > 1 ? Math.round(salePrice / quantity) : salePrice;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowGuideModal(false)}>
        <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-5 py-4 flex justify-between items-center z-10">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                📦 GUÍA DE ENVÍO
                {orderNumber && (
                  <span className="text-[10px] font-mono text-green-400 bg-green-500/10 px-2 py-0.5 rounded">{orderNumber}</span>
                )}
              </h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Fila real #{order.__row || '?'} - {getOrderDate(order)}</p>
            </div>
            <button onClick={() => setShowGuideModal(false)} className="text-slate-400 hover:text-white text-3xl leading-none transition-colors">×</button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                <div className="text-[9px] text-slate-400 uppercase tracking-wider">Estado actual</div>
                <div className="mt-1">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                    status === "CARGADO" || status === "CARGADO_MANUAL" ? "bg-green-500/20 text-green-400" :
                    status === "A DROPEAR" ? "bg-yellow-500/20 text-yellow-400" :
                    status === "CANCELADO" ? "bg-red-500/20 text-red-400" :
                    "bg-blue-500/20 text-blue-400"
                  }`}>
                    {status === "CARGADO" ? "✅ CARGADO AUTOMÁTICO" :
                     status === "CARGADO_MANUAL" ? "✍️ CARGADO MANUAL" :
                     status === "A DROPEAR" ? "⚠️ A DROPEAR" :
                     status === "CANCELADO" ? "❌ CANCELADO" : "⏳ PENDIENTE"}
                  </span>
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                <div className="text-[9px] text-slate-400 uppercase tracking-wider">Cobertura de envío</div>
                <div className="mt-1">
                  {covered ? (
                    <>
                      <div className="text-green-400 font-semibold text-sm">✅ CON COBERTURA</div>
                      {deliveryPrice && <div className="text-[10px] text-slate-400 mt-0.5">Costo delivery: {nf(deliveryPrice)} Gs</div>}
                    </>
                  ) : (
                    <div className="text-red-400 font-semibold text-sm">❌ SIN COBERTURA</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><span className="text-base">👤</span> DATOS DEL CLIENTE</h3>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="col-span-2 md:col-span-1">
                  <div className="text-slate-400 text-[9px] uppercase tracking-wider">Nombre completo</div>
                  <div className="text-white font-medium mt-0.5">{order[colKeys.name] || "—"}</div>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <div className="text-slate-400 text-[9px] uppercase tracking-wider">Teléfono / WhatsApp</div>
                  <div className="text-white mt-0.5">{order[colKeys.phone] || "—"}</div>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <div className="text-slate-400 text-[9px] uppercase tracking-wider">Ciudad / Localidad</div>
                  <div className={`mt-0.5 font-medium ${covered ? "text-green-400" : "text-red-400"}`}>{order[colKeys.city] || "—"}</div>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <div className="text-slate-400 text-[9px] uppercase tracking-wider">Departamento</div>
                  <div className="text-white mt-0.5 font-medium">{departamento || "—"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-slate-400 text-[9px] uppercase tracking-wider">Calle / Dirección</div>
                  <div className="text-white mt-0.5">{order[colKeys.street] || "—"}</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><span className="text-base">📦</span> DETALLE DEL PRODUCTO</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="border-b border-slate-700">
                    <tr className="text-slate-400 text-[9px] uppercase tracking-wider">
                      <th className="text-left py-1">Producto</th>
                      <th className="text-center w-16">Cant.</th>
                      <th className="text-right w-28">Precio Unit.</th>
                      <th className="text-right w-28">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 text-white font-medium truncate max-w-[200px]" title={productName}>{productName || "—"}</td>
                      <td className="py-2 text-center text-white">{quantity}</td>
                      <td className="py-2 text-right text-white">{nf(unitPrice)} Gs</td>
                      <td className="py-2 text-right text-green-400 font-semibold">{nf(salePrice)} Gs</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {matched && (
                <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px] text-slate-400">
                  <span className="text-slate-500">SKU:</span> {matched.sku || "—"} &nbsp;|&nbsp;
                  <span className="text-slate-500">Costo proveedor:</span> {nf(matched.provider_price_gs || 0)} Gs
                </div>
              )}
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><span className="text-base">💰</span> RESUMEN DE COSTOS</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-400">Subtotal productos:</span>
                  <span className="text-white">{nf(salePrice)} Gs</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-400">Costo de envío:</span>
                  <span className={deliveryPrice ? "text-orange-400" : "text-slate-500"}>{deliveryPrice ? nf(deliveryPrice) : "0"} Gs</span>
                </div>
                {matched && (
                  <div className="flex justify-between text-[12px] pt-1 border-t border-slate-700/50">
                    <span className="text-slate-400">Comisión del vendedor:</span>
                    <span className="text-blue-400 font-semibold">{nf(salePrice - (matched.provider_price_gs || 0) - (deliveryPrice || 0))} Gs</span>
                  </div>
                )}
                <div className="flex justify-between text-[14px] pt-2 border-t border-slate-700">
                  <span className="font-bold text-white">TOTAL A PAGAR:</span>
                  <span className="font-bold text-green-400 text-base">{nf(totalConEnvio)} Gs</span>
                </div>
              </div>
            </div>

            {Object.keys(extras).length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><span className="text-base">📋</span> INFORMACIÓN ADICIONAL</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(extras).map(([key, value]) => (
                    <div key={key} className="flex">
                      <span className="text-slate-400 min-w-[100px]">{key}:</span>
                      <span className="text-white ml-2 break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center pt-2">
              <div className="text-[9px] text-slate-500">Esta guía fue generada automáticamente el {new Date().toLocaleString("es-PY")}</div>
              <div className="text-[8px] text-slate-600 mt-1">Documento válido para entrega - E-commerce DCANP Group</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loadingStatuses) {
    return <div className="flex items-center justify-center h-64"><div className="btn-spinner mr-2" />Cargando...</div>;
  }

  return (
    <div className="h-full flex flex-col space-y-1.5">
      {/* Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1 flex-shrink-0">
        <div className="bg-blue-500/10 rounded p-1.5 text-center border border-blue-500/20">
          <div className="text-sm font-bold text-blue-400">{dashboardStats.pendientesConCobertura}</div>
          <div className="text-[9px] text-slate-400">Pendientes con cobertura</div>
        </div>
        <div className="bg-orange-500/10 rounded p-1.5 text-center border border-orange-500/20">
          <div className="text-sm font-bold text-orange-400">{dashboardStats.pendientesSinCobertura}</div>
          <div className="text-[9px] text-slate-400">Pendientes sin cobertura</div>
        </div>
        <div className="bg-green-500/10 rounded p-1.5 text-center border border-green-500/20">
          <div className="text-sm font-bold text-green-400">{dashboardStats.cargados}</div>
          <div className="text-[9px] text-slate-400">Cargados (Auto/Manual)</div>
        </div>
        <div className="bg-yellow-500/10 rounded p-1.5 text-center border border-yellow-500/20">
          <div className="text-sm font-bold text-yellow-400">{dashboardStats.dropeados}</div>
          <div className="text-[9px] text-slate-400">Dropeados</div>
        </div>
        <div className="bg-red-500/10 rounded p-1.5 text-center border border-red-500/20">
          <div className="text-sm font-bold text-red-400">{dashboardStats.cancelados}</div>
          <div className="text-[9px] text-slate-400">Cancelados</div>
        </div>
        <div className="bg-purple-500/10 rounded p-1.5 text-center border border-purple-500/20">
          <div className="text-sm font-bold text-purple-400">{dashboardStats.totalPedidos}</div>
          <div className="text-[9px] text-slate-400">Total Pedidos</div>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap gap-1 flex-shrink-0">
        <button className="px-2 py-0.5 text-[11px] bg-blue-600 hover:bg-blue-700 rounded transition" onClick={() => readSheet()} disabled={loading}>
          {loading ? "Leyendo..." : "📊 Leer Sheet"}
        </button>
        <button className="px-2 py-0.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 rounded transition" onClick={handleBulkLoad}>
          🚀 Cargar todos
        </button>
        <button className={`px-2 py-0.5 text-[11px] rounded transition ${autoLoad ? "bg-green-600" : "bg-slate-700"}`} onClick={toggleAutoLoad}>
          {autoLoad ? "🤖 Auto ON" : "🤖 Auto OFF"}
        </button>
        <button className="px-2 py-0.5 text-[11px] bg-red-600 hover:bg-red-700 rounded transition" onClick={() => loadStatusesFromDatabase()}>
          🔄 Recargar estados
        </button>
        {lastSync && <span className="text-[9px] text-slate-500 self-center">🔄 {lastSync.toLocaleTimeString("es-PY")}</span>}
      </div>

      {/* ─── NUEVO: Barra de acciones en lote ─── */}
      {selectedRows.size > 0 && (
        <div className="flex flex-wrap items-center gap-1 p-1.5 bg-blue-500/10 rounded border border-blue-500/20 flex-shrink-0">
          <span className="text-[10px] text-blue-400 font-medium mr-1">
            ✅ {selectedRows.size} seleccionado{selectedRows.size > 1 ? 's' : ''}
          </span>
          <div className="h-4 w-px bg-slate-600 mx-1" />
          
          <select
            className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-blue-500"
            onChange={(e) => {
              const value = e.target.value;
              if (value) {
                bulkChangeStatus(value as OrderStatus);
                e.target.value = "";
              }
            }}
            defaultValue=""
            disabled={bulkActionLoading}
          >
            <option value="">📝 Cambiar estado...</option>
            <option value="CARGAR">⏳ Pendiente</option>
            <option value="A DROPEAR">⚠️ Dropear</option>
            <option value="CANCELADO">❌ Cancelado</option>
            <option value="CARGADO">✅ Auto</option>
            <option value="CARGADO_MANUAL">✍️ Manual</option>
          </select>

          <button
            className="px-1.5 py-0.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 rounded transition-colors disabled:opacity-50"
            onClick={bulkLoadOrders}
            disabled={bulkActionLoading}
          >
            🚀 Cargar seleccionados
          </button>

          <button
            className="px-1.5 py-0.5 text-[10px] bg-slate-700 hover:bg-slate-600 rounded transition-colors disabled:opacity-50"
            onClick={() => {
              setSelectedRows(new Set());
              setSelectAll(false);
            }}
            disabled={bulkActionLoading}
          >
            ✖ Limpiar
          </button>

          {bulkActionLoading && (
            <span className="text-[10px] text-yellow-400 animate-pulse ml-1">⏳ Procesando...</span>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-0.5 flex-shrink-0">
        <button onClick={() => changeFilter("TODOS")} className={`px-1.5 py-0.5 rounded text-[10px] ${activeFilter === "TODOS" ? "bg-slate-700 text-white" : "text-slate-400"}`}>
          📋 Todos ({counts.total})
        </button>
        <button onClick={() => changeFilter("CARGAR")} className={`px-1.5 py-0.5 rounded text-[10px] ${activeFilter === "CARGAR" ? "bg-blue-600 text-white" : "text-slate-400"}`}>
          ⏳ Pendientes ({counts.cargarConCobertura})
        </button>
        <button onClick={() => changeFilter("CARGADO")} className={`px-1.5 py-0.5 rounded text-[10px] ${activeFilter === "CARGADO" ? "bg-green-600 text-white" : "text-slate-400"}`}>
          ✅ Cargados ({counts.cargados})
        </button>
        <button onClick={() => changeFilter("A DROPEAR")} className={`px-1.5 py-0.5 rounded text-[10px] ${activeFilter === "A DROPEAR" ? "bg-yellow-600 text-white" : "text-slate-400"}`}>
          ⚠️ Dropear ({counts.aDropear})
        </button>
        <button onClick={() => changeFilter("CANCELADO")} className={`px-1.5 py-0.5 rounded text-[10px] ${activeFilter === "CANCELADO" ? "bg-red-600 text-white" : "text-slate-400"}`}>
          ❌ Cancelado ({counts.cancelados})
        </button>
        <div className="flex-1"></div>
        <div className="flex gap-0.5">
          <button onClick={() => setCoverageFilter("all")} className={`px-1.5 py-0.5 rounded text-[10px] ${coverageFilter === "all" ? "bg-slate-700" : "text-slate-500"}`}>
            🌍 Todas
          </button>
          <button onClick={() => setCoverageFilter("covered")} className={`px-1.5 py-0.5 rounded text-[10px] ${coverageFilter === "covered" ? "bg-green-600" : "text-slate-500"}`}>
            ✅ Con cobertura ({counts.cargarConCobertura})
          </button>
          <button onClick={() => setCoverageFilter("uncovered")} className={`px-1.5 py-0.5 rounded text-[10px] ${coverageFilter === "uncovered" ? "bg-red-600" : "text-slate-500"}`}>
            ❌ Sin cobertura ({counts.cargarSinCobertura})
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="flex gap-1 flex-shrink-0">
        <div className="flex gap-0.5">
          <button onClick={() => setSearchType("product")} className={`px-1.5 py-0.5 rounded text-[10px] ${searchType === "product" ? "bg-blue-600" : "bg-slate-800"}`}>
            🏷️ Producto
          </button>
          <button onClick={() => setSearchType("city")} className={`px-1.5 py-0.5 rounded text-[10px] ${searchType === "city" ? "bg-blue-600" : "bg-slate-800"}`}>
            📍 Ciudad
          </button>
          <button onClick={() => setSearchType("all")} className={`px-1.5 py-0.5 rounded text-[10px] ${searchType === "all" ? "bg-blue-600" : "bg-slate-800"}`}>
            🔍 Todo
          </button>
        </div>
        <input
          className="flex-1 bg-slate-800 rounded px-2 py-0.5 text-[11px] border border-slate-700 focus:outline-none focus:border-blue-500"
          placeholder={searchType === "product" ? "Buscar producto..." : searchType === "city" ? "Buscar ciudad..." : "Buscar en todos los campos..."}
          value={searchType === "product" ? productSearch : searchType === "city" ? cityFilter : search}
          onChange={(e) => {
            if (searchType === "product") setProductSearch(e.target.value);
            else if (searchType === "city") setCityFilter(e.target.value);
            else setSearch(e.target.value);
          }}
        />
      </div>

      <div className="text-[9px] text-slate-500 flex-shrink-0 flex justify-between items-center">
        <span>Mostrando {filteredOrders.length} de {sheetOrders.length} filas</span>
        {selectedRows.size > 0 && (
          <span className="text-blue-400">{selectedRows.size} seleccionados</span>
        )}
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 overflow-auto rounded border border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-800 sticky top-0 z-10">
            <tr className="border-b border-slate-700">
              {/* ─── NUEVO: Checkbox para seleccionar todos ─── */}
              <th className="px-1.5 py-1.5 text-center text-[10px] font-medium text-slate-400 w-8">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  disabled={filteredOrders.length === 0 || bulkActionLoading}
                />
              </th>
              <th className="px-1.5 py-1.5 text-left text-[10px] font-medium text-slate-400">#</th>
              <th className="px-1.5 py-1.5 text-left text-[10px] font-medium text-slate-400">ID</th>
              <th className="px-1.5 py-1.5 text-left text-[10px] font-medium text-slate-400">Fecha</th>
              <th className="px-1.5 py-1.5 text-left text-[10px] font-medium text-slate-400">Cliente</th>
              <th className="px-1.5 py-1.5 text-left text-[10px] font-medium text-slate-400">Teléfono</th>
              <th className="px-1.5 py-1.5 text-left text-[10px] font-medium text-slate-400">Ciudad</th>
              <th className="px-1.5 py-1.5 text-left text-[10px] font-medium text-slate-400">Departamento</th>
              <th className="px-1.5 py-1.5 text-left text-[10px] font-medium text-slate-400">Delivery</th>
              <th className="px-1.5 py-1.5 text-left text-[10px] font-medium text-slate-400">Producto</th>
              <th className="px-1.5 py-1.5 text-center text-[10px] font-medium text-slate-400">Cant</th>
              <th className="px-1.5 py-1.5 text-right text-[10px] font-medium text-slate-400">Venta</th>
              <th className="px-1.5 py-1.5 text-center text-[10px] font-medium text-slate-400">Estado</th>
              <th className="px-1.5 py-1.5 text-center text-[10px] font-medium text-slate-400">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredOrders.map(({ order, idx, rowKey }) => {
              const status = getRowStatus(rowKey);
              const city = order[colKeys.city] || "";
              const deliveryPrice = getCityDeliveryPrice(city);
              const covered = deliveryPrice !== null;
              const salePrice = getDisplayAmount(order);
              const orderDate = getOrderDate(order);
              const canLoad = status === "CARGAR" && covered && salePrice > 0;
              const orderNumber = getRowOrderNumber(rowKey);
              const departamento = getCityDepartment(city);
              const rowDisplay = order.__row || String(idx + 1);
              const isSelected = selectedRows.has(rowKey);

              return (
                <tr key={rowKey} className={`${getRowClassName(status, covered)} ${isSelected ? 'ring-1 ring-blue-500/50 bg-blue-500/5' : ''}`}>
                  {/* ─── NUEVO: Checkbox individual ─── */}
                  <td className="px-1.5 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRowSelection(rowKey)}
                      className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      disabled={bulkActionLoading}
                    />
                  </td>
                  <td className="px-1.5 py-1 text-[10px] text-slate-400 font-mono">{rowDisplay}</td>
                  <td className="px-1.5 py-1 text-[10px] font-mono">
                    {orderNumber ? <span className="text-green-400">{orderNumber}</span> : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-1.5 py-1 text-[10px]">{orderDate}</td>
                  <td className="px-1.5 py-1 text-[10px] font-medium truncate max-w-[100px]" title={order[colKeys.name] || ""}>
                    {order[colKeys.name]?.substring(0, 20) || "—"}
                  </td>
                  <td className="px-1.5 py-1 text-[10px]">{order[colKeys.phone]?.substring(0, 15) || "—"}</td>
                  <td className="px-1.5 py-1 text-[10px]">
                    <div className={covered ? "text-green-400" : "text-red-400"}>{city?.substring(0, 25) || "—"}</div>
                  </td>
                  <td className="px-1.5 py-1 text-[10px]">
                    <div className={departamento ? "text-blue-400 font-medium" : "text-slate-500"}>{departamento || "—"}</div>
                  </td>
                  <td className="px-1.5 py-1 text-[10px]">
                    {deliveryPrice
                      ? <span className="text-orange-400 font-medium">{nf(deliveryPrice)} Gs</span>
                      : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-1.5 py-1 text-[10px] max-w-[150px] truncate" title={order[colKeys.product] || ""}>
                    {order[colKeys.product]?.substring(0, 25) || "—"}
                  </td>
                  <td className="px-1.5 py-1 text-[10px] text-center">{parseQuantity(order[colKeys.qty])}</td>
                  <td className="px-1.5 py-1 text-[10px] text-right text-green-400">
                    {salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}
                  </td>
                  <td className="px-1.5 py-1 text-center">
                    <select
                      className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[10px] focus:outline-none focus:border-blue-500"
                      value={status}
                      onChange={(e) => {
                        const newStatus = e.target.value as OrderStatus;
                        console.log(`🔄 Cambiando estado de fila ${rowKey} (real #${rowDisplay}) de ${status} a ${newStatus}`);

                        if (newStatus === "CARGAR") {
                          setRowStatuses(prev => {
                            const next = { ...prev };
                            delete next[rowKey];
                            return next;
                          });
                          setRowOrderNumbers(prev => {
                            const next = { ...prev };
                            delete next[rowKey];
                            return next;
                          });
                        } else {
                          setRowStatuses(prev => ({ ...prev, [rowKey]: newStatus }));
                        }

                        persistRowStatus(rowKey, newStatus, orderNumber || undefined);
                      }}
                    >
                      <option value="CARGAR">⏳ Pendiente</option>
                      <option value="A DROPEAR">⚠️ Dropear</option>
                      <option value="CANCELADO">❌ Cancelado</option>
                      <option value="CARGADO">✅ Auto</option>
                      <option value="CARGADO_MANUAL">✍️ Manual</option>
                    </select>
                  </td>
                  <td className="px-1.5 py-1 text-center">
                    <div className="flex gap-0.5 justify-center">
                      {canLoad && (
                        <button
                          className="px-1.5 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                          onClick={() => handleDirectSave(order, rowKey)}
                        >
                          Cargar
                        </button>
                      )}
                      <button
                        className="px-1.5 py-0.5 text-[10px] bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                        onClick={() => { setSelectedOrder({ order, rowKey }); setShowGuideModal(true); }}
                      >
                        📄 Guía
                      </button>
                      <button
                        className="px-1.5 py-0.5 text-[10px] bg-purple-700 hover:bg-purple-600 rounded transition-colors"
                        onClick={() => handleOpenForm(order, rowKey)}
                      >
                        Formulario
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={14} className="text-center py-4 text-slate-500 text-[10px]">
                  No hay pedidos para mostrar
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderGuideModal()}
    </div>
  );
}
