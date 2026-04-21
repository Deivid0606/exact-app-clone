import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function CommissionsView() {
  const { profile } = useAuth();
  const role = profile?.role;
  const myEmail = profile?.email || '';
  
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('PENDIENTE');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterProvider, setFilterProvider] = useState('');
  const [vendors, setVendors] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [commissionRequests, setCommissionRequests] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Cargar perfiles y productos
  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('email, name'),
      supabase.from('products').select('sku, provider_email'),
      supabase.from('commission_requests').select('*'),
    ]).then(([profilesRes, productsRes, requestsRes]) => {
      setVendors(profilesRes.data || []);
      setProviders(profilesRes.data || []);
      setProducts(productsRes.data || []);
      setCommissionRequests(requestsRes.data || []);
    });
  }, []);

  const loadCommissions = async () => {
    let query = supabase.from('orders').select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .in('status', ['ENTREGADO', 'ENCOMIENDA ENTREGADA'])
      .order('created_at', { ascending: false });

    if (role === 'VENDEDOR') {
      query = query.eq('created_by', profile?.email);
    }
    
    if (role === 'PROVEEDOR' && profile?.email) {
      query = query.ilike('provider_emails_list', `%${profile.email}%`);
    }

    const { data } = await query;
    setOrders(data || []);
  };

  useEffect(() => { loadCommissions(); }, []);

  const filtered = orders.filter(o => {
    if (filterStatus === 'PENDIENTE' && o.commission_paid) return false;
    if (filterStatus === 'PAGADO' && !o.commission_paid) return false;
    if (filterVendor && o.created_by?.toLowerCase() !== filterVendor.toLowerCase()) return false;
    if (role === 'ADMIN' && filterProvider && !(o.provider_emails_list || '').toLowerCase().includes(filterProvider.toLowerCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      return (o.customer_name || '').toLowerCase().includes(q) ||
        (o.phone || '').includes(q) ||
        (o.order_number || '').toLowerCase().includes(q);
    }
    return true;
  });

  // ✅ Calcular balances por PROVEEDOR (para VENDEDOR)
  const providerBalances = useMemo(() => {
    if (role !== 'VENDEDOR') return [];

    // Mapear SKU a proveedor
    const skuProvider: Record<string, string> = {};
    products.forEach(p => {
      if (p.sku && p.provider_email) {
        skuProvider[p.sku.trim()] = p.provider_email.toLowerCase().trim();
      }
    });

    // Agrupar por proveedor
    const map: Record<string, {
      provider: string;
      totalComision: number;      // Total de todos los pedidos entregados
      rendido: number;            // Total de pedidos con status2 = 'RENDIDO' y no pagados
      orderIds: string[];
    }> = {};

    filtered.forEach(o => {
      const commission = Number(o.commission_gs || 0);
      if (commission <= 0) return;

      const isRendido = o.status2 === 'RENDIDO' && !o.commission_paid;

      // Obtener proveedores del pedido
      const provSet = new Set<string>();
      try {
        const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
        items.forEach((it: any) => {
          const sku = String(it.sku || '').trim();
          const prov = skuProvider[sku];
          if (prov) provSet.add(prov);
        });
      } catch {}

      if (provSet.size === 0 && o.provider_emails_list) {
        o.provider_emails_list.split(',').forEach((e: string) => {
          const t = e.trim().toLowerCase();
          if (t) provSet.add(t);
        });
      }

      if (provSet.size === 0) return;
      
      // Distribuir comisión entre proveedores
      const perProv = commission / provSet.size;
      
      provSet.forEach(prov => {
        if (!map[prov]) {
          map[prov] = { provider: prov, totalComision: 0, rendido: 0, orderIds: [] };
        }
        map[prov].totalComision += perProv;
        if (isRendido) {
          map[prov].rendido += perProv;
          if (!map[prov].orderIds.includes(o.id)) {
            map[prov].orderIds.push(o.id);
          }
        }
      });
    });

    // Calcular lo ya solicitado a cada proveedor
    const yaSolicitado: Record<string, number> = {};
    commissionRequests.forEach(req => {
      if (req.vendor_email?.toLowerCase() === myEmail.toLowerCase() && 
          (req.status === 'PENDIENTE' || req.status === 'APROBADO')) {
        const prov = (req.provider_email || '').toLowerCase();
        yaSolicitado[prov] = (yaSolicitado[prov] || 0) + Number(req.amount_gs || 0);
      }
    });

    // Retornar array con todos los datos
    return Object.values(map).map(b => ({
      ...b,
      yaSolicitado: yaSolicitado[b.provider] || 0,
      disponible: Math.max(0, b.rendido - (yaSolicitado[b.provider] || 0)),
    })).filter(b => b.totalComision > 0);
  }, [filtered, products, commissionRequests, myEmail, role]);

  // ✅ KPIs generales
  const totalEntregado = filtered.reduce((s, o) => s + Number(o.commission_gs || 0), 0);
  const totalSolicitado = providerBalances.reduce((s, b) => s + b.yaSolicitado, 0);
  const totalDisponible = providerBalances.reduce((s, b) => s + b.disponible, 0);
  
  // Suma comisión neta = Total entregado - Total ya solicitado (pendiente + aprobado)
  const sumaComisionNeta = totalEntregado - totalSolicitado;
  const saldoDisponible = totalDisponible;

  const togglePaid = async (orderId: string, paid: boolean) => {
    const { error } = await supabase.from('orders').update({
      commission_paid: paid,
      paid_at: paid ? new Date().toISOString() : null,
    }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success(paid ? 'Marcado como PAGADO' : 'Desmarcado'); loadCommissions(); }
  };

  const markAllPaid = async () => {
    const pending = filtered.filter(o => !o.commission_paid);
    for (const o of pending) {
      await supabase.from('orders').update({ commission_paid: true, paid_at: new Date().toISOString() }).eq('id', o.id);
    }
    toast.success(`${pending.length} comisiones marcadas como PAGADO`);
    loadCommissions();
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">
        {role === 'VENDEDOR' ? '💰 Mis Comisiones' : role === 'PROVEEDOR' ? '💰 Comisiones a Pagar' : '💰 Pago de comisiones'}
      </h3>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        
        {(role === 'ADMIN' || role === 'PROVEEDOR') && (
          <select className="app-input !w-auto min-w-[200px]" value={filterVendor} onChange={e => setFilterVendor(e.target.value)}>
            <option value="">Todos los vendedores</option>
            {vendors.map(v => <option key={v.email} value={v.email}>{v.name || v.email}</option>)}
          </select>
        )}
        
        {role === 'ADMIN' && (
          <select className="app-input !w-auto min-w-[200px]" value={filterProvider} onChange={e => setFilterProvider(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {providers.map(p => <option key={p.email} value={p.email}>{p.name || p.email}</option>)}
          </select>
        )}
        
        <select className="app-input !w-auto min-w-[160px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PAGADO">Pagado</option>
          {role === 'ADMIN' && <option value="">Todos</option>}
        </select>
        
        <input className="app-input !w-auto min-w-[240px]" placeholder="🔎 Buscar por cliente, teléfono o ID"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active" onClick={loadCommissions}>Aplicar</button>
      </div>

      {(role === 'ADMIN') && (
        <div className="mb-3">
          <button className="nav-btn active text-xs" onClick={markAllPaid}>Marcar todos como PAGADO (vista actual)</button>
        </div>
      )}

      {/* KPIs GENERALES */}
      <div className="grid-kpi mb-4">
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1">Pedidos filtrados</div>
          <div className="text-[22px] font-extrabold">{filtered.length}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1">Suma comisión neta (Gs)</div>
          <div className="text-[22px] font-extrabold">{nf(sumaComisionNeta)}</div>
          <div className="text-[10px] text-muted-foreground">Total entregados - Solicitado</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1">Saldo disponible (Gs)</div>
          <div className="text-[22px] font-extrabold">{nf(saldoDisponible)}</div>
          <div className="text-[10px] text-muted-foreground">Solo pedidos en estado RENDIDO</div>
        </div>
      </div>

      {/* ✅ TABLA DE DESGLOSE POR PROVEEDOR (solo para VENDEDOR) */}
      {role === 'VENDEDOR' && providerBalances.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-sm mb-2">📊 Desglose por Proveedor</h4>
          <div className="overflow-auto">
            <table className="app-table text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left">Proveedor</th>
                  <th className="text-right">Comisión total (Gs)</th>
                  <th className="text-right">Rendido disponible (Gs)</th>
                  <th className="text-right">Ya solicitado (Gs)</th>
                  <th className="text-right">Disponible para solicitar (Gs)</th>
                </tr>
              </thead>
              <tbody>
                {providerBalances.map(b => {
                  const providerName = providers.find(p => p.email?.toLowerCase() === b.provider)?.name || b.provider;
                  return (
                    <tr key={b.provider}>
                      <td className="text-xs font-medium">{providerName}</td>
                      <td className="text-right text-xs">{nf(b.totalComision)}</td>
                      <td className="text-right text-xs text-green-600">{nf(b.rendido)}</td>
                      <td className="text-right text-xs text-orange-600">{nf(b.yaSolicitado)}</td>
                      <td className="text-right text-xs font-bold text-blue-600">{nf(b.disponible)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr>
                  <td className="font-bold">TOTAL</td>
                  <td className="text-right font-bold">{nf(totalEntregado)}</td>
                  <td className="text-right font-bold">{nf(totalDisponible)}</td>
                  <td className="text-right font-bold">{nf(totalSolicitado)}</td>
                  <td className="text-right font-bold">{nf(sumaComisionNeta)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tabla de pedidos */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1000px]">
          <thead>
            <tr>
              <th>Fecha</th><th>ID</th><th>Ciudad</th><th>Cliente</th><th>Vendedor</th><th>Delivery</th>
              <th className="text-right">Total (Gs)</th><th className="text-right">Comisión (Gs)</th><th>Estado 1</th><th>Status2</th><th>Pago</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.city}</td>
                <td className="text-xs">{o.customer_name}</td>
                <td className="text-xs">{o.created_by}</td>
                <td className="text-xs">{o.assigned_delivery || '—'}</td>
                <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                <td className="text-right text-xs">{nf(Number(o.commission_gs || 0))}</td>
                <td><span className="badge-status badge-entregado">{o.status}</span></td>
                <td>
                  <span className={`badge-status ${o.status2 === 'RENDIDO' ? 'badge-entregado' : 'badge-pendiente'}`}>
                    {o.status2 || 'PENDIENTE'}
                  </span>
                </td>
                <td>
                  {(role === 'ADMIN') ? (
                    <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.commission_paid ? 'PAGADO' : 'PENDIENTE'}
                      onChange={e => togglePaid(o.id, e.target.value === 'PAGADO')}>
                      <option value="PENDIENTE">PENDIENTE</option>
                      <option value="PAGADO">PAGADO</option>
                    </select>
                  ) : (
                    <span className={`badge-status ${o.commission_paid ? 'badge-entregado' : 'badge-pendiente'}`}>
                      {o.commission_paid ? 'PAGADO' : 'PENDIENTE'}
                    </span>
                  )}
                </td>
               </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center text-muted-foreground py-8">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
