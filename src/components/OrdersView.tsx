// ================================
// OrdersView.tsx
// VERSION CORREGIDA 100%
// ================================

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

// 🔥 FECHA LOCAL SEGURA
const getLocalDate = (value: string | null | undefined) => {
  if (!value) return '';

  const d = new Date(value);

  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const STATUS1_ALL = [
  'PENDIENTE',
  'EN RUTA',
  'ENTREGADO',
  'ENCOMIENDA ENTREGADA',
  'CANCELADO',
  'REAGENDADO',
  'NO CONTESTA',
  'RECHAZADO',
  'RECHAZADO EN EL LUGAR',
  'NO DESEA',
  'CANCELÓ POR WHATSAPP',
  'DEVUELTO A DEPÓSITO',
];

const STATUS1_DELIVERY = STATUS1_ALL.filter(
  s => s !== 'DEVUELTO A DEPÓSITO'
);

const STATUS2_ALL = [
  '--',
  'GUIA GENERADA',
  'FUERA DE COBERTURA',
  'CANCELADO',
  'REPETIDO',
  'RENDIDO',
];

interface EditOrder {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  street: string;
  district: string;
  email: string;
  obs: string;
  assigned_at: string;
  provider_email?: string;
}

function isProviderAllowed(order: any, userEmail: string): boolean {
  const orderProviderEmail = order?.provider_email;

  if (!orderProviderEmail) return false;

  return norm(orderProviderEmail) === norm(userEmail);
}

export default function OrdersView() {
  const { profile } = useAuth();

  const role = profile?.role || '';
  const myEmail = profile?.email || '';

  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 🔥 FECHAS SEGURAS
  const [dateFrom, setDateFrom] = useState('2024-01-01');

  const [dateTo, setDateTo] = useState(() =>
    getLocalDate(new Date().toISOString())
  );

  const [loading, setLoading] = useState(false);

  const [editOrder, setEditOrder] = useState<EditOrder | null>(null);

  const [guideText, setGuideText] = useState('');
  const [guideOrderId, setGuideOrderId] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 🔥 FILTRO FECHAS CORREGIDO
  const applyDateFilter = (data: any[]) => {
    const from = dateFrom <= dateTo ? dateFrom : dateTo;
    const to = dateFrom <= dateTo ? dateTo : dateFrom;

    return data.filter(order => {
      const orderDate = getLocalDate(order.created_at);

      if (!orderDate) return false;

      return orderDate >= from && orderDate <= to;
    });
  };

  const loadOrders = async () => {
    setLoading(true);

    const { data: allOrdersData, error: ordersError } = await supabase.rpc(
      'get_all_orders_without_limit'
    );

    if (ordersError) {
      console.error(ordersError);
      toast.error('Error cargando pedidos');
      setLoading(false);
      return;
    }

    const loadedOrders = allOrdersData || [];

    console.log('TOTAL PEDIDOS:', loadedOrders.length);

    const [deliveriesRes, providersRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('email, name, user_id')
        .then(async profilesRes => {
          const profiles = profilesRes.data || [];

          const { data: roles } = await supabase
            .from('user_roles')
            .select('user_id, role')
            .eq('role', 'DELIVERY');

          const deliveryIds = new Set(
            (roles || []).map((r: any) => r.user_id)
          );

          return profiles.filter((p: any) =>
            deliveryIds.has(p.user_id)
          );
        }),

      supabase
        .from('profiles')
        .select('email, name, company_name')
        .eq('role', 'PROVEEDOR'),
    ]);

    setAllOrders(loadedOrders);

    // 🔥 FECHAS CORREGIDAS
    const filteredByDate = applyDateFilter(loadedOrders);

    setOrders(filteredByDate);

    setDeliveries(deliveriesRes);

    setProviders(providersRes.data || []);

    setLoading(false);

    supabase
      .from('client_prices')
      .select('*')
      .order('city')
      .then(({ data }) => setClientPrices(data || []));
  };

  // 🔥 RECARGAR CUANDO CAMBIAN FECHAS
  useEffect(() => {
    if (allOrders.length > 0) {
      setOrders(applyDateFilter(allOrders));
    }
  }, [dateFrom, dateTo, allOrders]);

  useEffect(() => {
    loadOrders();
  }, []);

  // 🔥 FILTRO GENERAL
  const filtered = useMemo(() => {
    const q = norm(search);

    return orders.filter(o => {
      // vendedor
      if (
        role === 'VENDEDOR' &&
        norm(o.created_by || '') !== norm(myEmail)
      ) {
        return false;
      }

      // delivery
      if (
        role === 'DELIVERY' &&
        norm(o.assigned_delivery || '') !== norm(myEmail)
      ) {
        return false;
      }

      // proveedor
      if (
        role === 'PROVEEDOR' &&
        !isProviderAllowed(o, myEmail)
      ) {
        return false;
      }

      // estado
      if (
        statusFilter &&
        (o.status || 'PENDIENTE') !== statusFilter
      ) {
        return false;
      }

      // búsqueda
      if (q) {
        const hay = [
          o.customer_name,
          o.phone,
          o.order_number,
          o.id,
          o.city,
          o.created_by,
          o.assigned_delivery,
          o.provider_email,
        ]
          .map(norm)
          .join(' ');

        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [orders, search, statusFilter, role, myEmail]);

  // 🔥 ACTUALIZAR ESTADO
  const handleStatus1Change = async (
    orderId: string,
    newStatus: string
  ) => {
    const { error } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Estado actualizado');

    setAllOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, status: newStatus }
          : o
      )
    );

    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, status: newStatus }
          : o
      )
    );
  };

  // 🔥 ASIGNAR DELIVERY
  const handleAssignDelivery = async (
    orderId: string,
    deliveryEmail: string
  ) => {
    const updates = {
      assigned_delivery: deliveryEmail || null,
      assigned_at: deliveryEmail
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
      status: deliveryEmail ? 'EN RUTA' : 'PENDIENTE',
    };

    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Delivery asignado');

    setAllOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, ...updates }
          : o
      )
    );

    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, ...updates }
          : o
      )
    );
  };

  // 🔥 GENERAR GUÍA
  const generateGuide = (o: any) => {
    const text = `
GUÍA DE ENVÍO

Cliente: ${o.customer_name || ''}
Teléfono: ${o.phone || ''}
Ciudad: ${o.city || ''}
Dirección: ${o.street || ''}
Total: ${nf(Number(o.total_gs || 0))}
Proveedor: ${o.provider_email || ''}
`;

    setGuideText(text);

    setGuideOrderId(
      o.order_number || o.id.slice(0, 8)
    );
  };

  const copyGuide = () => {
    navigator.clipboard.writeText(guideText);

    toast.success('Guía copiada');
  };

  // 🔥 SELECCIÓN
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);

      next.has(id)
        ? next.delete(id)
        : next.add(id);

      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(
        new Set(filtered.map(o => o.id))
      );
    }
  };

  const statusClass = (s: string) => {
    if (
      s === 'ENTREGADO' ||
      s === 'ENCOMIENDA ENTREGADA'
    ) {
      return 'badge-entregado';
    }

    if (
      [
        'CANCELADO',
        'RECHAZADO',
        'NO DESEA',
      ].includes(s)
    ) {
      return 'badge-cancelado';
    }

    return 'badge-pendiente';
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">
        Pedidos
      </h3>

      {/* 🔥 FILTROS */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <label>Desde</label>

        <input
          type="date"
          className="app-input"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
        />

        <label>Hasta</label>

        <input
          type="date"
          className="app-input"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
        />

        <select
          className="app-input"
          value={statusFilter}
          onChange={e =>
            setStatusFilter(e.target.value)
          }
        >
          <option value="">
            Todos los estados
          </option>

          {STATUS1_ALL.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <input
          className="app-input flex-1 min-w-[250px]"
          placeholder="Buscar pedido..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <button
          className="nav-btn active"
          onClick={loadOrders}
          disabled={loading}
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* 🔥 CONTADOR */}
      <div className="text-xs mb-2">
        {filtered.length} pedidos
        {allOrders.length > 0 &&
          ` (Total BD: ${allOrders.length})`}
      </div>

      {/* 🔥 TABLA */}
      <div className="overflow-x-auto">
        <table className="app-table min-w-[1000px]">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={
                    selectedIds.size ===
                      filtered.length &&
                    filtered.length > 0
                  }
                  onChange={toggleSelectAll}
                />
              </th>

              <th>Fecha</th>
              <th>ID</th>
              <th>Ciudad</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Proveedor</th>
              <th>Delivery</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="text-center py-8"
                >
                  Sin pedidos
                </td>
              </tr>
            )}

            {filtered.map(o => (
              <tr key={o.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(o.id)}
                    onChange={() =>
                      toggleSelect(o.id)
                    }
                  />
                </td>

                <td>
                  {new Date(
                    o.created_at
                  ).toLocaleString('es-PY')}
                </td>

                <td>
                  {o.order_number ||
                    o.id.slice(0, 8)}
                </td>

                <td>{o.city}</td>

                <td>{o.customer_name}</td>

                <td>{o.created_by}</td>

                <td>
                  {o.provider_email || '—'}
                </td>

                <td>
                  {o.assigned_delivery || '—'}
                </td>

                <td>
                  {nf(Number(o.total_gs || 0))}
                </td>

                <td>
                  <select
                    className="app-input"
                    value={
                      o.status || 'PENDIENTE'
                    }
                    onChange={e =>
                      handleStatus1Change(
                        o.id,
                        e.target.value
                      )
                    }
                  >
                    {STATUS1_ALL.map(s => (
                      <option
                        key={s}
                        value={s}
                      >
                        {s}
                      </option>
                    ))}
                  </select>
                </td>

                <td>
                  <div className="flex gap-1">
                    <button
                      className="nav-btn"
                      onClick={() =>
                        generateGuide(o)
                      }
                    >
                      📄
                    </button>

                    <select
                      className="app-input"
                      value={
                        o.assigned_delivery ||
                        ''
                      }
                      onChange={e =>
                        handleAssignDelivery(
                          o.id,
                          e.target.value
                        )
                      }
                    >
                      <option value="">
                        Sin delivery
                      </option>

                      {deliveries.map(d => (
                        <option
                          key={d.email}
                          value={d.email}
                        >
                          {d.name || d.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 🔥 MODAL GUÍA */}
      {guideText &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
            onClick={() => setGuideText('')}
          >
            <div
              className="bg-card rounded-xl p-5 w-full max-w-xl"
              onClick={e => e.stopPropagation()}
            >
              <h4 className="text-lg font-bold mb-3">
                Guía — {guideOrderId}
              </h4>

              <pre className="bg-background p-4 rounded-xl whitespace-pre-wrap">
                {guideText}
              </pre>

              <div className="flex gap-2 justify-end mt-4">
                <button
                  className="nav-btn"
                  onClick={() =>
                    setGuideText('')
                  }
                >
                  Cerrar
                </button>

                <button
                  className="nav-btn active"
                  onClick={copyGuide}
                >
                  Copiar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
