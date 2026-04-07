import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const STATUS1_ALL = [
  'PENDIENTE', 'EN RUTA', 'ENTREGADO', 'ENCOMIENDA ENTREGADA',
  'CANCELADO', 'REAGENDADO', 'NO CONTESTA', 'RECHAZADO',
  'RECHAZADO EN EL LUGAR', 'NO DESEA', 'CANCELÓ POR WHATSAPP', 'DEVUELTO A DEPÓSITO'
];
const STATUS1_DELIVERY = STATUS1_ALL.filter(s => s !== 'DEVUELTO A DEPÓSITO');
const STATUS2_ALL = ['--', 'GUIA GENERADA', 'FUERA DE COBERTURA', 'CANCELADO', 'REPETIDO', 'RENDIDO'];

interface EditOrder {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  street: string;
  district: string;
  email: string;
  obs: string;
  assigned_at: string;
}

export default function OrdersView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const myEmail = profile?.email || '';

  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 22);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [editOrder, setEditOrder] = useState<EditOrder | null>(null);
  const [guideText, setGuideText] = useState('');
  const [guideOrderId, setGuideOrderId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadOrders = async () => {
    setLoading(true);
    const dateField = role === 'DELIVERY' ? 'assigned_at' : 'created_at';
    const [ordersRes, deliveriesRes] = await Promise.all([
      supabase.from('orders').select('*')
        .gte('created_at', dateFrom + 'T00:00:00')
        .lte('created_at', dateTo + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('profiles').select('email, name, user_id').then(async (profilesRes) => {
        const profiles = profilesRes.data || [];
        const { data: roles } = await supabase.from('user_roles').select('user_id, role').eq('role', 'DELIVERY');
        const deliveryUserIds = new Set((roles || []).map(r => r.user_id));
        return profiles.filter(p => deliveryUserIds.has(p.user_id));
      })
    ]);
    setOrders(ordersRes.data || []);
    setDeliveries(deliveriesRes);
    setLoading(false);
    // Load cities for dropdown
    supabase.from('client_prices').select('*').order('city').then(({ data }) => setClientPrices(data || []));
  };

  useEffect(() => { loadOrders(); }, []);

  const filtered = useMemo(() => {
    const q = norm(search);
    return orders.filter(o => {
      // Role filter
      if (role === 'VENDEDOR' && norm(o.created_by || '') !== norm(myEmail)) return false;
      if (role === 'DELIVERY' && norm(o.assigned_delivery || '') !== norm(myEmail)) return false;

      // Status filter
      if (statusFilter && (o.status || 'PENDIENTE') !== statusFilter) return false;

      // Search
      if (q) {
        const idNum = String(o.order_number || o.id || '').replace(/^[a-z]+/i, '');
        const hay = [o.customer_name, o.phone, o.order_number, o.id, idNum, o.city, o.created_by, o.assigned_delivery].map(norm).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter, role, myEmail]);

  const postNews = async (message: string, orderNum: string) => {
    await supabase.from('news').insert({
      message, order_id: orderNum, actor_email: myEmail, role_scope: role,
    });
  };

  const handleStatus1Change = async (orderId: string, newStatus: string) => {
    if (role === 'DELIVERY' && newStatus === 'DEVUELTO A DEPÓSITO') {
      toast.error('No podés usar DEVUELTO A DEPÓSITO');
      return;
    }
    const order = orders.find(o => o.id === orderId);
    const orderNum = order?.order_number || orderId.slice(0, 8);
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'ENTREGADO' || newStatus === 'ENCOMIENDA ENTREGADA') {
      updates.delivered_at = new Date().toISOString();
    }
    const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Estado → ${newStatus}`);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
    postNews(`Pedido ${orderNum} cambió a ${newStatus} por ${myEmail}`, orderNum);
  };

  const handleStatus2Change = async (orderId: string, newStatus2: string) => {
    const val = newStatus2 === '--' ? null : newStatus2;
    const order = orders.find(o => o.id === orderId);
    const orderNum = order?.order_number || orderId.slice(0, 8);
    const { error } = await supabase.from('orders').update({ status2: val, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Estado 2 → ${newStatus2}`);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status2: val } : o));
    if (val) postNews(`Pedido ${orderNum} estado 2 → ${val}`, orderNum);
  };

  const handleAssignDelivery = async (orderId: string, deliveryEmail: string) => {
    const order = orders.find(o => o.id === orderId);
    const orderNum = order?.order_number || orderId.slice(0, 8);
    const updates: any = {
      assigned_delivery: deliveryEmail || null,
      assigned_at: deliveryEmail ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    if (deliveryEmail) updates.status = 'EN RUTA';
    const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(deliveryEmail ? `Asignado a ${deliveryEmail}` : 'Delivery removido');
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
    if (deliveryEmail) postNews(`${myEmail} asignó pedido ${orderNum} a ${deliveryEmail}`, orderNum);
  };

  const openEdit = (o: any) => {
    setEditOrder({
      id: o.id,
      customer_name: o.customer_name || '',
      phone: o.phone || '',
      city: o.city || '',
      street: o.street || '',
      district: o.district || '',
      email: o.email || '',
      obs: o.obs || '',
      assigned_at: o.assigned_at ? new Date(o.assigned_at).toISOString().slice(0, 16) : '',
    });
  };

  const saveEdit = async () => {
    if (!editOrder) return;
    if (!editOrder.customer_name || !editOrder.phone || !editOrder.city) {
      toast.error('Cliente, teléfono y ciudad son obligatorios');
      return;
    }
    const { id, assigned_at, ...data } = editOrder;
    const updates: any = { ...data, updated_at: new Date().toISOString() };
    if (assigned_at) updates.assigned_at = new Date(assigned_at).toISOString();
    const { error } = await supabase.from('orders').update(updates).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Pedido actualizado');
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
    setEditOrder(null);
  };

  const deleteOrder = async (orderId: string) => {
    // Only admin can really delete; we just set status to CANCELADO
    const { error } = await supabase.from('orders').update({ status: 'CANCELADO', updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success('Pedido cancelado');
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'CANCELADO' } : o));
  };

  const generateGuide = (o: any) => {
    try {
      const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
      const itemsText = items.map((it: any, i: number) =>
        `${i + 1}. ${it.title || it.sku || 'Item'} x${it.qty || 1} — Gs ${nf(Number(it.sale_gs || 0) * Number(it.qty || 1))}`
      ).join('\n');

      const text = [
        `📦 GUÍA DE ENVÍO — ${o.order_number || o.id.slice(0, 8)}`,
        `━━━━━━━━━━━━━━━━━━`,
        `👤 Cliente: ${o.customer_name || ''}`,
        `📱 Teléfono: ${o.phone || ''}`,
        `📧 Email: ${o.email || ''}`,
        `🏙️ Ciudad: ${o.city || ''}`,
        `📍 Dirección: ${o.street || ''} ${o.district ? '- ' + o.district : ''}`,
        `━━━━━━━━━━━━━━━━━━`,
        `📝 Productos:`,
        itemsText,
        `━━━━━━━━━━━━━━━━━━`,
        `💰 Total: Gs ${nf(Number(o.total_gs || 0))}`,
        `🚚 Delivery: Gs ${nf(Number(o.delivery_gs || 0))}`,
        o.obs ? `📌 Obs: ${o.obs}` : '',
        `━━━━━━━━━━━━━━━━━━`,
        `👷 Vendedor: ${o.created_by || ''}`,
        `🛵 Delivery: ${o.assigned_delivery || 'Sin asignar'}`,
      ].filter(Boolean).join('\n');

      setGuideText(text);
      setGuideOrderId(o.order_number || o.id.slice(0, 8));
    } catch {
      toast.error('Error generando guía');
    }
  };

  const copyGuide = () => {
    navigator.clipboard.writeText(guideText);
    toast.success('Guía copiada al portapapeles');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(o => o.id)));
    }
  };

  const bulkGenerateGuides = () => {
    const selected = filtered.filter(o => selectedIds.has(o.id));
    if (selected.length === 0) { toast.error('Seleccioná pedidos primero'); return; }
    const allText = selected.map(o => {
      const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json || '[]') : (o.items_json || []);
      const itemsText = items.map((it: any, i: number) => `  ${i + 1}. ${it.title || it.sku} x${it.qty}`).join('\n');
      return `📦 ${o.order_number || o.id.slice(0, 8)} — ${o.customer_name} — ${o.city}\n📱 ${o.phone}\n📍 ${o.street || ''} ${o.district || ''}\n${itemsText}\n💰 Gs ${nf(Number(o.total_gs || 0))}\n${o.obs ? '📌 ' + o.obs : ''}`;
    }).join('\n\n════════════════════\n\n');
    navigator.clipboard.writeText(allText);
    toast.success(`${selected.length} guías copiadas`);
  };

  const statusClass = (s: string) => {
    if (s === 'ENTREGADO' || s === 'ENCOMIENDA ENTREGADA') return 'badge-entregado';
    if (['CANCELADO', 'RECHAZADO', 'RECHAZADO EN EL LUGAR', 'NO DESEA', 'CANCELÓ POR WHATSAPP'].includes(s)) return 'badge-cancelado';
    if (s === 'EN RUTA') return 'badge-entregado';
    return 'badge-pendiente';
  };

  const canEditStatus1 = role !== 'VENDEDOR';
  const canEditStatus2 = role === 'ADMIN' || role === 'DESPACHANTE' || role === 'PROVEEDOR';
  const canAssign = role === 'ADMIN' || role === 'PROVEEDOR';
  const canEdit = role === 'ADMIN' || role === 'DESPACHANTE' || role === 'PROVEEDOR';

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos</h3>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <select className="app-input !w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {STATUS1_ALL.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="app-input !w-auto min-w-[250px] flex-1" placeholder="🔎 Buscar por cliente, teléfono, ID o ciudad"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active" onClick={loadOrders} disabled={loading}>Filtrar</button>
        {selectedIds.size > 0 && (
          <button className="nav-btn" onClick={bulkGenerateGuides}>📋 Copiar {selectedIds.size} guías</button>
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-2">{filtered.length} pedidos</div>

      {/* Table */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1400px]">
          <thead>
            <tr>
              <th className="!w-[40px] text-center">
                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll} title="Seleccionar todos" />
              </th>
              <th>Fecha</th>
              <th>ID</th>
              <th>Ciudad</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              {role !== 'DESPACHANTE' && <th>Delivery</th>}
              <th className="text-right">Total (Gs)</th>
              <th className="text-right">{role === 'DELIVERY' ? 'Tarifa (Gs)' : 'Comisión (Gs)'}</th>
              <th>Estado 1</th>
              {role !== 'DELIVERY' && <th>Estado 2</th>}
              {canAssign && <th>Asignar</th>}
              <th>Guía</th>
              {canEdit && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={15} className="text-center text-muted-foreground py-8">Sin pedidos</td></tr>
            )}
            {filtered.map(o => {
              const feeStored = Number(o.delivery_fee_gs || 0);
              const commVal = role === 'DELIVERY' ? feeStored : Number(o.commission_gs || 0);
              const dateShown = (role === 'DELIVERY' && o.assigned_at)
                ? new Date(o.assigned_at).toLocaleString('es-PY')
                : new Date(o.created_at).toLocaleString('es-PY');

              return (
                <tr key={o.id}>
                  <td className="text-center">
                    <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                  </td>
                  <td className="whitespace-nowrap text-xs">{dateShown}</td>
                  <td className="font-bold text-xs">{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="text-xs">{o.city}</td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-xs">{o.created_by}</td>
                  {role !== 'DESPACHANTE' && <td className="text-xs">{o.assigned_delivery || '—'}</td>}
                  <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                  <td className="text-right text-xs">{nf(commVal)}</td>
                  <td>
                    {canEditStatus1 ? (
                      <select
                        className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[130px]"
                        value={o.status || 'PENDIENTE'}
                        onChange={e => handleStatus1Change(o.id, e.target.value)}
                      >
                        {(role === 'DELIVERY' ? STATUS1_DELIVERY : STATUS1_ALL).map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge-status ${statusClass(o.status || '')}`}>{o.status || 'PENDIENTE'}</span>
                    )}
                  </td>
                  {role !== 'DELIVERY' && (
                    <td>
                      {canEditStatus2 ? (
                        <select
                          className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[120px]"
                          value={o.status2 || '--'}
                          onChange={e => handleStatus2Change(o.id, e.target.value)}
                        >
                          {STATUS2_ALL.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{o.status2 || '—'}</span>
                      )}
                    </td>
                  )}
                  {canAssign && (
                    <td>
                      <select
                        className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[140px]"
                        value={o.assigned_delivery || ''}
                        onChange={e => handleAssignDelivery(o.id, e.target.value)}
                      >
                        <option value="">-- Sin asignar --</option>
                        {deliveries.map(d => (
                          <option key={d.email} value={d.email}>{d.name || d.email}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td>
                    <div className="flex gap-1">
                      <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => generateGuide(o)} title="Ver guía">📄</button>
                      <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => { generateGuide(o); setTimeout(copyGuide, 100); }} title="Copiar guía">📋</button>
                    </div>
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex gap-1">
                        <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => openEdit(o)}>Editar</button>
                        <button className="nav-btn !px-2 !py-1 !text-[10px] !bg-destructive/20 hover:!bg-destructive/40" onClick={() => { if (confirm('¿Cancelar este pedido?')) deleteOrder(o.id); }}>Cancelar</button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Order Modal */}
      {editOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditOrder(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg space-y-3" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold">Editar Pedido</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="app-label">Cliente *</label>
                <input className="app-input" value={editOrder.customer_name} onChange={e => setEditOrder({ ...editOrder, customer_name: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Teléfono *</label>
                <input className="app-input" value={editOrder.phone} onChange={e => setEditOrder({ ...editOrder, phone: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Ciudad *</label>
                <input className="app-input" value={editOrder.city} onChange={e => setEditOrder({ ...editOrder, city: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Calle</label>
                <input className="app-input" value={editOrder.street} onChange={e => setEditOrder({ ...editOrder, street: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Barrio</label>
                <input className="app-input" value={editOrder.district} onChange={e => setEditOrder({ ...editOrder, district: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Email</label>
                <input className="app-input" value={editOrder.email} onChange={e => setEditOrder({ ...editOrder, email: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="app-label">Observaciones</label>
              <textarea className="app-input min-h-[60px]" value={editOrder.obs} onChange={e => setEditOrder({ ...editOrder, obs: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="nav-btn" onClick={() => setEditOrder(null)}>Cancelar</button>
              <button className="nav-btn active" onClick={saveEdit}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {guideText && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setGuideText('')}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold mb-3">📦 Guía — {guideOrderId}</h4>
            <pre className="text-xs whitespace-pre-wrap bg-background p-4 rounded-xl border border-border max-h-[400px] overflow-auto">{guideText}</pre>
            <div className="flex gap-2 justify-end mt-4">
              <button className="nav-btn" onClick={() => setGuideText('')}>Cerrar</button>
              <button className="nav-btn active" onClick={copyGuide}>📋 Copiar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
