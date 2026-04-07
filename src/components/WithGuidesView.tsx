import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function WithGuidesView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [guideText, setGuideText] = useState('');
  const [guideId, setGuideId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = async () => {
    const { data } = await supabase.from('orders').select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(500);
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
  const withGuides = filtered.filter(o => o.status2 === 'GUIA GENERADA');

  const state2Opts = ['--', 'GUIA GENERADA', 'FUERA DE COBERTURA', 'CANCELADO', 'REPETIDO', 'RENDIDO'];

  const updateStatus2 = async (orderId: string, status2: string) => {
    const val = status2 === '--' ? null : status2;
    const { error } = await supabase.from('orders').update({ status2: val, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success('Estado 2 actualizado'); setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status2: val } : o)); }
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
        `📋 Proveedor: ${o.provider_emails_list || '—'}`,
      ].filter(Boolean).join('\n');

      setGuideText(text);
      setGuideId(o.order_number || o.id.slice(0, 8));
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

  const bulkCopyGuides = () => {
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

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos con guías</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1">Guías pendientes</div>
          <div className="text-[22px] font-extrabold">{pendingGuides.length}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1">Con guía generada</div>
          <div className="text-[22px] font-extrabold">{withGuides.length}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1">Total en rango</div>
          <div className="text-[22px] font-extrabold">{filtered.length}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1">Seleccionados</div>
          <div className="text-[22px] font-extrabold">{selectedIds.size}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <input className="app-input flex-1 min-w-[250px]" placeholder="🔎 Buscar por cliente, teléfono, ID o ciudad"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active" onClick={load}>Filtrar</button>
        {selectedIds.size > 0 && (
          <button className="nav-btn" onClick={bulkCopyGuides}>📋 Copiar {selectedIds.size} guías</button>
        )}
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1200px]">
          <thead>
            <tr>
              <th className="!w-[40px] text-center">
                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={() => selectedIds.size === filtered.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(filtered.map(o => o.id)))} />
              </th>
              <th>Fecha</th><th>ID</th><th>Ciudad</th><th>Cliente</th><th>Teléfono</th>
              <th>Vendedor</th><th>Proveedor</th><th>Estado 2</th><th>Guía</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td className="text-center">
                  <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                </td>
                <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.city}</td>
                <td className="text-xs">{o.customer_name}</td>
                <td className="text-xs">{o.phone}</td>
                <td className="text-xs">{o.created_by}</td>
                <td className="text-xs">{o.provider_emails_list || '—'}</td>
                <td>
                  <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.status2 || '--'}
                    onChange={e => updateStatus2(o.id, e.target.value)}>
                    {state2Opts.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => generateGuide(o)} title="Ver guía">📄</button>
                    <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => { generateGuide(o); setTimeout(() => { navigator.clipboard.writeText(guideText); toast.success('Copiada'); }, 150); }} title="Copiar guía">📋</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={10} className="text-center text-muted-foreground py-8">Sin pedidos</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Guide Modal */}
      {guideText && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setGuideText('')}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold mb-3">📦 Guía — {guideId}</h4>
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
