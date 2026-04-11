import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

interface SheetOrder {
  [key: string]: string;
}

export default function ShopifyInboxView() {
  const { profile } = useAuth();
  const myEmail = profile?.email || '';
  const sheetUrl = profile?.sheet_url || '';

  const [orders, setOrders] = useState<SheetOrder[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [imported, setImported] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<Record<string, number>>({});

  const loadImported = async () => {
    const { data } = await supabase.from('orders').select('obs')
      .ilike('obs', '%sheet_row:%');
    setImported(data || []);
  };

  const loadClientPrices = async () => {
    const { data } = await supabase.from('client_prices').select('city, price_gs');
    const map: Record<string, number> = {};
    (data || []).forEach((p: any) => {
      map[p.city.toLowerCase().trim()] = Number(p.price_gs) || 0;
    });
    setClientPrices(map);
  };

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
      toast.error('No tenés un link de Google Sheets configurado. Andá a Perfil y pegá tu link.');
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
      toast.success(`✅ ${result.total || 0} filas cargadas desde Google Sheets`);
    } catch (err: any) {
      toast.error(`Error al leer Sheet: ${err.message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadImported();
    loadClientPrices();
    if (sheetUrl) fetchOrders();
  }, [sheetUrl]);

  // Column detection - find columns by possible names
  const findCol = (possibleNames: string[]) => {
    return headers.find(h => possibleNames.some(p => h.includes(p))) || '';
  };

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

  const filtered = useMemo(() => {
    if (!search) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      Object.values(o).some(v => v.toLowerCase().includes(q))
    );
  }, [orders, search]);

  // Calculate delivery fee based on city using client_prices table
  const getDeliveryFee = (city: string): number => {
    if (!city) return 0;
    const key = city.toLowerCase().trim();
    // Try exact match first
    if (clientPrices[key]) return clientPrices[key];
    // Try partial match
    for (const [k, v] of Object.entries(clientPrices)) {
      if (key.includes(k) || k.includes(key)) return v;
    }
    return 0;
  };

  // Default commission rate: 10% of total
  const getCommission = (totalGs: number): number => {
    return Math.round(totalGs * 0.10);
  };

  const confirmOrder = async (order: SheetOrder, idx: number) => {
    setConfirming(prev => new Set(prev).add(idx));
    try {
      const totalStr = order[colTotal] || '0';
      const totalGs = Math.round(Number(totalStr.replace(/[^\d.-]/g, '')) || 0);
      const city = order[colCity] || '';
      const deliveryFee = getDeliveryFee(city);
      const commission = getCommission(totalGs);
      const product = order[colProducts] || '';
      const qty = order[colQty] || '1';
      const street = order[colStreet] || '';
      const street2 = order[colStreet2] || '';
      const fullStreet = [street, street2].filter(Boolean).join(', ');

      const { error } = await supabase.from('orders').insert({
        order_number: order[colOrderNum] ? `SH-${order[colOrderNum]}` : undefined,
        created_by: myEmail,
        customer_name: order[colName] || 'Sin nombre',
        phone: order[colPhone] || '',
        email: order[colEmail] || '',
        city: city,
        street: fullStreet,
        district: order[colDistrict] || '',
        items_json: product ? [{ title: product, qty: Number(qty.split('\n')[0]) || 1, sale_gs: totalGs }] : [],
        total_gs: totalGs,
        delivery_gs: deliveryFee,
        commission_gs: commission,
        status: 'PENDIENTE',
        obs: `Importado desde Google Sheet | sheet_row:${getRowId(order, idx)}`,
      });

      if (error) throw error;
      toast.success(`✅ Pedido importado — Delivery: ${nf(deliveryFee)} Gs | Comisión: ${nf(commission)} Gs`);
      setConfirmed(prev => new Set(prev).add(idx));
      loadImported();
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
    setConfirming(prev => { const n = new Set(prev); n.delete(idx); return n; });
  };

  const pendingCount = filtered.filter((_, i) => !importedRowIds.has(getRowId(filtered[i], i)) && !confirmed.has(i)).length;

  // Display columns: show the most useful ones
  const displayCols = [colName, colProducts, colCity, colDistrict, colTotal, colPhone, colStatus].filter(Boolean);

  if (!sheetUrl) {
    return (
      <div className="app-card">
        <h3 className="text-lg font-extrabold mb-3">🛒 Pedidos de Shopify (Google Sheets)</h3>
        <div className="p-6 text-center">
          <p className="text-muted-foreground mb-2">No tenés un link de Google Sheets configurado.</p>
          <p className="text-sm text-muted-foreground">Andá a <b>Perfil</b> y pegá el link de tu hoja pública de Shopify en el campo "Link de Google Sheets".</p>
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
        {pendingCount > 0 && (
          <button className="nav-btn" onClick={async () => {
            for (let i = 0; i < filtered.length; i++) {
              const rowId = getRowId(filtered[i], i);
              if (!importedRowIds.has(rowId) && !confirmed.has(i)) {
                await confirmOrder(filtered[i], i);
              }
            }
          }}>
            ✅ Confirmar todos ({pendingCount})
          </button>
        )}
        <input className="app-input !w-auto min-w-[240px] flex-1" placeholder="🔎 Buscar..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {filtered.length} filas • {pendingCount} sin confirmar
        <span className="ml-2 opacity-50">Columnas: {headers.filter(h => !h.startsWith('_col')).join(', ')}</span>
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[900px]">
          <thead>
            <tr>
              {displayCols.map(h => (
                <th key={h} className="capitalize">
                  {h === colProducts ? '📦 Producto' : 
                   h === colCity ? '🏙️ Ciudad' :
                   h === colTotal ? '💰 Monto' :
                   h === colName ? '👤 Cliente' :
                   h === colPhone ? '📱 Tel' :
                   h === colDistrict ? '📍 Depto' :
                   h === colStatus ? '📋 Estado' : h}
                </th>
              ))}
              <th>💵 Delivery</th>
              <th>📊 Comisión</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o, i) => {
              const rowId = getRowId(o, i);
              const alreadyImported = importedRowIds.has(rowId) || confirmed.has(i);
              const isConfirming = confirming.has(i);
              const totalGs = Math.round(Number((o[colTotal] || '0').replace(/[^\d.-]/g, '')) || 0);
              const city = o[colCity] || '';
              const deliveryFee = getDeliveryFee(city);
              const commission = getCommission(totalGs);

              return (
                <tr key={i} className={alreadyImported ? 'opacity-50' : ''}>
                  {displayCols.map(h => (
                    <td key={h} className="text-xs truncate max-w-[200px]">
                      {h === colTotal ? `${nf(totalGs)} Gs` : (o[h] || '-')}
                    </td>
                  ))}
                  <td className="text-xs font-semibold">
                    {deliveryFee > 0 ? <span className="text-blue-400">{nf(deliveryFee)} Gs</span> : <span className="text-yellow-500">Sin tarifa</span>}
                  </td>
                  <td className="text-xs font-semibold text-green-400">
                    {nf(commission)} Gs
                  </td>
                  <td>
                    {alreadyImported ? (
                      <span className="text-xs text-green-400 font-bold">✅ Cargado</span>
                    ) : (
                      <button className="nav-btn active !py-1 !px-3 !text-xs" disabled={isConfirming}
                        onClick={() => confirmOrder(o, i)}>
                        {isConfirming ? '⏳' : '➡️ Confirmar'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={displayCols.length + 3} className="text-center text-muted-foreground py-8">
                {loading ? 'Cargando desde Google Sheets...' : 'Sin datos en el Sheet'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
