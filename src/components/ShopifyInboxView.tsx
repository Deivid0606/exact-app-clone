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

// ========== FUNCIONES ==========

function extractPhoneNumber(value: any): string {
  if (!value) return "";
  let phone = String(value).replace(/[\s\-().+]/g, "").trim();
  if (phone.startsWith("595")) phone = "0" + phone.slice(3);
  if (phone.length === 9 && phone.match(/^\d+$/)) phone = "0" + phone;
  return phone;
}

const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
};

const normalizeCityName = (city: string): string => {
  if (!city) return "";
  
  let normalized = city.split("-")[0].trim();
  
  normalized = normalized
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  
  return normalized;
};

// ========== NUEVA: Tabla de precios por ciudad (para matching inteligente) ==========
const CITY_PRICES: Record<string, number> = {
  "altos": 55000,
  "aregua": 45000,
  "asuncion": 35000,
  "asunción": 35000,
  "atyra": 55000,
  "atyrá": 55000,
  "benjaminaceval": 60000,
  "benjamínaceval": 60000,
  "caacupe": 55000,
  "capiata": 45000,
  "ciudaddeleste": 45000,
  "coloniyguazu": 50000,
  "emboscada": 55000,
  "eusebioayala": 55000,
  "fernandodelamora": 35000,
  "guarambare": 50000,
  "hernandarias": 50000,
  "interiorpagoanticipado": 35000,
  "ita": 55000,
  "itacurubidelacordillera": 55000,
  "itaugua": 45000,
  "jaugustosaldívar": 45000,
  "juanleonmalloriquin": 60000,
  "lambare": 35000,
  "limpio": 40000,
  "lomagrande": 55000,
  "luque": 35000,
  "marianoroquealonso": 40000,
  "mingaguazu": 50000,
  "ñemby": 40000,
  "nuevaitalia": 55000,
  "paraguari": 55000,
  "pirayu": 55000,
  "pirayú": 55000,
  "piribebuy": 55000,
  "presidentefranco": 50000,
  "puertopdtefranco": 50000,
  "remansito": 60000,
  "sanalberto": 55000,
  "santonio": 45000,
  "sanbernardino": 55000,
  "sanlorenzo": 35000,
  "santarita": 55000,
  "tobati": 55000,
  "villaelsa": 40000,
  "villahayes": 60000,
  "villarrica": 50000,
  "villetta": 55000,
  "yaguaron": 55000,
  "yguazu": 60000,
  "ypacarai": 55000,
  "ypane": 45000
};

// Función para obtener precio de ciudad con matching inteligente
const getCityPriceFromMap = (cityName: string): number | null => {
  if (!cityName) return null;
  
  const normalized = normalizeCityName(cityName);
  
  // Búsqueda exacta
  if (CITY_PRICES[normalized]) {
    return CITY_PRICES[normalized];
  }
  
  // Búsqueda por inclusión (para ciudades con textos adicionales)
  for (const [key, price] of Object.entries(CITY_PRICES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return price;
    }
  }
  
  return null;
};

function parseQuantity(value: any): number {
  if (!value) return 1;
  
  let str = String(value).trim();
  
  if (str.includes('\n')) {
    str = str.split('\n')[0].trim();
  }
  
  str = str.replace(/["']/g, '');
  const numMatch = str.match(/\d+/);
  if (!numMatch) return 1;
  
  const num = parseInt(numMatch[0], 10);
  return isNaN(num) ? 1 : num;
}

function parseMoney(v: string): number {
  if (!v) return 0;
  
  let cleanValue = String(v);
  
  if (cleanValue.includes('\n')) {
    cleanValue = cleanValue.split('\n')[0].trim();
  }
  
  cleanValue = cleanValue.replace(/["']/g, '');
  let cleaned = cleanValue.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(cleaned) || 0);
}

const findAmountInRow = (row: SheetOrder): number => {
  const excludeColumns = [
    "telefono", "phone", "tel", "celular", "whatsapp", "cel", "movil",
    "cantidad", "qty", "quantity", "cant", "unidades",
    "fecha", "date", "tiempo", "hora",
    "estado", "status", "condicion",
    "codigo", "code", "id", "sku",
    "nota", "note", "observacion", "comentario",
    "referencia", "reference"
  ];
  
  for (const key in row) {
    const value = row[key];
    if (!value) continue;
    
    const keyLower = key.toLowerCase();
    if (excludeColumns.some(ex => keyLower.includes(ex))) {
      continue;
    }
    
    const str = String(value).trim();
    const priceMatches = str.match(/\b\d{4,7}\b/g);
    
    if (priceMatches && priceMatches.length > 0) {
      for (const match of priceMatches) {
        const num = parseInt(match, 10);
        if (num >= 10000 && num <= 5000000) {
          return num;
        }
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
    if (key === "TOTAL A PAGAR" || key === "total a pagar" || key === "Total a pagar") {
      const parsed = parseMoney(order[key]);
      if (parsed > 0) return parsed;
    }
  }
  
  const fallbackAmount = findAmountInRow(order);
  if (fallbackAmount > 0) return fallbackAmount;
  
  return 0;
};

// ========== GENERA ID PARA PEDIDOS NORMALES (A302, A303, etc.) ==========
const generateNormalOrderId = async (): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('get_next_order_number');
    
    if (error) {
      console.error("Error generando ID normal:", error);
      return `A${Date.now()}`;
    }
    
    return data;
  } catch (err) {
    console.error("Error en generateNormalOrderId:", err);
    return `A${Date.now()}`;
  }
};

// ========== GENERA ID PARA SHOPIFY/SHOPIFY (SHOPIFY001, SHOPIFY002, etc.) ==========
const generateShopifyOrderId = async (): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('get_next_shopify_order_number');
    
    if (!error && data) {
      return data;
    }
    
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('order_number')
      .ilike('order_number', 'SHOPIFY%');
    
    if (fetchError) throw fetchError;
    
    let maxNumber = 0;
    orders?.forEach(order => {
      const match = order.order_number.match(/SHOPIFY(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    });
    
    const nextNumber = maxNumber + 1;
    const padded = String(nextNumber).padStart(3, '0');
    return `SHOPIFY${padded}`;
  } catch (err) {
    console.error("Error en generateShopifyOrderId:", err);
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
  const [clientPrices, setClientPrices] = useState<any[]>([]);

  const [rowStatuses, setRowStatuses] = useState<Record<string, OrderStatus>>({});

  const [autoLoad, setAutoLoad] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AUTO_LOAD_KEY);
      return saved === "true";
    } catch {
      return false;
    }
  });

  const [activeFilter, setActiveFilter] = useState<FilterType>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_FILTER_KEY) as FilterType;
      return saved || "CARGAR";
    } catch {
      return "CARGAR";
    }
  });

  // NUEVOS ESTADOS PARA FILTROS MEJORADOS
  const [searchType, setSearchType] = useState<"all" | "product" | "city">("product");
  const [productSearch, setProductSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  
  // NUEVO: Filtro de cobertura
  const [coverageFilter, setCoverageFilter] = useState<"all" | "covered" | "uncovered">("all");

  const filterOnlyAvailable = true;
  const filterOnlyCoverage = true;
  const [search, setSearch] = useState("");

  const autoLoadRef = useRef(autoLoad);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoLoadingRef = useRef(false);

  // ========== FUNCIONES DE BASE DE DATOS PARA ESTADOS ==========
  
  const loadStatusesFromDatabase = useCallback(async () => {
    if (!myEmail || !sheetUrl) return;
    
    setLoadingStatuses(true);
    try {
      const { data, error } = await supabase
        .from("sheet_row_statuses")
        .select("row_index, status")
        .eq("user_email", myEmail)
        .eq("sheet_url", sheetUrl);
      
      if (error) {
        console.error("Error cargando estados:", error);
        return;
      }
      
      const statusMap: Record<string, OrderStatus> = {};
      data?.forEach(item => {
        statusMap[String(item.row_index)] = item.status as OrderStatus;
      });
      
      setRowStatuses(statusMap);
      console.log(`📦 Estados cargados desde BD: ${Object.keys(statusMap).length} filas`);
    } catch (err) {
      console.error("Error en loadStatusesFromDatabase:", err);
    } finally {
      setLoadingStatuses(false);
    }
  }, [myEmail, sheetUrl]);

  const saveStatusToDatabase = useCallback(async (rowIndex: number, status: OrderStatus, orderNumber?: string) => {
    if (!myEmail || !sheetUrl) return false;
    
    try {
      const { error } = await supabase
        .from("sheet_row_statuses")
        .upsert({
          user_email: myEmail,
          sheet_url: sheetUrl,
          row_index: rowIndex,
          status: status,
          order_number: orderNumber || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_email,sheet_url,row_index'
        });
      
      if (error) {
        console.error("Error guardando estado:", error);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Error en saveStatusToDatabase:", err);
      return false;
    }
  }, [myEmail, sheetUrl]);

  const setRowStatus = useCallback(async (key: string, status: OrderStatus, orderNumber?: string) => {
    const rowIndex = parseInt(key);
    
    setRowStatuses((prev) => ({ ...prev, [key]: status }));
    
    await saveStatusToDatabase(rowIndex, status, orderNumber);
  }, [saveStatusToDatabase]);

  useEffect(() => {
    localStorage.setItem(AUTO_LOAD_KEY, autoLoad.toString());
    autoLoadRef.current = autoLoad;
  }, [autoLoad]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_FILTER_KEY, activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    const loadProducts = async () => {
      const { data } = await supabase.from("products").select("*");
      setProducts(data || []);
    };
    const loadPrices = async () => {
      const { data } = await supabase.from("client_prices").select("*");
      setClientPrices(data || []);
    };
    loadProducts();
    loadPrices();
  }, []);

  useEffect(() => {
    if (myEmail && sheetUrl) {
      loadStatusesFromDatabase();
    }
  }, [myEmail, sheetUrl, loadStatusesFromDatabase]);

  useEffect(() => {
    if (sheetUrl && !initialLoadDone) {
      readSheet();
      setInitialLoadDone(true);
    }
  }, [sheetUrl]);

  // ========== AUTOCOMPLETADO DE PRODUCTOS Y CIUDADES ==========
  useEffect(() => {
    if (productSearch.length > 2 && searchType === "product") {
      const searchLower = productSearch.toLowerCase();
      const suggestions = products
        .filter(p => p.title && p.title.toLowerCase().includes(searchLower))
        .map(p => p.title)
        .slice(0, 5);
      setProductSuggestions(suggestions);
    } else {
      setProductSuggestions([]);
    }
  }, [productSearch, products, searchType]);

  // Autocompletado de ciudades desde el sheet
  useEffect(() => {
    if (cityFilter.length > 1 && searchType === "city") {
      const uniqueCities = new Set<string>();
      sheetOrders.forEach(order => {
        const city = order[colKeys.city];
        if (city && city.trim()) {
          uniqueCities.add(city.trim());
        }
      });
      
      const searchLower = cityFilter.toLowerCase();
      const suggestions = Array.from(uniqueCities)
        .filter(city => city.toLowerCase().includes(searchLower))
        .slice(0, 5);
      setCitySuggestions(suggestions);
    } else {
      setCitySuggestions([]);
    }
  }, [cityFilter, sheetOrders, colKeys.city, searchType]);

  // ========== DETECCIÓN DE COLUMNAS ==========
  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    console.log("📋 Headers del Sheet:", h);
    
    const findExact = (...candidates: string[]) => {
      for (let i = 0; i < h.length; i++) {
        const originalHeader = h[i];
        for (const candidate of candidates) {
          if (originalHeader === candidate) {
            return h[i];
          }
        }
      }
      return "";
    };
    
    const find = (...candidates: string[]) => {
      const normalizedCandidates = candidates.map(c => normalizeText(c));
      
      for (let i = 0; i < h.length; i++) {
        const normalizedHeader = normalizeText(h[i]);
        for (const candidate of normalizedCandidates) {
          if (normalizedHeader === candidate) {
            return h[i];
          }
        }
      }
      
      for (let i = 0; i < h.length; i++) {
        const normalizedHeader = normalizeText(h[i]);
        for (const candidate of normalizedCandidates) {
          if (normalizedHeader.includes(candidate) || candidate.includes(normalizedHeader)) {
            return h[i];
          }
        }
      }
      return "";
    };
    
    const findAmount = () => {
      for (let i = 0; i < h.length; i++) {
        const original = h[i];
        if (original === "TOTAL A PAGAR" || original === "total a pagar") {
          return original;
        }
      }
      
      for (let i = 0; i < h.length; i++) {
        const normalized = normalizeText(h[i]);
        if (normalized === "totalapagar") {
          return h[i];
        }
      }
      
      for (let i = 0; i < h.length; i++) {
        const normalized = normalizeText(h[i]);
        if (normalized.includes("total")) {
          return h[i];
        }
      }
      
      return find("monto", "total", "precio", "importe", "amount", "venta");
    };
    
    let productColumn = findExact("PRODUCTO OK");
    
    if (!productColumn) {
      productColumn = find("PRODUCTO OK", "productook", "producto ok", "PRODUCTO");
    }
    
    console.log("🎯 Columna de producto detectada:", productColumn || "❌ NO ENCONTRADA");
    
    return {
      name: find("nombre", "cliente", "customer", "name", "NOMBRE"),
      phone: find("telefono", "phone", "tel", "celular", "whatsapp", "Teléfono"),
      street: find("calle", "direccion", "address", "street", "CALLE"),
      street2: find("calle 2", "calle2", "direccion 2", "address2"),
      city: find("ciudad", "city", "localidad", "distrito", "CIUDAD"),
      dept: find("departamento", "depto", "department", "state"),
      product: productColumn,
      qty: find("cantidad", "qty", "quantity", "unidades", "CANTIDAD"),
      amount: findAmount(),
      email: find("email", "correo", "mail"),
      date: find("fecha", "date", "fecha pedido", "fecha de pedido"), // NUEVO: detectar fecha
    };
  }, [sheetHeaders]);

  // ========== FUNCIÓN DE BÚSQUEDA ESPECÍFICA ==========
  const filterByProduct = useCallback((order: SheetOrder, searchTerm: string) => {
    if (!searchTerm.trim()) return true;
    
    const searchLower = searchTerm.toLowerCase().trim();
    
    const productOkValue = order[colKeys.product] || "";
    if (productOkValue.toLowerCase().includes(searchLower)) return true;
    
    for (const key in order) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes("producto") || keyLower === "product") {
        const value = String(order[key] || "").toLowerCase();
        if (value.includes(searchLower)) return true;
      }
    }
    
    return false;
  }, [colKeys.product]);

  // NUEVO: Filtro por ciudad
  const filterByCity = useCallback((order: SheetOrder, citySearch: string) => {
    if (!citySearch.trim()) return true;
    
    const orderCity = order[colKeys.city] || "";
    const searchLower = citySearch.toLowerCase().trim();
    
    return orderCity.toLowerCase().includes(searchLower);
  }, [colKeys.city]);

  // NUEVO: Verificar si una ciudad tiene cobertura
  const isCityCovered = useCallback((cityName: string): boolean => {
    return getCityPriceFromMap(cityName) !== null;
  }, []);

  // ========== FUNCIÓN SUPER INTELIGENTE PARA NORMALIZAR ==========
  const normalizeForComparison = (text: string): string => {
    if (!text) return "";
    
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // ========== MATCHING MEJORADO - ENCUENTRA CUALQUIER PRODUCTO ==========
  const matchProduct = useCallback(
    (rawName: string) => {
      if (!rawName || rawName === "—" || rawName === "-") {
        return null;
      }
      
      const cleanSheetName = normalizeForComparison(rawName);
      
      let found = products.find((p) => {
        const cleanProductName = normalizeForComparison(p.title || "");
        return cleanProductName === cleanSheetName;
      });
      
      if (found) return found;
      
      found = products.find((p) => {
        const cleanProductName = normalizeForComparison(p.title || "");
        return cleanSheetName.includes(cleanProductName) || cleanProductName.includes(cleanSheetName);
      });
      
      if (found) return found;
      
      const sheetWords = cleanSheetName.split(' ').filter(w => w.length > 2);
      
      if (sheetWords.length > 0) {
        let bestMatch = null;
        let bestScore = 0;
        
        for (const product of products) {
          const cleanProductName = normalizeForComparison(product.title || "");
          let score = 0;
          
          for (const word of sheetWords) {
            if (cleanProductName === word) {
              score += 100;
            } else if (cleanProductName.includes(word)) {
              score += word.length;
            } else if (word.includes(cleanProductName)) {
              score += cleanProductName.length;
            }
          }
          
          if (score > bestScore && score > 0) {
            bestScore = score;
            bestMatch = product;
          }
        }
        
        if (bestMatch) return bestMatch;
      }
      
      return null;
    },
    [products],
  );

  const getCityPrice = useCallback(
    (cityName: string) => {
      return getCityPriceFromMap(cityName);
    },
    [],
  );

  const hasCoverage = useCallback(
    (cityName: string) => {
      return getCityPriceFromMap(cityName) !== null;
    },
    [],
  );

  const readSheet = useCallback(async () => {
    if (!sheetUrl) {
      toast.error("Configurá tu URL de Google Sheet en tu perfil");
      return;
    }
    
    setLoading(true);
    try {
      const resp = await fetch(`/api/read-sheet?url=${encodeURIComponent(sheetUrl)}&t=${Date.now()}`);
      const json = await resp.json();

      if (json.error) {
        toast.error(json.error);
      } else {
        setSheetHeaders(json.headers || []);
        setSheetOrders(json.orders || []);
        setLastSync(new Date());
        console.log("📊 Sheet actualizado:", json.orders?.length, "filas");
      }
    } catch (err: any) {
      toast.error("Error leyendo Sheet: " + (err.message || err));
    }
    setLoading(false);
  }, [sheetUrl]);

  // ========== LOAD ORDER ==========
  const loadOrder = useCallback(async (
    order: SheetOrder, 
    idx: number, 
    source: "auto" | "manual" = "auto"
  ) => {
    const productName = order[colKeys.product] || "";
    
    if (!colKeys.product) {
      toast.error(`❌ No se encontró la columna "PRODUCTO OK" en el Sheet`);
      return false;
    }
    
    if (!productName) {
      toast.error(`❌ Fila ${idx + 1}: No hay valor en la columna "${colKeys.product}"`);
      return false;
    }
    
    const matched = matchProduct(productName);
    if (!matched) {
      toast.error(`❌ Producto no detectado: "${productName}"`);
      return false;
    }
    
    const city = order[colKeys.city] || "";
    const deliveryPrice = getCityPrice(city);
    
    if (!deliveryPrice) {
      toast.warning(`⚠️ Ciudad "${city}" sin cobertura de delivery.`);
      return false;
    }
    
    const salePrice = getAmountFromRow(order, colKeys.amount);
    
    if (salePrice === 0) {
      toast.warning(`⚠️ No se pudo detectar el monto en la fila ${idx + 1}`);
      return false;
    }
    
    const productCost = matched?.provider_price_gs || 0;
    const qty = parseQuantity(order[colKeys.qty]);
    const commission = salePrice - (productCost + deliveryPrice);
    
    const orderId = await generateShopifyOrderId();
    
    const newStatus: OrderStatus = source === "auto" ? "CARGADO" : "CARGADO_MANUAL";
    
    const payload = {
      order_number: orderId,
      created_by: myEmail,
      customer_name: (order[colKeys.name] || "").trim(),
      phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: city,
      street: (order[colKeys.street] || "").trim(),
      district: (order[colKeys.dept] || "").trim(),
      email: order[colKeys.email] || "",
      obs: "",
      items_json: [{ 
        sku: matched.sku || "",
        title: matched.title, 
        qty: qty, 
        sale_gs: salePrice,
        provider_price_gs: productCost,
        provider_email: matched.provider_email || "",
      }],
      total_gs: salePrice * qty,
      delivery_gs: deliveryPrice,
      commission_gs: commission,
      provider_emails_list: matched.provider_email || "",
    };
    
    const { error } = await supabase.from("orders").insert(payload);
    
    if (error) {
      toast.error("Error: " + error.message);
      return false;
    } else {
      await setRowStatus(String(idx), newStatus, orderId);
      if (commission >= 0) {
        toast.success(`✅ Pedido ${orderId} cargado (${source === "auto" ? "Automático" : "Manual"}) | 💰 Comisión: +${commission.toLocaleString("es-PY")} Gs`);
      } else {
        toast.warning(`⚠️ Pedido ${orderId} cargado (${source === "auto" ? "Automático" : "Manual"}) | 💰 Comisión NEGATIVA: ${commission.toLocaleString("es-PY")} Gs`);
      }
      return true;
    }
  }, [colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

  const handleDirectSave = useCallback(async (order: SheetOrder, idx: number) => {
    await loadOrder(order, idx, "auto");
  }, [loadOrder]);

  const handleManualSave = useCallback(async (order: SheetOrder, idx: number) => {
    await setRowStatus(String(idx), "CARGADO_MANUAL");
    toast.info(`✍️ Pedido marcado como "Cargado Manual" - Usa el botón "Formulario" para completar la carga`);
  }, [setRowStatus]);

  const handleOpenForm = useCallback((order: SheetOrder, idx: number) => {
    if (!onSheetConfirm) return;
    
    const salePrice = getAmountFromRow(order, colKeys.amount);
    
    onSheetConfirm({
      customer: (order[colKeys.name] || "").trim(),
      phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: (order[colKeys.city] || "").trim(),
      street: (order[colKeys.street] || "").trim(),
      district: (order[colKeys.dept] || "").trim(),
      productTitle: (order[colKeys.product] || "").trim(),
      totalGs: salePrice,
      qty: parseQuantity(order[colKeys.qty]),
    });
  }, [colKeys, onSheetConfirm]);

  // ========== BULK LOAD ==========
  const handleBulkLoad = useCallback(async () => {
    if (!colKeys.product) {
      toast.error(`❌ No se encontró la columna "PRODUCTO OK" en el Sheet. No se puede continuar.`);
      return;
    }
    
    let count = 0;
    let errors = 0;
    let skippedNoProduct = 0;
    let skippedNoCoverage = 0;
    let skippedNoAmount = 0;
    let totalCommission = 0;
    
    for (let i = 0; i < sheetOrders.length; i++) {
      const currentStatus = rowStatuses[String(i)] || "CARGAR";
      if (currentStatus !== "CARGAR") continue;
      
      const order = sheetOrders[i];
      const productName = order[colKeys.product] || "";
      
      if (!productName) {
        skippedNoProduct++;
        continue;
      }
      
      const matched = matchProduct(productName);
      if (!matched) {
        skippedNoProduct++;
        continue;
      }
      
      const city = order[colKeys.city] || "";
      const deliveryPrice = getCityPrice(city);
      if (!deliveryPrice) {
        skippedNoCoverage++;
        continue;
      }
      
      const salePrice = getAmountFromRow(order, colKeys.amount);
      if (salePrice === 0) {
        skippedNoAmount++;
        continue;
      }
      
      const productCost = matched?.provider_price_gs || 0;
      const qty = parseQuantity(order[colKeys.qty]);
      const commission = salePrice - (productCost + deliveryPrice);
      
      const orderId = await generateShopifyOrderId();
      
      const payload = {
        order_number: orderId,
        created_by: myEmail,
        customer_name: (order[colKeys.name] || "").trim(),
        phone: extractPhoneNumber(order[colKeys.phone] || ""),
        city: city,
        street: (order[colKeys.street] || "").trim(),
        district: (order[colKeys.dept] || "").trim(),
        email: order[colKeys.email] || "",
        obs: "",
        items_json: [{ 
          sku: matched.sku || "",
          title: matched.title, 
          qty: qty, 
          sale_gs: salePrice,
          provider_price_gs: productCost,
          provider_email: matched.provider_email || "",
        }],
        total_gs: salePrice * qty,
        delivery_gs: deliveryPrice,
        commission_gs: commission,
        provider_emails_list: matched.provider_email || "",
      };
      
      const { error } = await supabase.from("orders").insert(payload);
      if (error) {
        errors++;
      } else {
        await setRowStatus(String(i), "CARGADO", orderId);
        count++;
        totalCommission += commission;
      }
      
      if (count % 3 === 0) await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    toast.success(`✅ ${count} cargados | ❌ ${errors} errores | ⏭️ ${skippedNoProduct} sin producto | 🚫 ${skippedNoCoverage} sin cobertura | 💰 ${skippedNoAmount} sin monto | 💰 Comisión total: ${totalCommission.toLocaleString("es-PY")} Gs`);
  }, [sheetOrders, rowStatuses, colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

  const getDisplayAmount = (order: SheetOrder) => {
    return getAmountFromRow(order, colKeys.amount);
  };

  // ========== NUEVA: Estadísticas para el Dashboard ==========
  const dashboardStats = useMemo(() => {
    let totalVentas = 0;
    let pedidosConMonto = 0;
    let ciudadesUnicas = new Set<string>();
    let ciudadesSinCobertura = new Set<string>();
    
    sheetOrders.forEach((order, idx) => {
      const currentStatus = rowStatuses[String(idx)] || "CARGAR";
      if (currentStatus !== "CARGAR") return;
      
      const monto = getAmountFromRow(order, colKeys.amount);
      if (monto > 0) {
        totalVentas += monto;
        pedidosConMonto++;
      }
      
      const city = order[colKeys.city];
      if (city && city.trim()) {
        ciudadesUnicas.add(city.trim());
        if (!hasCoverage(city)) {
          ciudadesSinCobertura.add(city.trim());
        }
      }
    });
    
    return {
      totalPedidos: sheetOrders.length,
      pedidosPendientes: Object.values(rowStatuses).filter(s => s === "CARGAR").length,
      totalVentas,
      promedioVenta: pedidosConMonto > 0 ? totalVentas / pedidosConMonto : 0,
      ciudadesCubiertas: ciudadesUnicas.size - ciudadesSinCobertura.size,
      ciudadesSinCobertura: ciudadesSinCobertura.size,
      ciudadesLista: Array.from(ciudadesUnicas).slice(0, 5) // Top 5 ciudades
    };
  }, [sheetOrders, rowStatuses, colKeys, hasCoverage]);

  // NUEVO: Extraer fecha del pedido
  const getOrderDate = (order: SheetOrder): string => {
    const dateValue = order[colKeys.date];
    if (!dateValue) return "—";
    
    try {
      // Intenta parsear la fecha
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("es-PY");
      }
      return String(dateValue).split(' ')[0]; // Devuelve como está si no se puede parsear
    } catch {
      return String(dateValue);
    }
  };

  // Filtrado de órdenes MEJORADO
  const filteredOrders = useMemo(() => {
    return sheetOrders
      .map((o, i) => ({ order: o, idx: i }))
      .filter(({ order, idx }) => {
        const currentStatus = rowStatuses[String(idx)] || "CARGAR";
        
        if (activeFilter === "CARGAR" && currentStatus !== "CARGAR") return false;
        if (activeFilter === "CARGADO" && currentStatus !== "CARGADO") return false;
        if (activeFilter === "CARGADO_MANUAL" && currentStatus !== "CARGADO_MANUAL") return false;
        if (activeFilter === "A DROPEAR" && currentStatus !== "A DROPEAR") return false;
        
        if (filterOnlyAvailable && currentStatus === "CARGAR") {
          const productName = order[colKeys.product] || "";
          if (!matchProduct(productName)) return false;
        }
        
        // NUEVO: Filtro por cobertura
        if (coverageFilter !== "all") {
          const city = order[colKeys.city] || "";
          const covered = isCityCovered(city);
          if (coverageFilter === "covered" && !covered) return false;
          if (coverageFilter === "uncovered" && covered) return false;
        }
        
        if (filterOnlyCoverage && currentStatus === "CARGAR") {
          const city = order[colKeys.city] || "";
          if (!hasCoverage(city)) return false;
        }
        
        // Búsqueda específica de PRODUCTO
        if (searchType === "product" && productSearch) {
          return filterByProduct(order, productSearch);
        }
        
        // NUEVO: Búsqueda específica de CIUDAD
        if (searchType === "city" && cityFilter) {
          return filterByCity(order, cityFilter);
        }
        
        // Búsqueda general (todos los campos)
        if (searchType === "all" && search) {
          const q = search.toLowerCase();
          const vals = Object.values(order).join(" ").toLowerCase();
          if (!vals.includes(q)) return false;
        }
        
        return true;
      });
  }, [sheetOrders, rowStatuses, activeFilter, search, productSearch, cityFilter, searchType, coverageFilter, colKeys, matchProduct, hasCoverage, filterOnlyAvailable, filterOnlyCoverage, filterByProduct, filterByCity, isCityCovered]);

  const counts = useMemo(() => {
    const cargar = Object.values(rowStatuses).filter(s => s === "CARGAR").length;
    const cargado = Object.values(rowStatuses).filter(s => s === "CARGADO").length;
    const cargadoManual = Object.values(rowStatuses).filter(s => s === "CARGADO_MANUAL").length;
    const aDropear = Object.values(rowStatuses).filter(s => s === "A DROPEAR").length;
    const total = sheetOrders.length;
    
    return { cargar, cargado, cargadoManual, aDropear, total };
  }, [rowStatuses, sheetOrders.length]);

  const changeFilter = (filter: FilterType) => {
    setActiveFilter(filter);
  };

  const getRowClassName = (status: OrderStatus): string => {
    if (status === "CARGADO" || status === "CARGADO_MANUAL") {
      return "bg-green-500/10 hover:bg-green-500/20 transition-colors";
    }
    if (status === "A DROPEAR") {
      return "bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors";
    }
    return "hover:bg-muted/50 transition-colors";
  };

  const getStatusBadge = (status: OrderStatus): JSX.Element => {
    const styles = {
      CARGAR: "bg-blue-500/20 text-blue-300",
      "A DROPEAR": "bg-yellow-500/20 text-yellow-300",
      CARGADO: "bg-green-500/20 text-green-300",
      CARGADO_MANUAL: "bg-emerald-500/20 text-emerald-300"
    };
    
    const labels = {
      CARGAR: "⏳ Pendiente",
      "A DROPEAR": "⚠️ A Dropear",
      CARGADO: "✅ Cargado (Auto)",
      CARGADO_MANUAL: "✍️ Cargado (Manual)"
    };
    
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  if (loadingStatuses) {
    return (
      <div className="app-card">
        <div className="flex items-center justify-center py-8">
          <div className="btn-spinner mr-2" />
          <span>Cargando estados desde base de datos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">📦 Shopify Inbox — Lectura de Sheet</h3>

      {/* ========== NUEVO: DASHBOARD KPI ========== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <div className="app-card !p-3 text-center bg-blue-500/10 border-blue-500/20">
          <div className="text-2xl font-bold text-blue-400">{dashboardStats.totalPedidos}</div>
          <div className="text-xs text-muted-foreground">Total pedidos</div>
        </div>
        <div className="app-card !p-3 text-center bg-green-500/10 border-green-500/20">
          <div className="text-xl font-bold text-green-400">{dashboardStats.pedidosPendientes}</div>
          <div className="text-xs text-muted-foreground">Pendientes</div>
        </div>
        <div className="app-card !p-3 text-center bg-yellow-500/10 border-yellow-500/20">
          <div className="text-lg font-bold text-yellow-400">{nf(dashboardStats.totalVentas)} Gs</div>
          <div className="text-xs text-muted-foreground">Total ventas</div>
        </div>
        <div className="app-card !p-3 text-center bg-purple-500/10 border-purple-500/20">
          <div className="text-lg font-bold text-purple-400">{nf(dashboardStats.promedioVenta)} Gs</div>
          <div className="text-xs text-muted-foreground">Promedio pedido</div>
        </div>
        <div className="app-card !p-3 text-center bg-emerald-500/10 border-emerald-500/20">
          <div className="text-2xl font-bold text-emerald-400">{dashboardStats.ciudadesCubiertas}</div>
          <div className="text-xs text-muted-foreground">Ciudades con cobertura</div>
        </div>
        <div className="app-card !p-3 text-center bg-red-500/10 border-red-500/20">
          <div className="text-2xl font-bold text-red-400">{dashboardStats.ciudadesSinCobertura}</div>
          <div className="text-xs text-muted-foreground">Sin cobertura</div>
        </div>
      </div>

      <div className="app-card !p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs text-muted-foreground truncate max-w-[400px]">
            {sheetUrl ? `📄 ${sheetUrl.slice(0, 60)}...` : "⚠️ Sin URL de Sheet configurada en perfil"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="nav-btn active" onClick={() => readSheet()} disabled={loading}>
            {loading ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Leyendo...</span> : "📊 Leer Sheet"}
          </button>
          <button className="nav-btn active" onClick={handleBulkLoad} disabled={!sheetOrders.length}>
            🚀 Cargar todos
          </button>
          <button className={`nav-btn ${autoLoad ? "!bg-green-600 !text-white" : ""}`} onClick={toggleAutoLoad}>
            {autoLoad ? "🤖 Auto-carga ON" : "🤖 Auto-carga OFF"}
          </button>
          {lastSync && (
            <span className="text-xs text-muted-foreground self-center">
              Última sync: {lastSync.toLocaleTimeString("es-PY")}
            </span>
          )}
        </div>
        {autoLoad && (
          <div className="text-xs text-green-400 mt-1">
            🤖 Auto-carga activa — Ciclo cada 60 segundos
          </div>
        )}
        {!colKeys.product && sheetHeaders.length > 0 && (
          <div className="text-xs text-red-400 mt-2 bg-red-500/10 p-2 rounded">
            ⚠️ ADVERTENCIA: No se encontró la columna "PRODUCTO OK" en el Sheet. Las columnas disponibles son: {sheetHeaders.join(", ")}
          </div>
        )}
      </div>

      {/* Filtros principales */}
      <div className="flex flex-wrap gap-2 mb-4 border-b border-border pb-3">
        <button
          onClick={() => changeFilter("TODOS")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeFilter === "TODOS"
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-muted hover:bg-muted/80 text-muted-foreground"
          }`}
        >
          📋 Todos ({counts.total})
        </button>
        <button
          onClick={() => changeFilter("CARGAR")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeFilter === "CARGAR"
              ? "bg-blue-500 text-white shadow-md"
              : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400"
          }`}
        >
          ⏳ Pendientes ({counts.cargar})
        </button>
        <button
          onClick={() => changeFilter("CARGADO")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeFilter === "CARGADO"
              ? "bg-green-500 text-white shadow-md"
              : "bg-green-500/10 hover:bg-green-500/20 text-green-400"
          }`}
        >
          ✅ Cargado (Auto) ({counts.cargado})
        </button>
        <button
          onClick={() => changeFilter("CARGADO_MANUAL")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeFilter === "CARGADO_MANUAL"
              ? "bg-emerald-500 text-white shadow-md"
              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400"
          }`}
        >
          ✍️ Cargado (Manual) ({counts.cargadoManual})
        </button>
        <button
          onClick={() => changeFilter("A DROPEAR")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeFilter === "A DROPEAR"
              ? "bg-yellow-500 text-white shadow-md"
              : "bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400"
          }`}
        >
          ⚠️ A Dropear ({counts.aDropear})
        </button>
      </div>

      {/* NUEVO: Filtro de cobertura */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="text-xs text-muted-foreground self-center mr-1">📍 Cobertura:</span>
        <button
          onClick={() => setCoverageFilter("all")}
          className={`px-2 py-1 rounded text-xs transition-all ${
            coverageFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/80"
          }`}
        >
          Todas
        </button>
        <button
          onClick={() => setCoverageFilter("covered")}
          className={`px-2 py-1 rounded text-xs transition-all ${
            coverageFilter === "covered"
              ? "bg-green-500 text-white"
              : "bg-green-500/10 hover:bg-green-500/20 text-green-400"
          }`}
        >
          ✅ Con cobertura
        </button>
        <button
          onClick={() => setCoverageFilter("uncovered")}
          className={`px-2 py-1 rounded text-xs transition-all ${
            coverageFilter === "uncovered"
              ? "bg-red-500 text-white"
              : "bg-red-500/10 hover:bg-red-500/20 text-red-400"
          }`}
        >
          ❌ Sin cobertura
        </button>
      </div>

      {/* BARRA DE BÚSQUEDA MEJORADA CON CIUDAD */}
      <div className="space-y-2 mb-3">
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => setSearchType("product")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              searchType === "product"
                ? "bg-blue-500 text-white shadow-md"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            🏷️ Buscar en PRODUCTO
          </button>
          <button
            onClick={() => setSearchType("city")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              searchType === "city"
                ? "bg-emerald-500 text-white shadow-md"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            📍 Buscar por CIUDAD
          </button>
          <button
            onClick={() => setSearchType("all")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              searchType === "all"
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            🔍 Buscar en TODO
          </button>
          
          {colKeys.product && (
            <div className="ml-auto text-xs text-muted-foreground">
              📌 Columna producto: <span className="font-mono text-blue-400">{colKeys.product}</span>
            </div>
          )}
        </div>
        
        {searchType === "product" && (
          <div className="relative">
            <input
              className="app-input w-full pl-8"
              placeholder={`🔎 Buscar en columna "${colKeys.product || 'PRODUCTO OK'}"...`}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {productSearch && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setProductSearch("")}
              >
                ✕
              </button>
            )}
            {productSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-background border border-border rounded-lg shadow-lg">
                {productSuggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                    onClick={() => setProductSearch(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {searchType === "city" && (
          <div className="relative">
            <input
              className="app-input w-full pl-8"
              placeholder="📍 Buscar por ciudad (ej: Asunción, Luque, CDE)..."
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            />
            {cityFilter && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setCityFilter("")}
              >
                ✕
              </button>
            )}
            {citySuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-background border border-border rounded-lg shadow-lg">
                {citySuggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                    onClick={() => setCityFilter(suggestion)}
                  >
                    📍 {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {searchType === "all" && (
          <input
            className="app-input w-full"
            placeholder="🔎 Buscar en todos los campos (cliente, teléfono, ciudad, producto, etc.)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        Mostrando {filteredOrders.length} de {sheetOrders.length} filas totales
        {searchType === "product" && productSearch && (
          <span className="ml-2 text-blue-400">🔍 Buscando producto: "{productSearch}"</span>
        )}
        {searchType === "city" && cityFilter && (
          <span className="ml-2 text-emerald-400">📍 Buscando ciudad: "{cityFilter}"</span>
        )}
        {coverageFilter !== "all" && (
          <span className="ml-2 text-yellow-400">
            {coverageFilter === "covered" ? "✅ Solo con cobertura" : "❌ Solo sin cobertura"}
          </span>
        )}
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1400px]">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Ciudad</th>
              <th>Calle</th>
              <th className="text-right">Delivery</th>
              <th>Producto</th>
              <th>Cant</th>
              <th className="text-right">Venta</th>
              <th className="text-right">Costo</th>
              <th className="text-right">Comisión</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(({ order, idx }) => {
              const currentStatus = rowStatuses[String(idx)] || "CARGAR";
              const productName = order[colKeys.product] || "";
              const matched = matchProduct(productName);
              const city = order[colKeys.city] || "";
              const covered = hasCoverage(city);
              const deliveryPrice = getCityPrice(city);
              const phoneRaw = order[colKeys.phone] || "";
              const extractedPhone = extractPhoneNumber(phoneRaw);
              const salePrice = getDisplayAmount(order);
              const productCost = matched?.provider_price_gs || 0;
              const qty = parseQuantity(order[colKeys.qty]);
              const commission = salePrice - (productCost + (deliveryPrice || 0));
              const orderDate = getOrderDate(order);

              const canLoadAuto = currentStatus === "CARGAR" && matched && covered && salePrice > 0 && colKeys.product;
              const canLoadManual = currentStatus === "CARGAR" && matched && covered && salePrice > 0 && colKeys.product;
              const isLoaded = currentStatus === "CARGADO" || currentStatus === "CARGADO_MANUAL";

              return (
                <tr key={idx} className={getRowClassName(currentStatus)}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs whitespace-nowrap">{orderDate}</td>
                  <td className="text-xs font-medium">{order[colKeys.name] || "—"}</td>
                  <td className="text-xs font-mono">{extractedPhone || phoneRaw || "—"}</td>
                  <td className={`text-xs ${!covered && city ? "text-red-400 font-semibold" : ""}`}>
                    {city || "—"}
                    {!covered && city && <span className="text-[10px] ml-1">⚠️</span>}
                  </td>
                  <td className="text-xs">{order[colKeys.street] || "—"}</td>
                  <td className="text-right text-xs font-bold">
                    {deliveryPrice != null ? `${nf(deliveryPrice)} Gs` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-xs truncate max-w-[180px]" title={productName}>
                    {productName || "—"}
                    {matched && searchType === "product" && productSearch && (
                      <div className="text-[10px] text-green-400 mt-0.5">
                        ✅ Match: {matched.title}
                      </div>
                    )}
                  </td>
                  <td className="text-xs">{qty}</td>
                  <td className="text-right text-xs font-bold text-green-400">{salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}</td>
                  <td className="text-right text-xs text-orange-400">{productCost > 0 ? `${nf(productCost)} Gs` : "—"}</td>
                  <td className={`text-right text-xs font-bold ${commission >= 0 ? "text-blue-400" : "text-red-400"}`}>
                    {commission !== 0 ? `${commission > 0 ? "+" : ""}${nf(commission)} Gs` : "—"}
                  </td>
                  <td className="min-w-[130px]">
                    {!isLoaded ? (
                      <select
                        className="app-input !py-1 !px-2 !text-[11px] !w-full"
                        value={currentStatus}
                        onChange={(e) => setRowStatus(String(idx), e.target.value as OrderStatus)}
                      >
                        <option value="CARGAR">⏳ CARGAR</option>
                        <option value="A DROPEAR">⚠️ A DROPEAR</option>
                      </select>
                    ) : (
                      getStatusBadge(currentStatus)
                    )}
                  </td>
                  <td className="min-w-[200px] flex gap-1 flex-wrap">
                    {canLoadAuto && (
                      <button
                        className="nav-btn active !py-1 !px-2 !text-[11px] whitespace-nowrap"
                        onClick={() => handleDirectSave(order, idx)}
                        title="Cargar pedido automáticamente"
                      >
                        💰 Cargar (Auto)
                      </button>
                    )}
                    {canLoadManual && (
                      <button
                        className="nav-btn !py-1 !px-2 !text-[11px] whitespace-nowrap bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleManualSave(order, idx)}
                        title="Marcar como cargado manualmente (sin cargar a BD)"
                      >
                        ✍️ Marcar Manual
                      </button>
                    )}
                    {onSheetConfirm && !isLoaded && (
                      <button
                        className="nav-btn !py-1 !px-2 !text-[11px] whitespace-nowrap"
                        onClick={() => handleOpenForm(order, idx)}
                        title="Abrir formulario para editar y cargar"
                      >
                        📝 Formulario
                      </button>
                    )}
                    {!canLoadAuto && !canLoadManual && currentStatus === "CARGAR" && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        {!colKeys.product ? "❌ Sin columna PRODUCTO OK" : !matched ? "⚠️ Sin producto" : !covered ? "🚫 Sin cobertura" : !salePrice ? "💰 Sin monto" : ""}
                      </span>
                    )}
                    {isLoaded && (
                      <span className="text-[10px] text-green-400 self-center">
                        ✓ Pedido cargado
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={14} className="text-center text-muted-foreground py-8">
                  {sheetOrders.length === 0 
                    ? "📊 Leé tu Sheet primero" 
                    : searchType === "product" && productSearch
                      ? `🔍 No se encontraron productos con "${productSearch}"`
                      : searchType === "city" && cityFilter
                        ? `📍 No se encontraron pedidos en "${cityFilter}"`
                        : activeFilter === "CARGAR" 
                          ? "🎉 No hay pedidos pendientes" 
                          : activeFilter === "CARGADO" 
                            ? "📭 No hay pedidos cargados automáticamente"
                            : activeFilter === "CARGADO_MANUAL"
                              ? "📭 No hay pedidos cargados manualmente"
                              : activeFilter === "A DROPEAR"
                                ? "📭 No hay pedidos marcados para dropear"
                                : "🎉 No hay pedidos para mostrar"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
