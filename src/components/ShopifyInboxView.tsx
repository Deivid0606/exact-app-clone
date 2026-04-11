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
  const sheetUrl = (profile as any)?.sheet_url || '';

  const [orders, setOrders] = useState<SheetOrder[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [imported, setImported] = useState<any[]>([]);

  const loadImported = async () => {
    const { data } = await supabase.from('orders').select('obs')
      .ilike('obs', '%sheet_row:%');
    setImported(data || []);
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
      const { data, error } = await supabase.functions.invoke('read-sheet', {
        body: null,
        headers: {},
      });
      // We need to call via URL with query params since invoke doesn't support query params well
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
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
    if (sheetUrl) fetchOrders();
  }, [sheetUrl]);

  // Try to find common column names
  const findCol = (possibleNames: string[]) => {
    return headers.find(h => possibleNames.some(p => h.includes(p))) || '';
  };

  const colName = findCol(['nombre', 'cliente', 'customer', 'name']);
  const colPhone = findCol(['telefono', 'teléfono', 'phone', 'celular', 'tel']);
  const colCity = findCol(['ciudad', 'city', 'localidad']);
  const colStreet = findCol(['direccion', 'dirección', 'address', 'calle', 'street']);
  const colDistrict = findCol(['barrio', 'district', 'zona', 'departamento']);
  const colTotal = findCol(['total', 'monto', 'amount', 'precio', 'price']);
  const colProducts = findCol(['producto', 'products', 'items', 'articulo', 'artículo', 'detalle']);
  const colOrderNum = findCol(['pedido', 'order', 'numero', 'número', 'nro', '#', 'id']);
  const colEmail = findCol(['email', 'correo', 'mail']);

  const getRowId = (order: SheetOrder, idx: number) => {
    // Create a unique ID from order number or row index
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

  const confirmOrder = async (order: SheetOrder, idx: number) => {
    setConfirming(prev => new Set(prev).add(idx));
    try {
      const totalStr = order[colTotal] || '0';
      const totalGs = Math.round(Number(totalStr.replace(/[^\d.-]/g, '')) || 0);

      const { error } = await supabase.from('orders').insert({
        order_number: order[colOrderNum] ? `SH-${order[colOrderNum]}` : undefined,
        created_by: myEmail,
        customer_name: order[colName] || 'Sin nombre',
        phone: order[colPhone] || '',
        email: order[colEmail] || '',
        city: order[colCity] || '',
        street: order[colStreet] || '',
        district: order[colDistrict] || '',
        items_json: order[colProducts] ? [{ title: order[colProducts], qty: 1, sale_gs: totalGs }] : [],
        total_gs: totalGs,
        status: 'PENDIENTE',
        obs: `Importado desde Google Sheet | sheet_row:${getRowId(order, idx)}`,
      });

      if (error) throw error;
      toast.success(`✅ Pedido importado correctamente`);
      setConfirmed(prev => new Set(prev).add(idx));
      loadImported();
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
    setConfirming(prev => { const n = new Set(prev); n.delete(idx); return n; });
  };

  const pendingCount = filtered.filter((_, i) => !importedRowIds.has(getRowId(filtered[i], i)) && !confirmed.has(i)).length;

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
        <span className="ml-2 opacity-50">Columnas detectadas: {headers.join(', ')}</span>
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[900px]">
          <thead>
            <tr>
              {headers.slice(0, 8).map(h => <th key={h} className="capitalize">{h}</th>)}
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o, i) => {
              const rowId = getRowId(o, i);
              const alreadyImported = importedRowIds.has(rowId) || confirmed.has(i);
              const isConfirming = confirming.has(i);
              return (
                <tr key={i} className={alreadyImported ? 'opacity-50' : ''}>
                  {headers.slice(0, 8).map(h => (
                    <td key={h} className="text-xs truncate max-w-[200px]">{o[h] || ''}</td>
                  ))}
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
              <tr><td colSpan={headers.length + 1} className="text-center text-muted-foreground py-8">
                {loading ? 'Cargando desde Google Sheets...' : 'Sin datos en el Sheet'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
