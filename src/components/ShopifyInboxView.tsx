import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

type SheetOrder = Record<string, string>;

const ROW_STATUS_KEY = "shopify_row_statuses_v5";
const SHEET_CACHE_KEY = "shopify_sheet_cache";
const AUTO_LOAD_KEY = "shopify_auto_load_enabled";
const CACHE_DURATION = 5 * 60 * 1000;

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

  // Persistencia de auto-carga
  const [autoLoad, setAutoLoad] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AUTO_LOAD_KEY);
      return saved === "true";
    } catch {
      return false;
    }
  });

  const autoLoadRef = useRef(autoLoad);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoLoadingRef = useRef(false);

  const [filterOnlyAvailable, setFilterOnlyAvailable] = useState(false);
  const [filterOnlyCoverage, setFilterOnlyCoverage] = useState(false);
  const [filterOnlyCargar, setFilterOnlyCargar] = useState(false);
  const [search, setSearch] = useState("");

  // Guardar estados en localStorage
  useEffect(() => {
    localStorage.setItem(ROW_STATUS_KEY, JSON.stringify(rowStatuses));
  }, [rowStatuses]);

  // Guardar estado de auto-carga
  useEffect(() => {
    localStorage.setItem(AUTO_LOAD_KEY, autoLoad.toString());
    autoLoadRef.current = autoLoad;
  }, [autoLoad]);

  // Cargar productos y precios
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

  // Carga automática al montar
  useEffect(() => {
    if (sheetUrl && !initialLoadDone) {
      console.log("🚀 Cargando Sheet automáticamente...");
      readSheet(false);
      setInitialLoadDone(true);
    }
  }, [sheetUrl]);

  // Reactivar auto-carga si estaba activo
  useEffect(() => {
    if (autoLoad && sheetUrl) {
      console.log("🤖 Auto-carga reactivado después de recargar página");
      setTimeout(() => {
        runAutoCycle();
      }, 2000);
    }
  }, [autoLoad, sheetUrl]);

  const colKeys = useMemo(() => {
    const h = sheetHeaders;
    
    const find = (...candidates: string[]) => {
      for (const candidate of candidates) {
        const exact = h.find(header => header.toLowerCase() === candidate.toLowerCase());
        if (exact) return exact;
      }
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
            console.log("📦 Usando cache local");
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
        
        console.log(`📊 ${json.total || 0} filas leídas del Sheet`);
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

  // Función para cargar un pedido individual
  const loadSingleOrder = async (order: SheetOrder, idx: number): Promise<{ success: boolean; commission: number }> => {
    const productName = order[colKeys.product] || "";
    const matched = matchProduct(productName);
    if (!matched) {
      return { success: false, commission: 0 };
    }
    
    const city = order[colKeys.city] || "";
    const deliveryPrice = getCityPrice(city) || 0;
    const salePrice = parseMoney(order[colKeys.amount] || "0");
    const productCost = matched?.provider_price_gs || 0;
    const qty = Number(order[colKeys.qty] || 1) || 1;
    const commission = salePrice - (productCost + deliveryPrice);
    
    const orderData = {
      order_number: `SH${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5)}`,
      created_by: myEmail,
      customer_name: (order[colKeys.name] || "").trim(),
      phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: city,
      street: [(order[colKeys.street] || "").trim(), (order[colKeys.street2] || "").trim()].filter(Boolean).join(" "),
      district: (order[colKeys.dept] || "").trim(),
      items_json: [{ 
        title: matched.title, 
        qty, 
        sale_gs: salePrice,
        provider_price_gs: productCost,
        sku: matched.sku || "" 
      }],
      total_gs: salePrice * qty,
      status: "PENDIENTE",
      obs: `💰 Comisión: ${commission.toLocaleString("es-PY")} Gs | Venta: ${salePrice.toLocaleString("es-PY")} Gs | Costo: ${productCost.toLocaleString("es-PY")} Gs | Delivery: ${deliveryPrice.toLocaleString("es-PY")} Gs | Producto: ${matched.title}`,
      provider_emails_list: matched.provider_email || "",
    };
    
    const { error } = await supabase.from("orders").insert(orderData);
    
    if (error) {
      console.error("Error al cargar:", error);
      return { success: false, commission: 0 };
    }
    
    return { success: true, commission };
  };

  // Carga automática de todos los pedidos en estado CARGAR
  const autoLoadOrders = async () => {
    if (isAutoLoadingRef.current) {
      console.log("⚠️ Auto-carga ya en progreso...");
      return;
    }
    
    isAutoLoadingRef.current = true;
    let count = 0;
    let errors = 0;
    let totalCommission = 0;
    
    console.log("🚀 Iniciando auto-carga de pedidos...");
    
    for (let i = 0; i < sheetOrders.length; i++) {
      const currentStatus = rowStatuses[String(i)] || "CARGAR";
      if (currentStatus !== "CARGAR") continue;
      
      const order = sheetOrders[i];
      const result = await loadSingleOrder(order, i);
      
      if (result.success) {
        setRowStatus(String(i), "CARGADO");
        count++;
        totalCommission += result.commission;
        
        if (count % 3 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } else {
        errors++;
      }
    }
    
    isAutoLoadingRef.current = false;
    
    if (count > 0) {
      toast.success(`🤖 Auto-carga: ${count} pedidos cargados | 💰 Comisión total: ${totalCommission.toLocaleString("es-PY")} Gs`);
    } else if (errors > 0) {
      toast.warning(`🤖 Auto-carga: ${errors} errores, ningún pedido cargado`);
    }
  };

  // 🔥 FORMULARIO - abre el modal y cambia estado a CARGADO inmediatamente
  const handleOpenForm = (order: SheetOrder, idx: number) => {
    if (!onSheetConfirm) return;
    
    // Cambiar estado a CARGADO inmediatamente
    setRowStatus(String(idx), "CARGADO");
    
    // Abrir el formulario con los datos
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

  // Carga manual de todos los pedidos
  const handleBulkLoad = async () => {
    await autoLoadOrders();
  };

  // Auto-load completo: lee Sheet + carga pedidos
  const runAutoCycle = async () => {
    if (!autoLoadRef.current) return;
    console.log("🔄 Ciclo automático iniciado...");
    await readSheet(false);
    if (!autoLoadRef.current) return;
    await autoLoadOrders();
  };

  // Configurar intervalo de auto-carga
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
    toast.info(newValue ? "🤖 Auto-carga activada - Se mantendrá aunque recargues la página" : "⏹️ Auto-carga desactivada");
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
            className={`nav-btn ${autoLoad ? "!bg-green-600 !text-white" : ""}`}
            onClick={toggleAutoLoad}
          >
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
            🤖 Auto-carga activa — Se mantiene aunque recargues la página. Ciclo cada 60 segundos.
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

              return (
                <tr key={idx} className={currentStatus !== "CARGAR" ? "opacity-60 line-through" : ""}>
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
                  <td className="text-right text-xs font-bold text-green-400">
                    {salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}
                  </td>
                  <td className="text-right text-xs text-orange-400">
                    {productCost > 0 ? `${nf(productCost)} Gs` : "—"}
                  </td>
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
                      <span className="text-yellow-400" title="Sin cobertura">⚠️</span>
                    )}
                  </td>
                  <td className="min-w-[130px]">
                    <select
                      className="app-input !py-1 !px-2 !text-[11px] !w-full"
                      value={currentStatus}
                      onChange={(e) => setRowStatus(String(idx), e.target.value)}
                    >
                      {statusOpts.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="min-w-[120px]">
                    {onSheetConfirm && (
                      <button
                        className="nav-btn active !py-1 !px-2 !text-[11px] whitespace-nowrap w-full"
                        onClick={() => handleOpenForm(order, idx)}
                        title="Abrir formulario para cargar el pedido"
                      >
                        📝 Ir a Formulario
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={14} className="text-center text-muted-foreground py-8">
                  {sheetOrders.length === 0 ? "Leé tu Sheet primero" : "🎉 Todos los pedidos han sido cargados"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
