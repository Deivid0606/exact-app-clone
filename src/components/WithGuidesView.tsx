import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

declare global {
  interface Window {
    QRCode: any;
  }
}

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

  // FILTRO POR DEPARTAMENTOS
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [deptSearch, setDeptSearch] = useState('');
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  // Mensajes aleatorios para WhatsApp
  const whatsappMessages = [
    "Buenas le escribo del área del delivery para entregarle su pedido, ¿me podría enviar su ubicación exacta por favor? Desde ya gracias.",
    "Hola, soy su repartidor. Para completar la entrega, necesito su ubicación en tiempo real. Muchas gracias.",
    "¡Buen día! Su pedido está en camino. ¿Podría compartirme su ubicación exacta para llegar sin demoras? Gracias.",
    "Atención: su delivery necesita su ubicación precisa para la entrega. ¿Me la envía por favor? Gracias.",
    "Hola, soy del servicio de delivery. Para entregarle su pedido correctamente, necesito su ubicación exacta. ¡Gracias!"
  ];

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

  // Obtener lista única de ciudades
  const allCities = useMemo(() => {
    const cities = new Set<string>();
    orders.forEach(o => {
      if (o.city && o.city.trim()) {
        cities.add(o.city.trim());
      }
    });
    return Array.from(cities).sort();
  }, [orders]);

  const allDepartments = useMemo(() => {
    const depts = new Set<string>();
    orders.forEach(o => {
      if (o.departamento && o.departamento.trim()) {
        depts.add(o.departamento.trim());
      }
    });
    return Array.from(depts).sort();
  }, [orders]);

  const filteredCities = useMemo(() => {
    if (!citySearch) return allCities;
    return allCities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()));
  }, [allCities, citySearch]);

  const filteredDepartments = useMemo(() => {
    if (!deptSearch) return allDepartments;
    return allDepartments.filter(d => d.toLowerCase().includes(deptSearch.toLowerCase()));
  }, [allDepartments, deptSearch]);

  const toggleCity = (city: string) => {
    setSelectedCities(prev => {
      const next = new Set(prev);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  };

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments(prev => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
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

  const selectAllDepartments = () => {
    if (selectedDepartments.size === allDepartments.length) {
      setSelectedDepartments(new Set());
    } else {
      setSelectedDepartments(new Set(allDepartments));
    }
  };

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
      
      if (selectedCities.size > 0) {
        if (!o.city || !selectedCities.has(o.city)) return false;
      }
      
      if (selectedDepartments.size > 0) {
        if (!o.departamento || !selectedDepartments.has(o.departamento)) return false;
      }
      
      if (!search) return true;
      const q = search.toLowerCase();
      return (o.customer_name || '').toLowerCase().includes(q) ||
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.phone || '').includes(q) || 
        (o.city || '').toLowerCase().includes(q) ||
        (o.departamento || '').toLowerCase().includes(q) ||
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
      `Departamento: ${o.departamento || ''}`,
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

  // Función para obtener URL de WhatsApp
  const getWhatsAppUrl = (order: any) => {
    const randomMessage = whatsappMessages[Math.floor(Math.random() * whatsappMessages.length)];
    const phoneNumber = order.phone?.replace(/\D/g, '');
    const fullNumber = '595' + phoneNumber;
    return 'https://wa.me/' + fullNumber + '?text=' + encodeURIComponent(randomMessage);
  };

  // IMPRESIÓN CON QR DENTRO DE CADA GUÍA
  const printWithQR = () => {
    const selected = getSelectedOrders();
    if (selected.length === 0) { 
      toast.error('Seleccioná pedidos primero'); 
      return; 
    }

    const deliveryNameValue = profile?.full_name || profile?.email?.split('@')[0] || 'Delivery';
    
    // Construir HTML para cada pedido con sus QR
    let allGuidesHtml = '';
    
    for (const order of selected) {
      const items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : (order.items_json || []);
      let itemsHtml = '';
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        itemsHtml += `
          <tr>
            <td style="padding: 4px 0;">${i + 1}</td>
            <td style="padding: 4px 0;">${it.title || it.sku || 'Item'}</td>
            <td style="padding: 4px 0; text-align: center;">${it.qty || 1}</td>
            <td style="padding: 4px 0; text-align: right;">Gs ${nf(Number(it.sale_gs || 0) * Number(it.qty || 1))}</td>
          </tr>
        `;
      }

      const orderId = order.id;
      const orderNumber = order.order_number || order.id.slice(0, 8);
      const whatsappUrl = getWhatsAppUrl(order);
      const deliveryUrl = window.location.origin + '/assign-delivery?order=' + order.id + '&delivery=' + encodeURIComponent(deliveryNameValue);

      allGuidesHtml += `
        <div class="guide-page">
          <h3 style="color: #7c5cff; margin: 0 0 10px 0;">GUÍA DE ENVÍO — ${orderNumber}</h3>
          
          <table style="width: 100%; font-size: 12px; margin-bottom: 12px;">
            <tr><td style="width: 100px; padding: 2px 0; color: #666;">Cliente:</td><td style="font-weight: bold;">${order.customer_name || ''}</td></tr>
            <tr><td style="padding: 2px 0; color: #666;">Teléfono:</td><td>${order.phone || ''}</td></tr>
            <tr><td style="padding: 2px 0; color: #666;">Email:</td><td>${order.email || ''}</td></tr>
            <tr><td style="padding: 2px 0; color: #666;">Departamento:</td><td>${order.departamento || ''}</td></tr>
            <tr><td style="padding: 2px 0; color: #666;">Ciudad:</td><td>${order.city || ''}</td></tr>
            <tr><td style="padding: 2px 0; color: #666;">Dirección:</td><td>${order.street || ''} ${order.district ? '- ' + order.district : ''}</td></tr>
          </table>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f0f0f0; border-bottom: 1px solid #ddd;">
                <th style="text-align: left; padding: 6px 4px;">#</th>
                <th style="text-align: left; padding: 6px 4px;">Producto</th>
                <th style="text-align: center; padding: 6px 4px;">Cant.</th>
                <th style="text-align: right; padding: 6px 4px;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr style="border-top: 1px solid #ddd;">
                <td colspan="3" style="text-align: right; padding: 8px 4px;"><strong>Total:</strong></td>
                <td style="text-align: right; padding: 8px 4px;"><strong>Gs ${nf(Number(order.total_gs || 0))}</strong></td>
              </tr>
            </tfoot>
          </table>
          
          ${order.obs ? `<div style="margin-top: 8px; font-size: 11px; color: #666;">Observación: ${order.obs}</div>` : ''}
          
          <div style="margin-top: 8px; font-size: 10px; color: #666; border-top: 1px solid #eee; padding-top: 8px;">
            Vendedor: ${order.created_by || ''} | Proveedor: ${order.provider_emails_list || order.provider_email || '—'}
          </div>
          
          <!-- QR CODES DENTRO DE LA GUÍA -->
          <div style="display: flex; justify-content: center; gap: 40px; margin-top: 20px; padding-top: 15px; border-top: 2px dashed #ccc;">
            <div style="text-align: center;">
              <div style="font-size: 11px; font-weight: bold; color: #25D366; margin-bottom: 8px;">📱 QR CLIENTE - Enviar Ubicación</div>
              <div id="qr-wa-${orderId}" class="qr-wa" data-url="${whatsappUrl}" style="width: 120px; height: 120px; margin: 0 auto;"></div>
              <div style="font-size: 9px; color: #666; margin-top: 6px;">WhatsApp con ubicación</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 11px; font-weight: bold; color: #F97316; margin-bottom: 8px;">🚚 QR DELIVERY - Asignar Pedido</div>
              <div id="qr-delivery-${orderId}" class="qr-delivery" data-url="${deliveryUrl}" style="width: 120px; height: 120px; margin: 0 auto;"></div>
              <div style="font-size: 9px; color: #666; margin-top: 6px;">Asignación automática</div>
            </div>
          </div>
        </div>
      `;
    }

    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Guías de Envío con QR</title>
      <style>
        @media print {
          body { margin: 0; padding: 0; }
          .guide-page { page-break-after: always; page-break-inside: avoid; }
        }
        @media screen {
          body { margin: 0; padding: 20px; background: #f5f5f5; }
          .guide-page { background: white; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        }
        .guide-page {
          padding: 20px;
          font-family: Arial, sans-serif;
          border: 1px solid #ddd;
          max-width: 800px;
          margin: 0 auto 20px auto;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
    </head>
    <body>
      ${allGuidesHtml}
      <script>
        (function() {
          function generateQRCodes() {
            if (typeof QRCode === 'undefined') {
              setTimeout(generateQRCodes, 200);
              return;
            }
            
            // Generar QR para WhatsApp (clientes)
            document.querySelectorAll('.qr-wa').forEach(function(el) {
              const url = el.getAttribute('data-url');
              if (url && el.children.length === 0) {
                new QRCode(el, { text: url, width: 120, height: 120 });
              }
            });
            
            // Generar QR para delivery
            document.querySelectorAll('.qr-delivery').forEach(function(el) {
              const url = el.getAttribute('data-url');
              if (url && el.children.length === 0) {
                new QRCode(el, { text: url, width: 120, height: 120 });
              }
            });
          }
          
          generateQRCodes();
        })();
      </script>
    </body>
    </html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 1000);
    }
    toast.success(`${selected.length} guías con QR listas para imprimir`);
  };

  const downloadPdf = () => {
    printWithQR();
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

      {/* Filtros */}
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

      {/* Filtros segunda línea */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input className="app-input flex-1 min-w-[200px]" placeholder="🔎 Buscar por cliente, teléfono, ID, ciudad o departamento"
          value={search} onChange={e => setSearch(e.target.value)} />
        
        <div className="relative">
          <button className="nav-btn" type="button" onClick={() => setShowDeptDropdown(!showDeptDropdown)}
            style={{ background: selectedDepartments.size > 0 ? '#3b82f6' : undefined, color: selectedDepartments.size > 0 ? 'white' : undefined }}>
            🗺️ Departamentos {selectedDepartments.size > 0 ? `(${selectedDepartments.size})` : ''}
          </button>
          {showDeptDropdown && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-xl w-80 max-h-96 overflow-hidden flex flex-col">
              <div className="p-2 border-b border-border">
                <input type="text" className="app-input w-full text-sm" placeholder="🔎 Buscar departamento..."
                  value={deptSearch} onChange={e => setDeptSearch(e.target.value)} />
              </div>
              <div className="p-2 border-b border-border flex gap-2">
                <button className="text-xs nav-btn !py-1" onClick={selectAllDepartments}>
                  {selectedDepartments.size === allDepartments.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
                <button className="text-xs nav-btn !py-1" onClick={() => setSelectedDepartments(new Set())}>Limpiar</button>
              </div>
              <div className="overflow-auto max-h-64">
                {filteredDepartments.map(dept => (
                  <label key={dept} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary cursor-pointer text-sm">
                    <input type="checkbox" checked={selectedDepartments.has(dept)} onChange={() => toggleDepartment(dept)} />
                    <span>{dept}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{orders.filter(o => o.departamento === dept).length}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="relative">
          <button className="nav-btn" type="button" onClick={() => setShowCityDropdown(!showCityDropdown)}
            style={{ background: selectedCities.size > 0 ? '#3b82f6' : undefined, color: selectedCities.size > 0 ? 'white' : undefined }}>
            🏙️ Ciudades {selectedCities.size > 0 ? `(${selectedCities.size})` : ''}
          </button>
          {showCityDropdown && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-xl w-80 max-h-96 overflow-hidden flex flex-col">
              <div className="p-2 border-b border-border">
                <input type="text" className="app-input w-full text-sm" placeholder="🔎 Buscar ciudad..."
                  value={citySearch} onChange={e => setCitySearch(e.target.value)} />
              </div>
              <div className="p-2 border-b border-border flex gap-2">
                <button className="text-xs nav-btn !py-1" onClick={selectAllCities}>
                  {selectedCities.size === allCities.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </button>
                <button className="text-xs nav-btn !py-1" onClick={() => setSelectedCities(new Set())}>Limpiar</button>
              </div>
              <div className="overflow-auto max-h-64">
                {filteredCities.map(city => (
                  <label key={city} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary cursor-pointer text-sm">
                    <input type="checkbox" checked={selectedCities.has(city)} onChange={() => toggleCity(city)} />
                    <span>{city}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{orders.filter(o => o.city === city).length}</span>
                  </label>
                ))}
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
          <button className="nav-btn active" onClick={printWithQR} style={{ background: '#8b5cf6', color: 'white' }}>
            🖨️ Imprimir con QR
          </button>
          <button className="nav-btn" onClick={clearSelection} style={{ background: '#ef4444', color: 'white' }}>
            ✖️ Limpiar selección
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button className="nav-btn" onClick={selectAllPending} style={{ background: '#3b82f6', color: 'white' }}>
          ☑️ Seleccionar todos pendientes ({pendingGuides.length})
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1200px]">
          <thead>
            <tr>
              <th className="!w-[40px] text-center">
                <input type="checkbox" checked={selectedIds.size === visibleOrders.length && visibleOrders.length > 0}
                  onChange={() => selectedIds.size === visibleOrders.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(visibleOrders.map(o => o.id)))} />
              </th>
              <th>Fecha</th>
              <th>ID</th>
              <th>Departamento</th>
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
            {visibleOrders.map(o => (
              <tr key={o.id}>
                <td className="text-center">
                  <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                </td>
                <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="text-xs">{o.departamento || '—'}</td>
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
              <tr>
                <td colSpan={11} className="text-center text-muted-foreground py-8">Sin pedidos en el rango seleccionado</td>
              </tr>
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
