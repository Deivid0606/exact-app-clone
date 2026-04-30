import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function CommissionRequestsView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const myEmail = profile?.email || '';

  const [requests, setRequests] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [providers, setProviders] = useState<{ email: string; name: string }[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [newProvider, setNewProvider] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newFrom, setNewFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [newTo, setNewTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = async () => {
    const [reqRes, profRes, prodRes] = await Promise.all([
      supabase.from('commission_requests').select('*').order('requested_at', { ascending: false }),
      supabase.from('profiles').select('email, name'),
      supabase.from('products').select('sku, provider_email, provider_price_gs, real_cost_gs'),
    ]);
    setRequests(reqRes.data || []);
    setProviders((profRes.data || []).map(p => ({ email: p.email, name: p.name || p.email })));
    setProducts(prodRes.data || []);
  };

  useEffect(() => { load(); }, []);

  // ✅ VERSIÓN CORREGIDA - Igual que el Dashboard, sin filtrar por payment_status
  const loadBalanceOrders = async () => {
    const { data } = await supabase.from('orders').select('*')
      .gte('created_at', newFrom + 'T00:00:00')
      .lte('created_at', newTo + 'T23:59:59')
      .eq('created_by', myEmail);
    
    console.log('📦 Pedidos encontrados:', data?.length);
    setOrders(data || []);
  };

  useEffect(() => { 
    if (showForm && role === 'VENDEDOR') loadBalanceOrders(); 
  }, [showForm, newFrom, newTo]);

  // ✅ LÓGICA CORREGIDA - Igual que el Dashboard
  const balances = useMemo(() => {
    const skuProvider: Record<string, string> = {};
    products.forEach(p => {
      if (p.sku && p.provider_email) {
        skuProvider[p.sku.trim()] = p.provider_email.toLowerCase().trim();
      }
    });

    const map: Record<string, { provider: string; gross: number; grossRendido: number; orderIds: string[] }> = {};
    orders.forEach(o => {
      const commission = Number(o.commission_gs || 0);
      if (commission <= 0) return;

      // ✅ Solo los que están RENDIDOS cuentan como "disponibles"
      const isRendido = o.status2 === 'RENDIDO';

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

      const provArr = Array.from(provSet);
      if (provArr.length === 0) return;
      const perProv = commission / provArr.length;

      provArr.forEach(prov => {
        if (!map[prov]) map[prov] = { provider: prov, gross: 0, grossRendido: 0, orderIds: [] };
        map[prov].gross += perProv;
        if (isRendido) map[prov].grossRendido += perProv;
        if (!map[prov].orderIds.includes(o.id)) map[prov].orderIds.push(o.id);
      });
    });

    const requested: Record<string, number> = {};
    requests.forEach(r => {
      if (r.vendor_email?.toLowerCase() === myEmail.toLowerCase() && r.status !== 'RECHAZADO') {
        const prov = (r.provider_email || '').toLowerCase();
        requested[prov] = (requested[prov] || 0) + Number(r.amount_gs || 0);
      }
    });

    return Object.values(map).map(b => ({
      ...b,
      requested: requested[b.provider] || 0,
      available: Math.max(0, b.grossRendido - (requested[b.provider] || 0)),
    }));
  }, [orders, products, requests, myEmail]);

  const filtered = requests.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (role === 'VENDEDOR' && r.vendor_email?.toLowerCase() !== myEmail.toLowerCase()) return false;
    if (role === 'PROVEEDOR' && r.provider_email?.toLowerCase() !== myEmail.toLowerCase()) return false;
    return true;
  });

  const kpis = useMemo(() => ({
    total: filtered.length,
    pendientes: filtered.filter(r => r.status === 'PENDIENTE').length,
    aprobados: filtered.filter(r => r.status === 'APROBADO').length,
    sumAprobados: filtered.filter(r => r.status === 'APROBADO').reduce((s, r) => s + Number(r.amount_gs || 0), 0),
    sumPendientes: filtered.filter(r => r.status === 'PENDIENTE').reduce((s, r) => s + Number(r.amount_gs || 0), 0),
  }), [filtered]);

  const createRequest = async () => {
    if (!newProvider) { toast.error('Elegí un proveedor'); return; }
    const balance = balances.find(b => b.provider === newProvider);
    const available = balance?.available || 0;
    if (available <= 0) { toast.error('No tenés saldo disponible para este proveedor'); return; }

    const { error } = await supabase.from('commission_requests').insert({
      vendor_email: myEmail,
      provider_email: newProvider,
      amount_gs: available,
      note: newNote,
      range_from: newFrom,
      range_to: newTo,
      requested_by: myEmail,
      status: 'PENDIENTE',
      meta_json: { order_ids: balance?.orderIds || [], gross: balance?.gross || 0 },
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Solicitud creada por Gs ${nf(available)}`);
    setShowForm(false);
    setNewProvider('');
    setNewNote('');
    load();
  };

  const approve = async (id: string) => {
    const note = prompt('Nota de aprobación (opcional):') || '';
    
    const { data: requestData, error: fetchError } = await supabase
      .from('commission_requests')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !requestData) {
      toast.error('No se pudo obtener la solicitud');
      return;
    }
    
    const metaJson = requestData.meta_json as any;
    const orderIds = metaJson?.order_ids || [];
    
    const { error: updateError } = await supabase
      .from('commission_requests')
      .update({
        status: 'APROBADO',
        approved_at: new Date().toISOString(),
        approved_by: myEmail,
        approval_note: note,
      })
      .eq('id', id);
    
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    
    if (orderIds.length > 0) {
      const { error: ordersError } = await supabase
        .from('orders')
        .update({
          payment_status: 'PAGADO',
          paid_at: new Date().toISOString(),
        })
        .in('id', orderIds);
      
      if (ordersError) {
        toast.error(`Error al marcar órdenes: ${ordersError.message}`);
      } else {
        toast.success(`Solicitud aprobada y ${orderIds.length} comisión(es) marcada(s) como PAGADO`);
      }
    } else {
      toast.success('Solicitud aprobada (sin órdenes asociadas)');
    }
    
    load();
  };

  const reject = async (id: string) => {
    const note = prompt('Motivo del rechazo:') || '';
    const { error } = await supabase.from('commission_requests').update({
      status: 'RECHAZADO', rejected_at: new Date().toISOString(),
      rejected_by: myEmail, approval_note: note,
    }).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Solicitud rechazada'); load(); }
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Solicitud de comisiones</h3>

      <div className="grid-kpi mb-4">
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Total solicitudes</div><div className="text-[22px] font-extrabold">{kpis.total}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Pendientes</div><div className="text-[22px] font-extrabold">{kpis.pendientes}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.sumPendientes)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Aprobados</div><div className="text-[22px] font-extrabold">{kpis.aprobados}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.sumAprobados)}</div></div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <select className="app-input !w-auto min-w-[180px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todas</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="APROBADO">Aprobadas</option>
          <option value="RECHAZADO">Rechazadas</option>
        </select>
        <button className="nav-btn active" onClick={load}>Actualizar</button>
        {role === 'VENDEDOR' && (
          <button className="nav-btn active" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : '+ Nueva solicitud'}
          </button>
        )}
      </div>

      {showForm && role === 'VENDEDOR' && (
        <div className="app-card !p-4 mb-4">
          <h4 className="font-bold mb-3">Nueva solicitud de comisión</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="app-label">Desde</label>
              <input type="date" className="app-input" value={newFrom} onChange={e => setNewFrom(e.target.value)} />
            </div>
            <div>
              <label className="app-label">Hasta</label>
              <input type="date" className="app-input" value={newTo} onChange={e => setNewTo(e.target.value)} />
            </div>
            <div>
              <label className="app-label">Proveedor</label>
              <select className="app-input" value={newProvider} onChange={e => { setNewProvider(e.target.value); }}>
                <option value="">-- Elegir --</option>
                {balances.map(b => {
                  const providerName = providers.find(p => p.email.toLowerCase() === b.provider)?.name || b.provider;
                  return (
                    <option key={b.provider} value={b.provider}>
                      {providerName} — Disponible: Gs {nf(b.available)}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          {newProvider && (() => {
            const bal = balances.find(b => b.provider === newProvider);
            return (
              <div className="mb-3 p-3 rounded-xl border border-border bg-secondary/50">
                <div className="text-xs text-muted-foreground">
                  Comisión total: Gs {nf(bal?.gross || 0)} |
                  Rendido: Gs {nf(bal?.grossRendido || 0)} |
                  Ya solicitado: Gs {nf(bal?.requested || 0)}
                </div>
                <div className="text-sm font-bold text-foreground mt-1">
                  Disponible para solicitar: Gs {nf(bal?.available || 0)}
                </div>
              </div>
            );
          })()}
          <div className="mb-3">
            <label className="app-label">Nota (opcional)</label>
            <input className="app-input" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Nota para el proveedor" />
          </div>
          <button className="nav-btn active" onClick={createRequest}>Enviar solicitud</button>
        </div>
      )}

      <div className="overflow-auto">
        <table className="app-table">
          <thead>
            <tr>
              <th>Fecha</th><th>Vendedor</th><th>Proveedor</th>
              <th className="text-right">Monto (Gs)</th><th>Rango</th><th>Nota</th><th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="text-xs whitespace-nowrap">{r.requested_at ? new Date(r.requested_at).toLocaleDateString('es-PY') : ''}</td>
                <td className="text-xs">{r.vendor_email}</td>
                <td className="text-xs">{r.provider_email}</td>
                <td className="text-right text-xs font-bold">{nf(Number(r.amount_gs || 0))}</td>
                <td className="text-xs whitespace-nowrap">{r.range_from} — {r.range_to}</td>
                <td className="text-xs max-w-[200px] truncate">{r.note || r.approval_note || '—'}</td>
                <td>
                  <span className={`badge-status ${r.status === 'APROBADO' ? 'badge-entregado' : r.status === 'RECHAZADO' ? 'badge-cancelado' : 'badge-pendiente'}`}>
                    {r.status}
                  </span>
                </td>
                <td>
                  {r.status === 'PENDIENTE' && (role === 'ADMIN' || role === 'PROVEEDOR') && (
                    <div className="flex gap-1">
                      <button className="nav-btn active text-xs !py-1 !px-2" onClick={() => approve(r.id)}>✅ Aprobar</button>
                      <button className="nav-btn text-xs !py-1 !px-2" onClick={() => reject(r.id)}>❌ Rechazar</button>
                    </div>
                  )}
                  {r.status !== 'PENDIENTE' && (
                    <span className="text-[10px] text-muted-foreground">{r.approved_by || r.rejected_by || ''}</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Sin solicitudes</td>}</tbody>
        </table>
      </div>
    </div>
  );
}
