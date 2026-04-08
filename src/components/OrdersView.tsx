import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const STATUS2_ALL = ['--', 'GUIA GENERADA', 'FUERA DE COBERTURA', 'CANCELADO', 'REPETIDO', 'RENDIDO'];

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
  const [lastUpdate, setLastUpdate] = useState('');

  const loadOrders = async () => {
    setLoading(true);
    
    let query = supabase.from('orders').select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })
      .limit(500);

    const { data, error } = await query;
    
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    
    let filteredData = data || [];
    
    // Si es PROVEEDOR, filtrar solo sus pedidos
    if (isProvider) {
      filteredData = filteredData.filter(order => isProviderAllowed(order, myEmail));
    }
    
    setOrders(filteredData);
    setLastUpdate(new Date().toLocaleString('es-PY'));
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, [dateFrom, dateTo]);

  // Filtrado por búsqueda
  const filtered = useMemo(() => {
    const q = norm(search);
    return orders.filter(o => {
      if (q) {
        const hay = [o.customer_name, o.phone, o.order_number, o.id, o.city, o.created_by].map(norm).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search]);

  const handleStatus2Change = async (orderId: string, newStatus2: string) => {
    const val = newStatus2 === '--' ? null : newStatus2;
    const { error } = await supabase.from('orders').update({ status2: val, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Estado 2 → ${newStatus2}`);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status2: val } : o));
  };

  // Estadísticas
  const stats = {
    pending: filtered.filter(o => !o.guide_number && o.status2 !== 'GUIA GENERADA').length,
    withGuide: filtered.filter(o => o.guide_number || o.status2 === 'GUIA GENERADA').length,
    total: filtered.length,
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos con guías</h3>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-yellow-500/10 rounded-lg p-3 text-center border border-yellow-500/20">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Guías pendientes</div>
        </div>
        <div className="bg-green-500/10 rounded-lg p-3 text-center border border-green-500/20">
          <div className="text-2xl font-bold text-green-600">{stats.withGuide}</div>
          <div className="text-xs text-muted-foreground">Con guía generada</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />

        {/* Si es PROVEEDOR, mostrar su email fijo */}
        {isProvider && (
          <div className="bg-primary/10 px-3 py-1.5 rounded-md text-sm font-medium border border-primary/20">
            📧 Proveedor: {myEmail}
          </div>
        )}

        {/* Si NO es proveedor, mostrar selector de proveedores */}
        {!isProvider && (
          <div className="bg-muted/50 px-3 py-1.5 rounded-md text-sm">
            <span className="font-medium">Todos los proveedores</span>
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
        <table className="app-table min-w-[900px]">
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
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-8">
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
                    className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[120px]"
                    value={o.status2 || '--'}
                    onChange={e => handleStatus2Change(o.id, e.target.value)}
                  >
                    {STATUS2_ALL.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Última actualización */}
      <div className="text-xs text-muted-foreground mt-3 text-right">
        Última actualización: {lastUpdate}
      </div>
    </div>
  );
}
