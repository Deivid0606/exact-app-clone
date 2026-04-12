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
  if (str.includes('\n')) str = str.split('\n')[0].trim();
  str = str.replace(/["']/g, '');
  const numMatch = str.match(/\d+/);
  if (!numMatch) return 1;
  const num = parseInt(numMatch[0], 10);
  return isNaN(num) ? 1 : num;
}

function parseMoney(v: string): number {
  if (!v) return 0;
  let cleanValue = String(v);
  if (cleanValue.includes('\n')) cleanValue = cleanValue.split('\n')[0].trim();
  cleanValue = cleanValue.replace(/["']/g, '');
  let cleaned = cleanValue.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(cleaned) || 0);
}

const findAmountInRow = (row: SheetOrder): number => {
  const excludeColumns = ["telefono", "phone", "tel", "celular", "whatsapp", "cantidad", "qty", "quantity"];
  for (const key in row) {
    const value = row[key];
    if (!value) continue;
    const keyLower = key.toLowerCase();
    if (excludeColumns.some(ex => keyLower.includes(ex))) continue;
    const str = String(value).trim();
    const priceMatches = str.match(/\b\d{4,7}\b/g);
    if (priceMatches) {
      for (const match of priceMatches) {
        const num = parseInt(match, 10);
        if (num >= 10000 && num <= 5000000) return num;
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
    if (key === "TOTAL A PAGAR" || key === "total a pagar") {
      const parsed = parseMoney(order[key]);
      if (parsed > 0) return parsed;
    }
  }
  const fallbackAmount = findAmountInRow(order);
  if (fallbackAmount > 0) return fallbackAmount;
  return 0;
};

// Generador de ID sin localStorage
let idCounter = Date.now();
const generateSequentialId = (): string => {
  idCounter++;
  return `SHOPIFY${idCounter.toString().slice(-8)}`;
};

type OrderStatus = "PENDIENTE" | "PEDIDO CARGADO" | "A DROPEAR" | "CARGADO MANUAL";
const STATUS_OPTIONS: OrderStatus[] = ["PENDIENTE", "PEDIDO CARGADO", "A DROPEAR", "CARGADO MANUAL"];
const STATUS_COLORS: Record<OrderStatus, string> = {
  "PENDIENTE": "",
  "PEDIDO CARGADO": "bg-green-500/20 border-l-4 border-green-500",
  "A DROPEAR": "bg-yellow-500/20 border-l-4 border-yellow-500",
  "CARGADO MANUAL": "bg-blue-500/20 border-l-4 border-blue-500"
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
  const [rowStatuses, setRowStatuses] = useState<Record<string, OrderStatus>>({});
  const [autoLoad, setAutoLoad] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "TODOS">("TODOS");
  const [search, setSearch] = useState("");

  const autoLoadRef = useRef(autoLoad);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoLoadingRef = useRef(false);

  // Guardar autoLoad
  useEffect(() => {
    autoLoadRef.current = autoLoad;
  }, [autoLoad]);

  // Refrescar al volver a la pestaña
  useEffect(() => {
    if (!sheetUrl) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("👁️ Pestaña activada - Refrescando...");
        readSheet();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sheetUrl, readSheet]);

  // Refresco automático cada 30 segundos
  useEffect(() => {
    if (!sheetUrl) return;
    const interval = setInterval(() => {
      console.log("⏰ Refresco automático cada 30 segundos");
      readSheet();
    }, 30000);
    return () => clearInterval(interval);
  }, [sheetUrl, readSheet]);

  // Cargar productos y precios
  useEffect(() => {
    const loadData = async () => {
      const { data: productsData } = await supabase.from("products").select("*");
      const { data: pricesData } = await supabase.from("client_prices").select("*");
      setProducts(productsData || []);
      setClientPrices(pricesData || []);
    };
    loadData();
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
    const find = (...candidates: string[]) => {
      const normalizedCandidates = candidates.map(c => normalizeText(c));
      for (let i = 0; i < h.length; i++) {
        const normalizedHeader = normalizeText(h[i]);
        for (const candidate of normalizedCandidates) {
          if (normalizedHeader === candidate || normalizedHeader.includes(candidate)) {
            return h[i];
          }
        }
      }
      return "";
    };
    const findAmount = () => {
      for (let i = 0; i < h.length; i++) {
        if (h[i] === "TOTAL A PAGAR" || h[i] === "total a pagar") return h[i];
      }
      return find("monto", "total", "precio", "importe", "amount");
    };
    return {
      name: find("nombre", "cliente", "customer", "name"),
      phone: find("telefono", "phone", "tel", "celular", "whatsapp"),
      street: find("calle", "direccion", "address", "street"),
      city: find("ciudad", "city", "localidad", "distrito"),
      product: find("producto", "product", "item", "titulo"),
      qty: find("cantidad", "qty", "quantity", "unidades"),
      amount: findAmount(),
      email: find("email", "correo", "mail"),
    };
  }, [sheetHeaders]);

  const matchProduct = useCallback((rawName: string) => {
    if (!rawName || rawName === "—") return null;
    const q = rawName.toLowerCase().trim();
    let found = products.find(p => p.title?.toLowerCase() === q);
    if (found) return found;
    found = products.find(p => p.title?.toLowerCase().includes(q));
    if (found) return found;
    found = products.find(p => q.includes(p.title?.toLowerCase() || ""));
    return found || null;
  }, [products]);

  const getCityPrice = useCallback((cityName: string) => {
    if (!cityName) return null;
    const q = cityName.toLowerCase().trim();
    let match = clientPrices.find(cp => cp.city?.toLowerCase().trim() === q);
    if (match) return match.price_gs;
    const prefixes = [4, 3];
    for (const len of prefixes) {
      if (q.length >= len) {
        const prefix = q.substring(0, len);
        match = clientPrices.find(cp => cp.city?.toLowerCase().trim().startsWith(prefix));
        if (match) return match.price_gs;
      }
    }
    match = clientPrices.find(cp => cp.city?.toLowerCase().trim().includes(q));
    return match ? match.price_gs : null;
  }, [clientPrices]);

  const hasCoverage = useCallback((cityName: string) => {
    return getCityPrice(cityName) !== null;
  }, [getCityPrice]);

  const readSheet = useCallback(async () => {
    if (!sheetUrl) {
      toast.error("Configurá tu URL de Google Sheet en tu perfil");
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`/api/read-sheet?url=${encodeURIComponent(sheetUrl)}&t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      const json = await resp.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setSheetHeaders(json.headers || []);
        setSheetOrders(json.orders || []);
        setLastSync(new Date());
      }
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    }
    setLoading(false);
  }, [sheetUrl]);

  const setRowStatus = useCallback((key: string, status: OrderStatus) => {
    setRowStatuses(prev => ({ ...prev, [key]: status }));
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
      toast.warning(`Ciudad "${city}" sin cobertura`);
      return;
    }
    const salePrice = getAmountFromRow(order, colKeys.amount);
    if (salePrice === 0) {
      toast.warning(`Monto no detectado en fila ${idx + 1}`);
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
      email: order[colKeys.email] || "",
      obs: `Comisión: ${commission.toLocaleString("es-PY")} Gs | Venta: ${salePrice.toLocaleString("es-PY")} Gs | Costo: ${productCost.toLocaleString("es-PY")} Gs | Delivery: ${deliveryPrice.toLocaleString("es-PY")} Gs | Producto: ${matched.title}`,
      items_json: [{ sku: matched.sku || "", title: matched.title, qty, sale_gs: salePrice, provider_price_gs: productCost }],
      total_gs: salePrice * qty,
      delivery_gs: deliveryPrice,
      commission_gs: commission,
    };
    
    const { error } = await supabase.from("orders").insert(payload);
    if (error) {
      toast.error("Error: " + error.message);
    } else {
      setRowStatus(String(idx), "PEDIDO CARGADO");
      toast.success(`✅ ${orderId} | Comisión: ${commission.toLocaleString("es-PY")} Gs`);
    }
  }, [colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

  const handleBulkLoad = useCallback(async () => {
    let count = 0, errors = 0, skippedNoProduct = 0, skippedNoCoverage = 0, skippedNoAmount = 0, totalCommission = 0;
    for (let i = 0; i < sheetOrders.length; i++) {
      const currentStatus = rowStatuses[String(i)] || "PENDIENTE";
      if (currentStatus !== "PENDIENTE") continue;
      const order = sheetOrders[i];
      const matched = matchProduct(order[colKeys.product] || "");
      if (!matched) { skippedNoProduct++; continue; }
      const deliveryPrice = getCityPrice(order[colKeys.city] || "");
      if (!deliveryPrice) { skippedNoCoverage++; continue; }
      const salePrice = getAmountFromRow(order, colKeys.amount);
      if (salePrice === 0) { skippedNoAmount++; continue; }
      const productCost = matched.provider_price_gs || 0;
      const qty = parseQuantity(order[colKeys.qty]);
      const commission = salePrice - (productCost + deliveryPrice);
      const orderId = generateSequentialId();
      const payload = {
        order_number: orderId, created_by: myEmail,
        customer_name: (order[colKeys.name] || "").trim(),
        phone: extractPhoneNumber(order[colKeys.phone] || ""),
        city: order[colKeys.city] || "",
        street: (order[colKeys.street] || "").trim(),
        email: order[colKeys.email] || "",
        obs: `Comisión: ${commission.toLocaleString("es-PY")} Gs | Producto: ${matched.title}`,
        items_json: [{ sku: matched.sku || "", title: matched.title, qty, sale_gs: salePrice, provider_price_gs: productCost }],
        total_gs: salePrice * qty, delivery_gs: deliveryPrice, commission_gs: commission,
      };
      const { error } = await supabase.from("orders").insert(payload);
      if (error) { errors++; } else { setRowStatus(String(i), "PEDIDO CARGADO"); count++; totalCommission += commission; }
      if (count % 3 === 0) await new Promise(r => setTimeout(r, 100));
    }
    toast.success(`✅ ${count} cargados | ❌ ${errors} errores | ⏭️ ${skippedNoProduct} sin producto | 🚫 ${skippedNoCoverage} sin cobertura | 💰 ${skippedNoAmount} sin monto | Comisión total: ${totalCommission.toLocaleString("es-PY")} Gs`);
  }, [sheetOrders, rowStatuses, colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

  const handleMarkAsManual = useCallback((idx: number) => {
    setRowStatus(String(idx), "CARGADO MANUAL");
    toast.success("📝 Marcado como cargado manualmente");
  }, [setRowStatus]);

  const handleFullRefresh = useCallback(() => {
    setRowStatuses({});
    readSheet();
    toast.info("🔄 Datos refrescados");
  }, [readSheet]);

  const handleOpenForm = useCallback((order: SheetOrder, idx: number) => {
    if (!onSheetConfirm) return;
    onSheetConfirm({
      customer: (order[colKeys.name] || "").trim(),
      phone: extractPhoneNumber(order[colKeys.phone] || ""),
      city: (order[colKeys.city] || "").trim(),
      street: (order[colKeys.street] || "").trim(),
      productTitle: (order[colKeys.product] || "").trim(),
      totalGs: getAmountFromRow(order, colKeys.amount),
      qty: parseQuantity(order[colKeys.qty]),
    });
  }, [colKeys, onSheetConfirm]);

  // Auto-carga
  const autoLoadOrders = useCallback(async () => {
    if (isAutoLoadingRef.current || !autoLoadRef.current) return;
    isAutoLoadingRef.current = true;
    let count = 0, totalCommission = 0;
    for (let i = 0; i < sheetOrders.length; i++) {
      if ((rowStatuses[String(i)] || "PENDIENTE") !== "PENDIENTE") continue;
      const order = sheetOrders[i];
      const matched = matchProduct(order[colKeys.product] || "");
      if (!matched) continue;
      const deliveryPrice = getCityPrice(order[colKeys.city] || "");
      if (!deliveryPrice) continue;
      const salePrice = getAmountFromRow(order, colKeys.amount);
      if (salePrice === 0) continue;
      const commission = salePrice - ((matched.provider_price_gs || 0) + deliveryPrice);
      const orderId = generateSequentialId();
      const { error } = await supabase.from("orders").insert({
        order_number: orderId, created_by: myEmail,
        customer_name: (order[colKeys.name] || "").trim(),
        phone: extractPhoneNumber(order[colKeys.phone] || ""),
        city: order[colKeys.city] || "",
        street: (order[colKeys.street] || "").trim(),
        items_json: [{ title: matched.title, qty: parseQuantity(order[colKeys.qty]), sale_gs: salePrice, provider_price_gs: matched.provider_price_gs || 0 }],
        total_gs: salePrice, delivery_gs: deliveryPrice, commission_gs: commission,
      });
      if (!error) { setRowStatus(String(i), "PEDIDO CARGADO"); count++; totalCommission += commission; }
      await new Promise(r => setTimeout(r, 100));
    }
    if (count > 0) toast.success(`🤖 Auto: ${count} cargados | Comisión: ${totalCommission.toLocaleString("es-PY")} Gs`);
    isAutoLoadingRef.current = false;
  }, [sheetOrders, rowStatuses, colKeys, matchProduct, getCityPrice, myEmail, setRowStatus]);

  const runAutoCycle = useCallback(async () => {
    if (!autoLoadRef.current) return;
    await readSheet();
    await new Promise(r => setTimeout(r, 500));
    await autoLoadOrders();
  }, [readSheet, autoLoadOrders]);

  useEffect(() => {
    if (autoLoad && sheetUrl) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimeout(() => runAutoCycle(), 2000);
      intervalRef.current = setInterval(runAutoCycle, 60000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoLoad, sheetUrl, runAutoCycle]);

  const toggleAutoLoad = () => {
    setAutoLoad(!autoLoad);
    toast.info(!autoLoad ? "🤖 Auto-carga activada" : "⏹️ Auto-carga desactivada");
  };

  // Filtros
  const filteredOrders = useMemo(() => {
    return sheetOrders
      .map((o, i) => ({ order: o, idx: i }))
      .filter(({ idx }) => {
        const s = rowStatuses[String(idx)] || "PENDIENTE";
        if (statusFilter !== "TODOS" && s !== statusFilter) return false;
        return true;
      })
      .filter(({ order }) => {
        if (!search) return true;
        return Object.values(order).some(v => String(v).toLowerCase().includes(search.toLowerCase()));
      });
  }, [sheetOrders, rowStatuses, statusFilter, search]);

  const stats = useMemo(() => {
    const pendientes = sheetOrders.filter((_, i) => (rowStatuses[String(i)] || "PENDIENTE") === "PENDIENTE").length;
    const cargados = sheetOrders.filter((_, i) => rowStatuses[String(i)] === "PEDIDO CARGADO").length;
    const aDropear = sheetOrders.filter((_, i) => rowStatuses[String(i)] === "A DROPEAR").length;
    const manual = sheetOrders.filter((_, i) => rowStatuses[String(i)] === "CARGADO MANUAL").length;
    return { pendientes, cargados, aDropear, manual, total: sheetOrders.length };
  }, [sheetOrders, rowStatuses]);

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">📦 Shopify Inbox — Lectura de Sheet</h3>

      <div className="app-card !p-4 mb-4">
        <div className="flex flex-wrap gap-2">
          <button className="nav-btn active" onClick={readSheet} disabled={loading}>
            {loading ? "Leyendo..." : "📊 Leer Sheet"}
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
          {lastSync && <span className="text-xs text-muted-foreground">Última sync: {lastSync.toLocaleTimeString("es-PY")}</span>}
        </div>
        {autoLoad && <div className="text-xs text-green-400 mt-1">🤖 Auto-carga activa — Ciclo cada 60 segundos</div>}
        <div className="text-xs text-blue-400 mt-1">🔄 Refresco al volver a la pestaña | Auto-refresco cada 30 segundos</div>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-700/50" onClick={() => setStatusFilter("TODOS")}>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs">Total</div>
        </div>
        <div className="bg-yellow-500/10 rounded-lg p-3 text-center cursor-pointer hover:bg-yellow-500/20" onClick={() => setStatusFilter("PENDIENTE")}>
          <div className="text-2xl font-bold text-yellow-400">{stats.pendientes}</div>
          <div className="text-xs">Pendientes</div>
        </div>
        <div className="bg-green-500/10 rounded-lg p-3 text-center cursor-pointer hover:bg-green-500/20" onClick={() => setStatusFilter("PEDIDO CARGADO")}>
          <div className="text-2xl font-bold text-green-400">{stats.cargados}</div>
          <div className="text-xs">Cargados</div>
        </div>
        <div className="bg-yellow-500/10 rounded-lg p-3 text-center cursor-pointer hover:bg-yellow-500/20" onClick={() => setStatusFilter("A DROPEAR")}>
          <div className="text-2xl font-bold text-yellow-400">{stats.aDropear}</div>
          <div className="text-xs">A Dropear</div>
        </div>
        <div className="bg-blue-500/10 rounded-lg p-3 text-center cursor-pointer hover:bg-blue-500/20" onClick={() => setStatusFilter("CARGADO MANUAL")}>
          <div className="text-2xl font-bold text-blue-400">{stats.manual}</div>
          <div className="text-xs">Manual</div>
        </div>
      </div>

      {/* Buscador */}
      <div className="flex flex-wrap gap-4 mb-3">
        <input className="app-input flex-1" placeholder="🔎 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        {(statusFilter !== "TODOS" || search) && (
          <button className="text-xs text-muted-foreground hover:text-white" onClick={() => { setStatusFilter("TODOS"); setSearch(""); }}>
            Limpiar filtros ✕
          </button>
        )}
      </div>

      {/* Tabla completa */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1300px]">
          <thead>
            <tr>
              <th>#</th><th>Cliente</th><th>Teléfono</th><th>Ciudad</th><th>Calle</th><th className="text-right">Delivery</th>
              <th>Producto</th><th>Cant</th><th className="text-right">Venta</th><th className="text-right">Costo</th>
              <th className="text-right">Comisión</th><th>Estado</th><th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(({ order, idx }) => {
              const currentStatus = rowStatuses[String(idx)] || "PENDIENTE";
              const matched = matchProduct(order[colKeys.product] || "");
              const deliveryPrice = getCityPrice(order[colKeys.city] || "");
              const salePrice = getAmountFromRow(order, colKeys.amount);
              const productCost = matched?.provider_price_gs || 0;
              const qty = parseQuantity(order[colKeys.qty]);
              const commission = salePrice - (productCost + (deliveryPrice || 0));
              const canLoad = currentStatus === "PENDIENTE" && matched && deliveryPrice && salePrice > 0;
              const statusColor = STATUS_COLORS[currentStatus] || "";

              return (
                <tr key={idx} className={statusColor}>
                  <td className="text-xs">{idx + 1}</td>
                  <td className="text-xs">{order[colKeys.name] || "—"}</td>
                  <td className="text-xs">{extractPhoneNumber(order[colKeys.phone] || "") || "—"}</td>
                  <td className="text-xs">{order[colKeys.city] || "—"}</td>
                  <td className="text-xs">{order[colKeys.street] || "—"}</td>
                  <td className="text-right text-xs">{deliveryPrice ? `${nf(deliveryPrice)} Gs` : "—"}</td>
                  <td className="text-xs truncate max-w-[180px]">{order[colKeys.product] || "—"}</td>
                  <td className="text-xs">{qty}</td>
                  <td className="text-right text-xs text-green-400">{salePrice > 0 ? `${nf(salePrice)} Gs` : "—"}</td>
                  <td className="text-right text-xs text-orange-400">{productCost > 0 ? `${nf(productCost)} Gs` : "—"}</td>
                  <td className={`text-right text-xs font-bold ${commission >= 0 ? "text-blue-400" : "text-red-400"}`}>
                    {commission !== 0 ? `${commission > 0 ? "+" : ""}${nf(commission)} Gs` : "—"}
                  </td>
                  <td className="min-w-[130px]">
                    <select className="app-input !py-1 !px-2 !text-xs" value={currentStatus} onChange={e => setRowStatus(String(idx), e.target.value as OrderStatus)}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="min-w-[180px] flex gap-1 flex-wrap">
                    {canLoad && <button className="nav-btn active !py-1 !px-2 !text-xs" onClick={() => handleDirectSave(order, idx)}>💰 Cargar</button>}
                    {currentStatus === "PENDIENTE" && <button className="nav-btn !py-1 !px-2 !text-xs bg-blue-600" onClick={() => handleMarkAsManual(idx)}>📝 Manual</button>}
                    {onSheetConfirm && <button className="nav-btn !py-1 !px-2 !text-xs" onClick={() => handleOpenForm(order, idx)}>📋 Editar</button>}
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
