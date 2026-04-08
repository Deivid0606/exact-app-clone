import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
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

export default function GuidesView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const myEmail = profile?.email || '';

  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [guideText, setGuideText] = useState('');
  const [guideOrderId, setGuideOrderId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // 🔒 FILTRO DE PROVEEDOR - Fijo y bloqueado
  const [providerFilter, setProviderFilter] = useState(myEmail);
  
  // Para ADMIN/DESPACHANTE: lista de proveedores disponibles
  const [providersList, setProvidersList] = useState<{email: string, name: string}[]>([]);

  // Helper para parsear items_json
  function parseItemsJson(itemsJson: any): any[] {
    if (!itemsJson) return [];
    if (Array.isArray(itemsJson)) return itemsJson;
    if (typeof itemsJson === 'string') {
      try {
        const parsed = JSON.parse(itemsJson);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  // Helper para obtener SOLO los items del proveedor seleccionado
  function getProviderItems(items: any[], providerEmail: string): any[] {
    if (!providerEmail) return items;
    const normalizedProvider = norm(providerEmail);
    return items.filter((item: any) => {
      const itemProvider = item.provider_email || '';
      return norm(itemProvider) === normalizedProvider;
    });
  }

  const loadOrders = async () => {
    setLoading(true);
    
    // Construir consulta base
    let query = supabase.from('orders').select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })
      .limit(500);
    
    // 🔒 FILTRO PERMANENTE PARA PROVEEDOR
    if (role === 'PROVEEDOR') {
      // Solo pedidos donde aparece su email en provider_emails_list
      query = query.contains('provider_emails_list', [myEmail]);
    }
    
    const { data: ordersData, error } = await query;
    
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    
    let filteredOrders = ordersData || [];
    
    // 🔒 Si es PROVEEDOR, filtrar adicionalmente pedidos donde realmente tenga productos
    if (role === 'PROVEEDOR') {
      filteredOrders = filteredOrders.filter(order => {
        const items = parseItemsJson(order.items_json);
        const providerItems = getProviderItems(items, myEmail);
        return providerItems.length > 0;
      });
    }
    
    // 🔒 Si es ADMIN/DESPACHANTE y seleccionó un proveedor específico
    if ((role === 'ADMIN' || role === 'DESPACHANTE') && providerFilter) {
      filteredOrders = filteredOrders.filter(order => {
        const items = parseItemsJson(order.items_json);
        const providerItems = getProviderItems(items, providerFilter);
        return providerItems.length > 0;
      });
    }
    
    setOrders(filteredOrders);
    setLoading(false);
  };

  // Cargar lista de proveedores para ADMIN/DESPACHANTE
  const loadProviders = async () => {
    if (role === 'ADMIN' || role === 'DESPACHANTE') {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('role', 'PROVEEDOR');
      setProvidersList(profiles || []);
    }
  };

  useEffect(() => {
    loadOrders();
    loadProviders();
  }, [dateFrom, dateTo]);

  // Aplicar filtros de búsqueda y estado
  const filtered = useMemo(() => {
    const q = norm(search);
    return orders.filter(o => {
      // Filtro por estado
      if (statusFilter && (o.status || 'PENDIENTE') !== statusFilter) return false;

      // Búsqueda
      if (q) {
        const idNum = String(o.order_number || o.id || '').replace(/^[a-z]+/i, '');
        const hay = [o.customer_name, o.phone, o.order_number, o.id, idNum, o.city, o.created_by].map(norm).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter]);

  // Estadísticas
  const stats = useMemo(() => {
    const total = filtered.length;
    const pendingGuides = filtered.filter(o => !o.status2 || o.status2 !== 'GUIA GENERADA').length;
    const withGuide = filtered.filter(o => o.status2 === 'GUIA GENERADA').length;
    return { total, pendingGuides, withGuide };
  }, [filtered]);

  const handleStatus2Change = async (orderId: string, newStatus2: string) => {
    const val = newStatus2 === '--' ? null : newStatus2;
    const { error } = await supabase.from('orders').update({ status2: val, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Estado 2 → ${newStatus2}`);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status2: val } : o));
  };

  // Generar guía - SOLO items del proveedor seleccionado
  const generateGuide = (o: any) => {
    try {
      const allItems = parseItemsJson(o.items_json);
      const activeProvider = role === 'PROVEEDOR' ? myEmail : providerFilter;
      const providerItems = getProviderItems(allItems, activeProvider);
      
      if (providerItems.length === 0) {
        toast.error('Este pedido no contiene productos del proveedor seleccionado');
        return;
      }

      const itemsText = providerItems.map((it: any, i: number) =>
        `${i + 1}. ${it.title || it.sku || 'Item'} x${it.qty || 1} — Gs ${nf(Number(it.sale_gs || 0) * Number(it.qty || 1))}`
      ).join('\n');

      const filteredTotal = providerItems.reduce((sum, it) => sum + (Number(it.sale_gs || 0) * Number(it.qty || 1)), 0);

      const text = [
        `GUÍA DE ENVÍO — ${o.order_number || o.id.slice(0, 8)}`,
        `━━━━━━━━━━━━━━━━━━`,
        `Cliente: ${o.customer_name || ''}`,
        `Teléfono: ${o.phone || ''}`,
        `Email: ${o.email || ''}`,
        `Ciudad: ${o.city || ''}`,
        `Dirección: ${o.street || ''} ${o.district ? '- ' + o.district : ''}`,
        `━━━━━━━━━━━━━━━━━━`,
        `Productos:`,
        itemsText,
        `━━━━━━━━━━━━━━━━━━`,
        `Total: Gs ${nf(filteredTotal)}`,
        `Delivery: Gs ${nf(Number(o.delivery_gs || 0))}`,
        o.obs ? `Observación: ${o.obs}` : '',
        `━━━━━━━━━━━━━━━━━━`,
        `Proveedor: ${activeProvider}`,
        `Vendedor: ${o.created_by || ''}`,
        `Delivery: ${o.assigned_delivery || 'Sin asignar'}`,
      ].filter(Boolean).join('\n');

      setGuideText(text);
      setGuideOrderId(o.order_number || o.id.slice(0, 8));
    } catch (error) {
      console.error('Error generando guía:', error);
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
    
    const activeProvider = role === 'PROVEEDOR' ? myEmail : providerFilter;
    let generatedCount = 0;
    const guidesArray: string[] = [];
    
    for (const o of selected) {
      const allItems = parseItemsJson(o.items_json);
      const providerItems = getProviderItems(allItems, activeProvider);
      
      if (providerItems.length === 0) continue;
      
      generatedCount++;
      const itemsText = providerItems.map((it: any, i: number) => 
        `  ${i + 1}. ${it.title || it.sku} x${it.qty} — Gs ${nf(Number(it.sale_gs || 0) * Number(it.qty || 1))}`
      ).join('\n');
      
      const filteredTotal = providerItems.reduce((sum, it) => sum + (Number(it.sale_gs || 0) * Number(it.qty || 1)), 0);
      
      const guide = `${o.order_number || o.id.slice(0, 8)} — ${o.customer_name} — ${o.city}
Teléfono: ${o.phone}
Dirección: ${o.street || ''} ${o.district || ''}
${itemsText}
Total: Gs ${nf(filteredTotal)}`;
      
      guidesArray.push(guide);
    }
    
    if (guidesArray.length === 0) {
      toast.error('Ninguno de los pedidos seleccionados contiene productos del proveedor');
      return;
    }
    
    const allText = guidesArray.join('\n\n════════════════════\n\n');
    navigator.clipboard.writeText(allText);
    toast.success(`${generatedCount} guía${generatedCount !== 1 ? 's' : ''} copiada${generatedCount !== 1 ? 's' : ''}`);
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos con guías</h3>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.pendingGuides}</div>
          <div className="text-xs text-blue-500">Guías pendientes</div>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.withGuide}</div>
          <div className="text-xs text-green-500">Con guía generada</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.total}</div>
          <div className="text-xs text-purple-500">Total en rango</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-600">{selectedIds.size}</div>
          <div className="text-xs text-gray-500">Seleccionados</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        
        {/* 🔒 CAMPO PROVEEDOR - FIJO Y BLOQUEADO PARA PROVEEDOR */}
        {(role === 'PROVEEDOR' || (role === 'ADMIN' && providerFilter)) && (
          <div className="flex items-center gap-1">
            <label className="app-label !mt-0">Proveedor</label>
            {role === 'PROVEEDOR' ? (
              // 🔒 PARA PROVEEDOR: campo bloqueado con su email
              <input 
                type="text" 
                className="app-input !w-auto bg-gray-100 cursor-not-allowed" 
                value={myEmail} 
                disabled 
                title="Filtro fijo - no se puede cambiar" 
              />
            ) : (
              // Para ADMIN: puede seleccionar proveedor
              <select 
                className="app-input !w-auto" 
                value={providerFilter} 
                onChange={e => setProviderFilter(e.target.value)}
              >
                <option value="">-- Todos los proveedores --</option>
                {providersList.map(p => (
                  <option key={p.email} value={p.email}>{p.email}</option>
                ))}
              </select>
            )}
          </div>
        )}
        
        <select className="app-input !w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {STATUS1_ALL.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="app-input !w-auto min-w-[250px] flex-1" placeholder="Buscar por cliente, teléfono, ID o ciudad"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active" onClick={loadOrders} disabled={loading}>Filtrar</button>
        {selectedIds.size > 0 && (
          <button className="nav-btn" onClick={bulkGenerateGuides}>📋 Copiar {selectedIds.size} guías</button>
        )}
      </div>

      {/* 🔒 Indicador para PROVEEDOR */}
      {role === 'PROVEEDOR' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3 text-sm text-blue-700 flex items-center gap-2">
          <span className="text-lg">🔒</span>
          <span>Filtro fijo: Mostrando solo pedidos del proveedor <strong>{myEmail}</strong></span>
        </div>
      )}

      <div className="text-xs text-muted-foreground mb-2">{filtered.length} pedidos</div>

      {/* Table */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1200px]">
          <thead>
            <tr>
              <th className="!w-[40px] text-center">
                <input type="checkbox" 
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll} />
              </th>
              <th>Fecha</th>
              <th>ID</th>
              <th>Ciudad</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Vendedor</th>
              <th>Proveedor</th>
              <th>Estado 2</th>
              <th>Guía</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-muted-foreground py-8">
                  {role === 'PROVEEDOR' 
                    ? 'No hay pedidos con tus productos en el rango seleccionado' 
                    : 'Sin pedidos'}
                </td>
              </tr>
            )}
            {filtered.map(o => {
              const dateShown = new Date(o.created_at).toLocaleString('es-PY');
              const activeProvider = role === 'PROVEEDOR' ? myEmail : providerFilter;
              const items = parseItemsJson(o.items_json);
              const providerItems = getProviderItems(items, activeProvider);
              
              // Mostrar el proveedor del pedido (el primero que aparece)
              const firstProvider = providerItems[0]?.provider_email || '—';
              
              // Verificar si tiene guía generada
              const hasGuide = o.status2 === 'GUIA GENERADA';

              return (
                <tr key={o.id}>
                  <td className="text-center">
                    <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                  </td>
                  <td className="whitespace-nowrap text-xs">{dateShown}</td>
                  <td className="font-bold text-xs">{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="text-xs">{o.city}</td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-xs">{o.phone}</td>
                  <td className="text-xs">{o.created_by}</td>
                  <td className="text-xs">{firstProvider}</td>
                  <td className="text-xs">
                    <select
                      className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[120px]"
                      value={o.status2 || '--'}
                      onChange={e => handleStatus2Change(o.id, e.target.value)}
                    >
                      <option value="--">--</option>
                      <option value="GUIA GENERADA">GUIA GENERADA</option>
                    </select>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button 
                        className="nav-btn !px-2 !py-1 !text-[10px]" 
                        onClick={() => generateGuide(o)} 
                        title="Ver guía">📄
                      </button>
                      <button 
                        className="nav-btn !px-2 !py-1 !text-[10px]" 
                        onClick={() => { generateGuide(o); setTimeout(copyGuide, 100); }} 
                        title="Copiar guía">📋
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Guide Modal */}
      {guideText && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4" onClick={() => setGuideText('')}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold mb-3">Guía — {guideOrderId}</h4>
            <pre className="text-sm whitespace-pre-wrap bg-background p-5 rounded-xl border border-border max-h-[70vh] overflow-auto leading-relaxed">{guideText}</pre>
            <div className="flex gap-2 justify-end mt-4">
              <button className="nav-btn" onClick={() => setGuideText('')}>Cerrar</button>
              <button className="nav-btn active" onClick={copyGuide}>Copiar</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
