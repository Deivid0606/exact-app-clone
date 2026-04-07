import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function WithGuidesView() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    const { data } = await supabase.from('orders').select('*')
      .order('created_at', { ascending: false }).limit(300);
    setOrders(data || []);
  };

  useEffect(() => { load(); }, []);

  const filtered = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (o.customer_name || '').toLowerCase().includes(q) ||
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.phone || '').includes(q) || (o.city || '').toLowerCase().includes(q);
  });

  const pendingGuides = filtered.filter(o => !o.status2 || o.status2 === '--');

  const updateStatus2 = async (orderId: string, status2: string) => {
    const { error } = await supabase.from('orders').update({ status2 }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success('Estado 2 actualizado'); load(); }
  };

  const state2Opts = ['--', 'GUIA GENERADA', 'FUERA DE COBERTURA', 'CANCELADO', 'REPETIDO', 'RENDIDO'];

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos con guías</h3>

      <div className="grid-kpi mb-3" style={{ gridTemplateColumns: '1fr' }}>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Guías pendientes</div><div className="text-[22px] font-extrabold">{pendingGuides.length}</div></div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <input className="app-input flex-1 min-w-[300px]" placeholder="🔎 Buscar por cliente, teléfono, ID o ciudad"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active" onClick={load}>Filtrar</button>
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1100px]">
          <thead>
            <tr><th>Fecha</th><th>ID</th><th>Ciudad</th><th>Cliente</th><th>Vendedor</th><th>Proveedor</th><th>Estado 2</th></tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.city}</td>
                <td className="text-xs">{o.customer_name}</td>
                <td className="text-xs">{o.created_by}</td>
                <td className="text-xs">{o.provider_emails_list || '—'}</td>
                <td>
                  <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.status2 || '--'}
                    onChange={e => updateStatus2(o.id, e.target.value)}>
                    {state2Opts.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">Sin pedidos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
