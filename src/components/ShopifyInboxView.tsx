import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

type SheetOrder = Record<string, string>;

const AUTO_LOAD_KEY = "shopify_auto_load_enabled";

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
  // Usar timestamp + random en lugar de secuencia guardada en localStorage
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `SHOPIFY${timestamp}${random}`;
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

  // Estado en memoria (sin localStorage)
  const [rowStatuses, setRowStatuses] = useState<Record<string, string>>({});

  const [autoLoad, setAutoLoad] = useState<boolean>(false);

  const filterOnlyAvailable = true;
  const filterOnlyCoverage = true;
  const filterOnlyCargar = true;
  const [search, setSearch] = useState("");

  const autoLoadRef = useRef(autoLoad);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoLoadingRef = useRef(false);

  // Guardar autoLoad en ref (sin localStorage)
  useEffect(() => {
    autoLoadRef.current = autoLoad;
  }, [autoLoad]);

  // Efecto para refrescar cuando la pestaña se activa
  useEffect(() => {
    if (!sheetUrl) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("👁️ Pestaña activada - Refrescando sheet...");
        readSheet();
      }
    };
    
    const handleWindowFocus = () => {
      console.log("🪟 Ventana enfocada - Refrescando sheet...");
      readSheet();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [sheetUrl, readSheet]);

  // Efecto para refresco automático cada 30 segundos
  useEffect(() => {
    if (!sheetUrl) return;
    
    const interval = setInterval(() => {
      console.log("⏰ Refresco automático cada 30 segundos");
      readSheet();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [sheetUrl, readSheet]);

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

  // FUNCIÓN MEJORADA: getCityPrice con reconocimiento por primeras letras
  const getCityPrice = useCallback(
    (cityName: string) => {
      if (!cityName) return null;
      const q = cityName.toLowerCase().trim();
      
      // 1. Búsqueda exacta
      let match = clientPrices.find((cp) => cp.city?.toLowerCase().trim() === q);
      if (match) return match.price_gs;
      
      // 2. Búsqueda por primeras 3-4 letras
      const prefixes = [4, 3];
      for (const len of prefixes) {
        if (q.length >= len) {
          const prefix = q.substring(0, len);
          match = clientPrices.find((cp) => {
            const cityClean = cp.city?.toLowerCase().trim();
            return cityClean?.startsWith(prefix);
          });
          if (match) return match.price_gs;
        }
      }
      
      // 3. Búsqueda por inclusión
      match = clientPrices.find((cp) => {
        const cityClean = cp.city?.toLowerCase().trim();
        return cityClean?.includes(q) || q.includes(cityClean);
      });
      
      return match ? match.price_gs : null;
    },
    [clientPrices],
  );

  // FUNCIÓN MEJORADA: hasCoverage con reconocimiento por primeras letras
  const hasCoverage = useCallback(
    (cityName: string) => {
      if (!cityName) return false;
      const q = cityName.toLowerCase().trim();
      
      // Búsqueda exacta
      if (clientPrices.some((cp) => cp.city?.toLowerCase().trim() === q)) return true;
      
      // Búsqueda por primeras 3-4 letras
      const prefixes = [4, 3];
      for (const len of prefixes) {
        if (q.length >= len) {
          const prefix = q.substring(0, len);
          if (clientPrices.some((cp) => cp.city?.toLowerCase().trim().startsWith(prefix))) {
            return true;
          }
        }
      }
      
      // Búsqueda por inclusión
      return clientPrices.some((cp) => {
        const cityClean = cp.city?.toLowerCase().trim();
        return cityClean?.includes(q) || q.includes(cityClean);
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
      const resp = await fetch(`/api/read-sheet?url=${encodeURIComponent(sheetUrl)}&t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
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

  const setRowStatus = useCallback((key: string, status: string) => {
    setRowStatuses((prev) => ({ ...prev, [key]: status }));
  }, []);

  const handleDirectSave = useCallback(async (order: SheetOrder, idx: number) => {
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    if (!matched) {
      toast.error(`Producto no detectado: "${productName}"`);
      return;
    }
    
    const city = order[colKeys.city] || "";
    const deliveryPrice = getCityPrice(city);
    
    if (!deliveryPrice) {
      toast.warning(`⚠️ Ciudad "${city}" sin cobertura de delivery.`);
      return;
    }
    
    const salePrice = getAmountFromRow(order, colKeys.amount);
    
    if (salePrice === 0) {
      toast.warning(`⚠️ No se pudo detectar el monto en la fila ${idx + 1}`);
      return;
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
      toast.error("Error: " + error.message);
    } else {
      setRowStatus(String(idx), "CARGADO");
      if (commission >= 0) {
        toast.success(`✅ Pedido ${orderId} cargado | 💰 Comisión: +${commission.toLocaleString("es-PY")} Gs`);
      } else {
        toast.warning(`⚠️ Pedido ${orderId} cargado | 💰 Comisión NEGATIVA: ${commission.toLocaleString("es-PY")} Gs`);
      }
    }
  }, [colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

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

  // Función para refrescar todo (resetear estados)
  const handleFullRefresh = useCallback(() => {
    setRowStatuses({}); // Resetear todos los estados
    readSheet(); // Refrescar sheet
    toast.info("🔄 Datos refrescados - Todos los pedidos están como CARGAR");
  }, [readSheet]);

  // Funciones de auto-carga
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

  const filteredOrders = useMemo(() => {
    return sheetOrders
      .map((o, i) => ({ order: o, idx: i }))
      .filter(({ order, idx }) => {
        const currentStatus = rowStatuses[String(idx)] || "CARGAR";
        if (currentStatus === "CARGADO") return false;
        if (filterOnlyCargar && currentStatus !== "CARGAR") return false;
        if (filterOnlyAvailable) {
          const productName = order[colKeys.product] || "";
          if (!matchProduct(productName)) return false;
        }
        if (filterOnlyCoverage) {
          const city = order[colKeys.city] || "";
          if (!hasCoverage(city)) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          const vals = Object.values(order).join(" ").toLowerCase();
          if (!vals.includes(q)) return false;
        }
        return true;
      });
  }, [sheetOrders, rowStatuses, filterOnlyAvailable, filterOnlyCoverage, filterOnlyCargar, search, colKeys, matchProduct, hasCoverage]);

  const statusOpts = ["CARGAR", "A DROPEAR", "CANCELADO"];
  const loadedCount = Object.values(rowStatuses).filter(s => s === "CARGADO").length;

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
          <button className="nav-btn active" onClick={handleFullRefresh}>
            🔄 Refrescar todo
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
        <div className="text-xs text-blue-400 mt-1">
          🔄 Refresco automático al volver a la pestaña | Auto-refresco cada 30 segundos
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-3">
        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">✓ Solo con producto</span>
        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">✓ Solo con cobertura</span>
        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">✓ Solo estado CARGAR</span>
        <input
          className="app-input !w-auto min-w-[240px] flex-1"
          placeholder="🔎 Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {filteredOrders.length} pendientes de {sheetOrders.length} filas totales
        {loadedCount > 0 && ` (${loadedCount} ya cargados en esta sesión)`}
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

              const canLoad = currentStatus === "CARGAR" && matched && covered && salePrice > 0;

              return (
                <tr key={idx} className={currentStatus !== "CARGAR" ? "opacity-60 line-through" : ""}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs">{order[colKeys.name] || "—"}</td>
                  <td className="text-xs font-mono">{extractedPhone || phoneRaw || "—"}</td>
                  <td className="text-xs">{city || "—"}</td>
                  <td className="text-xs">{order[colKeys.street] || "—"}</td>
                  <td className="text-right text-xs font-bold">
                    {deliveryPrice != null ? `${nf(deliveryPrice)} Gs` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-xs truncate max-w-[180px]">{productName || "—"}</td>
                  <td className="text-xs">{qty}</td>
                  <td className="text-right text-xs font-bold text-green-400">{salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}</td>
                  <td className="text-right text-xs text-orange-400">{productCost > 0 ? `${nf(productCost)} Gs` : "—"}</td>
                  <td className={`text-right text-xs font-bold ${commission >= 0 ? "text-blue-400" : "text-red-400"}`}>
                    {commission !== 0 ? `${commission > 0 ? "+" : ""}${nf(commission)} Gs` : "—"}
                  </td>
                  <td className="min-w-[130px]">
                    <select
                      className="app-input !py-1 !px-2 !text-[11px] !w-full"
                      value={currentStatus}
                      onChange={(e) => setRowStatus(String(idx), e.target.value)}
                    >
                      {statusOpts.map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                  </td>
                  <td className="min-w-[160px] flex gap-1">
                    {canLoad && (
                      <button
                        className="nav-btn active !py-1 !px-2 !text-[11px] whitespace-nowrap"
                        onClick={() => handleDirectSave(order, idx)}
                        title="Cargar pedido"
                      >
                        💰 Cargar
                      </button>
                    )}
                    {!canLoad && currentStatus === "CARGAR" && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        {!matched ? "⚠️ Sin producto" : !covered ? "🚫 Sin cobertura" : !salePrice ? "💰 Sin monto" : ""}
                      </span>
                    )}
                    {onSheetConfirm && (
                      <button
                        className="nav-btn !py-1 !px-2 !text-[11px] whitespace-nowrap"
                        onClick={() => handleOpenForm(order, idx)}
                        title="Abrir formulario para editar"
                      >
                        📝 Formulario
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr><td colSpan={13} className="text-center text-muted-foreground py-8">
                {sheetOrders.length === 0 ? "Leé tu Sheet primero" : "🎉 Todos los pedidos han sido cargados"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
