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

// Mejor detección de teléfono
function extractPhoneNumber(value: any): string {
  if (!value) return "";
  let phone = String(value).replace(/[\s\-().+]/g, "").trim();
  // Si empieza con 595, convertir a 0
  if (phone.startsWith("595")) phone = "0" + phone.slice(3);
  // Si tiene 9 dígitos (sin 0), agregar 0
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

  // ─── Sheet data ───
  const [sheetOrders, setSheetOrders] = useState<SheetOrder[]>([]);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [lastCacheHit, setLastCacheHit] = useState<boolean>(false);

  // ─── Products & prices for auto-detect ───
  const [products, setProducts] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);

  // ─── Per-row statuses (localStorage) ───
  const [rowStatuses, setRowStatuses] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(ROW_STATUS_KEY) || "{}"); } catch { return {}; }
  });

  // ─── Auto-load ───
  const [autoLoad, setAutoLoad] = useState(false);
  const autoLoadRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Filters ───
  const [filterOnlyAvailable, setFilterOnlyAvailable] = useState(false);
  const [filterOnlyCoverage, setFilterOnlyCoverage] = useState(false);
  const [filterOnlyCargar, setFilterOnlyCargar] = useState(false);
  const [search, setSearch] = useState("");

  // Persist statuses
  useEffect(() => {
    localStorage.setItem(ROW_STATUS_KEY, JSON.stringify(rowStatuses));
  }, [rowStatuses]);

  // Load products & prices
  useEffect(() => {
    supabase.from("products").select("*").then(({ data }) => setProducts(data || []));
    supabase.from("client_prices").select("*").then(({ data }) => setClientPrices(data || []));
  }, []);

  // ─── Column detection mejorada ───
  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    const find = (...candidates: string[]) => {
      // Buscar coincidencia exacta o parcial (insensible a mayúsculas)
      const lowerCandidates = candidates.map(c => c.toLowerCase());
      const found = h.find(header => 
        lowerCandidates.some(candidate => 
          header.toLowerCase().includes(candidate) || candidate.includes(header.toLowerCase())
        )
      );
      return found || "";
    };
    
    return {
      name: find("nombre", "customer name", "cliente", "name", "customer"),
      phone: find("numero", "telefono", "phone", "tel", "celular", "whatsapp", "movil"),
      street: find("calle", "direccion", "address", "street", "calle principal"),
      street2: find("calle 2", "calle2", "direccion 2", "address2", "calle secundaria"),
      city: find("ciudad", "city", "localidad", "distrito"),
      dept: find("departamento", "depto", "department", "state", "provincia"),
      product: find("producto", "product", "item", "titulo", "nombre del producto", "descripcion"),
      qty: find("cantidad", "qty", "quantity", "unidades", "cant"),
      amount: find("monto", "total", "importe", "amount", "precio", "valor", "precio total"),
      email: find("email", "correo", "mail"),
      store: find("tienda", "store", "origen"),
      date: find("fecha", "date", "fecha de pedido", "fecha pedido"),
    };
  }, [sheetHeaders]);

  // ─── Match product ───
  const matchProduct = useCallback(
    (rawName: string) => {
      if (!rawName) return null;
      const q = rawName.toLowerCase().trim();
      return (
        products.find((p) => p.title?.toLowerCase() === q) ||
        products.find((p) => p.title?.toLowerCase().includes(q)) ||
        products.find((p) => q.includes(p.title?.toLowerCase() || "")) ||
        null
      );
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

  // ─── Match city coverage ───
  const hasCoverage = useCallback(
    (cityName: string) => {
      if (!cityName) return false;
      const q = cityName.toLowerCase().trim();
      return clientPrices.some((cp) => cp.city?.toLowerCase().trim() === q);
    },
    [clientPrices],
  );

  // ─── Read sheet with cache ───
  const readSheet = async (forceRefresh = false) => {
    if (!sheetUrl) {
      toast.error("Configurá tu URL de Google Sheet en tu perfil");
      return;
    }
    
    // Check cache primero
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
            toast.info(`📦 Usando cache local (${Math.round((Date.now() - timestamp) / 1000)}s)`);
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
        
        // Guardar en cache
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

  // ─── Set row status (solo 3 estados: CARGAR, DROPEADO, CANCELADO) ───
  const setRowStatus = (key: string, status: string) => {
    setRowStatuses((prev) => ({ ...prev, [key]: status }));
  };

  // ─── Build order payload ───
  const buildPayload = (order: SheetOrder, matched: any) => {
    const parseMoney = (v: string) => {
      const cleaned = String(v || "").replace(/[^\d.,\-]/g, "");
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

  // ─── Confirm single order ───
  const handleConfirm = async (order: SheetOrder, idx: number) => {
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    if (!matched) {
      toast.error("Producto no detectado en catálogo");
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

  // ─── Open pre-filled form ───
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

  // ─── Bulk load all CARGAR rows ───
  const handleBulkLoad = async () => {
    let count = 0;
    let errors = 0;
    for (let i = 0; i < sheetOrders.length; i++) {
      const order = sheetOrders[i];
      const currentStatus = rowStatuses[String(i)] || "CARGAR";
      if (currentStatus !== "CARGAR") continue;

      const productName = order[colKeys.product] || "";
      const matched = matchProduct(productName);
      if (!matched) continue;

      const payload = buildPayload(order, matched);
      const { error } = await supabase.from("orders").insert(payload);
      if (error) {
        errors++;
      } else {
        setRowStatus(String(i), "CARGADO");
        count++;
      }
      
      // Pequeña pausa para no saturar
      if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 100));
    }
    toast.success(`✅ ${count} cargados, ${errors} errores`);
  };

  // ─── Auto-load logic con cache ───
  useEffect(() => {
    autoLoadRef.current = autoLoad;
    if (autoLoad) {
      const run = async () => {
        if (!autoLoadRef.current) return;
        // Usar cache primero, refresh cada 3 ciclos
        const shouldRefresh = Math.random() < 0.33;
        await readSheet(shouldRefresh);
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

  // ─── Filtered rows ───
  const filteredOrders = useMemo(() => {
    return sheetOrders
      .map((o, i) => ({ order: o, idx: i }))
      .filter(({ order, idx }) => {
        const currentStatus = rowStatuses[String(idx)] || "CARGAR";
        
        // Skip si ya está cargado
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

      {/* Sheet URL & controls */}
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

      {/* Filters */}
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

      {/* Table */}
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
                  <td className="text-xs font-mono">
                    {extractedPhone || phoneRaw || "—"}
                  </td>
                  <td className="text-xs">{city || "—"}</td>
                  <td className="text-right text-xs font-bold">
                    {deliveryPrice != null ? `${nf(deliveryPrice)} Gs` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-xs truncate max-w-[180px]">{productName || "—"}</td>
                  <td className="text-xs">{order[colKeys.qty] || "1"}</td>
                  <td className="text-right text-xs font-bold">{order[colKeys.amount] || "—"}</td>
                  <td className="text-xs">
                    {matched ? (
                      <span className="text-green-400">✅ {matched.title?.slice(0, 20)}</span>
                    ) : (
                      <span className="text-red-400">❌</span>
                    )}
                  </td>
                  <td className="text-xs">
                    {covered ? (
                      <span className="text-green-400">✅</span>
                    ) : (
                      <span className="text-yellow-400">⚠️</span>
                    )}
                  </td>
                  <td>
                    <select
                      className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[120px]"
                      value={currentStatus}
                      onChange={(e) => setRowStatus(String(idx), e.target.value)}
                    >
                      {statusOpts.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
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
