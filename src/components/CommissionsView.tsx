import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function CommissionsView() {
  const { profile } = useAuth();
  const role = profile?.role;
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('PENDIENTE');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterProvider, setFilterProvider] = useState('');
  const [vendors, setVendors] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    supabase.from('profiles').select('email, name').then(({ data }) => {
      setVendors(data || []);
      setProviders(data || []);
    });
  }, []);

  const loadCommissions = async () => {
    let query = supabase.from('orders').select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .in('status', ['ENTREGADO', 'ENCOMIENDA ENTREGADA'])
      .order('created_at', { ascending: false });

    // Filtrar por vendedor
    if (role === 'VENDEDOR') {
      query = query.eq('created_by', profile?.email);
    }
    
    // Filtrar por proveedor (solo ve sus propias comisiones)
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

  const kpis = {
    count: filtered.length,
    sum: filtered.reduce((s, o) => s + Number(o.commission_gs || 0), 0),
    available: filtered.filter(o => !o.commission_paid && o.status2 === 'RENDIDO').reduce((s, o) => s + Number(o.commission_gs || 0), 0),
  };

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
        {role === 'VENDEDOR' ? '💰 Mis Comisiones' : 'Pago de comisiones'}
      </h3>

      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        
        {/* Filtro de vendedor: ADMIN y PROVEEDOR lo ven */}
        {(role === 'ADMIN' || role === 'PROVEEDOR') && (
          <select className="app-input !w-auto min-w-[200px]" value={filterVendor} onChange={e => setFilterVendor(e.target.value)}>
            <option value="">Todos los vendedores</option>
            {vendors.map(v => <option key={v.email} value={v.email}>{v.name || v.email}</option>)}
          </select>
        )}
        
        {/* Filtro de proveedor: solo ADMIN lo ve */}
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

      <div className="grid-kpi mb-4">
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Pedidos filtrados</div><div className="text-[22px] font-extrabold">{kpis.count}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Suma comisión neta (Gs)</div><div className="text-[22px] font-extrabold">{nf(kpis.sum)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Saldo disponible (Gs)</div><div className="text-[22px] font-extrabold">{nf(kpis.available)}</div></div>
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1000px]">
          <thead>
            <tr>
              <th>Fecha</th><th>ID</th><th>Ciudad</th><th>Cliente</th><th>Vendedor</th><th>Delivery</th>
              <th className="text-right">Total (Gs)</th><th className="text-right">Comisión (Gs)</th><th>Estado 1</th><th>Pago</th>
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
            {filtered.length === 0 && <tr><td colSpan={10} className="text-center text-muted-foreground py-8">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
