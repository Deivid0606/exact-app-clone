import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function ClosuresView() {
  const { profile } = useAuth();
  const myEmail = profile?.email || '';
  
  // ========== DETECCIÓN DE ROL ==========
  const isSupplier = myEmail === 'skylinestore06@gmail.com' || 
                     myEmail === 'importadoraaliado@gmail.com' || 
                     myEmail === 'nkshop@gmail.com';
  
  const isAdmin = myEmail === 'aleimportss@gmail.com';
  
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);
  
  const [filterDelivery, setFilterDelivery] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterType, setFilterType] = useState('');
  const [rendicionNote, setRendicionNote] = useState('');
  const [rendicionPagada, setRendicionPagada] = useState<{ id: string; pagado_en: string; nota: string; marcado_por: string } | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [totalPedidosAsignados, setTotalPedidosAsignados] = useState(0);

  const loadDeliveries = async () => {
    const { data: ordersData } = await supabase
      .from('orders')
      .select('assigned_delivery')
      .not('assigned_delivery', 'is', null);
    
    if (ordersData && ordersData.length > 0) {
      const uniqueEmails = [...new Set(ordersData.map(o => o.assigned_delivery))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('email, name')
        .in('email', uniqueEmails);
      
      if (profilesData && profilesData.length > 0) {
        setDeliveries(profilesData);
      } else {
        setDeliveries(uniqueEmails.map(email => ({ email, name: email })));
      }
    }
  };

  const loadSuppliers = () => {
    const supplierList = [
      { email: 'skylinestore06@gmail.com', name: 'PROVEEDOR SKYLINE' },
      { email: 'importadoraaliado@gmail.com', name: 'IMPORTS ALIADEX' },
      { email: 'nkshop@gmail.com', name: 'PROVEEDOR NKSHOP' }
    ];
    setSuppliers(supplierList);
  };

  useEffect(() => {
    loadSuppliers();
    loadDeliveries();
    supabase.from('delivery_fees').select('*').then(({ data }) => setFees(data || []));
    supabase.from('client_prices').select('*').order('city').then(({ data }) => setClientPrices(data || []));
  }, []);

  const isDelivery = !isSupplier && !isAdmin && deliveries.some(d => d.email === myEmail);

  const loadClosures = async () => {
    let query = supabase.from('orders').select('*')
      .gte('assigned_at', dateFrom + 'T00:00:00')
      .lte('assigned_at', dateTo + 'T23:59:59')
      .order('assigned_at', { ascending: false });

    if (isSupplier) {
      // Obtener IDs de productos de este proveedor
      const { data: myProducts } = await supabase
        .from('products')
        .select('id')
        .eq('supplier_email', myEmail);
      
      const productIds = myProducts?.map(p => p.id) || [];
      
      if (productIds.length > 0) {
        // Obtener order_ids que contengan productos de este proveedor
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('order_id')
          .in('product_id', productIds);
        
        const orderIds = [...new Set(orderItems?.map(oi => oi.order_id) || [])];
        
        if (orderIds.length > 0) {
          query = query.in('id', orderIds);
        } else {
          query = query.in('id', []); // No hay pedidos con productos de este proveedor
        }
      } else {
        query = query.in('id', []); // No hay productos de este proveedor
      }
      
      if (filterDelivery) {
        query = query.eq('assigned_delivery', filterDelivery);
      }
    } else if (isDelivery) {
      query = query.eq('assigned_delivery', myEmail);
      if (filterSupplier) {
        query = query.eq('supplier_email', filterSupplier);
      }
    } else if (isAdmin) {
      if (filterDelivery) query = query.eq('assigned_delivery', filterDelivery);
      if (filterSupplier) query = query.eq('supplier_email', filterSupplier);
    }

    // ✅ FILTRO DE ESTADO: Solo aplicar si hay un valor seleccionado (no vacío)
    if (filterType && filterType !== '') {
      query = query.eq('status', filterType);
    }

    const { data } = await query;
    setOrders(data || []);
    setTotalPedidosAsignados(data?.length || 0);

    let deliveryToCheck = '';
    if (isDelivery) {
      deliveryToCheck = myEmail;
    } else if ((isAdmin || isSupplier) && filterDelivery) {
      deliveryToCheck = filterDelivery;
    }
    
    if (deliveryToCheck) {
      const { data: rp } = await supabase.from('rendiciones_pagadas').select('*')
        .eq('delivery_email', deliveryToCheck)
        .gte('pagado_en', dateFrom + 'T00:00:00')
        .lte('pagado_en', dateTo + 'T23:59:59')
        .order('pagado_en', { ascending: false })
        .limit(1);
      setRendicionPagada(rp && rp.length > 0 ? { id: rp[0].id, pagado_en: rp[0].pagado_en, nota: rp[0].nota || '', marcado_por: rp[0].marcado_por || '' } : null);
    } else {
      setRendicionPagada(null);
    }
  };

  useEffect(() => { loadClosures(); }, [filterSupplier, filterDelivery, filterType, dateFrom, dateTo]);

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
  const totalAPagar = useMemo(() => {
    return delivered.reduce((s, o) => {
      const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
      return s + (Number(o.total_gs || 0) - fee);
    }, 0);
  }, [delivered]);

  const updateStatus1 = async (orderId: string, status: string) => {
    if (status === 'DEVUELTO A DEPÓSITO' && isDelivery) {
      toast.error('Los repartidores no pueden cambiar a DEVUELTO A DEPÓSITO');
      return;
    }
    const { error } = await supabase.from('orders').update({ 
      status,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { 
      toast.success('Estado actualizado'); 
      loadClosures();
    }
  };

  const updateStatus2 = async (orderId: string, status2: string) => {
    const { error } = await supabase.from('orders').update({ 
      status2,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success('Estado 2 actualizado'); loadClosures(); }
  };

  const updateRetiro = async (orderId: string, estado: string) => {
    const { error } = await supabase.from('orders').update({ 
      estado_retiro: estado,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success('Estado de retiro actualizado'); loadClosures(); }
  };

  const updateAssignedAt = async (orderId: string, dateVal: string) => {
    if (!dateVal) return;
    const { error } = await supabase.from('orders').update({ assigned_at: dateVal + 'T00:00:00', updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success('Fecha actualizada'); loadClosures(); }
  };

  const updateCity = async (orderId: string, city: string) => {
    const { error } = await supabase.from('orders').update({ city, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success('Ciudad actualizada'); loadClosures(); }
  };

  const markSingleRendido = async (orderId: string) => {
    const { error } = await supabase.from('orders').update({
      delivery_settled: true,
      status2: 'RENDIDO',
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success('Marcado como RENDIDO');
    loadClosures();
  };

  const markRendicionPagada = async () => {
    let deliveryEmail = '';
    if (isDelivery) {
      deliveryEmail = myEmail;
    } else if (isAdmin || isSupplier) {
      deliveryEmail = filterDelivery;
    }
    
    if (!deliveryEmail) { toast.error('Seleccioná un delivery primero'); return; }
    if (totalAPagar <= 0) { toast.error('No hay monto para rendir'); return; }
    if (!confirm(`¿Marcar rendición de ${deliveryEmail} por Gs ${nf(totalAPagar)} como PAGADA?`)) return;

    for (const o of delivered) {
      await supabase.from('orders').update({
        delivery_settled: true,
        delivery_paid_at: new Date().toISOString(),
        status2: 'RENDIDO',
      }).eq('id', o.id);
    }

    const { error } = await supabase.from('rendiciones_pagadas').insert({
      delivery_email: deliveryEmail,
      fecha_rendicion: new Date().toISOString().slice(0, 10),
      monto_total: totalAPagar,
      nota: rendicionNote || `Rendición ${dateFrom} a ${dateTo} — ${delivered.length} pedidos`,
      marcado_por: myEmail,
      marcado_en: new Date().toISOString(),
      pagado_en: new Date().toISOString(),
    });

    if (error) { toast.error(error.message); return; }
    toast.success(`Rendición de Gs ${nf(totalAPagar)} marcada como PAGADA`);
    setRendicionNote('');
    loadClosures();
  };

  const desmarcarPagado = async () => {
    if (!rendicionPagada) return;
    if (!confirm('¿Desmarcar esta rendición como pagada?')) return;

    for (const o of delivered) {
      await supabase.from('orders').update({
        delivery_settled: false,
        delivery_paid_at: null,
        status2: '--',
      }).eq('id', o.id);
    }

    await supabase.from('rendiciones_pagadas').delete().eq('id', rendicionPagada.id);
    toast.success('Rendición desmarcada');
    loadClosures();
  };

  const status1Opts = ['PENDIENTE', 'EN RUTA', 'ENTREGADO', 'ENCOMIENDA ENTREGADA', 'CANCELADO', 'DEVUELTO A DEPÓSITO', 'REAGENDADO'];
  const state2Opts = ['--', 'GUIA GENERADA', 'FUERA DE COBERTURA', 'CANCELADO', 'REPETIDO', 'RENDIDO'];
  const retiroOpts = ['', 'PENDIENTE', 'REALIZADO', 'CANCELADO'];
  
  let deliveryName = '';
  if (isDelivery) {
    deliveryName = profile?.name || myEmail;
  } else if ((isAdmin || isSupplier) && filterDelivery) {
    const found = deliveries.find(d => d.email === filterDelivery);
    deliveryName = found?.name || filterDelivery;
  }
  
  const allRendered = noRendidos.length === 0 && delivered.length > 0;
  
  const canEditFull = isAdmin || isSupplier;
  const canEditStatus1 = isAdmin || isSupplier || isDelivery;
  const canManageRendicion = isAdmin || isSupplier;
  const canViewRendicion = isAdmin || isSupplier || isDelivery;

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Cierres</h3>

      {isDelivery && (
        <div className="mb-3">
          <span className="badge-status badge-entregado">✏️ DELIVERY: solo podés editar Estado 1</span>
          <p className="text-xs text-muted-foreground mt-1">Podés actualizar el estado de tus pedidos. No podés cambiar a DEVUELTO A DEPÓSITO.</p>
        </div>
      )}

      {(isSupplier || isAdmin) && (
        <div className="mb-3">
          <span className="badge-status badge-entregado">✏️ PROVEEDOR/ADMIN: edición completa</span>
          <p className="text-xs text-muted-foreground mt-1">Podés actualizar estados, fechas, ciudades y gestionar rendiciones.</p>
        </div>
      )}

      {/* ========== FILTROS ========== */}
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        
        {/* FILTRO POR DELIVERY - para PROVEEDOR y ADMIN */}
        {(isSupplier || isAdmin) && deliveries.length > 0 && (
          <select className="app-input !w-auto min-w-[280px]" value={filterDelivery} onChange={e => setFilterDelivery(e.target.value)}>
            <option value="">Todos los repartidores</option>
            {deliveries.map(d => (
              <option key={d.email} value={d.email}>
                {d.name || d.email}
              </option>
            ))}
          </select>
        )}

        {/* FILTRO POR PROVEEDOR - para DELIVERY y ADMIN */}
        {(isDelivery || isAdmin) && suppliers.length > 0 && (
          <select className="app-input !w-auto min-w-[280px]" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {suppliers.map(s => (
              <option key={s.email} value={s.email}>
                {s.name || s.email}
              </option>
            ))}
          </select>
        )}

        <select className="app-input !w-auto min-w-[200px]" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="ENTREGADO">ENTREGADO</option>
          <option value="ENCOMIENDA ENTREGADA">ENCOMIENDA ENTREGADA</option>
          <option value="EN RUTA">EN RUTA</option>
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="CANCELADO">CANCELADO</option>
          <option value="DEVUELTO A DEPÓSITO">DEVUELTO A DEPÓSITO</option>
          <option value="REAGENDADO">REAGENDADO</option>
        </select>
        <button className="nav-btn active" onClick={loadClosures}>Aplicar</button>
      </div>

      {/* Total de Pedidos Asignados */}
      {(filterDelivery || isDelivery || isSupplier) && (
        <div className="grid-kpi mb-4">
          <div className="kpi-card">
            <div className="text-xs text-muted-foreground mb-1">📦 Pedidos Asignados</div>
            <div className="text-[22px] font-extrabold">{totalPedidosAsignados}</div>
            <div className="text-xs text-muted-foreground">en el período</div>
          </div>
        </div>
      )}

      {/* Control de Rendición */}
      {canViewRendicion && delivered.length > 0 && (
        <div className="app-card !p-4 mb-4 border-l-4 border-l-[hsl(var(--primary))]">
          <h4 className="font-extrabold mb-3">📋 Control de Rendición</h4>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="chip text-[11px]">Delivery:</span>
              <span className="text-sm font-bold">{deliveryName || (isDelivery ? profile?.name : 'Seleccionar')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="chip text-[11px]">Fecha:</span>
              <span className="text-sm">{dateFrom} a {dateTo}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="chip text-[11px]">Total a pagar:</span>
              <span className="text-lg font-extrabold">{nf(totalAPagar)} Gs</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="chip text-[11px]">Estado:</span>
              <span className={`badge-status ${rendicionPagada ? 'badge-entregado' : allRendered ? 'badge-entregado' : 'badge-pendiente'}`}>
                {rendicionPagada ? '💰 PAGADO' : allRendered ? '✅ RENDIDO' : '⏳ PENDIENTE'}
              </span>
            </div>
          </div>
          
          {rendicionPagada ? (
            <div className="p-3 rounded-xl border border-[#4ade80]/30 bg-[#4ade80]/10">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-sm text-[#4ade80] border border-[#4ade80]/30">
                  💰 PAGADO
                </span>
                <div className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Pagado el:</span> {new Date(rendicionPagada.pagado_en).toLocaleString('es-PY')}
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Por:</span> {rendicionPagada.marcado_por}
                </div>
                {rendicionPagada.nota && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">Nota:</span> {rendicionPagada.nota}
                  </div>
                )}
                {canManageRendicion && (
                  <button
                    onClick={desmarcarPagado}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-destructive/30 text-destructive hover:bg-destructive/10 transition-all"
                  >
                    ↩ Desmarcar
                  </button>
                )}
              </div>
            </div>
          ) : (
            canManageRendicion && (
              <div className="flex flex-wrap items-center gap-3">
                <input className="app-input flex-1 min-w-[250px]" placeholder="Agregar nota (opcional)"
                  value={rendicionNote} onChange={e => setRendicionNote(e.target.value)} />
                <button
                  onClick={markRendicionPagada}
                  disabled={(!filterDelivery && !isDelivery) || totalAPagar <= 0}
                  className="nav-btn active"
                >
                  ✅ MARCAR COMO PAGADO
                </button>
              </div>
            )
          )}
        </div>
      )}

      <p className="chip mb-3 text-[10px]">Los KPIs se calculan <strong>solo</strong> con Estado 1 = ENTREGADO.</p>

      {/* KPIs */}
      <div className="grid-kpi mb-4">
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">ENTREGADOS</div><div className="text-[22px] font-extrabold">{kpis.entregados}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.entregadosRev)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">ENCOMIENDAS</div><div className="text-[22px] font-extrabold">{kpis.encomiendas}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.encomiendaRev)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Ganancia Delivery</div><div className="text-[22px] font-extrabold">{nf(kpis.deliveryFee)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Neto a Rendir</div><div className="text-[22px] font-extrabold">{nf(netRendir)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Pendientes rendir</div><div className="text-[22px] font-extrabold" style={{ color: '#eab308' }}>{kpis.noRendidos}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.montoPendiente)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Ya rendidos</div><div className="text-[22px] font-extrabold" style={{ color: '#4ade80' }}>{kpis.rendidos}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.montoRendido)}</div></div>
      </div>

      {/* Tabla de pedidos */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1500px]">
          <thead>
            <tr>
              <th>Asignado</th><th>ID</th><th>Ciudad</th><th>Cliente</th>
              <th>Proveedor</th>
              <th className="text-right">Total (Gs)</th><th className="text-right">Tarifa (Gs)</th>
              <th className="text-right">Neto (Gs)</th>
              <th>Estado 1</th>
              <th>Estado de retiro</th>
              <th>Estado 2 (cierre)</th>
              {canManageRendicion && <th></th>}
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
              const net = Number(o.total_gs || 0) - fee;
              const isSettled = o.delivery_settled;
              const assignedDate = o.assigned_at ? new Date(o.assigned_at).toISOString().slice(0, 10) : '';
              
              const getStatusBadgeClass = (status: string) => {
                if (status === 'ENTREGADO' || status === 'ENCOMIENDA ENTREGADA') return 'badge-entregado';
                if (status === 'CANCELADO') return 'badge-cancelado';
                if (status === 'DEVUELTO A DEPÓSITO') return 'badge-warning';
                if (status === 'REAGENDADO') return 'badge-info';
                return 'badge-pendiente';
              };
              
              return (
                <tr key={o.id} className={isSettled ? 'opacity-60' : ''}>
                  <td>
                    {canEditFull ? (
                      <input type="date" className="app-input !py-1 !px-2 !text-xs !w-[130px]"
                        value={assignedDate}
                        onChange={e => updateAssignedAt(o.id, e.target.value)} />
                    ) : (
                      <span className="text-xs whitespace-nowrap">{assignedDate ? new Date(o.assigned_at).toLocaleDateString('es-PY') : ''}</span>
                    )}
                  </td>
                  <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="text-xs">{o.city || '—'}</td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-xs">{o.supplier_email || '—'}</td>
                  <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                  <td className="text-right text-xs">{nf(fee)}</td>
                  <td className="text-right text-xs">{nf(net)}</td>
                  <td>
                    {canEditStatus1 ? (
                      <select 
                        className="app-input !w-auto !py-1 !px-2 text-xs"
                        value={o.status || 'PENDIENTE'}
                        onChange={e => updateStatus1(o.id, e.target.value)}
                      >
                        {status1Opts.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className={`badge-status ${getStatusBadgeClass(o.status)}`}>{o.status}</span>
                    )}
                  </td>
                  <td>
                    {canEditFull ? (
                      <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.estado_retiro || ''}
                        onChange={e => updateRetiro(o.id, e.target.value)}>
                        {retiroOpts.map(s => <option key={s} value={s}>{s || '—'}</option>)}
                      </select>
                    ) : <span className="text-xs">{o.estado_retiro || '—'}</span>}
                  </td>
                  <td>
                    {canEditFull ? (
                      <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.status2 || '--'}
                        onChange={e => updateStatus2(o.id, e.target.value)}>
                        {state2Opts.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <span className="text-xs">{o.status2 || '—'}</span>}
                  </td>
                  {canManageRendicion && (
                    <td>
                      <div className="flex items-center gap-1">
                        {!isSettled && (o.status === 'ENTREGADO' || o.status === 'ENCOMIENDA ENTREGADA') && (
                          <button
                            onClick={() => markSingleRendido(o.id)}
                            className="nav-btn active !py-1 !px-2 text-[11px]"
                          >
                            RENDIDO
                          </button>
                        )}
                        {isSettled && (
                          <span className="text-xs font-bold" style={{ color: '#4ade80' }}>RENDIDO</span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={canManageRendicion ? 12 : 11} className="text-center text-muted-foreground py-8">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
