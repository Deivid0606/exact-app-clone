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
  const [autoAssignProcessing, setAutoAssignProcessing] = useState(false);

  // Función para obtener parámetros del hash (para HashRouter)
  const getHashParams = () => {
    const hash = window.location.hash;
    const queryString = hash.split('?')[1];
    if (!queryString) return {};
    const params = new URLSearchParams(queryString);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  };

  // Manejo de QR - SELECCIONA el pedido en la tabla
  useEffect(() => {
    const params = getHashParams();
    const orderIdNumber = params.id;
    
    if (orderIdNumber && !autoAssignProcessing) {
      setAutoAssignProcessing(true);
      
      const selectAndAssign = async () => {
        // Buscar el pedido por order_number
        const { data: orderData } = await supabase
          .from('orders')
          .select('id, assigned_delivery')
          .eq('order_number', orderIdNumber)
          .maybeSingle();
        
        if (!orderData) {
          toast.error(`❌ Pedido ${orderIdNumber} no encontrado`);
          window.location.hash = '/asignar-pedidos';
          setAutoAssignProcessing(false);
          return;
        }
        
        // Si es DELIVERY, asignar automáticamente
        if (role === 'DELIVERY') {
          const deliveryEmail = profile?.email || '';
          
          if (orderData.assigned_delivery && orderData.assigned_delivery !== deliveryEmail) {
            toast.warning(`⚠️ El pedido ${orderIdNumber} ya está asignado a otro delivery`);
            window.location.hash = '/asignar-pedidos';
            setAutoAssignProcessing(false);
            return;
          }
          
          const { error } = await supabase
            .from('orders')
            .update({ 
              assigned_delivery: deliveryEmail, 
              assigned_at: new Date().toISOString() 
            })
            .eq('id', orderData.id);
          
          if (error) {
            toast.error('❌ Error al asignar: ' + error.message);
          } else {
            toast.success(`✅ Pedido ${orderIdNumber} asignado correctamente`);
            load();
          }
          
          window.location.hash = '/asignar-pedidos';
          setAutoAssignProcessing(false);
        } 
        // Para ADMIN/PROVEEDOR: seleccionar el pedido en la tabla
        else if (role === 'ADMIN' || role === 'PROVEEDOR') {
          // Seleccionar el pedido
          setSelected(prev => {
            const next = new Set(prev);
            if (next.has(orderData.id)) {
              next.delete(orderData.id);
              toast.info(`📦 Pedido ${orderIdNumber} deseleccionado`);
            } else {
              next.add(orderData.id);
              toast.info(`📦 Pedido ${orderIdNumber} seleccionado`);
            }
            return next;
          });
          
          window.location.hash = '/asignar-pedidos';
          setAutoAssignProcessing(false);
        }
      };
      
      selectAndAssign();
    }
  }, [role, profile?.email]);

  useEffect(() => {
    if (role === 'ADMIN' || role === 'PROVEEDOR') {
      supabase.from('profiles').select('email, name').then(({ data }) => setDeliveries(data || []));
    }
  }, [role]);

  const load = async () => {
    let query = supabase.from('orders').select('*')
      .gte(filterBy, dateFrom + 'T00:00:00')
      .lte(filterBy, dateTo + 'T23:59:59')
      .order(filterBy, { ascending: false }).limit(500);
    
    if (role === 'DELIVERY') {
      query = query.or(`assigned_delivery.is.null,assigned_delivery.eq.${profile?.email}`);
    }
    
    const { data } = await query;
    setOrders(data || []);
    setSelectAll(false);
    // No limpiar selected al recargar para mantener la selección
  };

  useEffect(() => { load(); }, [filterBy, dateFrom, dateTo]);

  const filtered = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (o.customer_name || '').toLowerCase().includes(q) ||
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.city || '').toLowerCase().includes(q) ||
      (o.phone || '').includes(q);
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      const allIds = filtered.map(o => o.id);
      setSelected(new Set(allIds));
    }
    setSelectAll(!selectAll);
  };

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
    let alreadyAssignedCount = 0;

    for (const id of selected) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('assigned_delivery')
        .eq('id', id)
        .single();
      
      if (orderData?.assigned_delivery && orderData.assigned_delivery !== deliveryEmail && role === 'DELIVERY') {
        alreadyAssignedCount++;
        continue;
      }
      
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
    if (alreadyAssignedCount > 0) {
      toast.warning(`⚠️ ${alreadyAssignedCount} pedido(s) ya estaban asignados a otro delivery`);
    }
    if (errorCount > 0) {
      toast.error(`❌ Error en ${errorCount} pedido(s)`);
    }
    
    setSelected(new Set());
    load();
  };

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
    load();
  };

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
      load();
    }
  };

  const clearSelection = () => {
    setSelected(new Set());
    toast.info('Selección limpiada');
  };

  const clearIdsInput = () => {
    setIdsInput('');
    toast.info('Lista de IDs limpiada');
  };

  const idsCount = idsInput.split(/[,\s\n]+/).filter(i => i.trim()).length;

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Asignar Pedidos</h3>

      {autoAssignProcessing && (
        <div className="mb-3 p-2 bg-blue-100 text-blue-800 rounded-lg text-sm text-center">
          ⏳ Procesando QR...
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        
        <select className="app-input !w-auto" value={filterBy} onChange={e => setFilterBy(e.target.value as any)}>
          <option value="created_at">📅 Fecha de venta</option>
          <option value="assigned_at">🚚 Fecha de asignación</option>
        </select>
        
        <input className="app-input flex-1 min-w-[200px]" placeholder="🔎 Buscar cliente, ID, ciudad, teléfono..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active" onClick={load}>Filtrar</button>
      </div>

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
              ✖ Limpiar selección
            </button>
          )}
        </div>
      )}

      {role === 'DELIVERY' && selected.size > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <button 
            className="nav-btn active bg-green-600 hover:bg-green-700" 
            onClick={assignSelected}
          >
            ✅ Asignarme estos {selected.size} pedido(s)
          </button>
          <button className="nav-btn !bg-gray-500" onClick={clearSelection}>
            ✖ Limpiar selección
          </button>
        </div>
      )}

      <div className="app-card !p-3 mb-3">
        <div className="flex justify-between items-center mb-2">
          <b className="text-sm">Asignar por IDs manualmente</b>
          <div className="flex gap-2">
            <span className="chip text-[10px] bg-blue-100 text-blue-800">
              📦 {idsCount} ID(s) cargados
            </span>
            {idsCount > 0 && (
              <button 
                className="text-xs text-red-500 hover:text-red-700"
                onClick={clearIdsInput}
              >
                Limpiar todo
              </button>
            )}
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground mb-2">
          📝 También podés escribir los IDs manualmente, separados por coma
        </p>
        
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
          className="app-input mb-2 font-mono text-sm" 
          rows={3} 
          placeholder="Ejemplo: A4800, A4599, A4601"
          value={idsInput} 
          onChange={e => setIdsInput(e.target.value)} 
        />
        
        <button 
          className="nav-btn active text-sm" 
          onClick={assignByIds}
          disabled={((role !== 'DELIVERY') && !assignDelivery) || idsInput.trim() === ''}
          style={{ background: '#10b981', color: 'white' }}
        >
          🚀 Asignar {idsCount} ID(s) {role === 'DELIVERY' ? 'a mí' : 'masivamente'}
        </button>
      </div>

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
              <th>{filterBy === 'created_at' ? 'Fecha venta' : 'Fecha asignación'}</th>
              <th>ID</th>
              <th>Ciudad</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th>Asignado a</th>
              {(role === 'ADMIN' || role === 'PROVEEDOR') && <th>Acción</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} className={selected.has(o.id) ? 'bg-green-100' : ''}>
                {(role === 'ADMIN' || role === 'PROVEEDOR' || role === 'DELIVERY') && (
                  <td className="text-center">
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
                  {filterBy === 'created_at' 
                    ? new Date(o.created_at).toLocaleDateString('es-PY')
                    : o.assigned_at 
                      ? new Date(o.assigned_at).toLocaleDateString('es-PY')
                      : '—'}
                </td>
                <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.city || '—'}</td>
                <td className="text-xs">{o.customer_name || '—'}</td>
                <td className="text-xs">{o.phone || '—'}</td>
                <td className="text-xs">
                  <span className={`badge-status ${o.status === 'ENTREGADO' ? 'badge-entregado' : o.status === 'CANCELADO' ? 'badge-cancelado' : 'badge-pendiente'}`}>
                    {o.status || 'PENDIENTE'}
                  </span>
                </td>
                <td className="text-xs">
                  {o.assigned_delivery === profile?.email ? (
                    <span className="text-green-600 font-bold">✓ Vos</span>
                  ) : (
                    <span className={o.assigned_delivery ? 'text-orange-600' : 'text-gray-400'}>
                      {o.assigned_delivery || '—'}
                    </span>
                  )}
                </td>
                {(role === 'ADMIN' || role === 'PROVEEDOR') && (
                  <td className="text-xs">
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={role === 'ADMIN' || role === 'PROVEEDOR' ? 9 : 8} className="text-center text-muted-foreground py-8">
                  {role === 'DELIVERY' ? 'No hay pedidos disponibles para asignarte' : 'Sin pedidos en este rango de fechas'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {role === 'DELIVERY' && selected.size > 0 && (
        <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-sm font-bold text-green-800">✅ {selected.size} pedido(s) seleccionado(s)</span>
              <p className="text-xs text-green-600 mt-1">Se asignarán automáticamente a tu cuenta</p>
            </div>
            <button 
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700"
              onClick={assignSelected}
            >
              Asignarme todo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
