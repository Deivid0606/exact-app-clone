import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

type SheetOrder = Record<string, string>;

const ROW_STATUS_KEY = "shopify_row_statuses_v6";
const AUTO_LOAD_KEY = "shopify_auto_load_enabled";
const LAST_ORDER_KEY = "shopify_last_order_number";
const ACTIVE_FILTER_KEY = "shopify_active_filter";

type OrderStatus = "CARGAR" | "A DROPEAR" | "CARGADO" | "CARGADO_MANUAL";
type FilterType = "TODOS" | "CARGAR" | "CARGADO" | "CARGADO_MANUAL" | "A DROPEAR";

// ========== FUNCIONES CORREGIDAS ==========

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

// NUEVA: Normalización flexible de ciudades
const normalizeCityName = (city: string): string => {
  if (!city) return "";
  
  // Eliminar todo lo que esté después de un guión (ej: "Ciudad del este - ALTO PARANÁ" → "Ciudad del este")
  let normalized = city.split("-")[0].trim();
  
  // Normalizar texto completo
  normalized = normalized
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  
  return normalized;
};

// Lista de ciudades normalizadas para comparación rápida
const getNormalizedCityList = (cities: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const city of cities) {
    const normalized = normalizeCityName(city);
    map.set(normalized, city);
  }
  return map;
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

const generateSequentialId = (): string => {
  let lastNumber = parseInt(localStorage.getItem(LAST_ORDER_KEY) || '0', 10);
  const newNumber = lastNumber + 1;
  localStorage.setItem(LAST_ORDER_KEY, newNumber.toString());
  const paddedNumber = newNumber.toString().padStart(3, '0');
  return `SHOPIFY${paddedNumber}`;
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

  const [products, setProducts] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);

  const [rowStatuses, setRowStatuses] = useState<Record<string, OrderStatus>>(() => {
    try { 
      const saved = localStorage.getItem(ROW_STATUS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { 
      return {}; 
    }
  });

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

  const filterOnlyAvailable = true;
  const filterOnlyCoverage = true;
  const [search, setSearch] = useState("");

  const autoLoadRef = useRef(autoLoad);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoLoadingRef = useRef(false);

  // Guardar estados en localStorage
  useEffect(() => {
    localStorage.setItem(ROW_STATUS_KEY, JSON.stringify(rowStatuses));
  }, [rowStatuses]);

  useEffect(() => {
    localStorage.setItem(AUTO_LOAD_KEY, autoLoad.toString());
    autoLoadRef.current = autoLoad;
  }, [autoLoad]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_FILTER_KEY, activeFilter);
  }, [activeFilter]);

  // Cargar productos y precios
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
    if (sheetUrl && !initialLoadDone) {
      readSheet();
      setInitialLoadDone(true);
    }
  }, [sheetUrl]);

  // Detección de columnas
  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    console.log("📋 Headers del Sheet:", h);
    
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
    
    return {
      name: find("nombre", "cliente", "customer", "name", "NOMBRE"),
      phone: find("telefono", "phone", "tel", "celular", "whatsapp", "Teléfono"),
      street: find("calle", "direccion", "address", "street", "CALLE"),
      street2: find("calle 2", "calle2", "direccion 2", "address2"),
      city: find("ciudad", "city", "localidad", "distrito", "CIUDAD"),
      dept: find("departamento", "depto", "department", "state"),
      product: find("producto", "product", "item", "titulo", "PRODUCTO"),
      qty: find("cantidad", "qty", "quantity", "unidades", "CANTIDAD"),
      amount: findAmount(),
      email: find("email", "correo", "mail"),
      date: find("fecha", "date"),
    };
  }, [sheetHeaders]);

  // Match de producto (sin cambios)
  const matchProduct = useCallback(
    (rawName: string) => {
      if (!rawName || rawName === "—" || rawName === "-") return null;
      
      const q = rawName.toLowerCase().trim();
      if (q.length === 0) return null;
      
      let found = products.find((p) => p.title?.toLowerCase() === q);
      if (found) return found;
      
      found = products.find((p) => q.includes(p.title?.toLowerCase() || ""));
      if (found) return found;
      
      found = products.find((p) => p.title?.toLowerCase().includes(q));
      if (found) return found;
      
      const keywords = q.split(/\s+/).filter(k => k.length > 3);
      for (const keyword of keywords) {
        found = products.find((p) => p.title?.toLowerCase().includes(keyword));
        if (found) return found;
      }
      
      return null;
    },
    [products],
  );

  // NUEVA: Función mejorada para obtener precio de ciudad con normalización
  const getCityPrice = useCallback(
    (cityName: string) => {
      if (!cityName) return null;
      
      const normalizedInput = normalizeCityName(cityName);
      
      // Buscar coincidencia exacta normalizada
      const match = clientPrices.find((cp) => {
        const normalizedCity = normalizeCityName(cp.city || "");
        return normalizedCity === normalizedInput;
      });
      
      return match ? match.price_gs : null;
    },
    [clientPrices],
  );

  // NUEVA: Función mejorada para verificar cobertura con normalización
  const hasCoverage = useCallback(
    (cityName: string) => {
      if (!cityName) return false;
      
      const normalizedInput = normalizeCityName(cityName);
      
      return clientPrices.some((cp) => {
        const normalizedCity = normalizeCityName(cp.city || "");
        return normalizedCity === normalizedInput;
      });
    },
    [clientPrices],
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

  const setRowStatus = useCallback((key: string, status: OrderStatus) => {
    setRowStatuses((prev) => ({ ...prev, [key]: status }));
  }, []);

  // Función para cargar pedido (automático o manual)
  const loadOrder = useCallback(async (
    order: SheetOrder, 
    idx: number, 
    source: "auto" | "manual" = "auto"
  ) => {
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    if (!matched) {
      toast.error(`Producto no detectado: "${productName}"`);
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
    const orderId = generateSequentialId();
    
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
      obs: `💰 Comisión: ${commission.toLocaleString("es-PY")} Gs | Venta: ${salePrice.toLocaleString("es-PY")} Gs | Costo: ${productCost.toLocaleString("es-PY")} Gs | Delivery: ${deliveryPrice.toLocaleString("es-PY")} Gs | Producto: ${matched.title} | Origen: ${source === "auto" ? "Automático" : "Manual"}`,
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
      setRowStatus(String(idx), newStatus);
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
    await loadOrder(order, idx, "manual");
  }, [loadOrder]);

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
      const orderId = generateSequentialId();
      
      const payload = {
        order_number: orderId,
        created_by: myEmail,
        customer_name: (order[colKeys.name] || "").trim(),
        phone: extractPhoneNumber(order[colKeys.phone] || ""),
        city: city,
        street: (order[colKeys.street] || "").trim(),
        district: (order[colKeys.dept] || "").trim(),
        email: order[colKeys.email] || "",
        obs: `💰 Comisión: ${commission.toLocaleString("es-PY")} Gs | Venta: ${salePrice.toLocaleString("es-PY")} Gs | Costo: ${productCost.toLocaleString("es-PY")} Gs | Delivery: ${deliveryPrice.toLocaleString("es-PY")} Gs | Producto: ${matched.title}`,
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
        setRowStatus(String(i), "CARGADO");
        count++;
        totalCommission += commission;
      }
      
      if (count % 3 === 0) await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    toast.success(`✅ ${count} cargados | ❌ ${errors} errores | ⏭️ ${skippedNoProduct} sin producto | 🚫 ${skippedNoCoverage} sin cobertura | 💰 ${skippedNoAmount} sin monto | 💰 Comisión total: ${totalCommission.toLocaleString("es-PY")} Gs`);
  }, [sheetOrders, rowStatuses, colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

  // Función de auto-carga
  const autoLoadOrders = useCallback(async () => {
    if (isAutoLoadingRef.current) {
      console.log("⏸️ Auto-carga ya en ejecución, omitiendo...");
      return;
    }
    
    isAutoLoadingRef.current = true;
    
    let count = 0;
    let totalCommission = 0;
    
    try {
      const pendingIndices = sheetOrders
        .map((_, i) => i)
        .filter(i => {
          const currentStatus = rowStatuses[String(i)] || "CARGAR";
          return currentStatus === "CARGAR";
        });
      
      console.log(`🤖 Auto-carga: ${pendingIndices.length} pedidos pendientes`);
      
      for (const i of pendingIndices) {
        const currentStatus = rowStatuses[String(i)] || "CARGAR";
        if (currentStatus !== "CARGAR") continue;
        
        const order = sheetOrders[i];
        const productName = order[colKeys.product] || "";
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
        const orderId = generateSequentialId();
        
        const payload = {
          order_number: orderId,
          created_by: myEmail,
          customer_name: (order[colKeys.name] || "").trim(),
          phone: extractPhoneNumber(order[colKeys.phone] || ""),
          city: city,
          street: (order[colKeys.street] || "").trim(),
          district: (order[colKeys.dept] || "").trim(),
          email: order[colKeys.email] || "",
          obs: `💰 Comisión: ${commission.toLocaleString("es-PY")} Gs | Venta: ${salePrice.toLocaleString("es-PY")} Gs | Costo: ${productCost.toLocaleString("es-PY")} Gs | Delivery: ${deliveryPrice.toLocaleString("es-PY")} Gs | Producto: ${matched.title} | Origen: Automático`,
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
        if (!error) {
          setRowStatus(String(i), "CARGADO");
          count++;
          totalCommission += commission;
          console.log(`✅ Auto-cargado: ${orderId} (fila ${i + 1})`);
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.error(`❌ Error fila ${i + 1}:`, error);
        }
      }
    } catch (err) {
      console.error("Error en autoLoadOrders:", err);
    } finally {
      isAutoLoadingRef.current = false;
    }
    
    if (count > 0) {
      toast.success(`🤖 Auto: ${count} cargados | 💰 Comisión: ${totalCommission.toLocaleString("es-PY")} Gs`);
    }
  }, [sheetOrders, rowStatuses, colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

  const runAutoCycle = useCallback(async () => {
    if (!autoLoadRef.current) {
      console.log("⏹️ Auto-carga desactivada");
      return;
    }
    
    console.log("🔄 Ciclo de auto-carga iniciado...");
    await readSheet();
    
    if (!autoLoadRef.current) return;
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await autoLoadOrders();
    console.log("✅ Ciclo completado");
  }, [readSheet, autoLoadOrders]);

  // Efecto para la auto-carga con intervalo
  useEffect(() => {
    if (autoLoad && sheetUrl) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      
      setTimeout(() => {
        runAutoCycle();
      }, 2000);
      
      intervalRef.current = setInterval(() => {
        runAutoCycle();
      }, 60000);
      
      console.log("🤖 Auto-carga activada - Ciclo cada 60 segundos");
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoLoad, sheetUrl, runAutoCycle]);

  const toggleAutoLoad = () => {
    const newValue = !autoLoad;
    setAutoLoad(newValue);
    toast.info(newValue ? "🤖 Auto-carga activada" : "⏹️ Auto-carga desactivada");
  };

  const getDisplayAmount = (order: SheetOrder) => {
    return getAmountFromRow(order, colKeys.amount);
  };

  // NUEVA: Filtrado de órdenes basado en el filtro activo
  const filteredOrders = useMemo(() => {
    return sheetOrders
      .map((o, i) => ({ order: o, idx: i }))
      .filter(({ order, idx }) => {
        const currentStatus = rowStatuses[String(idx)] || "CARGAR";
        
        // Aplicar filtro por estado
        if (activeFilter === "CARGAR" && currentStatus !== "CARGAR") return false;
        if (activeFilter === "CARGADO" && currentStatus !== "CARGADO") return false;
        if (activeFilter === "CARGADO_MANUAL" && currentStatus !== "CARGADO_MANUAL") return false;
        if (activeFilter === "A DROPEAR" && currentStatus !== "A DROPEAR") return false;
        
        // Filtros de disponibilidad y cobertura (solo para pendientes y no cargados)
        if (filterOnlyAvailable && currentStatus === "CARGAR") {
          const productName = order[colKeys.product] || "";
          if (!matchProduct(productName)) return false;
        }
        if (filterOnlyCoverage && currentStatus === "CARGAR") {
          const city = order[colKeys.city] || "";
          if (!hasCoverage(city)) return false;
        }
        
        // Búsqueda
        if (search) {
          const q = search.toLowerCase();
          const vals = Object.values(order).join(" ").toLowerCase();
          if (!vals.includes(q)) return false;
        }
        return true;
      });
  }, [sheetOrders, rowStatuses, activeFilter, search, colKeys, matchProduct, hasCoverage, filterOnlyAvailable, filterOnlyCoverage]);

  // Contadores para cada filtro
  const counts = useMemo(() => {
    const cargar = Object.values(rowStatuses).filter(s => s === "CARGAR").length;
    const cargado = Object.values(rowStatuses).filter(s => s === "CARGADO").length;
    const cargadoManual = Object.values(rowStatuses).filter(s => s === "CARGADO_MANUAL").length;
    const aDropear = Object.values(rowStatuses).filter(s => s === "A DROPEAR").length;
    const total = sheetOrders.length;
    
    return { cargar, cargado, cargadoManual, aDropear, total };
  }, [rowStatuses, sheetOrders.length]);

  // NUEVA: Función para cambiar filtro
  const changeFilter = (filter: FilterType) => {
    setActiveFilter(filter);
  };

  // NUEVA: Determinar clase CSS según estado
  const getRowClassName = (status: OrderStatus): string => {
    if (status === "CARGADO" || status === "CARGADO_MANUAL") {
      return "bg-green-500/10 hover:bg-green-500/20 transition-colors";
    }
    if (status === "A DROPEAR") {
      return "bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors";
    }
    return "hover:bg-muted/50 transition-colors";
  };

  // NUEVA: Mostrar badge de estado
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

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">📦 Shopify Inbox — Lectura de Sheet</h3>

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
      </div>

      {/* NUEVO: Filtros principales */}
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

      {/* Barra de búsqueda */}
      <div className="mb-3">
        <input
          className="app-input w-full"
          placeholder="🔎 Buscar en todos los campos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        Mostrando {filteredOrders.length} de {sheetOrders.length} filas totales
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1300px]">
          <thead>
            <tr>
              <th>#</th>
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

              const canLoadAuto = currentStatus === "CARGAR" && matched && covered && salePrice > 0;
              const canLoadManual = currentStatus === "CARGAR" && matched && covered && salePrice > 0;
              const isLoaded = currentStatus === "CARGADO" || currentStatus === "CARGADO_MANUAL";

              return (
                <tr key={idx} className={getRowClassName(currentStatus)}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs font-medium">{order[colKeys.name] || "—"}</td>
                  <td className="text-xs font-mono">{extractedPhone || phoneRaw || "—"}</td>
                  <td className="text-xs">{city || "—"}</td>
                  <td className="text-xs">{order[colKeys.street] || "—"}</td>
                  <td className="text-right text-xs font-bold">
                    {deliveryPrice != null ? `${nf(deliveryPrice)} Gs` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-xs truncate max-w-[180px]" title={productName}>
                    {productName || "—"}
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
                        title="Cargar pedido manualmente"
                      >
                        ✍️ Cargar (Manual)
                      </button>
                    )}
                    {!canLoadAuto && !canLoadManual && currentStatus === "CARGAR" && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        {!matched ? "⚠️ Sin producto" : !covered ? "🚫 Sin cobertura" : !salePrice ? "💰 Sin monto" : ""}
                      </span>
                    )}
                    {onSheetConfirm && !isLoaded && (
                      <button
                        className="nav-btn !py-1 !px-2 !text-[11px] whitespace-nowrap"
                        onClick={() => handleOpenForm(order, idx)}
                        title="Abrir formulario para editar"
                      >
                        📝 Formulario
                      </button>
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
                <td colSpan={13} className="text-center text-muted-foreground py-8">
                  {sheetOrders.length === 0 
                    ? "📊 Leé tu Sheet primero" 
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
