import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(Math.round(Number(n || 0)));
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#f97316', '#a855f7'];
const CANCEL_STATES = new Set(['CANCELADO','RECHAZADO','RECHAZADO EN EL LUGAR','NO DESEA','CANCELÓ POR WHATSAPP']);
const DELIVERED_STATES = new Set(['ENTREGADO', 'ENCOMIENDA ENTREGADA']);

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

type KpiTone = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan';

const todayPY = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const inDateRange = (value: string | null | undefined, from: string, to: string) => {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= from && day <= to;
};

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

function mergeOrders(...groups: any[][]): OrderRow[] {
  const map = new Map<string, OrderRow>();
  groups.flat().forEach((order: any) => {
    if (order?.id) map.set(order.id, order as OrderRow);
  });
  return Array.from(map.values());
}

function KpiCard({ title, value, subtitle, icon, tone = 'blue' }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  tone?: KpiTone;
}) {
  const tones: Record<KpiTone, string> = {
    blue: 'from-blue-500/20 to-cyan-500/5 border-blue-500/25 text-blue-300 shadow-blue-500/10',
    emerald: 'from-emerald-500/20 to-teal-500/5 border-emerald-500/25 text-emerald-300 shadow-emerald-500/10',
    amber: 'from-amber-500/20 to-orange-500/5 border-amber-500/25 text-amber-300 shadow-amber-500/10',
    rose: 'from-rose-500/20 to-red-500/5 border-rose-500/25 text-rose-300 shadow-rose-500/10',
    violet: 'from-violet-500/20 to-fuchsia-500/5 border-violet-500/25 text-violet-300 shadow-violet-500/10',
    cyan: 'from-cyan-500/20 to-blue-500/5 border-cyan-500/25 text-cyan-300 shadow-cyan-500/10',
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${tones[tone]} p-4 shadow-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20`}>
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{title}</div>
          <div className="mt-2 text-2xl font-black leading-tight text-white md:text-3xl">{value}</div>
          {subtitle && <div className="mt-2 text-[11px] font-bold text-slate-400">{subtitle}</div>}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/50 text-xl shadow-inner">
          {icon}
        </div>
      </div>
    </div>
  );
}

function MiniList({ title, subtitle, data, accent = 'cyan' }: {
  title: string;
  subtitle: string;
  data: [string, { qty: number; revenue?: number }][];
  accent?: 'cyan' | 'violet';
}) {
  const max = Math.max(...data.map(([, d]) => d.qty), 1);
  const bar = accent === 'violet' ? 'from-violet-500 to-fuchsia-400' : 'from-blue-500 to-cyan-400';
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
      <h3 className="text-base font-black text-white">{title}</h3>
      <p className="mb-4 text-xs font-semibold text-slate-400">{subtitle}</p>
      {data.length === 0 ? (
        <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm text-slate-500">Sin datos</div>
      ) : (
        <div className="space-y-3">
          {data.slice(0, 8).map(([name, d], i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-bold text-slate-200">{name}</span>
                <span className="shrink-0 font-black text-white">{nf(d.qty)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-950/80">
                <div className={`h-full rounded-full bg-gradient-to-r ${bar}`} style={{ width: `${Math.max(6, (d.qty / max) * 100)}%` }} />
              </div>
              {typeof d.revenue === 'number' && <div className="mt-1 text-[10px] font-bold text-slate-500">Gs {nf(d.revenue)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const email = profile?.email || '';

  // ✅ Por defecto el dashboard siempre abre desde/hasta el día actual.
  const [dateFrom, setDateFrom] = useState(() => todayPY());
  const [dateTo, setDateTo] = useState(() => todayPY());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [adSpend, setAdSpend] = useState(() => {
    try { return Number(localStorage.getItem('provider_ad_spend') || 0); } catch { return 0; }
  });

  const loadDashboard = async () => {
    setLoading(true);
    const from = `${dateFrom}T00:00:00`;
    const to = `${dateTo}T23:59:59`;

    // Trae pedidos por venta, por guía generada y por entrega para que los KPIs diarios no dependan de created_at.
    const [createdRes, guidesRes, deliveredRes, productsRes, ratesRes] = await Promise.all([
      supabase.from('orders').select('*').gte('created_at', from).lte('created_at', to),
      supabase.from('orders').select('*').gte('assigned_at', from).lte('assigned_at', to),
      supabase.from('orders').select('*').gte('delivered_at', from).lte('delivered_at', to),
      supabase.from('products').select('*'),
      supabase.from('delivery_fees').select('*'),
    ]);

    setOrders(mergeOrders(createdRes.data || [], guidesRes.data || [], deliveredRes.data || []));
    setProducts(productsRes.data || []);

    const rm: Record<string, number> = {};
    (ratesRes.data || []).forEach((r: any) => {
      if (r.city) rm[r.city.toLowerCase().trim()] = Number(r.fee_gs || 0);
    });
    setDeliveryRates(rm);
    setLoading(false);
  };

  useEffect(() => { loadDashboard(); }, [dateFrom, dateTo]);

  const costMap = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach(p => { if (p.sku) m[p.sku.trim()] = Number(p.real_cost_gs || p.provider_price_gs || 0); });
    return m;
  }, [products]);

  const skuProviderMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach(p => { if (p.sku && p.provider_email) m[p.sku.trim()] = p.provider_email.toLowerCase().trim(); });
    return m;
  }, [products]);

  const roleAllowed = (o: OrderRow) => {
    if (role === 'VENDEDOR' && (o.created_by || '').toLowerCase() !== email.toLowerCase()) return false;
    if (role === 'DELIVERY' && (o.assigned_delivery || '').toLowerCase() !== email.toLowerCase()) return false;
    if (role === 'PROVEEDOR' && !isProviderAllowed(o, email)) return false;
    return true;
  };

  const filteredOrders = useMemo(() => orders.filter(roleAllowed), [orders, role, email]);

  const createdRangeOrders = useMemo(() => filteredOrders.filter(o => inDateRange(o.created_at, dateFrom, dateTo)), [filteredOrders, dateFrom, dateTo]);
  const guidesRangeOrders = useMemo(() => filteredOrders.filter(o => inDateRange(o.assigned_at, dateFrom, dateTo)), [filteredOrders, dateFrom, dateTo]);
  const deliveredRangeOrders = useMemo(() => filteredOrders.filter(o => inDateRange(o.delivered_at, dateFrom, dateTo) && DELIVERED_STATES.has((o.status || '').toUpperCase())), [filteredOrders, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    let orderCount = 0, sold = 0, delivered = 0, canceled = 0, profit = 0;
    let montoRendir = 0, sumaEntregado = 0;
    let deliveredTodayProfit = 0, deliveredRangeProfit = 0;
    const currentDay = todayPY();

    createdRangeOrders.forEach(o => {
      orderCount++;
      const total = Number(o.total_gs || 0);
      const status = (o.status || 'PENDIENTE').toUpperCase();
      if (CANCEL_STATES.has(status)) canceled++;
      sold += total;
    });

    deliveredRangeOrders.forEach(o => {
      delivered++;
      const total = Number(o.total_gs || 0);
      const status = (o.status || 'PENDIENTE').toUpperCase();

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
              deliveredRangeProfit += itemProfit;
              if ((o.delivered_at || '').slice(0, 10) === currentDay) deliveredTodayProfit += itemProfit;
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
        try {
          const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
          let provCost = 0;
          items.forEach((it: any) => {
            const sku = String(it.sku || '').trim();
            provCost += Number(costMap[sku] || 0) * Number(it.qty || 0);
          });
          profit += total - provCost - Number(o.delivery_gs || 0);
        } catch {}
      }
    });

    return {
      orders: orderCount,
      sold,
      delivered,
      canceled,
      profit,
      montoRendir,
      sumaEntregado,
      deliveredTodayProfit,
      deliveredRangeProfit,
      guidesGenerated: guidesRangeOrders.length,
    };
  }, [createdRangeOrders, deliveredRangeOrders, guidesRangeOrders, role, email, costMap, deliveryRates, skuProviderMap]);

  const barData = useMemo(() => {
    const byDay: Record<string, number> = {};
    createdRangeOrders.forEach(o => {
      const day = o.created_at.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + Number(o.total_gs || 0);
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date: date.slice(5), value }));
  }, [createdRangeOrders]);

  const pieData = useMemo(() => {
    const byStatus: Record<string, number> = {};
    createdRangeOrders.forEach(o => {
      const status = (o.status || 'PENDIENTE').toUpperCase();
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    return Object.entries(byStatus).sort(([,a], [,b]) => b - a).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [createdRangeOrders]);

  const topProducts = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number }> = {};
    createdRangeOrders.forEach(o => {
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
  }, [createdRangeOrders]);

  const mapCities = useMemo(() => {
    const byCity: Record<string, { qty: number; revenue: number }> = {};
    createdRangeOrders.forEach(o => {
      const city = o.city || 'SIN CIUDAD';
      if (!byCity[city]) byCity[city] = { qty: 0, revenue: 0 };
      byCity[city].qty++;
      byCity[city].revenue += Number(o.total_gs || 0);
    });
    return Object.entries(byCity).sort(([,a], [,b]) => b.qty - a.qty).slice(0, 10);
  }, [createdRangeOrders]);

  const handleAdSpend = (val: number) => {
    setAdSpend(val);
    try { localStorage.setItem('provider_ad_spend', String(val)); } catch {}
  };


  return (
    <div className="min-h-full w-full overflow-auto bg-[#020617] p-3 text-slate-100 md:p-5">
      <div className="relative w-full overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-2xl shadow-black/30 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,.14),transparent_28%)]" />
        <div className="relative space-y-5">
          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-700/70 bg-slate-900/70 p-4 shadow-xl shadow-black/20 xl:flex-row xl:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-2xl shadow-lg shadow-blue-500/20">📊</div>
              <div>
                <h2 className="text-2xl font-black leading-tight text-white md:text-3xl">Dashboard</h2>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Desde
                <input type="date" className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-white outline-none transition focus:border-cyan-400" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Hasta
                <input type="date" className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-white outline-none transition focus:border-cyan-400" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </label>
              <button className="h-10 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60" onClick={loadDashboard} disabled={loading}>
                {loading ? '⏳ Cargando...' : 'Aplicar'}
              </button>
              <button className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-black text-slate-200 transition hover:bg-slate-700" onClick={() => { const t = todayPY(); setDateFrom(t); setDateTo(t); }}>
                Hoy
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard title="Pedidos" value={nf(kpis.orders)} subtitle="Vendidos en el rango" icon="🧾" tone="blue" />
            <KpiCard title="Total vendido" value={`${nf(kpis.sold)} Gs`} subtitle="Según fecha de venta" icon="💰" tone="emerald" />
            <KpiCard title="Guías generadas" value={nf(kpis.guidesGenerated)} subtitle="Según fecha de guía" icon="📦" tone="cyan" />
            <KpiCard title="Entregados" value={nf(kpis.delivered)} subtitle="Según fecha de entrega" icon="✅" tone="emerald" />
            <KpiCard title="Cancelados" value={nf(kpis.canceled)} subtitle="Cancelados vendidos en rango" icon="✕" tone="rose" />
            {role === 'DELIVERY' ? (
              <KpiCard title="A rendir" value={`${nf(kpis.montoRendir)} Gs`} subtitle="Entregas no liquidadas" icon="🏦" tone="violet" />
            ) : role === 'PROVEEDOR' ? (
              <KpiCard title="Ganancia rango" value={`${nf(kpis.deliveredRangeProfit)} Gs`} subtitle="Por entregas" icon="🏦" tone="violet" />
            ) : (
              <KpiCard title={role === 'VENDEDOR' ? 'Mi comisión' : 'Utilidad total'} value={`${nf(kpis.profit)} Gs`} subtitle="Por entregas del rango" icon="🏦" tone="violet" />
            )}
          </div>

          {role === 'DELIVERY' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <KpiCard title="Suma entregado" value={`${nf(kpis.sumaEntregado)} Gs`} subtitle="Entregado en el rango" icon="🚚" tone="emerald" />
              <KpiCard title="Monto a rendir" value={`${nf(kpis.montoRendir)} Gs`} subtitle="Total menos delivery" icon="🏦" tone="violet" />
            </div>
          )}

          {role === 'PROVEEDOR' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <KpiCard title="Ganancia hoy" value={`${nf(kpis.deliveredTodayProfit)} Gs`} subtitle="Entregas del día actual" icon="⚡" tone="emerald" />
              <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/20 to-orange-500/5 p-4 shadow-xl shadow-amber-500/10">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Inversión publicidad</div>
                <input
                  type="number"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xl font-black text-white outline-none focus:border-amber-400"
                  value={adSpend}
                  onChange={e => handleAdSpend(Number(e.target.value || 0))}
                />
              </div>
              <KpiCard title="Liquidez real" value={`${nf(kpis.deliveredRangeProfit - adSpend)} Gs`} subtitle="Ganancia - publicidad" icon="💎" tone="cyan" />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">Ventas por día</h3>
                  <p className="text-xs font-semibold text-slate-400">Total vendido según created_at.</p>
                </div>
                <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-300">Gs</span>
              </div>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => nf(v)} />
                    <Tooltip
                      contentStyle={{ background: '#020617', border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, color: '#fff' }}
                      formatter={(v: number) => [nf(v) + ' Gs', 'Ventas']}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm font-bold text-slate-500">Sin datos</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">Distribución de estados</h3>
                  <p className="text-xs font-semibold text-slate-400">Pedidos vendidos en el rango.</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">Live</span>
              </div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={90} paddingAngle={3} label={({ percent }) => `${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#020617', border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, color: '#fff' }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#cbd5e1' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm font-bold text-slate-500">Sin datos</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <MiniList title="Top productos" subtitle="Más vendidos por unidades." data={topProducts} accent="violet" />
            <MiniList title="Top ciudades" subtitle="Mayor volumen de pedidos." data={mapCities} accent="cyan" />
          </div>
        </div>
      </div>
    </div>
  );
}
