import { useState, useEffect, useMemo } from 'react';
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
  const [imported, setImported] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [onlyCovered, setOnlyCovered] = useState(false);

  const loadImported = async () => {
    const { data } = await supabase.from('orders').select('obs')
      .ilike('obs', '%sheet_row:%');
    setImported(data || []);
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

  const importedRowIds = useMemo(() => {
    const ids = new Set<string>();
    (imported || []).forEach((o: any) => {
      const match = (o.obs || '').match(/sheet_row:([^\s|]+)/);
      if (match) ids.add(match[1]);
    });
    return ids;
  }, [imported]);

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

  useEffect(() => {
    loadImported();
    loadMeta();
    if (sheetUrl) fetchOrders();
  }, [sheetUrl]);

  const findCol = (possibleNames: string[]) =>
    headers.find(h => possibleNames.some(p => h.includes(p))) || '';

  const colName = findCol(['nombre', 'cliente', 'customer', 'name']);
  const colPhone = findCol(['telefono', 'teléfono', 'phone', 'celular', 'tel']);
  const colCity = findCol(['ciudad', 'city', 'localidad']);
  const colStreet = findCol(['direccion', 'dirección', 'address', 'calle', 'street']);
  const colStreet2 = headers.find(h => h === 'calle_2') || '';
  const colDistrict = findCol(['barrio', 'district', 'zona', 'departamento']);
  const colTotal = findCol(['total', 'monto', 'amount', 'precio', 'price']);
  const colProducts = findCol(['producto', 'products', 'items', 'articulo', 'artículo', 'detalle']);
  const colQty = findCol(['cantidad', 'qty', 'quantity']);
  const colOrderNum = findCol(['pedido', 'order', 'numero', 'número', 'nro', '#', 'id']);
  const colEmail = findCol(['email', 'correo', 'mail']);
  const colStatus = findCol(['estado', 'status']);

  const getRowId = (order: SheetOrder, idx: number) => {
    const num = order[colOrderNum] || '';
    return num || `row-${idx}`;
  };

  // Match product by title
  const matchProduct = (sheetTitle: string) => {
    if (!sheetTitle) return null;
    const clean = sheetTitle.toLowerCase().replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    // Exact match
    const exact = products.find((p: any) => {
      const pt = (p.title || '').toLowerCase().trim();
      return pt === sheetTitle.toLowerCase().trim() || pt === clean;
    });
    if (exact) return exact;
    // Partial match
    return products.find((p: any) => {
      const pt = (p.title || '').toLowerCase().trim();
      return pt.includes(clean) || clean.includes(pt);
    }) || null;
  };

  const isCityCovered = (city: string) => {
    if (!city) return false;
    const c = city.toLowerCase().trim();
    if (coveredCities.has(c)) return true;
    for (const covered of coveredCities) {
      if (c.includes(covered) || covered.includes(c)) return true;
    }
    return false;
  };

  const filtered = useMemo(() => {
    let result = orders;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        Object.values(o).some(v => v.toLowerCase().includes(q))
      );
    }
    if (onlyCovered && colCity) {
      result = result.filter(o => isCityCovered(o[colCity] || ''));
    }
    return result;
  }, [orders, search, onlyCovered, coveredCities, colCity]);

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
      obs: `Importado desde Google Sheet | sheet_row:${getRowId(order, idx)}`,
    });
  };

  const pendingCount = filtered.filter((_, i) => !importedRowIds.has(getRowId(filtered[i], i))).length;

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
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyCovered}
            onChange={e => setOnlyCovered(e.target.checked)}
            className="accent-[hsl(var(--brand))] w-4 h-4"
          />
          🏙️ Solo ciudades con cobertura
        </label>
        <input className="app-input !w-auto min-w-[200px] flex-1" placeholder="🔎 Buscar..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

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
              {colDistrict && <th>📍 Depto</th>}
              {colTotal && <th>💵 Monto</th>}
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o, i) => {
              const rowId = getRowId(o, i);
              const alreadyImported = importedRowIds.has(rowId);
              const totalGs = Math.round(Number((o[colTotal] || '0').replace(/[^\d.-]/g, '')) || 0);
              const city = o[colCity] || '';
              const cityOk = isCityCovered(city);
              const matched = matchProduct(o[colProducts] || '');

              return (
                <tr key={i} className={alreadyImported ? 'opacity-50' : ''}>
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
                      <span className="text-accent">{nf(Number(matched.provider_price_gs || 0))} Gs</span>
                    ) : '-'}
                  </td>
                  {colCity && (
                    <td className="text-xs">
                      <span className={cityOk ? 'text-green-400' : 'text-red-400'}>
                        {cityOk ? '✅' : '❌'} {city || '-'}
                      </span>
                    </td>
                  )}
                  {colDistrict && <td className="text-xs truncate max-w-[120px]">{o[colDistrict] || '-'}</td>}
                  {colTotal && <td className="text-xs font-semibold">{nf(totalGs)} Gs</td>}
                  <td>
                    {alreadyImported ? (
                      <span className="text-xs text-green-400 font-bold">✅ Cargado</span>
                    ) : (
                      <button className="nav-btn active !py-1 !px-3 !text-xs"
                        onClick={() => handleConfirm(o, i)}>
                        ➡️ Cargar
                      </button>
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
