import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

type SheetOrder = Record<string, string>;

const ROW_STATUS_KEY = "shopify_row_statuses_v5";
const SHEET_CACHE_KEY = "shopify_sheet_cache";
const AUTO_LOAD_KEY = "shopify_auto_load_enabled";
const FILTER_AVAILABLE_KEY = "shopify_filter_available";
const FILTER_COVERAGE_KEY = "shopify_filter_coverage";
const FILTER_CARGAR_KEY = "shopify_filter_cargar";
const LAST_ORDER_KEY = "shopify_last_order_number";
const CACHE_DURATION = 5 * 60 * 1000;

function extractPhoneNumber(value: any): string {
  if (!value) return "";
  let phone = String(value).replace(/[\s\-().+]/g, "").trim();
  if (phone.startsWith("595")) phone = "0" + phone.slice(3);
  if (phone.length === 9 && phone.match(/^\d+$/)) phone = "0" + phone;
  return phone;
}

// Función para normalizar texto (sin acentos, minúsculas, sin caracteres especiales)
const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Elimina acentos
    .replace(/[^a-z0-9]/g, ""); // Elimina espacios, guiones, etc.
};

// Generar ID secuencial SHOPIFY001, SHOPIFY002, etc.
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
  const [lastCacheHit, setLastCacheHit] = useState<boolean>(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const [products, setProducts] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);

  const [rowStatuses, setRowStatuses] = useState<Record<string, string>>(() => {
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

  // Filtros PERSISTENTES
  const [filterOnlyAvailable, setFilterOnlyAvailable] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(FILTER_AVAILABLE_KEY);
      return saved === "true";
    } catch {
      return false;
    }
  });

  const [filterOnlyCoverage, setFilterOnlyCoverage] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(FILTER_COVERAGE_KEY);
      return saved === "true";
    } catch {
      return false;
    }
  });

  const [filterOnlyCargar, setFilterOnlyCargar] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(FILTER_CARGAR_KEY);
      return saved === "true";
    } catch {
      return false;
    }
  });

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
    localStorage.setItem(FILTER_AVAILABLE_KEY, filterOnlyAvailable.toString());
  }, [filterOnlyAvailable]);

  useEffect(() => {
    localStorage.setItem(FILTER_COVERAGE_KEY, filterOnlyCoverage.toString());
  }, [filterOnlyCoverage]);

  useEffect(() => {
    localStorage.setItem(FILTER_CARGAR_KEY, filterOnlyCargar.toString());
  }, [filterOnlyCargar]);

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
      readSheet(false);
      setInitialLoadDone(true);
    }
  }, [sheetUrl]);

  useEffect(() => {
    if (autoLoad && sheetUrl) {
      setTimeout(() => {
        runAutoCycle();
      }, 2000);
    }
  }, [autoLoad, sheetUrl]);

  // 🔥 FUNCIÓN MEJORADA - Detecta columnas SIN IMPORTAR EL ORDEN
  // Normaliza los nombres para comparar sin acentos, espacios, mayúsculas
  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    console.log("📋 Headers del Sheet:", h);
    
    // Función mejorada para buscar coincidencia NORMALIZADA
    const find = (...candidates: string[]) => {
      // Normalizar cada candidato
      const normalizedCandidates = candidates.map(c => normalizeText(c));
      
      // 1. Buscar coincidencia exacta normalizada
      for (let i = 0; i < h.length; i++) {
        const normalizedHeader = normalizeText(h[i]);
        for (const candidate of normalizedCandidates) {
          if (normalizedHeader === candidate) {
            console.log(`✅ Coincidencia exacta: "${h[i]}" para candidato "${candidates[normalizedCandidates.indexOf(candidate)]}"`);
            return h[i];
          }
        }
      }
      
      // 2. Buscar coincidencia parcial (un contiene al otro)
      for (let i = 0; i < h.length; i++) {
        const normalizedHeader = normalizeText(h[i]);
        for (const candidate of normalizedCandidates) {
          if (normalizedHeader.includes(candidate) || candidate.includes(normalizedHeader)) {
            console.log(`✅ Coincidencia parcial: "${h[i]}" para candidato "${candidates[normalizedCandidates.indexOf(candidate)]}"`);
            return h[i];
          }
        }
      }
      
      console.log(`❌ No se encontró columna para: ${candidates.join(", ")}`);
      return "";
    };
    
    const result = {
      name: find("nombre", "customer name", "cliente", "name", "customer", "cliente nombre", "full name", "cliente full name"),
      phone: find("numero", "telefono", "phone", "tel", "celular", "whatsapp", "movil", "contacto", "número", "teléfono", "cel", "whatsapp number"),
      street: find("calle", "direccion", "address", "street", "calle principal", "dirección", "direccion completa", "calle y numero"),
      street2: find("calle 2", "calle2", "direccion 2", "address2", "calle secundaria", "entre calles", "referencia"),
      city: find("ciudad", "city", "localidad", "distrito", "ciudad de envío", "city name", "ciudad destino", "localidad destino"),
      dept: find("departamento", "depto", "department", "state", "provincia", "region"),
      product: find("producto", "product", "item", "titulo", "nombre del producto", "descripcion", "producto nombre", "título", "product name", "item name", "producto adquirido"),
      qty: find("cantidad", "qty", "quantity", "unidades", "cant", "cantidad de productos", "Qty", "numero de unidades", "cantidad pedida"),
      amount: find("monto", "total", "importe", "amount", "precio", "valor", "precio total", "total gs", "Total", "monto total", "precio final"),
      email: find("email", "correo", "mail", "email cliente", "correo electronico"),
      store: find("tienda", "store", "origen", "canal", "plataforma"),
      date: find("fecha", "date", "fecha de pedido", "fecha pedido", "fecha creación", "created at", "fecha compra"),
    };
    
    console.log("🔍 Columnas detectadas:", result);
    return result;
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

  const getCityPrice = useCallback(
    (cityName: string) => {
      if (!cityName) return null;
      const q = cityName.toLowerCase().trim();
      const match = clientPrices.find((cp) => cp.city?.toLowerCase().trim() === q);
      return match ? match.price_gs : null;
    },
    [clientPrices],
  );

  const hasCoverage = useCallback(
    (cityName: string) => {
      if (!cityName) return false;
      const q = cityName.toLowerCase().trim();
      return clientPrices.some((cp) => cp.city?.toLowerCase().trim() === q);
    },
    [clientPrices],
  );

  const readSheet = async (forceRefresh = false) => {
    if (!sheetUrl) {
      toast.error("Configurá tu URL de Google Sheet en tu perfil");
      return;
    }
    
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(SHEET_CACHE_KEY);
        if (cached) {
          const { data, timestamp, url } = JSON.parse(cached);
          if (url === sheetUrl && (Date.now() - timestamp) < CACHE_DURATION) {
            setSheetHeaders(data.headers || []);
            setSheetOrders(data.orders || []);
            setLastSync(new Date(timestamp));
            setLastCacheHit(true);
            return;
          }
        }
      } catch (e) {}
    }
    
    setLoading(true);
    setLastCacheHit(false);
    try {
      const resp = await fetch(`/api/read-sheet?url=${encodeURIComponent(sheetUrl)}&t=${Date.now()}`);
      const json = await resp.json();

      if (json.error) {
        toast.error(json.error);
      } else {
        const sheetData = {
          headers: json.headers || [],
          orders: json.orders || []
        };
        setSheetHeaders(sheetData.headers);
        setSheetOrders(sheetData.orders);
        setLastSync(new Date());
        
        localStorage.setItem(SHEET_CACHE_KEY, JSON.stringify({
          data: sheetData,
          timestamp: Date.now(),
          url: sheetUrl
        }));
      }
    } catch (err: any) {
      toast.error("Error leyendo Sheet: " + (err.message || err));
    }
    setLoading(false);
  };

  const setRowStatus = (key: string, status: string) => {
    setRowStatuses((prev) => ({ ...prev, [key]: status }));
  };

  const parseMoney = (v: string) => {
    if (!v) return 0;
    const cleaned = String(v).replace(/[^\d.,\-]/g, "");
    if (!cleaned) return 0;
    return Math.round(Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0);
  };

  // CARGA DIRECTA - solo si producto detectado Y ciudad con cobertura
  const handleDirectSave = async (order: SheetOrder, idx: number) => {
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    if (!matched) {
      toast.error(`Producto no detectado: "${productName}"`);
      return;
    }
    
    const city = order[colKeys.city] || "";
    const deliveryPrice = getCityPrice(city);
    
    if (!deliveryPrice) {
      toast.warning(`⚠️ Ciudad "${city}" sin cobertura de delivery. No se puede cargar el pedido.`);
      return;
    }
    
    const salePrice = parseMoney(order[colKeys.amount] || "0");
    const productCost = matched?.provider_price_gs || 0;
    const qty = Number(order[colKeys.qty] || 1) || 1;
    const commission = salePrice - (productCost + deliveryPrice);
    const orderId = generateSequentialId();
    
    const payload = {
      order_number: orderId,
      created_by: myEmail,
      customer_name: (order[colKeys.name] || "").trim(),
      phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: city,
      street: [(order[colKeys.street] || "").trim(), (order[colKeys.street2] || "").trim()].filter(Boolean).join(" "),
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
  };

  const handleOpenForm = (order: SheetOrder, idx: number) => {
    if (!onSheetConfirm) return;
    
    onSheetConfirm({
      customer: (order[colKeys.name] || "").trim(),
      phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: (order[colKeys.city] || "").trim(),
      street: [(order[colKeys.street] || "").trim(), (order[colKeys.street2] || "").trim()].filter(Boolean).join(" "),
      district: (order[colKeys.dept] || "").trim(),
      productTitle: (order[colKeys.product] || "").trim(),
      totalGs: parseMoney(order[colKeys.amount] || "0"),
      qty: Number(order[colKeys.qty] || 1) || 1,
    });
  };

  const handleBulkLoad = async () => {
    let count = 0;
    let errors = 0;
    let skippedNoProduct = 0;
    let skippedNoCoverage = 0;
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
      
      const salePrice = parseMoney(order[colKeys.amount] || "0");
      const productCost = matched?.provider_price_gs || 0;
      const qty = Number(order[colKeys.qty] || 1) || 1;
      const commission = salePrice - (productCost + deliveryPrice);
      const orderId = generateSequentialId();
      
      const payload = {
        order_number: orderId,
        created_by: myEmail,
        customer_name: (order[colKeys.name] || "").trim(),
        phone: extractPhoneNumber(order[colKeys.phone] || ""),
        city: city,
        street: [(order[colKeys.street] || "").trim(), (order[colKeys.street2] || "").trim()].filter(Boolean).join(" "),
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
    
    toast.success(`✅ ${count} cargados | ❌ ${errors} errores | ⏭️ ${skippedNoProduct} sin producto | 🚫 ${skippedNoCoverage} sin cobertura | 💰 Comisión total: ${totalCommission.toLocaleString("es-PY")} Gs`);
  };

  const autoLoadOrders = async () => {
    if (isAutoLoadingRef.current) return;
    isAutoLoadingRef.current = true;
    
    let count = 0;
    let totalCommission = 0;
    
    for (let i = 0; i < sheetOrders.length; i++) {
      const currentStatus = rowStatuses[String(i)] || "CARGAR";
      if (currentStatus !== "CARGAR") continue;
      
      const order = sheetOrders[i];
      const productName = order[colKeys.product] || "";
      const matched = matchProduct(productName);
      if (!matched) continue;
      
      const city = order[colKeys.city] || "";
      const deliveryPrice = getCityPrice(city);
      if (!deliveryPrice) continue;
      
      const salePrice = parseMoney(order[colKeys.amount] || "0");
      const productCost = matched?.provider_price_gs || 0;
      const qty = Number(order[colKeys.qty] || 1) || 1;
      const commission = salePrice - (productCost + deliveryPrice);
      const orderId = generateSequentialId();
      
      const payload = {
        order_number: orderId,
        created_by: myEmail,
        customer_name: (order[colKeys.name] || "").trim(),
        phone: extractPhoneNumber(order[colKeys.phone] || ""),
        city: city,
        street: [(order[colKeys.street] || "").trim(), (order[colKeys.street2] || "").trim()].filter(Boolean).join(" "),
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
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    isAutoLoadingRef.current = false;
    if (count > 0) {
      toast.success(`🤖 Auto: ${count} cargados | 💰 Comisión: ${totalCommission.toLocaleString("es-PY")} Gs`);
    }
  };

  const runAutoCycle = async () => {
    if (!autoLoadRef.current) return;
    await readSheet(false);
    if (!autoLoadRef.current) return;
    await autoLoadOrders();
  };

  useEffect(() => {
    if (autoLoad) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(runAutoCycle, 60000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoLoad]);

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

  const toggleAutoLoad = () => {
    const newValue = !autoLoad;
    setAutoLoad(newValue);
    toast.info(newValue ? "🤖 Auto-carga activada" : "⏹️ Auto-carga desactivada");
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
          <button className="nav-btn active" onClick={() => readSheet(true)} disabled={loading}>
            {loading ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Leyendo...</span> : "📊 Leer Sheet"}
          </button>
          <button className="nav-btn active" onClick={handleBulkLoad} disabled={!sheetOrders.length}>
            🚀 Cargar todos
          </button>
          <button className={`nav-btn ${autoLoad ? "!bg-green-600 !text-white" : ""}`} onClick={toggleAutoLoad}>
            {autoLoad ? "🤖 Auto-carga ON 🔒" : "🤖 Auto-carga OFF"}
          </button>
          {lastSync && (
            <span className="text-xs text-muted-foreground self-center">
              Última sync: {lastSync.toLocaleTimeString("es-PY")}
              {lastCacheHit && <span className="text-blue-400 ml-1">(cache)</span>}
            </span>
          )}
        </div>
        {autoLoad && (
          <div className="text-xs text-green-400 mt-1">
            🤖 Auto-carga activa — Ciclo cada 60 segundos
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 mb-3">
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={filterOnlyAvailable}
            onChange={(e) => setFilterOnlyAvailable(e.target.checked)}
          />
          Solo con producto
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={filterOnlyCoverage}
            onChange={(e) => setFilterOnlyCoverage(e.target.checked)}
          />
          Solo con cobertura
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={filterOnlyCargar}
            onChange={(e) => setFilterOnlyCargar(e.target.checked)}
          />
          Solo estado CARGAR
        </label>
        <input
          className="app-input !w-auto min-w-[240px] flex-1"
          placeholder="🔎 Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {filteredOrders.length} pendientes de {sheetOrders.length} filas totales
        {loadedCount > 0 && ` (${loadedCount} ya cargados)`}
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1300px]">
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Ciudad</th>
              <th className="text-right">Delivery</th>
              <th>Producto</th>
              <th>Cant</th>
              <th className="text-right">Venta</th>
              <th className="text-right">Costo</th>
              <th className="text-right">Comisión</th>
              <th>Detectado</th>
              <th>Cobertura</th>
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
              const salePrice = parseMoney(order[colKeys.amount] || "0");
              const productCost = matched?.provider_price_gs || 0;
              const commission = salePrice - (productCost + (deliveryPrice || 0));

              const canLoad = currentStatus === "CARGAR" && matched && covered;

              return (
                <tr key={idx} className={currentStatus !== "CARGAR" ? "opacity-60 line-through" : ""}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs">{order[colKeys.name] || "—"}</td>
                  <td className="text-xs font-mono">{extractedPhone || phoneRaw || "—"}</td>
                  <td className="text-xs">{city || "—"}</td>
                  <td className="text-right text-xs font-bold">
                    {deliveryPrice != null ? `${nf(deliveryPrice)} Gs` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-xs truncate max-w-[180px]">{productName || "—"}</td>
                  <td className="text-xs">{order[colKeys.qty] || "1"}</td>
                  <td className="text-right text-xs font-bold text-green-400">{salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}</td>
                  <td className="text-right text-xs text-orange-400">{productCost > 0 ? `${nf(productCost)} Gs` : "—"}</td>
                  <td className={`text-right text-xs font-bold ${commission >= 0 ? "text-blue-400" : "text-red-400"}`}>
                    {commission !== 0 ? `${commission > 0 ? "+" : ""}${nf(commission)} Gs` : "—"}
                  </td>
                  <td className="text-xs">
                    {matched ? (
                      <span className="text-green-400" title={`Costo: ${nf(productCost)} Gs`}>
                        ✅ {matched.title?.slice(0, 15)}
                      </span>
                    ) : (
                      <span className="text-red-400" title={`No se encontró: "${productName}"`}>
                        ❌
                      </span>
                    )}
                  </td>
                  <td className="text-xs">
                    {covered ? (
                      <span className="text-green-400" title={`Delivery: ${deliveryPrice?.toLocaleString()} Gs`}>✅</span>
                    ) : (
                      <span className="text-yellow-400" title="Sin cobertura de delivery">⚠️</span>
                    )}
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
                        title="Cargar pedido (Producto detectado + Ciudad con cobertura)"
                      >
                        💰 Cargar
                      </button>
                    )}
                    {!canLoad && currentStatus === "CARGAR" && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        {!matched ? "⚠️ Sin producto" : !covered ? "🚫 Sin cobertura" : ""}
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
              <tr><td colSpan={14} className="text-center text-muted-foreground py-8">
                {sheetOrders.length === 0 ? "Leé tu Sheet primero" : "🎉 Todos los pedidos han sido cargados"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
