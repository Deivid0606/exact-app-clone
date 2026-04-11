import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

type SheetOrder = Record<string, string>;

const ROW_STATUS_KEY = "shopify_row_statuses_v2";
const SHEET_CACHE_KEY = "shopify_sheet_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos de cache

function getRowId(order: SheetOrder, idx: number): string {
  const name = (order["nombre"] || order["customer name"] || order["cliente"] || "").trim();
  const phone = (order["numero"] || order["telefono"] || order["phone"] || order["tel"] || "").trim();
  const product = (order["producto"] || order["product"] || order["item"] || order["titulo"] || "").trim();
  return `${name}|${phone}|${product}|${idx}`;
}

function extractPhoneNumber(value: any): string {
  if (!value) return "";
  let phone = String(value).replace(/[\s\-().+]/g, "").trim();
  if (phone.startsWith("595")) phone = "0" + phone.slice(3);
  if (phone.length === 9 && phone.match(/^\d+$/)) phone = "0" + phone;
  return phone;
}

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

  const [products, setProducts] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);

  const [rowStatuses, setRowStatuses] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(ROW_STATUS_KEY) || "{}"); } catch { return {}; }
  });

  const [autoLoad, setAutoLoad] = useState(false);
  const autoLoadRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [filterOnlyAvailable, setFilterOnlyAvailable] = useState(false);
  const [filterOnlyCoverage, setFilterOnlyCoverage] = useState(false);
  const [filterOnlyCargar, setFilterOnlyCargar] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    localStorage.setItem(ROW_STATUS_KEY, JSON.stringify(rowStatuses));
  }, [rowStatuses]);

  useEffect(() => {
    const loadProducts = async () => {
      const { data } = await supabase.from("products").select("*");
      console.log("📦 Productos cargados:", data?.length || 0);
      setProducts(data || []);
    };
    const loadPrices = async () => {
      const { data } = await supabase.from("client_prices").select("*");
      console.log("🏙️ Precios por ciudad cargados:", data?.length || 0);
      setClientPrices(data || []);
    };
    loadProducts();
    loadPrices();
  }, []);

  // Column detection - VERSIÓN MEJORADA
  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    console.log("📋 Headers del Sheet:", h);
    
    const find = (...candidates: string[]) => {
      // Coincidencia exacta
      for (const candidate of candidates) {
        const exact = h.find(header => header.toLowerCase() === candidate.toLowerCase());
        if (exact) return exact;
      }
      // Coincidencia parcial
      for (const candidate of candidates) {
        const partial = h.find(header => 
          header.toLowerCase().includes(candidate.toLowerCase()) ||
          candidate.toLowerCase().includes(header.toLowerCase())
        );
        if (partial) return partial;
      }
      return "";
    };
    
    return {
      name: find("nombre", "customer name", "cliente", "name", "customer", "cliente nombre", "full name"),
      phone: find("numero", "telefono", "phone", "tel", "celular", "whatsapp", "movil", "contacto", "número", "teléfono"),
      street: find("calle", "direccion", "address", "street", "calle principal", "dirección"),
      street2: find("calle 2", "calle2", "direccion 2", "address2", "calle secundaria"),
      city: find("ciudad", "city", "localidad", "distrito", "ciudad de envío", "city name"),
      dept: find("departamento", "depto", "department", "state", "provincia"),
      product: find("producto", "product", "item", "titulo", "nombre del producto", "descripcion", "producto nombre", "título", "product name"),
      qty: find("cantidad", "qty", "quantity", "unidades", "cant", "cantidad de productos", "Qty"),
      amount: find("monto", "total", "importe", "amount", "precio", "valor", "precio total", "total gs", "Total"),
      email: find("email", "correo", "mail", "email cliente"),
      store: find("tienda", "store", "origen", "canal"),
      date: find("fecha", "date", "fecha de pedido", "fecha pedido", "fecha creación", "created at"),
    };
  }, [sheetHeaders]);

  // Match product - VERSIÓN MEJORADA
  const matchProduct = useCallback(
    (rawName: string) => {
      if (!rawName || rawName === "—" || rawName === "-") return null;
      
      const q = rawName.toLowerCase().trim();
      if (q.length === 0) return null;
      
      // 1. Búsqueda exacta
      let found = products.find((p) => p.title?.toLowerCase() === q);
      if (found) return found;
      
      // 2. Búsqueda por inclusión (texto contiene producto)
      found = products.find((p) => q.includes(p.title?.toLowerCase() || ""));
      if (found) return found;
      
      // 3. Búsqueda por inclusión (producto contiene texto)
      found = products.find((p) => p.title?.toLowerCase().includes(q));
      if (found) return found;
      
      // 4. Búsqueda por palabras clave
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
            toast.info(`📦 Usando cache local`);
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
        
        toast.success(`📊 ${json.total || 0} filas leídas del Sheet`);
      }
    } catch (err: any) {
      toast.error("Error leyendo Sheet: " + (err.message || err));
    }
    setLoading(false);
  };

  const setRowStatus = (key: string, status: string) => {
    setRowStatuses((prev) => ({ ...prev, [key]: status }));
  };

  const buildPayload = (order: SheetOrder, matched: any) => {
    const parseMoney = (v: string) => {
      if (!v) return 0;
      const cleaned = String(v).replace(/[^\d.,\-]/g, "");
      if (!cleaned) return 0;
      return Math.round(Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0);
    };

    const customer = (order[colKeys.name] || "").trim();
    const phone = extractPhoneNumber(order[colKeys.phone] || "");
    const city = (order[colKeys.city] || "").trim();
    const street = [(order[colKeys.street] || "").trim(), (order[colKeys.street2] || "").trim()].filter(Boolean).join(" ");
    const dept = (order[colKeys.dept] || "").trim();
    const qty = Number(order[colKeys.qty] || 1) || 1;
    const rawAmount = parseMoney(order[colKeys.amount] || "0");
    const amount = rawAmount || (matched?.provider_price_gs || 0);

    return {
      order_number: `SH${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5)}`,
      created_by: myEmail,
      customer_name: customer,
      phone,
      city,
      street,
      district: dept,
      items_json: [{ title: matched.title, qty, sale_gs: amount, sku: matched.sku || "" }],
      total_gs: amount * qty,
      status: "PENDIENTE",
      obs: "",
      provider_emails_list: matched.provider_email || "",
    };
  };

  const handleConfirm = async (order: SheetOrder, idx: number) => {
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    if (!matched) {
      toast.error(`Producto no detectado: "${productName}"`);
      return;
    }
    const payload = buildPayload(order, matched);
    const { error } = await supabase.from("orders").insert(payload);
    if (error) {
      toast.error("Error: " + error.message);
    } else {
      setRowStatus(String(idx), "CARGADO");
      toast.success("✅ Pedido cargado");
    }
  };

  const handleOpenForm = (order: SheetOrder) => {
    if (!onSheetConfirm) return;
    onSheetConfirm({
      customer: (order[colKeys.name] || "").trim(),
      phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: (order[colKeys.city] || "").trim(),
      street: [(order[colKeys.street] || "").trim(), (order[colKeys.street2] || "").trim()].filter(Boolean).join(" "),
      district: (order[colKeys.dept] || "").trim(),
      productTitle: (order[colKeys.product] || "").trim(),
      totalGs: (() => {
        const cleaned = String(order[colKeys.amount] || "").replace(/[^\d.,\-]/g, "");
        if (!cleaned) return 0;
        return Math.round(Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0);
      })(),
      qty: Number(order[colKeys.qty] || 1) || 1,
    });
  };

  const handleBulkLoad = async () => {
    let count = 0;
    let errors = 0;
    let skipped = 0;
    
    for (let i = 0; i < sheetOrders.length; i++) {
      const order = sheetOrders[i];
      const currentStatus = rowStatuses[String(i)] || "CARGAR";
      if (currentStatus !== "CARGAR") {
        skipped++;
        continue;
      }

      const productName = order[colKeys.product] || "";
      const matched = matchProduct(productName);
      if (!matched) {
        errors++;
        continue;
      }

      const payload = buildPayload(order, matched);
      const { error } = await supabase.from("orders").insert(payload);
      if (error) {
        errors++;
      } else {
        setRowStatus(String(i), "CARGADO");
        count++;
      }
      
      if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 100));
    }
    toast.success(`✅ ${count} cargados, ${errors} errores, ${skipped} omitidos`);
  };

  useEffect(() => {
    autoLoadRef.current = autoLoad;
    if (autoLoad) {
      const run = async () => {
        if (!autoLoadRef.current) return;
        await readSheet(false);
        if (!autoLoadRef.current) return;
        await handleBulkLoad();
      };
      run();
      intervalRef.current = setInterval(run, 60000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
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

  const statusOpts = ["CARGAR", "DROPEADO", "CANCELADO"];

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
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="btn-spinner" /> Leyendo...
              </span>
            ) : (
              "📊 Leer Sheet"
            )}
          </button>
          <button className="nav-btn active" onClick={handleBulkLoad} disabled={!sheetOrders.length}>
            🚀 Cargar todos (CARGAR)
          </button>
          <button
            className={`nav-btn ${autoLoad ? "!bg-yellow-600 !text-white" : ""}`}
            onClick={() => setAutoLoad(!autoLoad)}
          >
            {autoLoad ? "⚡ Auto-carga ON" : "⚡ Auto-carga OFF"}
          </button>
          {lastSync && (
            <span className="text-xs text-muted-foreground self-center">
              Última sync: {lastSync.toLocaleTimeString("es-PY")}
              {lastCacheHit && <span className="text-blue-400 ml-1">(cache)</span>}
            </span>
          )}
        </div>
        {autoLoad && (
          <div className="text-xs text-yellow-400 mt-1">
            🔄 Auto-carga activa — sincroniza y carga cada 60 segundos
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 mb-3">
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={filterOnlyAvailable}
            onChange={(e) => setFilterOnlyAvailable(e.target.checked)}
          />
          Solo con producto
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={filterOnlyCoverage}
            onChange={(e) => setFilterOnlyCoverage(e.target.checked)}
          />
          Solo con cobertura
        </label>
        <label className="flex items-center gap-1 text-xs">
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
        {Object.values(rowStatuses).filter(s => s === "CARGADO").length > 0 && 
          ` (${Object.values(rowStatuses).filter(s => s === "CARGADO").length} ya cargados)`
        }
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1100px]">
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Ciudad</th>
              <th className="text-right">Delivery</th>
              <th>Producto</th>
              <th>Cant</th>
              <th className="text-right">Monto</th>
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

              return (
                <tr key={idx}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs">{order[colKeys.name] || "—"}</td>
                  <td className="text-xs font-mono">{extractedPhone || phoneRaw || "—"}</td>
                  <td className="text-xs">{city || "—"}</td>
                  <td className="text-right text-xs font-bold">
                    {deliveryPrice != null ? `${nf(deliveryPrice)} Gs` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-xs truncate max-w-[180px]" title={productName}>
                    {productName || "—"}
                  </td>
                  <td className="text-xs">{order[colKeys.qty] || "1"}</td>
                  <td className="text-right text-xs font-bold">{order[colKeys.amount] || "—"}</td>
                  <td className="text-xs">
                    {matched ? (
                      <span className="text-green-400" title={`Producto: ${matched.title}`}>
                        ✅ {matched.title?.slice(0, 20)}
                      </span>
                    ) : (
                      <span className="text-red-400" title={`No se encontró: "${productName}" en el catálogo`}>
                        ❌ {productName?.slice(0, 15) || "—"}
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
                  <td>
                    <select
                      className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[120px]"
                      value={currentStatus}
                      onChange={(e) => setRowStatus(String(idx), e.target.value)}
                    >
                      {statusOpts.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="flex gap-1">
                    {currentStatus === "CARGAR" && matched && (
                      <button
                        className="nav-btn active !py-1 !px-2 !text-[11px]"
                        onClick={() => handleConfirm(order, idx)}
                      >
                        Cargar
                      </button>
                    )}
                    {onSheetConfirm && (
                      <button
                        className="nav-btn !py-1 !px-2 !text-[11px]"
                        onClick={() => handleOpenForm(order)}
                      >
                        📝 Formulario
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center text-muted-foreground py-8">
                  {sheetOrders.length === 0 ? "Leé tu Sheet primero" : "Sin resultados con los filtros actuales"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
