import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function AssignOrdersView() {
  const { profile } = useAuth();
  const role = profile?.role;
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignDelivery, setAssignDelivery] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [idsInput, setIdsInput] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('email, name').then(({ data }) => setDeliveries(data || []));
  }, []);

  const load = async () => {
    const { data } = await supabase.from('orders').select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(300);
    setOrders(data || []);
  };

  useEffect(() => { load(); }, []);

  const filtered = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (o.customer_name || '').toLowerCase().includes(q) ||
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.city || '').toLowerCase().includes(q);
  });

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const assignSelected = async () => {
    if (!assignDelivery) { toast.error('Selecciona un delivery'); return; }
    for (const id of selected) {
      await supabase.from('orders').update({ assigned_delivery: assignDelivery, assigned_at: new Date().toISOString() }).eq('id', id);
    }
    toast.success(`${selected.size} pedidos asignados`);
    setSelected(new Set());
    load();
  };

  const assignByIds = async () => {
    if (!assignDelivery && role !== 'DELIVERY') { toast.error('Selecciona un delivery'); return; }
    const deliveryEmail = role === 'DELIVERY' ? profile?.email : assignDelivery;
    const ids = idsInput.split(/[,\s\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    if (ids.length === 0) { toast.error('Ingresá al menos un ID'); return; }

    let count = 0;
    for (const id of ids) {
      const { data } = await supabase.from('orders').select('id').eq('order_number', id).limit(1);
      if (data && data[0]) {
        await supabase.from('orders').update({ assigned_delivery: deliveryEmail, assigned_at: new Date().toISOString() }).eq('id', data[0].id);
        count++;
      }
    }
    toast.success(`${count} pedidos asignados de ${ids.length}`);
    setIdsInput('');
    load();
  };

  const assignSingle = async (orderId: string, deliveryEmail: string) => {
    await supabase.from('orders').update({ assigned_delivery: deliveryEmail, assigned_at: new Date().toISOString() }).eq('id', orderId);
    toast.success('Delivery asignado');
    load();
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Asignar Pedidos</h3>

      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <input className="app-input flex-1 min-w-[200px]" placeholder="🔎 Buscar cliente, ID, ciudad..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active" onClick={load}>Filtrar</button>
      </div>

      {(role === 'ADMIN' || role === 'PROVEEDOR') && (
        <div className="flex flex-wrap gap-2 mb-3">
          <select className="app-input !w-auto min-w-[200px]" value={assignDelivery} onChange={e => setAssignDelivery(e.target.value)}>
            <option value="">Seleccionar delivery...</option>
            {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
          </select>
          <button className="nav-btn active" onClick={assignSelected} disabled={selected.size === 0}>
            Asignar seleccionados ({selected.size})
          </button>
        </div>
      )}

      {/* Assign by IDs */}
      <div className="app-card !p-3 mb-3">
        <div className="flex justify-between items-center mb-2">
          <b className="text-sm">Asignar por IDs manualmente</b>
          <span className="chip text-[10px]">Máximo 35 IDs por carga</span>
        </div>
        {role !== 'DELIVERY' && (
          <select className="app-input !w-auto min-w-[200px] mb-2" value={assignDelivery} onChange={e => setAssignDelivery(e.target.value)}>
            <option value="">Seleccionar delivery...</option>
            {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
          </select>
        )}
        <textarea className="app-input mb-2" rows={3} placeholder="Ejemplo: A4800,A4599,A4601"
          value={idsInput} onChange={e => setIdsInput(e.target.value)} />
        <p className="text-xs text-muted-foreground mb-2">Podés separar por coma, espacio o salto de línea.</p>
        <button className="nav-btn active text-xs" onClick={assignByIds}>Asignar IDs masivamente</button>
      </div>

      <div className="overflow-auto">
        <table className="app-table">
          <thead>
            <tr>
              {(role === 'ADMIN' || role === 'PROVEEDOR') && <th><input type="checkbox" /></th>}
              <th>Fecha</th><th>ID</th><th>Ciudad</th><th>Cliente</th><th>Estado</th><th>Asignado a</th><th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                {(role === 'ADMIN' || role === 'PROVEEDOR') && (
                  <td><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} className="accent-brand" /></td>
                )}
                <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.city}</td>
                <td className="text-xs">{o.customer_name}</td>
                <td><span className={`badge-status ${o.status === 'ENTREGADO' ? 'badge-entregado' : o.status === 'CANCELADO' ? 'badge-cancelado' : 'badge-pendiente'}`}>{o.status}</span></td>
                <td className="text-xs">{o.assigned_delivery || '—'}</td>
                <td>
                  {(role === 'ADMIN' || role === 'PROVEEDOR') && (
                    <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.assigned_delivery || ''}
                      onChange={e => assignSingle(o.id, e.target.value)}>
                      <option value="">Sin asignar</option>
                      {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Sin pedidos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
