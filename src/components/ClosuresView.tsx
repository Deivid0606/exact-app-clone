import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function ClosuresView() {
  const { profile } = useAuth();
  const role = profile?.role;
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [filterDelivery, setFilterDelivery] = useState(role === 'DELIVERY' ? (profile?.email || '') : '');
  const [filterType, setFilterType] = useState('ENTREGADO');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    supabase.from('profiles').select('email, name').then(({ data }) => setDeliveries(data || []));
    supabase.from('delivery_fees').select('*').then(({ data }) => setFees(data || []));
  }, []);

  const loadClosures = async () => {
    let query = supabase.from('orders').select('*')
      .gte('assigned_at', dateFrom + 'T00:00:00')
      .lte('assigned_at', dateTo + 'T23:59:59')
      .order('assigned_at', { ascending: false });

    if (filterDelivery) query = query.eq('assigned_delivery', filterDelivery);
    if (filterType) query = query.eq('status', filterType);

    const { data } = await query;
    setOrders(data || []);
  };

  useEffect(() => { loadClosures(); }, []);

  const getFee = (deliveryEmail: string, city: string) => {
    const f = fees.find(f => f.delivery_email?.toLowerCase() === deliveryEmail?.toLowerCase() && f.city?.toLowerCase() === city?.toLowerCase());
    return Number(f?.fee_gs || 0);
  };

  const kpis = {
    entregados: orders.filter(o => o.status === 'ENTREGADO').length,
    entregadosRev: orders.filter(o => o.status === 'ENTREGADO').reduce((s, o) => s + Number(o.total_gs || 0), 0),
    encomiendas: orders.filter(o => o.status === 'ENCOMIENDA ENTREGADA').length,
    encomiendaRev: orders.filter(o => o.status === 'ENCOMIENDA ENTREGADA').reduce((s, o) => s + Number(o.total_gs || 0), 0),
    deliveryFee: orders.reduce((s, o) => {
      const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
      return s + fee;
    }, 0),
  };
  const netRendir = kpis.entregadosRev + kpis.encomiendaRev - kpis.deliveryFee;

  const updateStatus2 = async (orderId: string, status2: string) => {
    const { error } = await supabase.from('orders').update({ status2 }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success('Estado 2 actualizado'); loadClosures(); }
  };

  const updateRetiro = async (orderId: string, estado: string) => {
    const { error } = await supabase.from('orders').update({ estado_retiro: estado }).eq('id', orderId);
    if (error) toast.error(error.message);
    else toast.success('Estado de retiro actualizado');
  };

  const state2Opts = ['--', 'GUIA GENERADA', 'FUERA DE COBERTURA', 'CANCELADO', 'REPETIDO', 'RENDIDO'];
  const retiroOpts = ['', 'PENDIENTE', 'REALIZADO', 'CANCELADO'];

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Cierres</h3>

      {role === 'DELIVERY' && (
        <div className="mb-3">
          <span className="badge-status badge-pendiente">👁️ Vista solo lectura para DELIVERY</span>
          <p className="text-xs text-muted-foreground mt-1">Acá podés ver tu cierre, cuánto debés rendir y el detalle de tus pedidos.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {role !== 'DELIVERY' && (
          <select className="app-input !w-auto min-w-[280px]" value={filterDelivery} onChange={e => setFilterDelivery(e.target.value)}>
            <option value="">Todos los repartidores</option>
            {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
          </select>
        )}
        <select className="app-input !w-auto min-w-[200px]" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="ENTREGADO">ENTREGADO</option>
          <option value="ENCOMIENDA ENTREGADA">ENCOMIENDA ENTREGADA</option>
          <option value="EN RUTA">EN RUTA</option>
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="CANCELADO">CANCELADO</option>
        </select>
        <button className="nav-btn active" onClick={loadClosures}>Aplicar</button>
      </div>

      <p className="chip mb-3 text-[10px]">Los KPIs se calculan solo con Estado 1 = ENTREGADO</p>

      <div className="grid-kpi mb-4">
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">ENTREGADOS</div><div className="text-[22px] font-extrabold">{kpis.entregados}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.entregadosRev)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">ENCOMIENDAS</div><div className="text-[22px] font-extrabold">{kpis.encomiendas}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.encomiendaRev)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Ganancia Delivery (Gs)</div><div className="text-[22px] font-extrabold">{nf(kpis.deliveryFee)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Neto a Rendir (Gs)</div><div className="text-[22px] font-extrabold">{nf(netRendir)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Pedidos</div><div className="text-[22px] font-extrabold">{orders.length}</div></div>
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1100px]">
          <thead>
            <tr>
              <th>Asignado</th><th>ID</th><th>Ciudad</th><th>Cliente</th>
              <th className="text-right">Total (Gs)</th><th className="text-right">Tarifa (Gs)</th>
              <th className="text-right">Neto (Gs)</th><th>Estado 1</th><th>Retiro</th><th>Estado 2</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
              const net = Number(o.total_gs || 0) - fee;
              return (
                <tr key={o.id}>
                  <td className="text-xs whitespace-nowrap">{o.assigned_at ? new Date(o.assigned_at).toLocaleDateString('es-PY') : ''}</td>
                  <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="text-xs">{o.city}</td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                  <td className="text-right text-xs">{nf(fee)}</td>
                  <td className="text-right text-xs">{nf(net)}</td>
                  <td><span className={`badge-status ${o.status === 'ENTREGADO' || o.status === 'ENCOMIENDA ENTREGADA' ? 'badge-entregado' : o.status === 'CANCELADO' ? 'badge-cancelado' : 'badge-pendiente'}`}>{o.status}</span></td>
                  <td>
                    {role !== 'DELIVERY' ? (
                      <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.estado_retiro || ''}
                        onChange={e => updateRetiro(o.id, e.target.value)}>
                        {retiroOpts.map(s => <option key={s} value={s}>{s || '—'}</option>)}
                      </select>
                    ) : <span className="text-xs">{o.estado_retiro || '—'}</span>}
                  </td>
                  <td>
                    {role !== 'DELIVERY' ? (
                      <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.status2 || '--'}
                        onChange={e => updateStatus2(o.id, e.target.value)}>
                        {state2Opts.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <span className="text-xs">{o.status2 || '—'}</span>}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && <tr><td colSpan={10} className="text-center text-muted-foreground py-8">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
