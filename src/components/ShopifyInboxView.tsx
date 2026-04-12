import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

type SheetOrder = Record<string, string>;

const ROW_STATUS_KEY = "shopify_row_statuses_v5";
const SHEET_CACHE_KEY = "shopify_sheet_cache";
const AUTO_LOAD_KEY = "shopify_auto_load_enabled";
const LAST_ORDER_KEY = "shopify_last_order_number";

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

// Función para limpiar cantidad (toma solo el primer número válido)
function parseQuantity(value: any): number {
  if (!value) return 1;
  const str = String(value).trim();
  const firstLine = str.split('\n')[0].trim();
  const numMatch = firstLine.match(/\d+/);
  if (!numMatch) return 1;
  const num = parseInt(numMatch[0], 10);
  return isNaN(num) ? 1 : num;
}

// Función para limpiar monto
function parseMoney(v: string): number {
  if (!v) return 0;
  let cleanValue = String(v).split('\n')[0].trim();
  let cleaned = cleanValue.replace(/[^\d.,\-]/g, "");
  if (!cleaned) return 0;
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(cleaned) || 0);
}

// Generar ID secuencial SHOPIFY001, SHOPIFY002, etc.
const generateSequentialId = (): string => {
  let lastNumber = parseInt(localStorage.getItem(LAST_ORDER_KEY) || '0', 10);
  const newNumber = lastNumber + 1;
  localStorage.setItem(LAST_ORDER_KEY, newNumber.toString());
  const paddedNumber = newNumber.toString().padStart(3, '0');
  return `SHOPIFY${paddedNumber}`;
};

// 🔥 NUEVA FUNCIÓN: Detecta el tipo de columna para CADA FILA
const detectColumnType = (headers: string[], sampleValue: string): string => {
  const normalizedValue = normalizeText(sampleValue);
  
  // Patrones para cada tipo de dato
  const patterns = {
    name: ["nombre", "cliente", "customer", "name", "fullname"],
    phone: ["telefono", "phone", "tel", "celular", "whatsapp", "movil"],
    city: ["ciudad", "city", "localidad", "distrito"],
    street: ["calle", "direccion", "address", "street"],
    product: ["producto", "product", "item", "titulo"],
    qty: ["cantidad", "qty", "quantity", "unidades"],
    amount: ["monto", "total", "importe", "precio", "amount"],
    email: ["email", "correo", "mail"],
    date: ["fecha", "date"]
  };
  
  for (const [type, keywords] of Object.entries(patterns)) {
    for (const keyword of keywords) {
      if (normalizedValue.includes(keyword)) {
        return type;
      }
    }
  }
  
  return "unknown";
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

  const filterOnlyAvailable = true;
  const filterOnlyCoverage = true;
  const filterOnlyCargar = true;
  const [search, setSearch] = useState("");

  const autoLoadRef = useRef(autoLoad);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoLoadingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(ROW_STATUS_KEY, JSON.stringify(rowStatuses));
  }, [rowStatuses]);

  useEffect(() => {
    localStorage.setItem(AUTO_LOAD_KEY, autoLoad.toString());
    autoLoadRef.current = autoLoad;
  }, [autoLoad]);

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

  useEffect(() => {
    if (autoLoad && sheetUrl) {
      setTimeout(() => {
        runAutoCycle();
      }, 2000);
    }
  }, [autoLoad, sheetUrl]);

  // 🔥 NUEVA FUNCIÓN: Extrae datos de UNA FILA específica sin depender de columnas fijas
  const extractRowData = useCallback((row: SheetOrder, headers: string[]) => {
    const result: Record<string, any> = {};
    
    // Para cada celda en la fila, intentar determinar qué contiene
    for (const header of headers) {
      const value = row[header];
      if (!value || value === "" || value === "—" || value === "-") continue;
      
      const normalizedHeader = normalizeText(header);
      const stringValue = String(value);
      const normalizedValue = normalizeText(stringValue);
      
      // Detectar por el header primero
      if (normalizedHeader.includes("nombre") || normalizedHeader.includes("cliente") || normalizedHeader.includes("customer")) {
        result.customer_name = stringValue.trim();
      }
      else if (normalizedHeader.includes("telefono") || normalizedHeader.includes("phone") || normalizedHeader.includes("cel")) {
        result.phone = extractPhoneNumber(stringValue);
      }
      else if (normalizedHeader.includes("ciudad") || normalizedHeader.includes("city") || normalizedHeader.includes("localidad")) {
        result.city = stringValue.trim();
      }
      else if (normalizedHeader.includes("calle") || normalizedHeader.includes("direccion") || normalizedHeader.includes("address")) {
        result.street = stringValue.trim();
      }
      else if (normalizedHeader.includes("producto") || normalizedHeader.includes("product") || normalizedHeader.includes("item")) {
        result.product = stringValue.trim();
      }
      else if (normalizedHeader.includes("cantidad") || normalizedHeader.includes("qty") || normalizedHeader.includes("quantity")) {
        result.qty = parseQuantity(stringValue);
      }
      else if (normalizedHeader.includes("monto") || normalizedHeader.includes("total") || normalizedHeader.includes("importe") || 
               normalizedHeader.includes("precio") || normalizedHeader.includes("amount")) {
        result.amount = parseMoney(stringValue);
      }
      else if (normalizedHeader.includes("email") || normalizedHeader.includes("correo")) {
        result.email = stringValue.trim();
      }
      else if (normalizedHeader.includes("fecha") || normalizedHeader.includes("date")) {
        result.date = stringValue;
      }
      else {
        // Si no coincide con ningún header, intentar detectar por el contenido
        if (!result.customer_name && stringValue.length > 3 && stringValue.length < 100 && !stringValue.includes("@") && !/\d/.test(stringValue)) {
          result.customer_name = stringValue.trim();
        }
        else if (!result.phone && (stringValue.match(/\d/g) || []).length >= 8) {
          result.phone = extractPhoneNumber(stringValue);
        }
        else if (!result.city && stringValue.length > 3 && stringValue.length < 50 && !/\d/.test(stringValue)) {
          result.city = stringValue.trim();
        }
        else if (!result.product && stringValue.length > 5 && stringValue.length < 200) {
          result.product = stringValue.trim();
        }
        else if (!result.amount && stringValue.match(/\d/g) && (stringValue.match(/\d/g) || []).length >= 4) {
          result.amount = parseMoney(stringValue);
        }
      }
    }
    
    return result;
  }, []);

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

  const readSheet = async () => {
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
  };

  const setRowStatus = (key: string, status: string) => {
    setRowStatuses((prev) => ({ ...prev, [key]: status }));
  };

  // CARGA DIRECTA - Usa la nueva función extractRowData
  const handleDirectSave = async (order: SheetOrder, idx: number) => {
    const rowData = extractRowData(order, sheetHeaders);
    
    if (!rowData.product) {
      toast.error(`No se pudo detectar el producto en la fila ${idx + 1}`);
      return;
    }
    
    const matched = matchProduct(rowData.product);
    if (!matched) {
      toast.error(`Producto no detectado: "${rowData.product}"`);
      return;
    }
    
    if (!rowData.city) {
      toast.warning(`⚠️ No se pudo detectar la ciudad en la fila ${idx + 1}`);
      return;
    }
    
    const deliveryPrice = getCityPrice(rowData.city);
    if (!deliveryPrice) {
      toast.warning(`⚠️ Ciudad "${rowData.city}" sin cobertura de delivery. No se puede cargar el pedido.`);
      return;
    }
    
    const salePrice = rowData.amount || 0;
    const productCost = matched?.provider_price_gs || 0;
    const qty = rowData.qty || 1;
    const commission = salePrice - (productCost + deliveryPrice);
    const orderId = generateSequentialId();
    
    const payload = {
      order_number: orderId,
      created_by: myEmail,
      customer_name: rowData.customer_name || "",
      phone: rowData.phone || "",
      city: rowData.city,
      street: rowData.street || "",
      district: "",
      email: rowData.email || "",
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
    const rowData = extractRowData(order, sheetHeaders);
    
    onSheetConfirm({
      customer: rowData.customer_name || "",
      phone: rowData.phone || "",
      city: rowData.city || "",
      street: rowData.street || "",
      district: "",
      productTitle: rowData.product || "",
      totalGs: rowData.amount || 0,
      qty: rowData.qty || 1,
    });
  };

  const handleBulkLoad = async () => {
    let count = 0;
    let errors = 0;
    let skippedNoProduct = 0;
    let skippedNoCoverage = 0;
    let skippedNoData = 0;
    let totalCommission = 0;
    
    for (let i = 0; i < sheetOrders.length; i++) {
      const currentStatus = rowStatuses[String(i)] || "CARGAR";
      if (currentStatus !== "CARGAR") continue;
      
      const rowData = extractRowData(sheetOrders[i], sheetHeaders);
      
      if (!rowData.product) {
        skippedNoData++;
        continue;
      }
      
      const matched = matchProduct(rowData.product);
      if (!matched) {
        skippedNoProduct++;
        continue;
      }
      
      if (!rowData.city) {
        skippedNoData++;
        continue;
      }
      
      const deliveryPrice = getCityPrice(rowData.city);
      if (!deliveryPrice) {
        skippedNoCoverage++;
        continue;
      }
      
      const salePrice = rowData.amount || 0;
      const productCost = matched?.provider_price_gs || 0;
      const qty = rowData.qty || 1;
      const commission = salePrice - (productCost + deliveryPrice);
      const orderId = generateSequentialId();
      
      const payload = {
        order_number: orderId,
        created_by: myEmail,
        customer_name: rowData.customer_name || "",
        phone: rowData.phone || "",
        city: rowData.city,
        street: rowData.street || "",
        district: "",
        email: rowData.email || "",
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
    
    toast.success(`✅ ${count} cargados | ❌ ${errors} errores | ⏭️ ${skippedNoProduct} sin producto | 🚫 ${skippedNoCoverage} sin cobertura | ⚠️ ${skippedNoData} sin datos | 💰 Comisión total: ${totalCommission.toLocaleString("es-PY")} Gs`);
  };

  const autoLoadOrders = async () => {
    if (isAutoLoadingRef.current) return;
    isAutoLoadingRef.current = true;
    
    let count = 0;
    let totalCommission = 0;
    
    for (let i = 0; i < sheetOrders.length; i++) {
      const currentStatus = rowStatuses[String(i)] || "CARGAR";
      if (currentStatus !== "CARGAR") continue;
      
      const rowData = extractRowData(sheetOrders[i], sheetHeaders);
      
      if (!rowData.product) continue;
      const matched = matchProduct(rowData.product);
      if (!matched) continue;
      
      if (!rowData.city) continue;
      const deliveryPrice = getCityPrice(rowData.city);
      if (!deliveryPrice) continue;
      
      const salePrice = rowData.amount || 0;
      const productCost = matched?.provider_price_gs || 0;
      const qty = rowData.qty || 1;
      const commission = salePrice - (productCost + deliveryPrice);
      const orderId = generateSequentialId();
      
      const payload = {
        order_number: orderId,
        created_by: myEmail,
        customer_name: rowData.customer_name || "",
        phone: rowData.phone || "",
        city: rowData.city,
        street: rowData.street || "",
        district: "",
        email: rowData.email || "",
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
    await readSheet();
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

  // Filtrar órdenes usando extractRowData
  const filteredOrders = useMemo(() => {
    return sheetOrders
      .map((o, i) => ({ order: o, idx: i, data: extractRowData(o, sheetHeaders) }))
      .filter(({ data, idx }) => {
        const currentStatus = rowStatuses[String(idx)] || "CARGAR";
        if (currentStatus === "CARGADO") return false;
        if (filterOnlyCargar && currentStatus !== "CARGAR") return false;
        if (filterOnlyAvailable) {
          if (!data.product) return false;
          if (!matchProduct(data.product)) return false;
        }
        if (filterOnlyCoverage) {
          if (!data.city) return false;
          if (!hasCoverage(data.city)) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          const vals = Object.values(data).join(" ").toLowerCase();
          if (!vals.includes(q)) return false;
        }
        return true;
      });
  }, [sheetOrders, rowStatuses, filterOnlyAvailable, filterOnlyCoverage, filterOnlyCargar, search, sheetHeaders, extractRowData, matchProduct, hasCoverage]);

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
          <button className="nav-btn active" onClick={() => readSheet()} disabled={loading}>
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
            {filteredOrders.map(({ order, idx, data }) => {
              const currentStatus = rowStatuses[String(idx)] || "CARGAR";
              const matched = matchProduct(data.product || "");
              const covered = data.city ? hasCoverage(data.city) : false;
              const deliveryPrice = data.city ? getCityPrice(data.city) : null;
              const salePrice = data.amount || 0;
              const productCost = matched?.provider_price_gs || 0;
              const commission = salePrice - (productCost + (deliveryPrice || 0));
              const canLoad = currentStatus === "CARGAR" && matched && covered;

              return (
                <tr key={idx} className={currentStatus !== "CARGAR" ? "opacity-60 line-through" : ""}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs">{data.customer_name || "—"}</td>
                  <td className="text-xs font-mono">{data.phone || "—"}</td>
                  <td className="text-xs">{data.city || "—"}</td>
                  <td className="text-xs">{data.street || "—"}</td>
                  <td className="text-right text-xs font-bold">
                    {deliveryPrice != null ? `${nf(deliveryPrice)} Gs` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-xs truncate max-w-[180px]">{data.product || "—"}</td>
                  <td className="text-xs">{data.qty || 1}</td>
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
                        {!data.product ? "⚠️ Sin producto" : !matched ? "❌ Producto no existe" : !data.city ? "⚠️ Sin ciudad" : !covered ? "🚫 Sin cobertura" : ""}
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
