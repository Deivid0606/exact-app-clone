// ============================================================
// PEDIDOS CON GUÍAS - VERSIÓN FINAL
// Filtro automático por email del usuario logueado
// SIN selector de proveedores
// ============================================================

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function PedidosConGuias() {
  const { profile } = useAuth();
  const myEmail = profile?.email || ''; // ← Email fijo del usuario logueado

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Cargar pedidos filtrados por el email del proveedor logueado
  const loadOrders = async () => {
    if (!myEmail) {
      toast.error('No se detectó usuario logueado');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .filter('provider_emails_list', 'cs', `["${myEmail}"]`) // ← FILTRO AUTOMÁTICO por email logueado
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      toast.error('Error al cargar pedidos: ' + error.message);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (myEmail) loadOrders();
  }, [dateFrom, dateTo, myEmail]);

  // Filtro por búsqueda local
  const filtered = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.customer_name?.toLowerCase().includes(q) ||
      o.phone?.includes(q) ||
      o.order_number?.toLowerCase().includes(q) ||
      o.id?.toLowerCase().includes(q) ||
      o.city?.toLowerCase().includes(q)
    );
  });

  // Estadísticas
  const guiasPendientes = filtered.filter(o => !o.status2 || o.status2 === '--' || o.status2 === null).length;
  const guiasGeneradas = filtered.filter(o => o.status2 === 'GUIA GENERADA').length;
  const seleccionados = selectedIds.size;

  // Generar guía individual
  const generarGuia = (o: any) => {
    const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json || '[]') : (o.items_json || []);
    const itemsText = items.map((it: any, i: number) => 
      `${i + 1}. ${it.title || it.sku || 'Item'} x${it.qty || 1} — Gs ${nf(Number(it.sale_gs || 0) * Number(it.qty || 1))}`
    ).join('\n');

    const textoGuia = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `GUÍA DE ENVÍO — ${o.order_number || o.id.slice(0, 8)}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Cliente: ${o.customer_name || ''}`,
      `Teléfono: ${o.phone || ''}`,
      `Email: ${o.email || ''}`,
      `Ciudad: ${o.city || ''}`,
      `Dirección: ${o.street || ''} ${o.district ? '- ' + o.district : ''}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Productos:`,
      itemsText || '  Sin productos',
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Total: Gs ${nf(Number(o.total_gs || 0))}`,
      `Delivery: Gs ${nf(Number(o.delivery_gs || 0))}`,
      o.obs ? `Observación: ${o.obs}` : '',
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Proveedor: ${myEmail}`,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(textoGuia);
    toast.success('Guía copiada al portapapeles');
  };

  // Generar guías masivas
  const generarGuiasMasivas = () => {
    const selected = filtered.filter(o => selectedIds.has(o.id));
    if (selected.length === 0) {
      toast.error('Seleccioná al menos un pedido');
      return;
    }

    const todasGuias = selected.map(o => {
      const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json || '[]') : (o.items_json || []);
      const itemsText = items.map((it: any, i: number) => `  ${i + 1}. ${it.title || it.sku} x${it.qty}`).join('\n');
      return `${o.order_number || o.id.slice(0, 8)} — ${o.customer_name} — ${o.city}\nTeléfono: ${o.phone}\nDirección: ${o.street || ''} ${o.district || ''}\n${itemsText}\nTotal: Gs ${nf(Number(o.total_gs || 0))}\n${o.obs ? 'Obs: ' + o.obs : ''}`;
    }).join('\n\n════════════════════════════════════\n\n');

    navigator.clipboard.writeText(todasGuias);
    toast.success(`${selected.length} guías copiadas`);
  };

  // Actualizar Estado 2 (GUIA GENERADA)
  const actualizarEstado2 = async (orderId: string, nuevoEstado: string) => {
    const valor = nuevoEstado === '--' ? null : nuevoEstado;
    const { error } = await supabase
      .from('orders')
      .update({ status2: valor, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Estado 2 → ${nuevoEstado}`);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status2: valor } : o));
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

  if (!myEmail) {
    return (
      <div className="app-card text-center py-8">
        <p className="text-destructive">Debes iniciar sesión para ver tus pedidos asignados</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-extrabold">Pedidos con guías</h3>
        <div className="text-sm text-muted-foreground">
          Proveedor: <span className="font-mono font-bold text-foreground">{myEmail}</span>
        </div>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-primary/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-primary">{guiasPendientes}</div>
          <div className="text-xs text-muted-foreground">Guías pendientes</div>
        </div>
        <div className="bg-success/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-success">{guiasGeneradas}</div>
          <div className="text-xs text-muted-foreground">Con guía generada</div>
        </div>
        <div className="bg-info/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{filtered.length}</div>
          <div className="text-xs text-muted-foreground">Total en rango</div>
        </div>
        <div className="bg-warning/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{seleccionados}</div>
          <div className="text-xs text-muted-foreground">Seleccionados</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="app-label !mt-0">Desde</label>
        <input 
          type="date" 
          className="app-input !w-auto" 
          value={dateFrom} 
          onChange={e => setDateFrom(e.target.value)} 
        />
        <label className="app-label !mt-0">Hasta</label>
        <input 
          type="date" 
          className="app-input !w-auto" 
          value={dateTo} 
          onChange={e => setDateTo(e.target.value)} 
        />
        <input 
          className="app-input flex-1 min-w-[200px]" 
          placeholder="🔎 Buscar por cliente, teléfono, ID o ciudad"
          value={search} 
          onChange={e => setSearch(e.target.value)} 
        />
        <button className="nav-btn active" onClick={loadOrders} disabled={loading}>
          {loading ? 'Cargando...' : 'Filtrar'}
        </button>
        {seleccionados > 0 && (
          <button className="nav-btn" onClick={generarGuiasMasivas}>
            📋 Copiar {seleccionados} guías
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-auto">
        <table className="app-table min-w-[1200px]">
          <thead>
            <tr>
              <th className="!w-[40px] text-center">
                <input 
                  type="checkbox" 
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll} 
                  title="Seleccionar todos" 
                />
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
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="text-center text-muted-foreground py-8">
                  No hay pedidos asignados a {myEmail} en este rango de fechas
                </td>
              </tr>
            )}
            {filtered.map(o => (
              <tr key={o.id}>
                <td className="text-center">
                  <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                </td>
                <td className="whitespace-nowrap text-xs">
                  {new Date(o.created_at).toLocaleString('es-PY')}
                </td>
                <td className="font-mono text-xs font-bold">
                  {o.order_number || o.id.slice(0, 8)}
                </td>
                <td className="text-xs">{o.city || '—'}</td>
                <td className="text-xs font-medium">{o.customer_name || '—'}</td>
                <td className="text-xs">{o.phone || '—'}</td>
                <td className="text-xs">{o.created_by || '—'}</td>
                <td className="text-xs font-mono">{myEmail}</td> {/* ← Email fijo del proveedor */}
                <td>
                  <select
                    className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[120px]"
                    value={o.status2 || '--'}
                    onChange={e => actualizarEstado2(o.id, e.target.value)}
                  >
                    <option value="--">--</option>
                    <option value="GUIA GENERADA">✅ GUIA GENERADA</option>
                    <option value="FUERA DE COBERTURA">❌ FUERA DE COBERTURA</option>
                    <option value="CANCELADO">🚫 CANCELADO</option>
                    <option value="REPETIDO">🔄 REPETIDO</option>
                    <option value="RENDIDO">💰 RENDIDO</option>
                  </select>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button 
                      className="nav-btn !px-2 !py-1 !text-[10px]" 
                      onClick={() => generarGuia(o)}
                      title="Copiar guía"
                    >
                      📋 Guía
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
