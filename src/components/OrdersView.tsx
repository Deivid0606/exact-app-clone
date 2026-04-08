import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Helper para verificar si el proveedor tiene acceso al pedido
function isProviderAllowed(order: any, userEmail: string): boolean {
  const providerList = order.provider_emails_list;
  if (!providerList) return false;

  let emails: string[] = [];
  if (Array.isArray(providerList)) {
    emails = providerList;
  } else if (typeof providerList === 'string') {
    try {
      const parsed = JSON.parse(providerList);
      if (Array.isArray(parsed)) emails = parsed;
      else emails = providerList.split(',').map(s => s.trim());
    } catch {
      emails = providerList.split(',').map(s => s.trim());
    }
  }
  return emails.some(email => norm(email) === norm(userEmail));
}

export default function OrdersWithGuides() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const myEmail = profile?.email || '';
  const isProvider = role === 'PROVEEDOR';

  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [providerFilter, setProviderFilter] = useState('');
  const [providersList, setProvidersList] = useState<string[]>([]);
  const [guideText, setGuideText] = useState('');
  const [guideOrderId, setGuideOrderId] = useState('');

  // Cargar pedidos con filtro automático para proveedor
  const loadOrders = async () => {
    setLoading(true);
    
    let query = supabase.from('orders').select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false });

    // 🔥 CLAVE: Si es PROVEEDOR, filtrar automáticamente por su email
    if (isProvider) {
      // Buscar en provider_emails_list (array)
      // Nota: Esto es una aproximación, idealmente tendrías una columna provider_email
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', dateFrom + 'T00:00:00')
        .lte('created_at', dateTo + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (error) {
        toast.error(error.message);
      } else {
        // Filtrar por provider_emails_list
        const filtered = (data || []).filter(order => isProviderAllowed(order, myEmail));
        setOrders(filtered);
      }
      setLoading(false);
      return;
    }
    
    // Si NO es proveedor, puede filtrar manualmente por providerFilter
    const { data, error } = await query.limit(500);
    
    if (error) {
      toast.error(error.message);
    } else {
      let filteredData = data || [];
      // Si hay filtro de proveedor manual
      if (providerFilter) {
        filteredData = filteredData.filter(order => isProviderAllowed(order, providerFilter));
      }
      setOrders(filteredData);
    }
    
    setLoading(false);
  };

  // Cargar lista de proveedores solo si NO es proveedor
  useEffect(() => {
    if (!isProvider) {
      supabase.from('profiles')
        .select('email, name')
        .eq('role', 'PROVEEDOR')
        .then(({ data }) => {
          const emails = (data || []).map(p => p.email);
          setProvidersList(emails);
        });
    }
  }, [isProvider]);

  useEffect(() => {
    loadOrders();
  }, [dateFrom, dateTo, providerFilter]);

  // Filtrado por búsqueda
  const filtered = useMemo(() => {
    const q = norm(search);
    return orders.filter(o => {
      if (q) {
        const hay = [o.customer_name, o.phone, o.order_number, o.id, o.city].map(norm).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search]);

  const handleStatus2Change = async (orderId: string, newStatus2: string) => {
    const val = newStatus2 === '--' ? null : newStatus2;
    const order = orders.find(o => o.id === orderId);
    const orderNum = order?.order_number || orderId.slice(0, 8);
    const { error } = await supabase.from('orders').update({ status2: val, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Estado 2 → ${newStatus2}`);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status2: val } : o));
  };

  const handleGuideChange = async (orderId: string, guideNumber: string) => {
    const order = orders.find(o => o.id === orderId);
    const orderNum = order?.order_number || orderId.slice(0, 8);
    const { error } = await supabase.from('orders').update({ guide_number: guideNumber || null, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(guideNumber ? `Guía ${guideNumber} agregada` : 'Guía removida');
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, guide_number: guideNumber || null } : o));
  };

  const generateGuide = (o: any) => {
    try {
      const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
      const itemsText = items.map((it: any, i: number) =>
        `${i + 1}. ${it.title || it.sku || 'Item'} x${it.qty || 1} — Gs ${nf(Number(it.sale_gs || 0) * Number(it.qty || 1))}`
      ).join('\n');

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
        `Total: Gs ${nf(Number(o.total_gs || 0))}`,
        `Delivery: Gs ${nf(Number(o.delivery_gs || 0))}`,
        o.obs ? `Observación: ${o.obs}` : '',
        `━━━━━━━━━━━━━━━━━━`,
        `Vendedor: ${o.created_by || ''}`,
        `Proveedor: ${o.provider_email || '—'}`,
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

  // Estadísticas
  const stats = {
    pending: filtered.filter(o => !o.guide_number).length,
    withGuide: filtered.filter(o => o.guide_number).length,
    total: filtered.length,
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos con guías</h3>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-yellow-500/10 rounded-lg p-3 text-center border border-yellow-500/20">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Guías pendientes</div>
        </div>
        <div className="bg-green-500/10 rounded-lg p-3 text-center border border-green-500/20">
          <div className="text-2xl font-bold text-green-600">{stats.withGuide}</div>
          <div className="text-xs text-muted-foreground">Con guía generada</div>
        </div>
        <div className="bg-blue-500/10 rounded-lg p-3 text-center border border-blue-500/20">
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total en rango</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />

        {/* 🔥 Selector de proveedores: SOLO visible si NO es proveedor */}
        {!isProvider && providersList.length > 0 && (
          <>
            <label className="app-label !mt-0">Proveedor</label>
            <select 
              className="app-input !w-auto" 
              value={providerFilter} 
              onChange={e => setProviderFilter(e.target.value)}
            >
              <option value="">Todos los proveedores</option>
              {providersList.map(email => (
                <option key={email} value={email}>{email}</option>
              ))}
            </select>
          </>
        )}

        {/* 🔥 Si es proveedor, mostrar su email fijo (no puede filtrar) */}
        {isProvider && (
          <div className="bg-primary/10 px-3 py-1.5 rounded-md text-sm font-medium border border-primary/20">
            📧 Proveedor: {myEmail}
          </div>
        )}

        <input 
          className="app-input !w-auto min-w-[250px] flex-1" 
          placeholder="🔎 Buscar por cliente, teléfono, ID o ciudad"
          value={search} 
          onChange={e => setSearch(e.target.value)} 
        />
        
        <button className="nav-btn active" onClick={loadOrders} disabled={loading}>
          {loading ? 'Cargando...' : 'Filtrar'}
        </button>
      </div>

      <div className="text-xs text-muted-foreground mb-2">{filtered.length} pedidos</div>

      {/* Tabla */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1000px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left py-2 px-3">Fecha</th>
              <th className="text-left py-2 px-3">ID</th>
              <th className="text-left py-2 px-3">Ciudad</th>
              <th className="text-left py-2 px-3">Cliente</th>
              <th className="text-left py-2 px-3">Teléfono</th>
              <th className="text-left py-2 px-3">Vendedor</th>
              <th className="text-left py-2 px-3">Proveedor</th>
              <th className="text-left py-2 px-3">Estado 2</th>
              <th className="text-left py-2 px-3">Guía</th>
              <th className="text-left py-2 px-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-muted-foreground py-8">
                  {loading ? 'Cargando...' : 'Sin pedidos en este rango'}
                </td>
              </tr>
            )}
            {filtered.map(o => (
              <tr key={o.id} className="border-b border-border hover:bg-muted/30">
                <td className="py-2 px-3 whitespace-nowrap text-xs">
                  {new Date(o.created_at).toLocaleDateString('es-PY')}
                </td>
                <td className="py-2 px-3 font-bold text-xs">{o.order_number || o.id.slice(0, 8)}</td>
                <td className="py-2 px-3 text-xs">{o.city || '—'}</td>
                <td className="py-2 px-3 text-xs">{o.customer_name || '—'}</td>
                <td className="py-2 px-3 text-xs">{o.phone || '—'}</td>
                <td className="py-2 px-3 text-xs">{o.created_by || '—'}</td>
                <td className="py-2 px-3 text-xs">{o.provider_email || '—'}</td>
                <td className="py-2 px-3">
                  <select
                    className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[100px]"
                    value={o.status2 || '--'}
                    onChange={e => handleStatus2Change(o.id, e.target.value)}
                  >
                    <option value="--">--</option>
                    <option value="GUIA GENERADA">GUIA GENERADA</option>
                    <option value="FUERA DE COBERTURA">FUERA DE COBERTURA</option>
                    <option value="CANCELADO">CANCELADO</option>
                    <option value="REPETIDO">REPETIDO</option>
                    <option value="RENDIDO">RENDIDO</option>
                  </select>
                </td>
                <td className="py-2 px-3">
                  <input
                    type="text"
                    className="app-input !py-1 !px-2 !text-[11px] !w-[120px]"
                    placeholder="N° guía"
                    value={o.guide_number || ''}
                    onChange={e => handleGuideChange(o.id, e.target.value)}
                  />
                </td>
                <td className="py-2 px-3">
                  <div className="flex gap-1">
                    <button 
                      className="nav-btn !px-2 !py-1 !text-[10px]" 
                      onClick={() => generateGuide(o)} 
                      title="Ver guía"
                    >
                      📄
                    </button>
                    <button 
                      className="nav-btn !px-2 !py-1 !text-[10px]" 
                      onClick={() => {
                        generateGuide(o);
                        setTimeout(copyGuide, 100);
                      }} 
                      title="Copiar guía"
                    >
                      📋
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Guía */}
      {guideText && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4" onClick={() => setGuideText('')}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold mb-3">Guía — {guideOrderId}</h4>
            <pre className="text-sm whitespace-pre-wrap bg-background p-5 rounded-xl border border-border max-h-[70vh] overflow-auto leading-relaxed font-mono">{guideText}</pre>
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
