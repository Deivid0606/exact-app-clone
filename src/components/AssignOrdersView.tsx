import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function AssignOrdersView() {
  const { profile } = useAuth();
  const role = profile?.role;
  const myEmail = profile?.email || '';
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignDelivery, setAssignDelivery] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [idsInput, setIdsInput] = useState('');
  const [selectAll, setSelectAll] = useState(false);

  // ========== DETECCIÓN DE ROL POR EMAIL ==========
  const isSupplier = myEmail === 'skylinestore06@gmail.com' || 
                     myEmail === 'importadoraaliado@gmail.com' || 
                     myEmail === 'nkshop@gmail.com';
  const isAdmin = myEmail === 'aleimportss@gmail.com';
  const isDelivery = !isSupplier && !isAdmin;

  // ========== DETECTAR PROVEEDOR SEGÚN EL DELIVERY ==========
  const getSupplierByDelivery = (deliveryEmail: string): string | null => {
    if (!deliveryEmail) return null;
    
    const email = deliveryEmail.toLowerCase();
    
    // Deliveries de SKYLINE
    if (email.includes('skyline') ||
        email === 'roberto.skyline.@gmail.com' ||
        email === 'josema.skyline.@gmail.com' ||
        email === 'deliverynico-skyline@gmail.com' ||
        email === 'nayder-skyline@gmail.com' ||
        email === 'fabianskyline@gmail.com' ||
        email === 'diegoskyline@gmail.com') {
      return 'skylinestore06@gmail.com';
    }
    
    // Deliveries de IMPORTADORA ALIADO
    if (email.includes('importaliado') ||
        email === 'pablo-godoy09importaliado@gmail.com' ||
        email === 'chirstianimporaliado04@gmail.com' ||
        email === 'santiagonandedeliveryimportaliado@gmail.com') {
      return 'importadoraaliado@gmail.com';
    }
    
    // Si no se puede detectar, retornar null
    return null;
  };

  useEffect(() => {
    if (isAdmin || isSupplier) {
      supabase.from('profiles').select('email, name').then(({ data }) => setDeliveries(data || []));
    }
  }, [isAdmin, isSupplier]);

  const load = async () => {
    let query = supabase.from('orders').select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(300);
    
    if (isDelivery) {
      query = query.or(`assigned_delivery.is.null,assigned_delivery.eq.${myEmail}`);
    }
    
    const { data } = await query;
    setOrders(data || []);
    setSelectAll(false);
    setSelected(new Set());
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

  // Función común para asignar pedidos (AHORA CON DETECCIÓN AUTOMÁTICA DE PROVEEDOR)
  const assignOrdersToDelivery = async (orderIds: string[], deliveryEmail: string, supplierEmail?: string) => {
    let successCount = 0;
    let errorCount = 0;

    for (const id of orderIds) {
      // Obtener el pedido actual para preservar su supplier_email si existe
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('supplier_email')
        .eq('id', id)
        .single();
      
      // Determinar el supplier_email final
      let finalSupplierEmail = currentOrder?.supplier_email;
      
      // Si el pedido NO tiene supplier_email, intentar determinarlo
      if (!finalSupplierEmail) {
        // 1. Si el usuario es proveedor, usar su email
        if (supplierEmail) {
          finalSupplierEmail = supplierEmail;
        }
        // 2. Si no, detectar automáticamente por el delivery
        else {
          finalSupplierEmail = getSupplierByDelivery(deliveryEmail);
        }
      }
      
      // Preparar los datos a actualizar
      const updateData: any = { 
        assigned_delivery: deliveryEmail, 
        assigned_at: new Date().toISOString(),
        status: 'EN RUTA'
      };
      
      // Solo asignar supplier_email si se determinó uno
      if (finalSupplierEmail) {
        updateData.supplier_email = finalSupplierEmail;
      }
      
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', id);
      
      if (error) {
        errorCount++;
        console.error(`Error asignando pedido ${id}:`, error);
      } else {
        successCount++;
      }
    }
    
    return { successCount, errorCount };
  };

  // Para DELIVERY: asigna automáticamente a sí mismo
  const assignSelected = async () => {
    if (selected.size === 0) {
      toast.error('Seleccioná al menos un pedido');
      return;
    }
    
    const deliveryEmail = isDelivery ? myEmail : assignDelivery;
    if (!deliveryEmail) {
      toast.error('Seleccioná un delivery o asegurate de estar logueado');
      return;
    }

    const loadingToast = toast.loading(`Asignando ${selected.size} pedido(s)...`);
    
    const { successCount, errorCount } = await assignOrdersToDelivery(
      Array.from(selected), 
      deliveryEmail,
      isSupplier ? myEmail : undefined
    );
    
    toast.dismiss(loadingToast);
    
    if (successCount > 0) {
      toast.success(`✅ ${successCount} pedido(s) asignado(s) correctamente`);
      // Mostrar resumen de proveedores asignados
      toast.info(`📦 Los proveedores podrán ver sus pedidos en Cierres`);
    }
    if (errorCount > 0) {
      toast.error(`❌ Error en ${errorCount} pedido(s)`);
    }
    
    setSelected(new Set());
    setSelectAll(false);
    load();
  };

  // Asignar por IDs manuales
  const assignByIds = async () => {
    const deliveryEmail = isDelivery ? myEmail : assignDelivery;
    
    if (!deliveryEmail) {
      toast.error('Seleccioná un delivery');
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
    const foundIds: string[] = [];

    for (const id of ids) {
      const { data } = await supabase
        .from('orders')
        .select('id, assigned_delivery, supplier_email')
        .eq('order_number', id)
        .limit(1);
      
      if (data && data[0]) {
        if (data[0].assigned_delivery && data[0].assigned_delivery !== deliveryEmail && isDelivery) {
          alreadyAssigned++;
          continue;
        }
        foundIds.push(data[0].id);
      } else {
        notFound++;
      }
    }
    
    if (foundIds.length > 0) {
      const { successCount, errorCount } = await assignOrdersToDelivery(
        foundIds, 
        deliveryEmail,
        isSupplier ? myEmail : undefined
      );
      count = successCount;
    }
    
    toast.dismiss(loadingToast);
    
    if (count > 0) {
      toast.success(`✅ ${count} pedido(s) asignado(s) correctamente`);
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

  // Asignar individualmente (solo ADMIN/PROVEEDOR)
  const assignSingle = async (orderId: string, deliveryEmail: string) => {
    if (!deliveryEmail) {
      toast.error('Seleccioná un delivery');
      return;
    }
    
    // Obtener el pedido actual para preservar supplier_email
    const { data: currentOrder } = await supabase
      .from('orders')
      .select('supplier_email')
      .eq('id', orderId)
      .single();
    
    const updateData: any = { 
      assigned_delivery: deliveryEmail, 
      assigned_at: new Date().toISOString(),
      status: 'EN RUTA'
    };
    
    // Si no tiene supplier_email, detectar automáticamente
    if (!currentOrder?.supplier_email) {
      const detectedSupplier = getSupplierByDelivery(deliveryEmail);
      if (detectedSupplier) {
        updateData.supplier_email = detectedSupplier;
      }
    }
    
    const { error } = await supabase
      .from('orders')
      .update(updateData)
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
    setSelectAll(false);
    toast.info('Selección limpiada');
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

      {/* Sección para ADMIN/PROVEEDOR */}
      {(isAdmin || isSupplier) && (
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
      {isDelivery && selected.size > 0 && (
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

      {/* Asignar por IDs */}
      <div className="app-card !p-3 mb-3">
        <div className="flex justify-between items-center mb-2">
          <b className="text-sm">Asignar por IDs manualmente</b>
          <span className="chip text-[10px]">Máximo 35 IDs por carga</span>
        </div>
        
        {(isAdmin || isSupplier) && (
          <select className="app-input !w-auto min-w-[200px] mb-2" value={assignDelivery} onChange={e => setAssignDelivery(e.target.value)}>
            <option value="">Seleccionar delivery...</option>
            {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
          </select>
        )}
        
        {isDelivery && (
          <div className="mb-2 p-2 bg-blue-50 rounded text-sm text-blue-700">
            📍 Los pedidos se asignarán automáticamente a tu usuario: <strong>{myEmail}</strong>
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
          disabled={(isDelivery ? false : !assignDelivery) || idsInput.trim() === ''}
        >
          🚀 Asignar IDs masivamente
        </button>
      </div>

      <div className="overflow-auto">
        <table className="app-table">
          <thead>
            <tr>
              {(isAdmin || isSupplier || isDelivery) && (
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
              <th>Proveedor</th>
              <th>Estado</th>
              <th>Asignado a</th>
              {(isAdmin || isSupplier) && <th>Acción</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} className={selected.has(o.id) ? 'bg-brand/10' : ''}>
                {(isAdmin || isSupplier || isDelivery) && (
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selected.has(o.id)} 
                      onChange={() => toggleSelect(o.id)} 
                      className="accent-brand"
                      disabled={isDelivery && o.assigned_delivery && o.assigned_delivery !== myEmail}
                    />
                  </td>
                )}
                <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.city}</td>
                <td className="text-xs">{o.customer_name}</td>
                <td className="text-xs">
                  {o.supplier_email ? (
                    <span className="text-blue-600 font-medium">{o.supplier_email}</span>
                  ) : (
                    <span className="text-red-500 italic">Sin proveedor</span>
                  )}
                </td>
                <td>
                  <span className={`badge-status ${o.status === 'ENTREGADO' ? 'badge-entregado' : o.status === 'CANCELADO' ? 'badge-cancelado' : 'badge-pendiente'}`}>
                    {o.status || 'PENDIENTE'}
                  </span>
                </td>
                <td className="text-xs">
                  {o.assigned_delivery === myEmail ? (
                    <span className="text-green-600 font-bold">✓ Vos</span>
                  ) : (
                    <span className={o.assigned_delivery ? 'text-orange-600' : 'text-gray-400'}>
                      {o.assigned_delivery || '—'}
                    </span>
                  )}
                </td>
                {(isAdmin || isSupplier) && (
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isAdmin || isSupplier ? 9 : 8} className="text-center text-muted-foreground py-8">
                  No hay pedidos en este rango de fechas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Resumen para DELIVERY */}
      {isDelivery && selected.size > 0 && (
        <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-sm font-bold text-green-800">✅ {selected.size} pedido(s) seleccionado(s)</span>
              <p className="text-xs text-green-600 mt-1">Se asignarán automáticamente a tu cuenta</p>
              <p className="text-xs text-green-600">📦 Los proveedores verán estos pedidos en Cierres</p>
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
