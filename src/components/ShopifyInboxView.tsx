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

  const filtered = useMemo(() => {
    if (!search) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      Object.values(o).some(v => v.toLowerCase().includes(q))
    );
  }, [orders, search]);

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
  const displayCols = [colName, colProducts, colCity, colDistrict, colTotal, colPhone, colStatus].filter(Boolean);

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
        <input className="app-input !w-auto min-w-[240px] flex-1" placeholder="🔎 Buscar..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {filtered.length} filas • {pendingCount} sin cargar
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
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o, i) => {
              const rowId = getRowId(o, i);
              const alreadyImported = importedRowIds.has(rowId);
              const totalGs = Math.round(Number((o[colTotal] || '0').replace(/[^\d.-]/g, '')) || 0);

              return (
                <tr key={i} className={alreadyImported ? 'opacity-50' : ''}>
                  {displayCols.map(h => (
                    <td key={h} className="text-xs truncate max-w-[200px]">
                      {h === colTotal ? `${nf(totalGs)} Gs` : (o[h] || '-')}
                    </td>
                  ))}
                  <td>
                    {alreadyImported ? (
                      <span className="text-xs text-green-400 font-bold">✅ Cargado</span>
                    ) : (
                      <button className="nav-btn active !py-1 !px-3 !text-xs"
                        onClick={() => handleConfirm(o, i)}>
                        ➡️ Cargar pedido
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={displayCols.length + 1} className="text-center text-muted-foreground py-8">
                {loading ? 'Cargando...' : 'Sin datos en el Sheet'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
