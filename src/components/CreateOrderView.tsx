import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type OrderRow = {
  id: number | string;
  order_number: string | null;
  created_at: string | null;
  city: string | null;
  customer_name: string | null;
  created_by: string | null;
  status: string | null;
};

const formatDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('es-PY');
};

const statusOptions = [
  'Todos los estados',
  'PENDIENTE',
  'EN RUTA',
  'ENTREGADO',
  'CANCELADO',
  'RECHAZADO',
];

interface CreateOrderViewProps {
  initialSku?: string | null;
  onSkuConsumed?: () => void;
}

export default function OrdersView({ initialSku, onSkuConsumed }: CreateOrderViewProps) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 21);
    return formatDateInput(d);
  });

  const [toDate, setToDate] = useState(() => formatDateInput(new Date()));
  const [statusFilter, setStatusFilter] = useState('Todos los estados');
  const [selectedIds, setSelectedIds] = useState<(number | string)[]>([]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const fromIso = new Date(`${fromDate}T00:00:00`).toISOString();
      const toIso = new Date(`${toDate}T23:59:59.999`).toISOString();

      let query = supabase
        .from('orders')
        .select('id, order_number, created_at, city, customer_name, created_by, status')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'Todos los estados') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setOrders((data || []) as OrderRow[]);
      setSelectedIds([]);
    } catch (error: any) {
      console.error('Error cargando pedidos:', error);
      toast.error(error?.message || 'No se pudieron cargar los pedidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const visibleOrders = useMemo(() => orders, [orders]);

  const toggleAll = () => {
    if (selectedIds.length === visibleOrders.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(visibleOrders.map((o) => o.id));
  };

  const toggleOne = (id: number | string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getStatusClass = (status?: string | null) => {
    const s = (status || '').toUpperCase();
    if (s === 'ENTREGADO') return 'bg-green-500/15 text-green-400 border border-green-500/30';
    if (s === 'EN RUTA') return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
    if (s === 'CANCELADO' || s === 'RECHAZADO') {
      return 'bg-red-500/15 text-red-400 border border-red-500/30';
    }
    return 'bg-white/5 text-white/80 border border-white/10';
  };

  return (
    <div className="app-card">
      <h3 className="text-2xl font-extrabold mb-4">Pedidos</h3>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="app-label">Desde</label>
          <input
            type="date"
            className="app-input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div>
          <label className="app-label">Hasta</label>
          <input
            type="date"
            className="app-input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div className="min-w-[220px]">
          <label className="app-label">Estado</label>
          <select
            className="app-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <button className="nav-btn active" onClick={loadOrders} disabled={loading}>
          {loading ? 'Cargando...' : 'Filtrar'}
        </button>
      </div>

      <div className="text-sm text-muted-foreground mb-3">
        {visibleOrders.length} pedido{visibleOrders.length === 1 ? '' : 's'}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="py-3 pr-3 w-[40px]">
                <input
                  type="checkbox"
                  checked={visibleOrders.length > 0 && selectedIds.length === visibleOrders.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="py-3 pr-4">Fecha</th>
              <th className="py-3 pr-4">ID</th>
              <th className="py-3 pr-4">Ciudad</th>
              <th className="py-3 pr-4">Cliente</th>
              <th className="py-3 pr-4">Vendedor</th>
              <th className="py-3 pr-4">Estado</th>
            </tr>
          </thead>

          <tbody>
            {visibleOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  {loading ? 'Cargando pedidos...' : 'No hay pedidos en ese rango'}
                </td>
              </tr>
            ) : (
              visibleOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                >
                  <td className="py-4 pr-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(order.id)}
                      onChange={() => toggleOne(order.id)}
                    />
                  </td>

                  <td className="py-4 pr-4 whitespace-nowrap">
                    {formatDateTime(order.created_at)}
                  </td>

                  <td className="py-4 pr-4 font-bold whitespace-nowrap">
                    {order.order_number || order.id}
                  </td>

                  <td className="py-4 pr-4 whitespace-nowrap">
                    {order.city || '-'}
                  </td>

                  <td className="py-4 pr-4 whitespace-nowrap">
                    {order.customer_name || '-'}
                  </td>

                  <td className="py-4 pr-4 whitespace-nowrap">
                    {order.created_by || '-'}
                  </td>

                  <td className="py-4 pr-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusClass(order.status)}`}>
                      {order.status || 'PENDIENTE'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
