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

// Tabla de precios por ciudad
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

const getCityPriceFromMap = (cityName: string): number | null => {
  if (!cityName) return null;
  
  const normalized = normalizeCityName(cityName);
  
  if (CITY_PRICES[normalized]) {
    return CITY_PRICES[normalized];
  }
  
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

  // Estados para filtros
  const [searchType, setSearchType] = useState<"all" | "product" | "city">("product");
  const [productSearch, setProductSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [coverageFilter, setCoverageFilter] = useState<"all" | "covered" | "uncovered">("all");
  const [search, setSearch] = useState("");

  const autoLoadRef = useRef(autoLoad);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoLoadingRef = useRef(false);

  // ========== DETECCIÓN DE COLUMNAS (definido primero) ==========
  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    
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
      date: find("fecha", "date", "fecha pedido", "fecha de pedido"),
    };
  }, [sheetHeaders]);

  // ========== FUNCIONES ==========
  
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
      }
    } catch (err: any) {
      toast.error("Error leyendo Sheet: " + (err.message || err));
    }
    setLoading(false);
  }, [sheetUrl]);

  // Autocompletado de productos
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

  // Autocompletado de ciudades
  useEffect(() => {
    if (cityFilter.length > 1 && searchType === "city" && colKeys.city) {
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

  const normalizeForComparison = (text: string): string => {
    if (!text) return "";
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, ' ')
      .trim();
  };

  const matchProduct = useCallback(
    (rawName: string) => {
      if (!rawName || rawName === "—" || rawName === "-") return null;
      
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
            if (cleanProductName === word) score += 100;
            else if (cleanProductName.includes(word)) score += word.length;
            else if (word.includes(cleanProductName)) score += cleanProductName.length;
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

  const getCityPrice = useCallback((cityName: string) => {
    return getCityPriceFromMap(cityName);
  }, []);

  const hasCoverage = useCallback((cityName: string) => {
    return getCityPriceFromMap(cityName) !== null;
  }, []);

  const isCityCovered = useCallback((cityName: string): boolean => {
    return getCityPriceFromMap(cityName) !== null;
  }, []);

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
        toast.success(`✅ Pedido ${orderId} cargado | 💰 Comisión: +${commission.toLocaleString("es-PY")} Gs`);
      } else {
        toast.warning(`⚠️ Pedido ${orderId} cargado | 💰 Comisión NEGATIVA: ${commission.toLocaleString("es-PY")} Gs`);
      }
      return true;
    }
  }, [colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

  const handleDirectSave = useCallback(async (order: SheetOrder, idx: number) => {
    await loadOrder(order, idx, "auto");
  }, [loadOrder]);

  const handleManualSave = useCallback(async (order: SheetOrder, idx: number) => {
    await setRowStatus(String(idx), "CARGADO_MANUAL");
    toast.info(`✍️ Pedido marcado como "Cargado Manual"`);
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

  const handleBulkLoad = useCallback(async () => {
    if (!colKeys.product) {
      toast.error(`❌ No se encontró la columna "PRODUCTO OK"`);
      return;
    }
    
    let count = 0;
    let errors = 0;
    let totalCommission = 0;
    
    for (let i = 0; i < sheetOrders.length; i++) {
      const currentStatus = rowStatuses[String(i)] || "CARGAR";
      if (currentStatus !== "CARGAR") continue;
      
      const order = sheetOrders[i];
      const productName = order[colKeys.product] || "";
      if (!productName) continue;
      
      const matched = matchProduct(productName);
      if (!matched) continue;
      
      const city = order[colKeys.city] || "";
      const deliveryPrice = getCityPrice(city);
      if (!deliveryPrice) continue;
      
      const salePrice = getAmountFromRow(order, colKeys.amount);
      if (salePrice === 0) continue;
      
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
    
    toast.success(`✅ ${count} cargados | ❌ ${errors} errores | 💰 Comisión total: ${totalCommission.toLocaleString("es-PY")} Gs`);
  }, [sheetOrders, rowStatuses, colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

  const toggleAutoLoad = () => {
    const newValue = !autoLoad;
    setAutoLoad(newValue);
    toast.info(newValue ? "🤖 Auto-carga activada" : "⏹️ Auto-carga desactivada");
  };

  const getDisplayAmount = (order: SheetOrder) => {
    return getAmountFromRow(order, colKeys.amount);
  };

  const getOrderDate = (order: SheetOrder): string => {
    const dateValue = order[colKeys.date];
    if (!dateValue) return "—";
    
    try {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("es-PY");
      }
      return String(dateValue).split(' ')[0];
    } catch {
      return String(dateValue);
    }
  };

  // Dashboard stats
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
    };
  }, [sheetOrders, rowStatuses, colKeys, hasCoverage]);

  const filterByProduct = useCallback((order: SheetOrder, searchTerm: string) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase().trim();
    const productOkValue = order[colKeys.product] || "";
    if (productOkValue.toLowerCase().includes(searchLower)) return true;
    return false;
  }, [colKeys.product]);

  const filterByCity = useCallback((order: SheetOrder, citySearch: string) => {
    if (!citySearch.trim()) return true;
    const orderCity = order[colKeys.city] || "";
    return orderCity.toLowerCase().includes(citySearch.toLowerCase().trim());
  }, [colKeys.city]);

  // Filtrado de órdenes
  const filteredOrders = useMemo(() => {
    return sheetOrders
      .map((o, i) => ({ order: o, idx: i }))
      .filter(({ order, idx }) => {
        const currentStatus = rowStatuses[String(idx)] || "CARGAR";
        
        if (activeFilter === "CARGAR" && currentStatus !== "CARGAR") return false;
        if (activeFilter === "CARGADO" && currentStatus !== "CARGADO") return false;
        if (activeFilter === "CARGADO_MANUAL" && currentStatus !== "CARGADO_MANUAL") return false;
        if (activeFilter === "A DROPEAR" && currentStatus !== "A DROPEAR") return false;
        
        if (coverageFilter !== "all") {
          const city = order[colKeys.city] || "";
          const covered = isCityCovered(city);
          if (coverageFilter === "covered" && !covered) return false;
          if (coverageFilter === "uncovered" && covered) return false;
        }
        
        if (searchType === "product" && productSearch) {
          return filterByProduct(order, productSearch);
        }
        
        if (searchType === "city" && cityFilter) {
          return filterByCity(order, cityFilter);
        }
        
        if (searchType === "all" && search) {
          const q = search.toLowerCase();
          const vals = Object.values(order).join(" ").toLowerCase();
          if (!vals.includes(q)) return false;
        }
        
        return true;
      });
  }, [sheetOrders, rowStatuses, activeFilter, search, productSearch, cityFilter, searchType, coverageFilter, colKeys, filterByProduct, filterByCity, isCityCovered]);

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
          <span>Cargando estados...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">📦 Shopify Inbox — Lectura de Sheet</h3>

      {/* Dashboard KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <div className="app-card !p-3 text-center bg-blue-500/10">
          <div className="text-2xl font-bold text-blue-400">{dashboardStats.totalPedidos}</div>
          <div className="text-xs text-muted-foreground">Total pedidos</div>
        </div>
        <div className="app-card !p-3 text-center bg-green-500/10">
          <div className="text-xl font-bold text-green-400">{dashboardStats.pedidosPendientes}</div>
          <div className="text-xs text-muted-foreground">Pendientes</div>
        </div>
        <div className="app-card !p-3 text-center bg-yellow-500/10">
          <div className="text-lg font-bold text-yellow-400">{nf(dashboardStats.totalVentas)} Gs</div>
          <div className="text-xs text-muted-foreground">Total ventas</div>
        </div>
        <div className="app-card !p-3 text-center bg-purple-500/10">
          <div className="text-lg font-bold text-purple-400">{nf(dashboardStats.promedioVenta)} Gs</div>
          <div className="text-xs text-muted-foreground">Promedio pedido</div>
        </div>
        <div className="app-card !p-3 text-center bg-emerald-500/10">
          <div className="text-2xl font-bold text-emerald-400">{dashboardStats.ciudadesCubiertas}</div>
          <div className="text-xs text-muted-foreground">Con cobertura</div>
        </div>
        <div className="app-card !p-3 text-center bg-red-500/10">
          <div className="text-2xl font-bold text-red-400">{dashboardStats.ciudadesSinCobertura}</div>
          <div className="text-xs text-muted-foreground">Sin cobertura</div>
        </div>
      </div>

      {/* Controles principales */}
      <div className="app-card !p-4 mb-4">
        <div className="flex flex-wrap gap-2 mb-2">
          <button className="nav-btn active" onClick={() => readSheet()} disabled={loading}>
            {loading ? "Leyendo..." : "📊 Leer Sheet"}
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
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="text-xs text-muted-foreground self-center">📍 Cobertura:</span>
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
            <input className="app-input w-full" placeholder={`Buscar en ${colKeys.product || "PRODUCTO OK"}...`} value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
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
        <table className="app-table min-w-[1400px]">
          <thead>
            <tr>
              <th>#</th><th>Fecha</th><th>Cliente</th><th>Teléfono</th><th>Ciudad</th><th>Calle</th><th className="text-right">Delivery</th><th>Producto</th><th>Cant</th><th className="text-right">Venta</th><th className="text-right">Costo</th><th className="text-right">Comisión</th><th>Estado</th><th>Acción</th>
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
              const salePrice = getDisplayAmount(order);
              const productCost = matched?.provider_price_gs || 0;
              const qty = parseQuantity(order[colKeys.qty]);
              const commission = salePrice - (productCost + (deliveryPrice || 0));
              const orderDate = getOrderDate(order);
              const canLoadAuto = currentStatus === "CARGAR" && matched && covered && salePrice > 0;

              return (
                <tr key={idx} className={getRowClassName(currentStatus)}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs">{orderDate}</td>
                  <td className="text-xs">{order[colKeys.name] || "—"}</td>
                  <td className="text-xs">{order[colKeys.phone] || "—"}</td>
                  <td className={`text-xs ${!covered && city ? "text-red-400 font-semibold" : ""}`}>{city || "—"}</td>
                  <td className="text-xs">{order[colKeys.street] || "—"}</td>
                  <td className="text-right text-xs">{deliveryPrice ? `${nf(deliveryPrice)} Gs` : "—"}</td>
                  <td className="text-xs truncate max-w-[180px]">{productName || "—"}</td>
                  <td className="text-xs">{qty}</td>
                  <td className="text-right text-xs text-green-400">{salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}</td>
                  <td className="text-right text-xs text-orange-400">{productCost > 0 ? `${nf(productCost)} Gs` : "—"}</td>
                  <td className={`text-right text-xs font-bold ${commission >= 0 ? "text-blue-400" : "text-red-400"}`}>{commission !== 0 ? `${commission > 0 ? "+" : ""}${nf(commission)} Gs` : "—"}</td>
                  <td>{!canLoadAuto ? getStatusBadge(currentStatus) : <select className="app-input !py-1 !px-2 !text-[11px]" value={currentStatus} onChange={(e) => setRowStatus(String(idx), e.target.value as OrderStatus)}><option value="CARGAR">⏳ CARGAR</option><option value="A DROPEAR">⚠️ A DROPEAR</option></select>}</td>
                  <td className="flex gap-1">
                    {canLoadAuto && <button className="nav-btn active !py-1 !px-2 !text-[11px]" onClick={() => handleDirectSave(order, idx)}>💰 Cargar</button>}
                    {onSheetConfirm && !canLoadAuto && currentStatus === "CARGAR" && <button className="nav-btn !py-1 !px-2 !text-[11px]" onClick={() => handleOpenForm(order, idx)}>📝 Formulario</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
