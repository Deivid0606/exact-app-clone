import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function WithGuidesView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const myEmail = profile?.email || '';
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [guideText, setGuideText] = useState('');
  const [guideId, setGuideId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  
  // FILTROS EXISTENTES
  const [status2Filter, setStatus2Filter] = useState<string>('PENDIENTES');
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [citySearch, setCitySearch] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // 🔥 NUEVO FILTRO POR DEPARTAMENTOS
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [deptSearch, setDeptSearch] = useState('');
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  // Obtener lista única de ciudades de los pedidos
  const allCities = useMemo(() => {
    const cities = new Set<string>();
    orders.forEach(o => {
      if (o.city && o.city.trim()) {
        cities.add(o.city.trim());
      }
    });
    return Array.from(cities).sort();
  }, [orders]);

  // 🔥 Obtener lista única de departamentos de los pedidos
  const allDepartments = useMemo(() => {
    const depts = new Set<string>();
    orders.forEach(o => {
      if (o.department && o.department.trim()) {
        depts.add(o.department.trim());
      }
    });
    return Array.from(depts).sort();
  }, [orders]);

  const filteredCities = useMemo(() => {
    if (!citySearch) return allCities;
    return allCities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()));
  }, [allCities, citySearch]);

  // 🔥 Filtrar departamentos por búsqueda
  const filteredDepartments = useMemo(() => {
    if (!deptSearch) return allDepartments;
    return allDepartments.filter(d => d.toLowerCase().includes(deptSearch.toLowerCase()));
  }, [allDepartments, deptSearch]);

  const toggleCity = (city: string) => {
    setSelectedCities(prev => {
      const next = new Set(prev);
      if (next.has(city)) {
        next.delete(city);
      } else {
        next.add(city);
      }
      return next;
    });
  };

  // 🔥 Toggle para departamentos
  const toggleDepartment = (dept: string) => {
    setSelectedDepartments(prev => {
      const next = new Set(prev);
      if (next.has(dept)) {
        next.delete(dept);
      } else {
        next.add(dept);
      }
      return next;
    });
  };

  const selectAllCities = () => {
    if (selectedCities.size === allCities.length) {
      setSelectedCities(new Set());
    } else {
      setSelectedCities(new Set(allCities));
    }
  };

  // 🔥 Seleccionar todos los departamentos
  const selectAllDepartments = () => {
    if (selectedDepartments.size === allDepartments.length) {
      setSelectedDepartments(new Set());
    } else {
      setSelectedDepartments(new Set(allDepartments));
    }
  };

  const load = async () => {
    setLoading(true);
    
    let query = supabase
      .from('orders')
      .select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false });

    if (status2Filter === 'PENDIENTES') {
      query = query.or('status2.is.null,status2.eq.--');
    } else if (status2Filter === 'CON_GUIA') {
      query = query.eq('status2', 'GUIA GENERADA');
    }

    const { data, error } = await query;

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => { 
    load(); 
  }, [dateFrom, dateTo, status2Filter]);

  const allProviders = useMemo(() => {
    if (role === 'PROVEEDOR') return [];
    const set = new Set<string>();
    orders.forEach(o => {
      if (o.provider_email && o.provider_email.trim()) {
        set.add(o.provider_email.trim());
      }
      if (o.provider_emails_list) {
        (o.provider_emails_list || '').split(',').forEach((e: string) => {
          const t = e.trim();
          if (t) set.add(t);
        });
      }
    });
    return [...set].sort();
  }, [orders, role]);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (role === 'PROVEEDOR') {
        const providerList = o.provider_emails_list || '';
        const myEmailLower = myEmail.toLowerCase();
        const isMine = providerList.toLowerCase().includes(myEmailLower);
        if (!isMine) return false;
      }
      
      if (role !== 'PROVEEDOR' && providerFilter) {
        const providerList = (o.provider_emails_list || '') + ',' + (o.provider_email || '');
        if (!providerList.toLowerCase().includes(providerFilter.toLowerCase())) return false;
      }
      
      // 🔥 FILTRO POR CIUDADES
      if (selectedCities.size > 0) {
        if (!o.city || !selectedCities.has(o.city)) return false;
      }
      
      // 🔥 FILTRO POR DEPARTAMENTOS
      if (selectedDepartments.size > 0) {
        if (!o.department || !selectedDepartments.has(o.department)) return false;
      }
      
      if (!search) return true;
      const q = search.toLowerCase();
      return (o.customer_name || '').toLowerCase().includes(q) ||
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.phone || '').includes(q) || 
        (o.city || '').toLowerCase().includes(q) ||
        (o.department || '').toLowerCase().includes(q) ||
        (o.id || '').toLowerCase().includes(q);
    });
  }, [orders, search, providerFilter, role, myEmail, selectedCities, selectedDepartments]);

  const pendingGuides = filtered.filter(o => !o.status2 || o.status2 === '--');
  const withGuides = filtered.filter(o => o.status2 === 'GUIA GENERADA');
  const visibleOrders = filtered;

  const state2Opts = ['--', 'GUIA GENERADA', 'FUERA DE COBERTURA', 'CANCELADO', 'REPETIDO', 'RENDIDO'];

  const updateStatus2 = async (orderId: string, status2: string) => {
    const val = status2 === '--' ? null : status2;
    const { error } = await supabase.from('orders').update({ status2: val, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) toast.error(error.message);
    else {
      toast.success('Estado 2 actualizado');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status2: val } : o));
      if (val === 'GUIA GENERADA') {
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    }
  };

  const buildGuideText = (o: any) => {
    const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
    const itemsText = items.map((it: any, i: number) =>
      `${i + 1}. ${it.title || it.sku || 'Item'} x${it.qty || 1} — Gs ${nf(Number(it.sale_gs || 0) * Number(it.qty || 1))}`
    ).join('\n');

    return [
      `GUÍA DE ENVÍO — ${o.order_number || o.id.slice(0, 8)}`,
      `━━━━━━━━━━━━━━━━━━`,
      `Cliente: ${o.customer_name || ''}`,
      `Teléfono: ${o.phone || ''}`,
      `Email: ${o.email || ''}`,
      `Departamento: ${o.department || ''}`,
      `Ciudad: ${o.city || ''}`,
      `Dirección: ${o.street || ''} ${o.district ? '- ' + o.district : ''}`,
      `━━━━━━━━━━━━━━━━━━`,
      `Productos:`,
      itemsText,
      `━━━━━━━━━━━━━━━━━━`,
      `Total: Gs ${nf(Number(o.total_gs || 0))}`,
      o.obs ? `Observación: ${o.obs}` : '',
      `━━━━━━━━━━━━━━━━━━`,
      `Vendedor: ${o.created_by || ''}`,
      `Proveedor: ${o.provider_emails_list || o.provider_email || '—'}`,
    ].filter(Boolean).join('\n');
  };

  const generateGuide = (o: any) => {
    try {
      setGuideText(buildGuideText(o));
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

  const getSelectedOrders = () => visibleOrders.filter(o => selectedIds.has(o.id));

  const bulkCopyGuides = () => {
    const selected = getSelectedOrders();
    if (selected.length === 0) { toast.error('Seleccioná pedidos primero'); return; }
    const allText = selected.map(o => buildGuideText(o)).join('\n\n════════════════════\n\n');
    navigator.clipboard.writeText(allText);
    toast.success(`${selected.length} guías copiadas`);
  };

  const bulkMarkAsGuiaGenerada = async () => {
    const selected = getSelectedOrders();
    
    if (selected.length === 0) {
      toast.error('Seleccioná pedidos primero');
      return;
    }

    const toastId = toast.loading(`Actualizando ${selected.length} pedido${selected.length > 1 ? 's' : ''}...`);
    
    try {
      const updates = selected.map(order => 
        supabase.from('orders').update({ 
          status2: 'GUIA GENERADA', 
          updated_at: new Date().toISOString() 
        }).eq('id', order.id)
      );
      
      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      
      if (errors.length > 0) {
        toast.error(`${errors.length} error${errors.length > 1 ? 'es' : ''} al actualizar`, { id: toastId });
      } else {
        toast.success(`${selected.length} pedido${selected.length > 1 ? 's' : ''} marcado${selected.length > 1 ? 's' : ''} como GUIA GENERADA`, { id: toastId });
        
        setOrders(prev => prev.map(o => 
          selectedIds.has(o.id) ? { ...o, status2: 'GUIA GENERADA' } : o
        ));
        
        setSelectedIds(new Set());
      }
    } catch (error) {
      toast.error('Error al actualizar los pedidos', { id: toastId });
    }
  };

  const selectAllPending = () => {
    const allPendingIds = pendingGuides.map(o => o.id);
    if (allPendingIds.length === 0) {
      toast.error('No hay pedidos pendientes');
      return;
    }
    setSelectedIds(new Set(allPendingIds));
    toast.success(`${allPendingIds.length} pedido${allPendingIds.length > 1 ? 's' : ''} pendiente${allPendingIds.length > 1 ? 's' : ''} seleccionado${allPendingIds.length > 1 ? 's' : ''}`);
  };

  const clearSelection = () => {
    if (selectedIds.size === 0) return;
    setSelectedIds(new Set());
    toast.success('Selección limpiada');
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadTxt = () => {
    const selected = getSelectedOrders();
    if (selected.length === 0) { toast.error('Seleccioná pedidos primero'); return; }
    const content = selected.map(o => buildGuideText(o)).join('\n\n════════════════════\n\n');
    downloadFile(content, `guias_${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain');
    toast.success(`${selected.length} guías descargadas en TXT`);
  };

  const downloadPdf = () => {
    const selected = getSelectedOrders();
    if (selected.length === 0) { toast.error('Seleccioná pedidos primero'); return; }

    const content = selected.map(o => {
      const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
      const itemsHtml = items.map((it: any, i: number) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #333;">${i + 1}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #333;">${it.title || it.sku || 'Item'}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center;">${it.qty || 1}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #333;text-align:right;">Gs ${nf(Number(it.sale_gs || 0) * Number(it.qty || 1))}</td>
       </tr>`
      ).join('');

      return `
        <div style="page-break-after:always;padding:20px;font-family:Arial,sans-serif;color:#eee;background:#141420;">
          <h2 style="color:#7c5cff;margin:0 0 10px;">Guía — ${o.order_number || o.id.slice(0, 8)}</h2>
          <table style="width:100%;margin-bottom:12px;font-size:13px;"><tbody>
            <tr><td style="padding:3px 0;width:120px;color:#999;">Cliente:</td><td style="font-weight:bold;">${o.customer_name || ''}</td></tr>
            <tr><td style="padding:3px 0;color:#999;">Teléfono:</td><td>${o.phone || ''}</td></tr>
            <tr><td style="padding:3px 0;color:#999;">Email:</td><td>${o.email || ''}</td></tr>
            <tr><td style="padding:3px 0;color:#999;">Departamento:</td><td>${o.department || ''}</td></tr>
            <tr><td style="padding:3px 0;color:#999;">Ciudad:</td><td>${o.city || ''}</td></tr>
            <tr><td style="padding:3px 0;color:#999;">Dirección:</td><td>${o.street || ''} ${o.district ? '- ' + o.district : ''}</td></tr>
            <tr><td style="padding:3px 0;color:#999;">Vendedor:</td><td>${o.created_by || ''}</td></tr>
            <tr><td style="padding:3px 0;color:#999;">Proveedor:</td><td>${o.provider_emails_list || o.provider_email || '—'}</td></tr>
          </tbody></table>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:#1e1e2f;">
              <th style="padding:6px 8px;text-align:left;color:#7c5cff;">#</th>
              <th style="padding:6px 8px;text-align:left;color:#7c5cff;">Producto</th>
              <th style="padding:6px 8px;text-align:center;color:#7c5cff;">Cant.</th>
              <th style="padding:6px 8px;text-align:right;color:#7c5cff;">Subtotal</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div style="margin-top:12px;padding:8px;background:#1e1e2f;border-radius:8px;font-size:14px;">
            <strong>Total: Gs ${nf(Number(o.total_gs || 0))}</strong>
          </div>
          ${o.obs ? `<div style="margin-top:8px;font-size:12px;color:#bbb;">Observación: ${o.obs}</div>` : ''}
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Guías</title>
      <style>@media print{body{margin:0;} div{page-break-after:always;}}</style>
    </head><body style="background:#0b0b10;margin:0;">${content}</body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
    toast.success(`${selected.length} guías listas para imprimir/PDF`);
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos con guías</h3>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
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
          <div className="text-xs text-muted-foreground mb-1">Departamentos</div>
          <div className="text-[22px] font-extrabold">{selectedDepartments.size || 'Todos'}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1">Ciudades</div>
          <div className="text-[22px] font-extrabold">{selectedCities.size || 'Todas'}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1">Seleccionados</div>
          <div className="text-[22px] font-extrabold">{selectedIds.size}</div>
        </div>
      </div>

      {/* Filtros - Primera línea */}
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        
        <label className="app-label !mt-0">Estado</label>
        <select className="app-input !w-auto min-w-[150px]" value={status2Filter} onChange={e => setStatus2Filter(e.target.value)}>
          <option value="PENDIENTES">📋 Pendientes</option>
          <option value="CON_GUIA">✅ Con guía generada</option>
          <option value="TODOS">📦 Todos</option>
        </select>
        
        {role !== 'PROVEEDOR' && (
          <>
            <label className="app-label !mt-0">Proveedor</label>
            <select className="app-input !w-auto min-w-[200px]" value={providerFilter} onChange={e => setProviderFilter(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {allProviders.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Filtros - Segunda línea: Búsqueda, Departamentos y Ciudades */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input className="app-input flex-1 min-w-[200px]" placeholder="🔎 Buscar por cliente, teléfono, ID, ciudad o departamento"
          value={search} onChange={e => setSearch(e.target.value)} />
        
        {/* 🔥 FILTRO POR DEPARTAMENTOS */}
        <div className="relative">
          <button 
            className="nav-btn"
            type="button"
            onClick={() => setShowDeptDropdown(!showDeptDropdown)}
            style={{ background: selectedDepartments.size > 0 ? '#3b82f6' : undefined, color: selectedDepartments.size > 0 ? 'white' : undefined }}
          >
            🗺️ Departamentos {selectedDepartments.size > 0 ? `(${selectedDepartments.size})` : ''}
          </button>
          
          {showDeptDropdown && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-xl w-80 max-h-96 overflow-hidden flex flex-col">
              <div className="p-2 border-b border-border">
                <input 
                  type="text" 
                  className="app-input w-full text-sm" 
                  placeholder="🔎 Buscar departamento..."
                  value={deptSearch}
                  onChange={e => setDeptSearch(e.target.value)}
                />
              </div>
              <div className="p-2 border-b border-border flex gap-2">
                <button className="text-xs nav-btn !py-1" onClick={selectAllDepartments}>
                  {selectedDepartments.size === allDepartments.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
                {selectedDepartments.size > 0 && (
                  <button className="text-xs nav-btn !py-1" onClick={() => setSelectedDepartments(new Set())}>
                    Limpiar
                  </button>
                )}
              </div>
              <div className="overflow-auto max-h-64">
                {filteredDepartments.map(dept => (
                  <label key={dept} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary cursor-pointer text-sm">
                    <input 
                      type="checkbox" 
                      checked={selectedDepartments.has(dept)}
                      onChange={() => toggleDepartment(dept)}
                      className="rounded border-border"
                    />
                    <span>{dept}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {orders.filter(o => o.department === dept).length}
                    </span>
                  </label>
                ))}
                {filteredDepartments.length === 0 && (
                  <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                    No se encontraron departamentos
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* FILTRO POR CIUDADES */}
        <div className="relative">
          <button 
            className="nav-btn"
            type="button"
            onClick={() => setShowCityDropdown(!showCityDropdown)}
            style={{ background: selectedCities.size > 0 ? '#3b82f6' : undefined, color: selectedCities.size > 0 ? 'white' : undefined }}
          >
            🏙️ Ciudades {selectedCities.size > 0 ? `(${selectedCities.size})` : ''}
          </button>
          
          {showCityDropdown && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-xl w-80 max-h-96 overflow-hidden flex flex-col">
              <div className="p-2 border-b border-border">
                <input 
                  type="text" 
                  className="app-input w-full text-sm" 
                  placeholder="🔎 Buscar ciudad..."
                  value={citySearch}
                  onChange={e => setCitySearch(e.target.value)}
                />
              </div>
              <div className="p-2 border-b border-border flex gap-2">
                <button className="text-xs nav-btn !py-1" onClick={selectAllCities}>
                  {selectedCities.size === allCities.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </button>
                {selectedCities.size > 0 && (
                  <button className="text-xs nav-btn !py-1" onClick={() => setSelectedCities(new Set())}>
                    Limpiar
                  </button>
                )}
              </div>
              <div className="overflow-auto max-h-64">
                {filteredCities.map(city => (
                  <label key={city} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary cursor-pointer text-sm">
                    <input 
                      type="checkbox" 
                      checked={selectedCities.has(city)}
                      onChange={() => toggleCity(city)}
                      className="rounded border-border"
                    />
                    <span>{city}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {orders.filter(o => o.city === city).length}
                    </span>
                  </label>
                ))}
                {filteredCities.length === 0 && (
                  <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                    No se encontraron ciudades
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <button className="nav-btn active" onClick={load} disabled={loading}>
          {loading ? 'Cargando...' : 'Filtrar'}
        </button>
      </div>

      {/* Acciones masivas */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="text-sm font-bold text-green-400 mr-2 self-center">
            ✅ {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}:
          </div>
          <button className="nav-btn" style={{ background: '#10b981', color: 'white' }} onClick={bulkMarkAsGuiaGenerada}>
            🚀 Marcar como GUIA GENERADA
          </button>
          <button className="nav-btn" onClick={bulkCopyGuides}>📋 Copiar guías</button>
          <button className="nav-btn active" onClick={downloadTxt}>📥 Descargar TXT</button>
          <button className="nav-btn active" onClick={downloadPdf}>🖨️ Imprimir / PDF</button>
          <button className="nav-btn" onClick={clearSelection} style={{ background: '#ef4444', color: 'white' }}>
            ✖️ Limpiar selección
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button className="nav-btn" onClick={selectAllPending} style={{ background: '#3b82f6', color: 'white' }}>
          ☑️ Seleccionar todos pendientes ({pendingGuides.length})
        </button>
        {selectedIds.size > 0 && selectedIds.size !== pendingGuides.length && pendingGuides.length > 0 && (
          <button className="nav-btn" onClick={selectAllPending}>
            + Agregar resto pendientes ({pendingGuides.length - selectedIds.size})
          </button>
        )}
        {(selectedDepartments.size > 0 || selectedCities.size > 0) && (
          <button className="nav-btn" onClick={() => {
            setSelectedDepartments(new Set());
            setSelectedCities(new Set());
          }}>
            🗑️ Limpiar todos los filtros de ubicación
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1300px]">
          <thead>
            <tr>
              <th className="!w-[40px] text-center">
                <input type="checkbox" checked={selectedIds.size === visibleOrders.length && visibleOrders.length > 0}
                  onChange={() => selectedIds.size === visibleOrders.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(visibleOrders.map(o => o.id)))} />
              </th>
              <th>Fecha</th><th>ID</th><th>Departamento</th><th>Ciudad</th><th>Cliente</th><th>Teléfono</th>
              <th>Vendedor</th><th>Proveedor</th><th>Estado 2</th><th>Guía</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map(o => (
              <tr key={o.id}>
                <td className="text-center">
                  <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                </td>
                <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.department || '—'}</td>
                <td className="text-xs">{o.city || '—'}</td>
                <td className="text-xs">{o.customer_name}</td>
                <td className="text-xs">{o.phone}</td>
                <td className="text-xs">{o.created_by}</td>
                <td className="text-xs">{o.provider_emails_list || o.provider_email || '—'}</td>
                <td>
                  <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.status2 || '--'}
                    onChange={e => updateStatus2(o.id, e.target.value)}>
                    {state2Opts.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => generateGuide(o)} title="Ver guía">📄</button>
                    <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => {
                      const text = buildGuideText(o);
                      navigator.clipboard.writeText(text);
                      toast.success('Copiada');
                    }} title="Copiar guía">📋</button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleOrders.length === 0 && (
              <tr><td colSpan={11} className="text-center text-muted-foreground py-8">Sin pedidos en el rango seleccionado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de guía */}
      {guideText && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4" onClick={() => setGuideText('')}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold mb-3">📦 Guía — {guideId}</h4>
            <pre className="text-xs whitespace-pre-wrap bg-background p-4 rounded-xl border border-border max-h-[400px] overflow-auto">{guideText}</pre>
            <div className="flex gap-2 justify-end mt-4">
              <button className="nav-btn" onClick={() => setGuideText('')}>Cerrar</button>
              <button className="nav-btn active" onClick={copyGuide}>📋 Copiar</button>
              <button className="nav-btn active" onClick={() => {
                downloadFile(guideText, `guia_${guideId}.txt`, 'text/plain');
              }}>📥 TXT</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
