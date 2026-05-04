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
  const [selectAll, setSelectAll] = useState(false);
  const [filterBy, setFilterBy] = useState<'created_at' | 'assigned_at'>('created_at');
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (role === 'ADMIN' || role === 'PROVEEDOR') {
      supabase.from('profiles').select('email, name').then(({ data }) => setDeliveries(data || []));
    }
  }, [role]);

  const load = async (reset = true) => {
    setLoadingOrders(true);
    
    try {
      // Si es delivery, NO aplicar filtros de fecha → ver TODOS los pedidos (asignados a él o sin asignar)
      if (role === 'DELIVERY') {
        let query = supabase
          .from('orders')
          .select('*')
          .or(`assigned_delivery.is.null,assigned_delivery.eq.${profile?.email}`)
          .order('created_at', { ascending: false });
        
        // Si no es reset, aplicar paginación
        if (!reset && currentPage > 0) {
          const lastOrder = orders[orders.length - 1];
          if (lastOrder) {
            query = query.lt('created_at', lastOrder.created_at);
          }
        }
        
        query = query.limit(500);
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        if (reset) {
          setOrders(data || []);
        } else {
          setOrders(prev => [...prev, ...(data || [])]);
        }
        
        setHasMore((data || []).length === 500);
      } 
      // Si es ADMIN o PROVEEDOR, mantener filtro de fechas
      else {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .gte(filterBy, dateFrom + 'T00:00:00')
          .lte(filterBy, dateTo + 'T23:59:59')
          .order(filterBy, { ascending: false })
          .limit(500);
        
        if (error) throw error;
        setOrders(data || []);
      }
    } catch (error) {
      console.error('Error cargando pedidos:', error);
      toast.error('Error al cargar los pedidos');
    } finally {
      setLoadingOrders(false);
      if (reset) {
        setSelectAll(false);
        setSelected(new Set());
        setCurrentPage(0);
      }
    }
  };

  const loadMore = async () => {
    if (!hasMore || loadingOrders) return;
    setCurrentPage(prev => prev + 1);
    await load(false);
  };

  // Recargar cuando cambie el filtro, el rol o el email del delivery
  useEffect(() => { 
    if (role === 'DELIVERY') {
      load(true);
    }
  }, [role, profile?.email]);

  // Para admin, recargar cuando cambien los filtros
  useEffect(() => {
    if (role !== 'DELIVERY') {
      load(true);
    }
  }, [filterBy, dateFrom, dateTo, role]);

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
    setSelectAll(s.size === filtered.length && filtered.length > 0);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
    } else {
      const allIds = filtered.map(o => o.id);
      setSelected(new Set(allIds));
      setSelectAll(true);
    }
  };

  // Para DELIVERY: asigna automáticamente a sí mismo
  const assignSelected = async () => {
    if (selected.size === 0) {
      toast.error('Seleccioná al menos un pedido');
      return;
    }
    
    let deliveryEmail = '';
    
    if (role === 'DELIVERY') {
      deliveryEmail = profile?.email || '';
    } else if ((role === 'ADMIN' || role === 'PROVEEDOR') && assignDelivery) {
      deliveryEmail = assignDelivery;
    }
    
    if (!deliveryEmail) {
      toast.error('Seleccioná un delivery primero');
      return;
    }

    const loadingToast = toast.loading(`Asignando ${selected.size} pedido(s)...`);
    
    let successCount = 0;
    let errorCount = 0;

    for (const id of selected) {
      const { error } = await supabase
        .from('orders')
        .update({ 
          assigned_delivery: deliveryEmail, 
          assigned_at: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) {
        errorCount++;
        console.error(`Error asignando pedido ${id}:`, error);
      } else {
        successCount++;
      }
    }
    
    toast.dismiss(loadingToast);
    
    if (successCount > 0) {
      toast.success(`✅ ${successCount} pedido(s) asignado(s) a ${role === 'DELIVERY' ? 'vos' : deliveryEmail}`);
    }
    if (errorCount > 0) {
      toast.error(`❌ Error en ${errorCount} pedido(s)`);
    }
    
    load(true);
  };

  // Para DELIVERY: asigna IDs manuales a sí mismo
  const assignByIds = async () => {
    let deliveryEmail = '';
    
    if (role === 'DELIVERY') {
      deliveryEmail = profile?.email || '';
    } else if ((role === 'ADMIN' || role === 'PROVEEDOR') && assignDelivery) {
      deliveryEmail = assignDelivery;
    }
    
    if (!deliveryEmail) {
      toast.error('Seleccioná un delivery primero');
      return;
    }
    
    const ids = idsInput.split(/[,\s\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    if (ids.length === 0) { 
      toast.error('Ingresá al menos un ID'); 
      return; 
    }
    
    if (ids.length > 35) {
      toast.error('Máximo 35 IDs por carga');
      return;
    }

    const loadingToast = toast.loading(`Procesando ${ids.length} ID(s)...`);
    let count = 0;
    let notFound = 0;
    let alreadyAssigned = 0;

    for (const id of ids) {
      const { data } = await supabase
        .from('orders')
        .select('id, assigned_delivery')
        .eq('order_number', id)
        .limit(1);
      
      if (data && data[0]) {
        // Si ya está asignado a otro delivery y soy delivery, avisar
        if (data[0].assigned_delivery && data[0].assigned_delivery !== deliveryEmail && role === 'DELIVERY') {
          alreadyAssigned++;
          continue;
        }
        
        const { error } = await supabase
          .from('orders')
          .update({ 
            assigned_delivery: deliveryEmail, 
            assigned_at: new Date().toISOString() 
          })
          .eq('id', data[0].id);
        
        if (!error) {
          count++;
        }
      } else {
        notFound++;
      }
    }
    
    toast.dismiss(loadingToast);
    
    if (count > 0) {
      toast.success(`✅ ${count} pedido(s) asignado(s) a ${role === 'DELIVERY' ? 'vos' : deliveryEmail}`);
    }
    if (alreadyAssigned > 0) {
      toast.warning(`⚠️ ${alreadyAssigned} pedido(s) ya estaban asignados a otro delivery`);
    }
    if (notFound > 0) {
      toast.warning(`❓ ${notFound} ID(s) no encontrados`);
    }
    
    setIdsInput('');
    load(true);
  };

  // Solo para ADMIN/PROVEEDOR
  const assignSingle = async (orderId: string, deliveryEmail: string) => {
    if (!deliveryEmail) {
      toast.error('Seleccioná un delivery');
      return;
    }
    
    const { error } = await supabase
      .from('orders')
      .update({ 
        assigned_delivery: deliveryEmail, 
        assigned_at: new Date().toISOString() 
      })
      .eq('id', orderId);
    
    if (error) {
      toast.error('Error al asignar delivery');
      console.error(error);
    } else {
      toast.success('Delivery asignado correctamente');
      load(true);
    }
  };

  const clearSelection = () => {
    setSelected(new Set());
    setSelectAll(false);
    toast.info('Selección limpiada');
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Asignar Pedidos</h3>

      {/* Filtros de fecha - SOLO visibles para ADMIN/PROVEEDOR */}
      {(role === 'ADMIN' || role === 'PROVEEDOR') && (
        <div className="flex flex-wrap gap-2 mb-3">
          <label className="app-label !mt-0">Desde</label>
          <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <label className="app-label !mt-0">Hasta</label>
          <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          
          <select className="app-input !w-auto" value={filterBy} onChange={e => setFilterBy(e.target.value as any)}>
            <option value="created_at">📅 Fecha de venta</option>
            <option value="assigned_at">🚚 Fecha de asignación</option>
          </select>
          
          <input className="app-input flex-1 min-w-[200px]" placeholder="🔎 Buscar cliente, ID, ciudad..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <button className="nav-btn active" onClick={() => load(true)}>Filtrar</button>
        </div>
      )}

      {/* Para DELIVERY: solo mostrar búsqueda, sin filtros de fecha */}
      {role === 'DELIVERY' && (
        <div className="flex flex-wrap gap-2 mb-3">
          <input className="app-input flex-1 min-w-[200px]" placeholder="🔎 Buscar cliente, ID, ciudad..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <button className="nav-btn active" onClick={() => load(true)} disabled={loadingOrders}>
            {loadingOrders ? 'Cargando...' : 'Actualizar'}
          </button>
          <div className="text-xs text-muted-foreground self-center ml-auto">
            📦 Mostrando {orders.length} pedido(s) | Sin asignar: {orders.filter(o => !o.assigned_delivery).length}
          </div>
        </div>
      )}

      {/* Sección para ADMIN/PROVEEDOR */}
      {(role === 'ADMIN' || role === 'PROVEEDOR') && (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <select className="app-input !w-auto min-w-[200px]" value={assignDelivery} onChange={e => setAssignDelivery(e.target.value)}>
            <option value="">Seleccionar delivery...</option>
            {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
          </select>
          <button 
            className="nav-btn active" 
            onClick={assignSelected} 
            disabled={selected.size === 0 || !assignDelivery}
          >
            📦 Asignar seleccionados ({selected.size})
          </button>
          {selected.size > 0 && (
            <button className="nav-btn !bg-gray-500" onClick={clearSelection}>
              ✖ Limpiar
            </button>
          )}
        </div>
      )}

      {/* Sección para DELIVERY */}
      {role === 'DELIVERY' && selected.size > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <div className="p-2 bg-green-50 rounded-lg flex-1">
            <span className="text-sm font-bold text-green-800">✅ {selected.size} pedido(s) seleccionado(s)</span>
            <p className="text-xs text-green-600">Se asignarán automáticamente a tu cuenta</p>
          </div>
          <button 
            className="nav-btn active bg-green-600 hover:bg-green-700" 
            onClick={assignSelected}
          >
            Asignarme estos {selected.size}
          </button>
          <button className="nav-btn !bg-gray-500" onClick={clearSelection}>
            ✖ Limpiar
          </button>
        </div>
      )}

      {/* Asignar por IDs */}
      <div className="app-card !p-3 mb-3">
        <div className="flex justify-between items-center mb-2">
          <b className="text-sm">Asignar por IDs manualmente</b>
          <span className="chip text-[10px]">Máximo 35 IDs por carga</span>
        </div>
        
        {(role === 'ADMIN' || role === 'PROVEEDOR') && (
          <select className="app-input !w-auto min-w-[200px] mb-2" value={assignDelivery} onChange={e => setAssignDelivery(e.target.value)}>
            <option value="">Seleccionar delivery...</option>
            {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
          </select>
        )}
        
        {role === 'DELIVERY' && (
          <div className="mb-2 p-2 bg-blue-50 rounded text-sm text-blue-700">
            📍 Los pedidos se asignarán automáticamente a tu usuario: <strong>{profile?.email}</strong>
          </div>
        )}
        
        <textarea 
          className="app-input mb-2" 
          rows={3} 
          placeholder="Ejemplo: A4800, A4599, A4601"
          value={idsInput} 
          onChange={e => setIdsInput(e.target.value)} 
        />
        <p className="text-xs text-muted-foreground mb-2">Podés separar por coma, espacio o salto de línea.</p>
        
        <button 
          className="nav-btn active text-xs" 
          onClick={assignByIds}
          disabled={((role !== 'DELIVERY') && !assignDelivery) || idsInput.trim() === ''}
        >
          🚀 Asignar IDs masivamente
        </button>
      </div>

      {loadingOrders && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
          <p className="text-sm text-muted-foreground mt-2">Cargando pedidos...</p>
        </div>
      )}

      <div className="overflow-auto">
        <table className="app-table">
          <thead>
            <tr>
              {(role === 'ADMIN' || role === 'PROVEEDOR' || role === 'DELIVERY') && (
                <th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={selectAll && filtered.length > 0}
                    onChange={handleSelectAll}
                    className="accent-brand"
                    disabled={filtered.length === 0}
                  />
                </th>
              )}
              <th>Fecha</th>
              <th>ID</th>
              <th>Ciudad</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Asignado a</th>
              {(role === 'ADMIN' || role === 'PROVEEDOR') && <th>Acción</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} className={selected.has(o.id) ? 'bg-brand/10' : ''}>
                {(role === 'ADMIN' || role === 'PROVEEDOR' || role === 'DELIVERY') && (
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selected.has(o.id)} 
                      onChange={() => toggleSelect(o.id)} 
                      className="accent-brand"
                      disabled={role === 'DELIVERY' && o.assigned_delivery && o.assigned_delivery !== profile?.email}
                    />
                  </td>
                )}
                <td className="text-xs whitespace-nowrap">
                  {new Date(o.created_at).toLocaleDateString('es-PY')}
                </td>
                <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.city}</td>
                <td className="text-xs">{o.customer_name}</td>
                <td>
                  <span className={`badge-status ${o.status === 'ENTREGADO' ? 'badge-entregado' : o.status === 'CANCELADO' ? 'badge-cancelado' : 'badge-pendiente'}`}>
                    {o.status || 'PENDIENTE'}
                  </span>
                </td>
                <td className="text-xs">
                  {!o.assigned_delivery ? (
                    <span className="text-yellow-600 font-semibold">⚡ Sin asignar</span>
                  ) : o.assigned_delivery === profile?.email ? (
                    <span className="text-green-600 font-bold">✓ Vos</span>
                  ) : (
                    <span className="text-orange-600">{o.assigned_delivery}</span>
                  )}
                </td>
                {(role === 'ADMIN' || role === 'PROVEEDOR') && (
                  <td>
                    <select 
                      className="app-input !w-auto !py-1 !px-2 text-xs" 
                      value={o.assigned_delivery || ''}
                      onChange={e => assignSingle(o.id, e.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
                    </select>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && !loadingOrders && (
              <tr>
                <td colSpan={role === 'ADMIN' || role === 'PROVEEDOR' ? 8 : 7} className="text-center text-muted-foreground py-8">
                  {role === 'DELIVERY' ? 'No hay pedidos disponibles para asignarte' : 'Sin pedidos en este rango de fechas'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {role === 'DELIVERY' && hasMore && orders.length > 0 && !loadingOrders && (
        <div className="flex justify-center mt-4">
          <button 
            className="nav-btn !bg-gray-500 text-sm"
            onClick={loadMore}
          >
            📥 Cargar más pedidos
          </button>
        </div>
      )}
    </div>
  );
}
