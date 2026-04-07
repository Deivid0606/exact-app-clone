import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function OrdersView() {
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 22);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })
      .limit(200);

    const { data } = await query;
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => { loadOrders(); }, []);

  const filtered = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.phone || '').includes(q) ||
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.city || '').toLowerCase().includes(q)
    );
  });

  const statusClass = (s: string) => {
    if (s === 'ENTREGADO' || s === 'ENCOMIENDA ENTREGADA') return 'badge-entregado';
    if (s === 'CANCELADO') return 'badge-cancelado';
    return 'badge-pendiente';
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos</h3>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <input className="app-input !w-auto min-w-[280px] flex-1" placeholder="🔎 Buscar por cliente, teléfono, ID o ciudad"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active" onClick={loadOrders} disabled={loading}>Filtrar</button>
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1200px]">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>ID</th>
              <th>Ciudad</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Delivery</th>
              <th className="text-right">Total (Gs)</th>
              <th className="text-right">Comisión (Gs)</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Sin pedidos</td></tr>
            )}
            {filtered.map(o => (
              <tr key={o.id}>
                <td className="whitespace-nowrap text-xs">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                <td className="font-bold text-xs">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.city}</td>
                <td className="text-xs">{o.customer_name}</td>
                <td className="text-xs">{o.created_by}</td>
                <td className="text-xs">{o.assigned_delivery || '—'}</td>
                <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                <td className="text-right text-xs">{nf(Number(o.commission_gs || 0))}</td>
                <td><span className={`badge-status ${statusClass(o.status || '')}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
