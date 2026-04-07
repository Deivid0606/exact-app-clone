import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function ClosuresView() {
  const { profile } = useAuth();
  const role = profile?.role;
  const myEmail = profile?.email || '';
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [filterDelivery, setFilterDelivery] = useState(role === 'DELIVERY' ? (profile?.email || '') : '');
  const [filterType, setFilterType] = useState('ENTREGADO');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    setSelectedIds(new Set());
  };

  useEffect(() => { loadClosures(); }, []);

  const getFee = (deliveryEmail: string, city: string) => {
    const f = fees.find(f => f.delivery_email?.toLowerCase() === deliveryEmail?.toLowerCase() && f.city?.toLowerCase() === city?.toLowerCase());
    return Number(f?.fee_gs || 0);
  };

  const delivered = useMemo(() => orders.filter(o => o.status === 'ENTREGADO' || o.status === 'ENCOMIENDA ENTREGADA'), [orders]);
  const rendidos = useMemo(() => delivered.filter(o => o.delivery_settled), [delivered]);
  const noRendidos = useMemo(() => delivered.filter(o => !o.delivery_settled), [delivered]);

  const kpis = useMemo(() => {
    const entregados = orders.filter(o => o.status === 'ENTREGADO');
    const encomiendas = orders.filter(o => o.status === 'ENCOMIENDA ENTREGADA');
    return {
      entregados: entregados.length,
      entregadosRev: entregados.reduce((s, o) => s + Number(o.total_gs || 0), 0),
      encomiendas: encomiendas.length,
      encomiendaRev: encomiendas.reduce((s, o) => s + Number(o.total_gs || 0), 0),
      deliveryFee: orders.reduce((s, o) => {
        const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
        return s + fee;
      }, 0),
      rendidos: rendidos.length,
      noRendidos: noRendidos.length,
      montoRendido: rendidos.reduce((s, o) => s + Number(o.total_gs || 0), 0),
      montoPendiente: noRendidos.reduce((s, o) => s + Number(o.total_gs || 0), 0),
    };
  }, [orders, rendidos, noRendidos]);

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

  // Mark selected orders as RENDIDO
  const markRendido = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) { toast.error('Seleccioná pedidos primero'); return; }
    let ok = 0;
    for (const id of ids) {
      const { error } = await supabase.from('orders').update({
        delivery_settled: true,
        status2: 'RENDIDO',
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (!error) ok++;
    }
    if (ok > 0) {
      await supabase.from('news').insert({
        message: `${ok} pedidos marcados como RENDIDO por ${myEmail} (${filterDelivery || 'todos'})`,
        actor_email: myEmail,
        role_scope: role,
      });
      toast.success(`${ok} pedidos marcados como RENDIDO`);
    }
    setSelectedIds(new Set());
    loadClosures();
  };

  // Mark rendición del día as PAGADO
  const markRendicionPagada = async () => {
    const deliveryEmail = filterDelivery;
    if (!deliveryEmail) { toast.error('Seleccioná un delivery primero'); return; }

    const montoRendir = rendidos.reduce((s, o) => {
      const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
      return s + (Number(o.total_gs || 0) - fee);
    }, 0);

    if (montoRendir <= 0) { toast.error('No hay monto para rendir'); return; }
    if (!confirm(`¿Marcar rendición de ${deliveryEmail} por Gs ${nf(montoRendir)} como PAGADA?`)) return;

    // Mark all settled orders as paid
    for (const o of rendidos) {
      await supabase.from('orders').update({
        delivery_paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', o.id);
    }

    // Create rendicion pagada record
    const { error } = await supabase.from('rendiciones_pagadas').insert({
      delivery_email: deliveryEmail,
      fecha_rendicion: new Date().toISOString().slice(0, 10),
      monto_total: montoRendir,
      nota: `Rendición ${dateFrom} a ${dateTo} — ${rendidos.length} pedidos`,
      marcado_por: myEmail,
      marcado_en: new Date().toISOString(),
      pagado_en: new Date().toISOString(),
    });

    if (error) { toast.error(error.message); return; }

    await supabase.from('news').insert({
      message: `Rendición de ${deliveryEmail} marcada como PAGADA — Gs ${nf(montoRendir)}`,
      actor_email: myEmail,
      role_scope: role,
    });

    toast.success(`Rendición de Gs ${nf(montoRendir)} marcada como PAGADA`);
    loadClosures();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllNoRendidos = () => {
    if (selectedIds.size === noRendidos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(noRendidos.map(o => o.id)));
    }
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

      <div className="grid-kpi mb-4">
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">ENTREGADOS</div><div className="text-[22px] font-extrabold">{kpis.entregados}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.entregadosRev)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">ENCOMIENDAS</div><div className="text-[22px] font-extrabold">{kpis.encomiendas}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.encomiendaRev)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Ganancia Delivery</div><div className="text-[22px] font-extrabold">{nf(kpis.deliveryFee)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Neto a Rendir</div><div className="text-[22px] font-extrabold">{nf(netRendir)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Pendientes rendir</div><div className="text-[22px] font-extrabold text-yellow-400">{kpis.noRendidos}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.montoPendiente)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Ya rendidos</div><div className="text-[22px] font-extrabold text-green-400">{kpis.rendidos}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.montoRendido)}</div></div>
      </div>

      {/* Bulk actions for ADMIN/DESPACHANTE */}
      {role !== 'DELIVERY' && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedIds.size > 0 && (
            <button className="nav-btn active" onClick={markRendido}>
              ✅ Marcar {selectedIds.size} como RENDIDO
            </button>
          )}
          {filterDelivery && rendidos.length > 0 && (
            <button className="nav-btn active !bg-green-600 hover:!bg-green-700" onClick={markRendicionPagada}>
              💰 Marcar rendición como PAGADA ({rendidos.length} pedidos — Gs {nf(rendidos.reduce((s, o) => {
                const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
                return s + (Number(o.total_gs || 0) - fee);
              }, 0))})
            </button>
          )}
        </div>
      )}

      <div className="overflow-auto">
        <table className="app-table min-w-[1200px]">
          <thead>
            <tr>
              {role !== 'DELIVERY' && (
                <th className="!w-[40px] text-center">
                  <input type="checkbox"
                    checked={selectedIds.size === noRendidos.length && noRendidos.length > 0}
                    onChange={selectAllNoRendidos} title="Seleccionar no rendidos" />
                </th>
              )}
              <th>Asignado</th><th>ID</th><th>Ciudad</th><th>Cliente</th>
              <th className="text-right">Total (Gs)</th><th className="text-right">Tarifa (Gs)</th>
              <th className="text-right">Neto (Gs)</th><th>Estado 1</th><th>Rendido</th><th>Retiro</th><th>Estado 2</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
              const net = Number(o.total_gs || 0) - fee;
              const isSettled = o.delivery_settled;
              return (
                <tr key={o.id} className={isSettled ? 'opacity-60' : ''}>
                  {role !== 'DELIVERY' && (
                    <td className="text-center">
                      {!isSettled && (o.status === 'ENTREGADO' || o.status === 'ENCOMIENDA ENTREGADA') ? (
                        <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                      ) : <span className="text-[10px]">{isSettled ? '✅' : ''}</span>}
                    </td>
                  )}
                  <td className="text-xs whitespace-nowrap">{o.assigned_at ? new Date(o.assigned_at).toLocaleDateString('es-PY') : ''}</td>
                  <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="text-xs">{o.city}</td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                  <td className="text-right text-xs">{nf(fee)}</td>
                  <td className="text-right text-xs">{nf(net)}</td>
                  <td><span className={`badge-status ${o.status === 'ENTREGADO' || o.status === 'ENCOMIENDA ENTREGADA' ? 'badge-entregado' : o.status === 'CANCELADO' ? 'badge-cancelado' : 'badge-pendiente'}`}>{o.status}</span></td>
                  <td>
                    <span className={`badge-status ${isSettled ? 'badge-entregado' : 'badge-pendiente'}`}>
                      {isSettled ? 'RENDIDO' : 'PENDIENTE'}
                    </span>
                    {o.delivery_paid_at && <div className="text-[9px] text-green-400 mt-0.5">PAGADO</div>}
                  </td>
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
            {orders.length === 0 && <tr><td colSpan={role !== 'DELIVERY' ? 12 : 11} className="text-center text-muted-foreground py-8">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
