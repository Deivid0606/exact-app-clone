import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { SheetPrefill } from '@/pages/Index';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

interface SheetOrder {
  [key: string]: string;
}

export default function ShopifyInboxView({
  onConfirmOrder,
}: {
  onConfirmOrder: (prefill: SheetPrefill) => void;
}) {
  const { profile } = useAuth();
  const sheetUrl = profile?.sheet_url || '';

  const [orders, setOrders] = useState<SheetOrder[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [clientPrices, setClientPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [onlyCovered, setOnlyCovered] = useState(() => {
    try { return localStorage.getItem('shopify_onlyCovered') === '1'; } catch { return false; }
  });
  const [onlyMatched, setOnlyMatched] = useState(() => {
    try { return localStorage.getItem('shopify_onlyMatched') === '1'; } catch { return false; }
  });
  const [bulkLoading, setBulkLoading] = useState(false);

  // Track imported row IDs in localStorage (not in DB obs)
  const [loadedRowIds, setLoadedRowIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('shopify_loadedRowIds');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const markRowLoaded = (rowId: string) => {
    setLoadedRowIds(prev => {
      const next = new Set(prev);
      next.add(rowId);
      try { localStorage.setItem('shopify_loadedRowIds', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // Local row statuses: statusKey -> 'A_DROPEAR' | 'CARGAR' | 'PENDIENTE'
  const [rowStatuses, setRowStatuses] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('shopify_rowStatuses');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const setRowStatus = (key: string, status: string) => {
    setRowStatuses(prev => {
      const next = { ...prev, [key]: status };
      try { localStorage.setItem('shopify_rowStatuses', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Auto-load toggle
  const [autoLoad, setAutoLoad] = useState(() => {
    try { return localStorage.getItem('shopify_autoLoad') === '1'; } catch { return false; }
  });
  const autoLoadRef = useRef(autoLoad);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleAutoLoad = (val: boolean) => {
    setAutoLoad(val);
    autoLoadRef.current = val;
    try { localStorage.setItem('shopify_autoLoad', val ? '1' : '0'); } catch {}
    if (!val && autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  };

  const toggleOnlyCovered = (val: boolean) => {
    setOnlyCovered(val);
    try { localStorage.setItem('shopify_onlyCovered', val ? '1' : '0'); } catch {}
  };
  const toggleOnlyMatched = (val: boolean) => {
    setOnlyMatched(val);
    try { localStorage.setItem('shopify_onlyMatched', val ? '1' : '0'); } catch {}
  };

  const loadMeta = async () => {
    const [pricesRes, productsRes] = await Promise.all([
      supabase.from('client_prices').select('city, price_gs'),
      supabase.from('products').select('title, sku, provider_price_gs, provider_email'),
    ]);
    setClientPrices(pricesRes.data || []);
    setProducts(productsRes.data || []);
  };

  const coveredCities = useMemo(() => {
    return new Set((clientPrices || []).map((c: any) => (c.city || '').toLowerCase().trim()));
  }, [clientPrices]);

  const compactWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

  const fetchOrders = async () => {
    if (!sheetUrl) {
      toast.error('No tenés un link de Google Sheets configurado.');
      return;
    }
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;

      const res = await fetch(`${supabaseUrl}/functions/v1/read-sheet?url=${encodeURIComponent(sheetUrl)}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || anonKey}`,
          'apikey': anonKey,
        },
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setHeaders(result.headers || []);
      setOrders(result.orders || []);
      toast.success(`✅ ${result.total || 0} filas cargadas`);
    } catch (err: any) {
      toast.error(`Error al leer Sheet: ${err.message}`);
    }
    setLoading(false);
  };

  // Silent fetch for auto-load (no toast)
  const fetchOrdersSilent = async (): Promise<{ headers: string[]; orders: SheetOrder[] } | null> => {
    if (!sheetUrl) return null;
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;

      const res = await fetch(`${supabaseUrl}/functions/v1/read-sheet?url=${encodeURIComponent(sheetUrl)}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || anonKey}`,
          'apikey': anonKey,
        },
      });
      const result = await res.json();
      if (result.error) return null;
      setHeaders(result.headers || []);
      setOrders(result.orders || []);
      return { headers: result.headers || [], orders: result.orders || [] };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    loadMeta();
    if (sheetUrl) fetchOrders();
  }, [sheetUrl]);

  const findCol = (possibleNames: string[]) =>
    headers.find(h => possibleNames.some(p => h.includes(p))) || '';

  const normalizeHeaderKey = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const findStrictCol = (possibleNames: string[]) => {
    return headers.find((header) => {
      const normalizedHeader = normalizeHeaderKey(header);
      return possibleNames.some((name) => {
        const normalizedName = normalizeHeaderKey(name);
        return (
          normalizedHeader === normalizedName ||
          normalizedHeader.startsWith(`${normalizedName} `) ||
          normalizedHeader.endsWith(` ${normalizedName}`) ||
          normalizedHeader.includes(` ${normalizedName} `)
        );
      });
    }) || '';
  };

  const colName = findCol(['nombre', 'cliente', 'customer', 'name']);
  const colPhone = findCol(['telefono', 'teléfono', 'phone', 'celular', 'tel']);
  const colDate = findCol(['fecha', 'date']);
  const colCity = findCol(['ciudad', 'city', 'localidad']);
  const colStreet = findCol(['direccion', 'dirección', 'address', 'calle', 'street']);
  const colStreet2 = headers.find(h => h === 'calle_2') || '';
  const colDistrict = findCol(['barrio', 'district', 'zona', 'departamento']);
  const colTotal = findCol(['total', 'monto', 'amount', 'precio', 'price']);
  const colProducts = findCol(['producto', 'products', 'items', 'articulo', 'artículo', 'detalle']);
  const colQty = findCol(['cantidad', 'qty', 'quantity']);
  const colOrderNum = findStrictCol(['pedido', 'order', 'numero pedido', 'número pedido', 'numero', 'número', 'nro pedido', 'nro', 'id']);
  const colEmail = findCol(['email', 'correo', 'mail']);

  const getRowId = useCallback((order: SheetOrder, _idx: number) => {
    const num = compactWhitespace(order[colOrderNum] || '');
    if (num) return num;

    const date = compactWhitespace(order[colDate] || '');
    const name = compactWhitespace(order[colName] || '');
    const phone = compactWhitespace(order[colPhone] || '');
    const prod = compactWhitespace(order[colProducts] || '');
    const city = compactWhitespace(order[colCity] || '');
    const total = compactWhitespace(order[colTotal] || '');

    return compactWhitespace(`r-${date}-${name}-${phone}-${prod}-${city}-${total}`);
  }, [colOrderNum, colDate, colName, colPhone, colProducts, colCity, colTotal]);

  const getStatusKey = (_order: SheetOrder, origIdx: number) => {
    return `status:${sheetUrl || 'default'}:${origIdx}`;
  };

  // Match product by title
  const matchProduct = useCallback((sheetTitle: string) => {
    if (!sheetTitle) return null;
    const clean = sheetTitle.toLowerCase().replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    const exact = products.find((p: any) => {
      const pt = (p.title || '').toLowerCase().trim();
      return pt === sheetTitle.toLowerCase().trim() || pt === clean;
    });
    if (exact) return exact;
    return products.find((p: any) => {
      const pt = (p.title || '').toLowerCase().trim();
      return pt.includes(clean) || clean.includes(pt);
    }) || null;
  }, [products]);

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const findCityMatch = useCallback((sheetCity: string): any | null => {
    if (!sheetCity) return null;
    const raw = norm(sheetCity);
    const exact = clientPrices.find((p: any) => norm(p.city || '') === raw);
    if (exact) return exact;
    const partial = clientPrices.find((p: any) => {
      const pc = norm(p.city || '');
      return raw.includes(pc) || pc.includes(raw);
    });
    if (partial) return partial;
    const parts = raw.split(/[\-–—,\/|]+/).map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = clientPrices.find((p: any) => {
        const pc = norm(p.city || '');
        return pc.includes(part) || part.includes(pc);
      });
      if (match) return match;
    }
    return null;
  }, [clientPrices]);

  const getDeliveryFee = (city: string): number => {
    const match = findCityMatch(city);
    return match ? Number(match.price_gs) || 0 : 0;
  };

  const isCityCovered = (city: string) => !!findCityMatch(city);

  const indexedOrders = useMemo(() => orders.map((o, i) => ({ order: o, origIdx: i })), [orders]);

  const filtered = useMemo(() => {
    let result = indexedOrders;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(({ order }) =>
        Object.values(order).some(v => v.toLowerCase().includes(q))
      );
    }
    if (onlyCovered && colCity) {
      result = result.filter(({ order }) => isCityCovered(order[colCity] || ''));
    }
    if (onlyMatched && colProducts) {
      result = result.filter(({ order }) => !!matchProduct(order[colProducts] || ''));
    }
    return result;
  }, [indexedOrders, search, onlyCovered, onlyMatched, coveredCities, colCity, colProducts, products]);

  const handleConfirm = (order: SheetOrder, idx: number) => {
    const totalStr = order[colTotal] || '0';
    const totalGs = Math.round(Number(totalStr.replace(/[^\d.-]/g, '')) || 0);
    const street = order[colStreet] || '';
    const street2 = order[colStreet2] || '';
    const fullStreet = [street, street2].filter(Boolean).join(', ');
    const qty = order[colQty] || '1';

    onConfirmOrder({
      customer: order[colName] || '',
      phone: order[colPhone] || '',
      city: order[colCity] || '',
      street: fullStreet,
      district: order[colDistrict] || '',
      email: order[colEmail] || '',
      productTitle: order[colProducts] || '',
      totalGs,
      qty: Number(qty.split('\n')[0]) || 1,
      obs: '',
    });
  };

  // Build a single order payload
  const buildPayload = (order: SheetOrder, matched: any) => {
    const totalStr = order[colTotal] || '0';
    const totalGs = Math.round(Number(totalStr.replace(/[^\d.-]/g, '')) || 0);
    const street = order[colStreet] || '';
    const street2 = order[colStreet2] || '';
    const fullStreet = [street, street2].filter(Boolean).join(', ');
    const qty = Number((order[colQty] || '1').split('\n')[0]) || 1;
    const city = order[colCity] || '';
    const cityMatch = findCityMatch(city);
    const deliveryFee = cityMatch ? Number(cityMatch.price_gs) || 0 : 0;
    const platformCity = cityMatch?.city || city;

    const providerCost = Number(matched.provider_price_gs || 0) * qty;
    const commission = totalGs - (providerCost + deliveryFee);

    return {
      created_by: profile?.email || null,
      customer_name: order[colName] || '',
      phone: order[colPhone] || '',
      city: platformCity,
      street: fullStreet,
      district: order[colDistrict] || '',
      email: order[colEmail] || '',
      obs: null,
      items_json: [{
        sku: matched.sku || '',
        title: matched.title || '',
        sale_gs: totalGs,
        qty,
        provider_price_gs: Number(matched.provider_price_gs || 0),
        provider_email: matched.provider_email || '',
      }],
      total_gs: totalGs,
      delivery_gs: deliveryFee,
      commission_gs: commission,
      provider_emails_list: matched.provider_email || '',
    };
  };

  // Get all loadable orders (status=CARGAR + city covered + product detected + not loaded)
  const getLoadableOrders = () => {
    return filtered
      .filter(({ order, origIdx }) => {
        const rowId = getRowId(order, origIdx);
        const statusKey = getStatusKey(order, origIdx);
        if (loadedRowIds.has(rowId)) return false;
        if ((rowStatuses[statusKey] || 'CARGAR') !== 'CARGAR') return false;
        const city = order[colCity] || '';
        if (!isCityCovered(city)) return false;
        const matched = matchProduct(order[colProducts] || '');
        if (!matched) return false;
        return true;
      });
  };

  const loadableOrders = useMemo(() => getLoadableOrders(), [filtered, loadedRowIds, colCity, colProducts, rowStatuses]);

  const handleBulkLoad = async () => {
    if (loadableOrders.length === 0) {
      toast.error('No hay pedidos listos para carga masiva.');
      return;
    }
    setBulkLoading(true);
    let ok = 0;
    let fail = 0;
    for (const { order, origIdx } of loadableOrders) {
      try {
        const rowId = getRowId(order, origIdx);
        const matched = matchProduct(order[colProducts] || '');
        if (!matched) continue;

        const payload = buildPayload(order, matched);
        const { error } = await supabase.from('orders').insert(payload);
        if (error) { fail++; console.error('Bulk insert error:', error); }
        else { ok++; markRowLoaded(rowId); }
      } catch (e) {
        fail++;
        console.error('Bulk load error:', e);
      }
    }
    toast.success(`🚀 ${ok} pedidos cargados${fail ? ` (${fail} errores)` : ''}`);
    setBulkLoading(false);
  };

  // Auto-load cycle
  const runAutoLoadCycle = useCallback(async () => {
    if (!autoLoadRef.current || !sheetUrl) return;

    // Re-fetch sheet silently
    const result = await fetchOrdersSilent();
    if (!result) return;

    // Get current loaded IDs from localStorage
    let currentLoaded: Set<string>;
    try {
      const saved = localStorage.getItem('shopify_loadedRowIds');
      currentLoaded = saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { currentLoaded = new Set(); }

    let currentStatuses: Record<string, string>;
    try {
      const saved = localStorage.getItem('shopify_rowStatuses');
      currentStatuses = saved ? JSON.parse(saved) : {};
    } catch { currentStatuses = {}; }

    let ok = 0;
    for (let i = 0; i < result.orders.length; i++) {
      const order = result.orders[i];
      const rowId = getRowId(order, i);
      const statusKey = `status:${sheetUrl || 'default'}:${i}`;

      if (currentLoaded.has(rowId)) continue;
      if ((currentStatuses[statusKey] || 'CARGAR') !== 'CARGAR') continue;

      const city = order[colCity] || '';
      if (!isCityCovered(city)) continue;

      const matched = matchProduct(order[colProducts] || '');
      if (!matched) continue;

      try {
        const payload = buildPayload(order, matched);
        const { error } = await supabase.from('orders').insert(payload);
        if (!error) {
          ok++;
          currentLoaded.add(rowId);
        }
      } catch { /* skip */ }
    }

    if (ok > 0) {
      try { localStorage.setItem('shopify_loadedRowIds', JSON.stringify([...currentLoaded])); } catch {}
      setLoadedRowIds(new Set(currentLoaded));
      toast.success(`⚡ Auto-carga: ${ok} pedidos cargados`);
    }
  }, [sheetUrl, getRowId, matchProduct, findCityMatch, colCity, colProducts, products, clientPrices, profile?.email]);

  // Start/stop auto-load timer
  useEffect(() => {
    if (autoLoad && sheetUrl) {
      // Run immediately, then every 60 seconds
      runAutoLoadCycle();
      autoTimerRef.current = setInterval(runAutoLoadCycle, 60000);
    }
    return () => {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [autoLoad, sheetUrl, runAutoLoadCycle]);

  const pendingCount = filtered.filter(({ order, origIdx }) => !loadedRowIds.has(getRowId(order, origIdx))).length;

  if (!sheetUrl) {
    return (
      <div className="app-card">
        <h3 className="text-lg font-extrabold mb-3">🛒 Pedidos de Shopify (Google Sheets)</h3>
        <div className="p-6 text-center">
          <p className="text-muted-foreground mb-2">No tenés un link de Google Sheets configurado.</p>
          <p className="text-sm text-muted-foreground">Andá a <b>Perfil</b> y pegá el link de tu hoja pública de Shopify.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">🛒 Pedidos de Shopify (Google Sheets)</h3>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <button className="nav-btn active" onClick={fetchOrders} disabled={loading}>
          {loading ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Cargando...</span> : '🔄 Sincronizar Sheet'}
        </button>
        {loadableOrders.length > 0 && (
          <button className="nav-btn active !bg-green-700 hover:!bg-green-600" onClick={handleBulkLoad} disabled={bulkLoading}>
            {bulkLoading ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Cargando...</span> : `🚀 Carga masiva (${loadableOrders.length})`}
          </button>
        )}
        <button
          className={`nav-btn ${autoLoad ? 'active !bg-amber-600 hover:!bg-amber-500' : ''}`}
          onClick={() => toggleAutoLoad(!autoLoad)}
        >
          {autoLoad ? '⚡ Auto-carga ON' : '⚡ Auto-carga OFF'}
        </button>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input type="checkbox" checked={onlyCovered}
            onChange={e => toggleOnlyCovered(e.target.checked)}
            className="accent-[hsl(var(--brand))] w-4 h-4" />
          🏙️ Solo ciudades con cobertura
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input type="checkbox" checked={onlyMatched}
            onChange={e => toggleOnlyMatched(e.target.checked)}
            className="accent-[hsl(var(--brand))] w-4 h-4" />
          📦 Solo productos detectados
        </label>
        <input className="app-input !w-auto min-w-[200px] flex-1" placeholder="🔎 Buscar..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {autoLoad && (
        <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
          <span className="animate-pulse">⚡</span> Carga automática activa — sincroniza y carga cada 60 segundos
        </div>
      )}

      <div className="text-xs text-muted-foreground mb-2">
        {filtered.length} filas • {pendingCount} sin cargar
        {onlyCovered && <span className="ml-1">• Filtro: solo ciudades cubiertas ({coveredCities.size})</span>}
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1100px]">
          <thead>
            <tr>
              <th>👤 Cliente</th>
              {colProducts && <th>📦 Producto</th>}
              <th>🔗 Producto detectado</th>
              <th>💰 Costo Prov.</th>
              {colCity && <th>🏙️ Ciudad</th>}
              <th>🚚 Delivery</th>
              {colTotal && <th>💵 Monto</th>}
              <th>📌 Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ order: o, origIdx }) => {
              const rowId = getRowId(o, origIdx);
              const statusKey = getStatusKey(o, origIdx);
              const alreadyLoaded = loadedRowIds.has(rowId);
              const totalGs = Math.round(Number((o[colTotal] || '0').replace(/[^\d.-]/g, '')) || 0);
              const city = o[colCity] || '';
              const cityOk = isCityCovered(city);
              const matched = matchProduct(o[colProducts] || '');
              const currentStatus = alreadyLoaded ? 'YA_CARGADO' : (rowStatuses[statusKey] || 'CARGAR');

              return (
                <tr key={statusKey} className={alreadyLoaded ? 'opacity-50' : ''}>
                  <td className="text-xs truncate max-w-[150px]">{o[colName] || '-'}</td>
                  {colProducts && (
                    <td className="text-xs truncate max-w-[180px]">{o[colProducts] || '-'}</td>
                  )}
                  <td className="text-xs">
                    {matched ? (
                      <span className="text-green-400 font-semibold">✅ {matched.title}</span>
                    ) : (
                      <span className="text-yellow-500">⚠️ No detectado</span>
                    )}
                  </td>
                  <td className="text-xs font-semibold">
                    {matched ? (
                      <span className="text-white font-bold">{nf(Number(matched.provider_price_gs || 0))} Gs</span>
                    ) : '-'}
                  </td>
                  {colCity && (
                    <td className="text-xs">
                      <span className={cityOk ? 'text-green-400' : 'text-red-400'}>
                        {cityOk ? '✅' : '❌'} {city || '-'}
                      </span>
                    </td>
                  )}
                  <td className="text-xs font-semibold">
                    {cityOk ? (
                      <span className="text-white font-bold">{nf(getDeliveryFee(city))} Gs</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {colTotal && <td className="text-xs font-semibold">{nf(totalGs)} Gs</td>}
                  <td className="text-xs">
                    {alreadyLoaded ? (
                      <span className="text-green-400 font-bold">✅ Cargado</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <select
                          className="app-input !py-1 !px-1.5 !text-xs !w-auto min-w-[100px]"
                          value={currentStatus}
                          onChange={e => setRowStatus(statusKey, e.target.value)}
                        >
                          <option value="PENDIENTE">⏳ Pendiente</option>
                          <option value="A_DROPEAR">📋 A Dropear</option>
                          <option value="CARGAR">✅ Cargar</option>
                        </select>
                        {currentStatus === 'CARGAR' && (
                          <button className="nav-btn active !py-1 !px-2 !text-xs"
                            onClick={() => handleConfirm(o, origIdx)}>
                            ➡️
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">
                {loading ? 'Cargando...' : 'Sin datos'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
