import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);
const COLORS = ['#7c5cff','#21c08b','#ffa726','#ff5c7c','#42a5f5','#ab47bc','#26c6da','#ef5350','#66bb6a','#ffca28'];
const CANCEL_STATES = new Set(['CANCELADO','RECHAZADO','RECHAZADO EN EL LUGAR','NO DESEA','CANCELÓ POR WHATSAPP']);

interface OrderRow {
  id: string;
  created_at: string;
  assigned_at: string | null;
  total_gs: number | null;
  delivery_gs: number | null;
  commission_gs: number | null;
  delivery_fee_gs: number | null;
  status: string | null;
  city: string | null;
  created_by: string | null;
  assigned_delivery: string | null;
  items_json: any;
  delivery_settled: boolean | null;
  provider_emails_list: string | null;
  delivered_at: string | null;
}

// Helper para verificar si el proveedor tiene acceso al pedido (misma función que en OrdersView)
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
  return emails.some(email => email.toLowerCase() === userEmail.toLowerCase());
}

export default function DashboardView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const email = profile?.email || '';

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [adSpend, setAdSpend] = useState(() => {
    try { return Number(localStorage.getItem('provider_ad_spend') || 0); } catch { return 0; }
  });

  const loadDashboard = async () => {
    setLoading(true);
    const [ordersRes, productsRes, ratesRes] = await Promise.all([
      supabase.from('orders').select('*').gte('created_at', dateFrom + 'T00:00:00').lte('created_at', dateTo + 'T23:59:59'),
      supabase.from('products').select('*'),
      supabase.from('delivery_fees').select('*'),
    ]);
    setOrders((ordersRes.data || []) as OrderRow[]);
    setProducts(productsRes.data || []);
    const rm: Record<string, number> = {};
    (ratesRes.data || []).forEach((r: any) => { if (r.city) rm[r.city.toLowerCase().trim()] = Number(r.fee_gs || 0); });
    setDeliveryRates(rm);
    setLoading(false);
  };

  // ✅ AHORA se actualiza cuando cambian las fechas
  useEffect(() => { loadDashboard(); }, [dateFrom, dateTo]);

  // Build cost map by SKU
  const costMap = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach(p => { if (p.sku) m[p.sku.trim()] = Number(p.real_cost_gs || p.provider_price_gs || 0); });
    return m;
  }, [products]);

  // Provider email map by SKU (solo se usa para cálculos de ganancia, NO para filtrar)
  const skuProviderMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach(p => { if (p.sku && p.provider_email) m[p.sku.trim()] = p.provider_email.toLowerCase().trim(); });
    return m;
  }, [products]);

  // ✅ Filter orders by role - MISMA LÓGICA que OrdersView
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // VENDEDOR: mismo filtro que OrdersView
      if (role === 'VENDEDOR' && (o.created_by || '').toLowerCase() !== email.toLowerCase()) return false;
      
      // DELIVERY: mismo filtro que OrdersView
      if (role === 'DELIVERY' && (o.assigned_delivery || '').toLowerCase() !== email.toLowerCase()) return false;
      
      // PROVEEDOR: usa provider_emails_list (mismo que OrdersView)
      if (role === 'PROVEEDOR' && !isProviderAllowed(o, email)) return false;
      
      // ADMIN y DESPACHANTE ven todos
      return true;
    });
  }, [orders, role, email]);

  // KPIs
  const kpis = useMemo(() => {
    let orderCount = 0, sold = 0, delivered = 0, canceled = 0, profit = 0;
    let montoRendir = 0, sumaEntregado = 0;
    let deliveredTodayProfit = 0, deliveredRangeProfit = 0;
    const today = new Date().toISOString().slice(0, 10);

    filteredOrders.forEach(o => {
      orderCount++;
      const total = Number(o.total_gs || 0);
      const status = (o.status || 'PENDIENTE').toUpperCase();

      if (status === 'ENTREGADO' || status === 'ENCOMIENDA ENTREGADA') delivered++;
      if (CANCEL_STATES.has(status)) canceled++;
      sold += total;

      // Profit calculation
      if (role === 'PROVEEDOR') {
        try {
          const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
          items.forEach((it: any) => {
            const sku = String(it.sku || '').trim();
            if ((skuProviderMap[sku] || '') === email.toLowerCase()) {
              const qty = Number(it.qty || 0);
              const salePrice = Number(it.sale_gs || 0);
              const cost = Number(costMap[sku] || 0);
              const itemProfit = (salePrice - cost) * qty;
              if (status === 'ENTREGADO' || status === 'ENCOMIENDA ENTREGADA') {
                deliveredRangeProfit += itemProfit;
                const deliveredDate = o.delivered_at ? o.delivered_at.slice(0, 10) : '';
                if (deliveredDate === today) deliveredTodayProfit += itemProfit;
              }
            }
          });
        } catch {}
      } else if (role === 'DELIVERY') {
        if (status === 'ENTREGADO') {
          const feeStored = Number(o.delivery_fee_gs || 0);
          const fee = feeStored > 0 ? feeStored : (deliveryRates[(o.city || '').toLowerCase().trim()] || 0);
          sumaEntregado += total;
          if (!o.delivery_settled) montoRendir += (total - fee);
        }
      } else {
        // ADMIN/VENDEDOR
        try {
          const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
          let provCost = 0;
          items.forEach((it: any) => {
            const sku = String(it.sku || '').trim();
            provCost += Number(costMap[sku] || 0) * Number(it.qty || 0);
          });
          if (status === 'ENTREGADO' || status === 'ENCOMIENDA ENTREGADA') {
            profit += total - provCost - Number(o.delivery_gs || 0);
          }
        } catch {}
      }
    });

    return { orders: orderCount, sold, delivered, canceled, profit, montoRendir, sumaEntregado, deliveredTodayProfit, deliveredRangeProfit };
  }, [filteredOrders, role, email, costMap, deliveryRates, skuProviderMap]);

  // Bar chart data (sales by day)
  const barData = useMemo(() => {
    const byDay: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const baseDate = (role === 'DELIVERY' && o.assigned_at) ? o.assigned_at : o.created_at;
      const day = baseDate.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + Number(o.total_gs || 0);
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  }, [filteredOrders, role]);

  // Pie chart data (by city)
  const pieData = useMemo(() => {
    const byCity: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const city = o.city || 'SIN CIUDAD';
      byCity[city] = (byCity[city] || 0) + 1;
    });
    return Object.entries(byCity).sort(([,a], [,b]) => b - a).slice(0, 10).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  // Top products
  const topProducts = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number }> = {};
    filteredOrders.forEach(o => {
      try {
        const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
        items.forEach((it: any) => {
          const key = it.title || it.sku || 'Item';
          if (!map[key]) map[key] = { qty: 0, revenue: 0 };
          map[key].qty += Number(it.qty || 0);
          map[key].revenue += Number(it.sale_gs || 0) * Number(it.qty || 0);
        });
      } catch {}
    });
    return Object.entries(map).sort(([,a], [,b]) => b.qty - a.qty).slice(0, 10);
  }, [filteredOrders]);

  // Map cities
  const mapCities = useMemo(() => {
    const byCity: Record<string, { qty: number; revenue: number }> = {};
    filteredOrders.forEach(o => {
      const city = o.city || 'SIN CIUDAD';
      if (!byCity[city]) byCity[city] = { qty: 0, revenue: 0 };
      byCity[city].qty++;
      byCity[city].revenue += Number(o.total_gs || 0);
    });
    return Object.entries(byCity).sort(([,a], [,b]) => b.revenue - a.revenue);
  }, [filteredOrders]);

  const handleAdSpend = (val: number) => {
    setAdSpend(val);
    try { localStorage.setItem('provider_ad_spend', String(val)); } catch {}
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Dashboard</h3>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <button className="nav-btn active" onClick={loadDashboard} disabled={loading}>
          {loading ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Cargando...</span> : 'Aplicar'}
        </button>
      </div>

      {/* KPIs by role */}
      <div className="grid-kpi">
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1.5">Pedidos</div>
          <div className="text-[22px] font-extrabold">{nf(kpis.orders)}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1.5">Total vendido (Gs)</div>
          <div className="text-[22px] font-extrabold">{nf(kpis.sold)}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1.5">Entregados</div>
          <div className="text-[22px] font-extrabold">{nf(kpis.delivered)}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1.5">Cancelados</div>
          <div className="text-[22px] font-extrabold">{nf(kpis.canceled)}</div>
        </div>

        {role === 'DELIVERY' ? (
          <>
            <div className="kpi-card">
              <div className="text-xs text-muted-foreground mb-1.5">Suma entregado (Gs)</div>
              <div className="text-[22px] font-extrabold">{nf(kpis.sumaEntregado)}</div>
            </div>
            <div className="kpi-card">
              <div className="text-xs text-muted-foreground mb-1.5">Monto a rendir (Gs)</div>
              <div className="text-[22px] font-extrabold">{nf(kpis.montoRendir)}</div>
            </div>
          </>
        ) : role === 'PROVEEDOR' ? (
          <>
            <div className="kpi-card">
              <div className="text-xs text-muted-foreground mb-1.5">Ganancia hoy (Gs)</div>
              <div className="text-[22px] font-extrabold">{nf(kpis.deliveredTodayProfit)}</div>
            </div>
            <div className="kpi-card">
              <div className="text-xs text-muted-foreground mb-1.5">Ganancia rango (Gs)</div>
              <div className="text-[22px] font-extrabold">{nf(kpis.deliveredRangeProfit)}</div>
            </div>
            <div className="kpi-card">
              <div className="text-xs text-muted-foreground mb-1.5">Inversión publicidad (Gs)</div>
              <input
                type="number"
                className="app-input !py-1 !mt-1 text-lg font-bold"
                value={adSpend}
                onChange={e => handleAdSpend(Number(e.target.value || 0))}
              />
            </div>
            <div className="kpi-card">
              <div className="text-xs text-muted-foreground mb-1.5">Liquidez real (Gs)</div>
              <div className="text-[22px] font-extrabold">{nf(kpis.deliveredRangeProfit - adSpend)}</div>
            </div>
          </>
        ) : (
          <div className="kpi-card">
            <div className="text-xs text-muted-foreground mb-1.5">
              {role === 'VENDEDOR' ? 'Mi comisión (Gs)' : 'Utilidad Total (Gs)'}
            </div>
            <div className="text-[22px] font-extrabold">{nf(kpis.profit)}</div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="kpi-card min-h-[280px]">
          <div className="text-xs font-bold text-muted-foreground mb-2">Ventas por día (Gs)</div>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 16% 22%)" />
                <XAxis dataKey="date" tick={{ fill: 'hsl(228 12% 62%)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'hsl(228 12% 62%)', fontSize: 10 }} tickFormatter={v => nf(v)} />
                <Tooltip
                  contentStyle={{ background: 'hsl(240 18% 10%)', border: '1px solid hsl(240 16% 22%)', borderRadius: 8, color: '#fff' }}
                  formatter={(v: number) => [nf(v) + ' Gs', 'Ventas']}
                />
                <Bar dataKey="value" fill="hsl(256 100% 68%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Sin datos</div>
          )}
        </div>

        <div className="kpi-card min-h-[280px]">
          <div className="text-xs font-bold text-muted-foreground mb-2">Pedidos por ciudad</div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(240 18% 10%)', border: '1px solid hsl(240 16% 22%)', borderRadius: 8, color: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Sin datos</div>
          )}
        </div>
      </div>

      {/* Top products + Map cities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="kpi-card">
          <div className="text-xs font-bold text-muted-foreground mb-2">🏆 Top Productos</div>
          {topProducts.length === 0 ? (
            <p className="text-muted-foreground text-xs">Sin datos</p>
          ) : (
            <ul className="space-y-1">
              {topProducts.map(([name, d], i) => (
                <li key={i} className="text-xs flex justify-between gap-2">
                  <span className="truncate">{name}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{nf(d.qty)} uds — Gs {nf(d.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="kpi-card">
          <div className="text-xs font-bold text-muted-foreground mb-2">🗺️ Pedidos por ciudad</div>
          {mapCities.length === 0 ? (
            <p className="text-muted-foreground text-xs">Sin datos</p>
          ) : (
            <ul className="space-y-1">
              {mapCities.map(([city, d], i) => (
                <li key={i} className="text-xs flex justify-between gap-2">
                  <span className="truncate">{city}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{nf(d.qty)} pedidos — Gs {nf(d.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
