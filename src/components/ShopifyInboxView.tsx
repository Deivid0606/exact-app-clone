import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

type SheetOrder = Record<string, string>;

const ROW_STATUS_KEY = "shopify_row_statuses";
const LOADED_IDS_KEY = "shopify_loaded_ids";

function getRowId(order: SheetOrder, idx: number): string {
  const name = (order["nombre"] || order["customer name"] || order["cliente"] || "").trim();
  const phone = (order["numero"] || order["telefono"] || order["phone"] || order["tel"] || "").trim();
  const product = (order["producto"] || order["product"] || order["item"] || order["titulo"] || "").trim();
  return `${name}|${phone}|${product}|${idx}`;
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

  // ─── Products & prices for auto-detect ───
  const [products, setProducts] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);

  // ─── Per-row statuses (localStorage) ───
  const [rowStatuses, setRowStatuses] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(ROW_STATUS_KEY) || "{}"); } catch { return {}; }
  });
  const [loadedRowIds, setLoadedRowIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LOADED_IDS_KEY) || "[]")); } catch { return new Set(); }
  });

  // ─── Auto-load ───
  const [autoLoad, setAutoLoad] = useState(false);
  const autoLoadRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Filters ───
  const [filterOnlyAvailable, setFilterOnlyAvailable] = useState(false);
  const [filterOnlyCoverage, setFilterOnlyCoverage] = useState(false);
  const [search, setSearch] = useState("");

  // Persist statuses
  useEffect(() => {
    localStorage.setItem(ROW_STATUS_KEY, JSON.stringify(rowStatuses));
  }, [rowStatuses]);
  useEffect(() => {
    localStorage.setItem(LOADED_IDS_KEY, JSON.stringify([...loadedRowIds]));
  }, [loadedRowIds]);

  // Load products & prices
  useEffect(() => {
    supabase.from("products").select("*").then(({ data }) => setProducts(data || []));
    supabase.from("client_prices").select("*").then(({ data }) => setClientPrices(data || []));
  }, []);

  // ─── Column detection ───
  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    const find = (...candidates: string[]) =>
      candidates.find((c) => h.includes(c)) || "";
    return {
      name: find("nombre", "customer name", "cliente"),
      phone: find("numero", "telefono", "phone", "tel"),
      street: find("calle", "direccion", "address", "street"),
      street2: find("calle 2", "calle2", "direccion 2", "address2"),
      city: find("ciudad", "city"),
      dept: find("departamento", "depto", "department", "state"),
      product: find("producto", "product", "item", "titulo"),
      qty: find("cantidad", "qty", "quantity"),
      amount: find("monto", "total", "importe", "amount", "precio"),
      email: find("email", "correo"),
      store: find("tienda", "store"),
      date: find("fecha", "date"),
    };
  }, [sheetHeaders]);

  // ─── Match product ───
  const matchProduct = useCallback(
    (rawName: string) => {
      if (!rawName) return null;
      const q = rawName.toLowerCase().trim();
      return (
        products.find((p) => p.title?.toLowerCase() === q) ||
        products.find((p) => p.title?.toLowerCase().includes(q) || q.includes(p.title?.toLowerCase() || "___")) ||
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

  // ─── Read sheet ───
  const readSheet = async () => {
    if (!sheetUrl) {
      toast.error("Configurá tu URL de Google Sheet en tu perfil");
      return;
    }
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/read-sheet?url=${encodeURIComponent(sheetUrl)}`,
        { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } },
      );
      const json = await resp.json();

      if (json.error) {
        toast.error(json.error);
      } else {
        setSheetHeaders(json.headers || []);
        setSheetOrders(json.orders || []);
        setLastSync(new Date());
        toast.success(`📊 ${json.total || 0} filas leídas del Sheet`);
      }
    } catch (err: any) {
      toast.error("Error leyendo Sheet: " + (err.message || err));
    }
    setLoading(false);
  };

  // ─── Set row status ───
  const setRowStatus = (key: string, status: string) => {
    setRowStatuses((prev) => ({ ...prev, [key]: status }));
  };

  // ─── Build order payload ───
  const buildPayload = (order: SheetOrder, matched: any) => {
    const normalizePhone = (p: string) => {
      let phone = String(p || "").replace(/[\s\-().+]/g, "").trim();
      if (phone.startsWith("595")) phone = "0" + phone.slice(3);
      return phone;
    };
    const parseMoney = (v: string) => {
      const cleaned = String(v || "").replace(/[^\d.,\-]/g, "");
      if (!cleaned) return 0;
      return Math.round(Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0);
    };

    const customer = (order[colKeys.name] || "").trim();
    const phone = normalizePhone(order[colKeys.phone] || "");
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
      const rowId = getRowId(order, idx);
      setLoadedRowIds((prev) => new Set(prev).add(rowId));
      setRowStatus(String(idx), "CARGADO");
      toast.success("✅ Pedido cargado");
    }
  };

  // ─── Bulk load all CARGAR rows ───
  const handleBulkLoad = async () => {
    let count = 0;
    let errors = 0;
    for (let i = 0; i < sheetOrders.length; i++) {
      const order = sheetOrders[i];
      const rowId = getRowId(order, i);
      const currentStatus = loadedRowIds.has(rowId) ? "CARGADO" : (rowStatuses[String(i)] || "CARGAR");
      if (currentStatus !== "CARGAR") continue;

      const productName = order[colKeys.product] || "";
      const matched = matchProduct(productName);
      if (!matched) continue;

      const payload = buildPayload(order, matched);
      const { error } = await supabase.from("orders").insert(payload);
      if (error) {
        errors++;
      } else {
        setLoadedRowIds((prev) => new Set(prev).add(rowId));
        setRowStatus(String(i), "CARGADO");
        count++;
      }
    }
    toast.success(`✅ ${count} cargados, ${errors} errores`);
  };

  // ─── Auto-load logic ───
  useEffect(() => {
    autoLoadRef.current = autoLoad;
    if (autoLoad) {
      const run = async () => {
        if (!autoLoadRef.current) return;
        await readSheet();
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
        const rowId = getRowId(order, idx);
        const status = loadedRowIds.has(rowId) ? "CARGADO" : (rowStatuses[String(idx)] || "CARGAR");

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
  }, [sheetOrders, rowStatuses, loadedRowIds, filterOnlyAvailable, filterOnlyCoverage, search, colKeys, matchProduct, hasCoverage]);

  const statusOpts = ["CARGAR", "PENDIENTE", "A DROPEAR"];

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
          <button className="nav-btn active" onClick={readSheet} disabled={loading}>
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
      <div className="flex flex-wrap gap-2 mb-3">
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
        <input
          className="app-input !w-auto min-w-[240px] flex-1"
          placeholder="🔎 Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {filteredOrders.length} de {sheetOrders.length} filas
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
              const rowId = getRowId(order, idx);
              const isLoaded = loadedRowIds.has(rowId);
              const currentStatus = isLoaded ? "CARGADO" : (rowStatuses[String(idx)] || "CARGAR");

              const productName = order[colKeys.product] || "";
              const matched = matchProduct(productName);
              const city = order[colKeys.city] || "";
              const covered = hasCoverage(city);

              return (
                <tr key={idx} className={isLoaded ? "opacity-50" : ""}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs">{order[colKeys.name] || "—"}</td>
                  <td className="text-xs">{order[colKeys.phone] || "—"}</td>
                  <td className="text-xs">{city || "—"}</td>
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
                    {isLoaded ? (
                      <span className="text-xs text-green-400 font-bold">✅ Cargado</span>
                    ) : (
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
                    )}
                  </td>
                  <td>
                    {!isLoaded && currentStatus === "CARGAR" && matched && (
                      <button
                        className="nav-btn active !py-1 !px-2 !text-[11px]"
                        onClick={() => handleConfirm(order, idx)}
                      >
                        Cargar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center text-muted-foreground py-8">
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
