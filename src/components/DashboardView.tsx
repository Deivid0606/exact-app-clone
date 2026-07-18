import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
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

interface DeliveryStock {
  delivery_email: string;
  product_sku: string;
  quantity: number;
  product_name?: string;
}

type KpiTone = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'pink';

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
    pink: 'from-pink-500/20 to-rose-500/5 border-pink-500/25 text-pink-300 shadow-pink-500/10',
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

function TopSellerCard({ name, email, avatar, revenue, orders, delivered }: {
  name: string;
  email: string;
  avatar?: string;
  revenue: number;
  orders: number;
  delivered: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-800/50 p-3 transition hover:bg-slate-800/80 border border-slate-700/50">
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border-2 border-violet-500/50 bg-slate-900">
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{name}</p>
        <p className="truncate text-xs text-slate-400">{email}</p>
      </div>
      <div className="text-right">
        <div className="text-sm font-black text-emerald-400">{nf(revenue)} Gs</div>
        <div className="text-xs text-slate-400">
          {nf(orders)} pedidos • {nf(delivered)} entregados
        </div>
      </div>
    </div>
  );
}

function DeliveryPendingCard({ name, email, avatar, pendingOrders, pendingAmount }: {
  name: string;
  email: string;
  avatar?: string;
  pendingOrders: number;
  pendingAmount: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-800/50 p-3 transition hover:bg-slate-800/80 border border-amber-500/30">
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border-2 border-amber-500/50 bg-slate-900">
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl bg-gradient-to-br from-amber-500 to-orange-500">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{name}</p>
        <p className="truncate text-xs text-slate-400">{email}</p>
      </div>
      <div className="text-right">
        <div className="text-sm font-black text-amber-400">{nf(pendingOrders)} pendientes</div>
        <div className="text-xs text-amber-300">{nf(pendingAmount)} Gs a rendir</div>
      </div>
    </div>
  );
}

function DeliveryStockCard({ productName, sku, quantity, image }: {
  productName: string;
  sku: string;
  quantity: number;
  image?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-800/50 p-3 transition hover:bg-slate-800/80 border border-cyan-500/30">
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
        {image ? (
          <img src={image} alt={productName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">📦</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{productName}</p>
        <p className="truncate text-xs text-slate-400">SKU: {sku}</p>
      </div>
      <div className="text-right">
        <div className={`text-sm font-black ${quantity > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {nf(quantity)} unidades
        </div>
        <div className="text-xs text-slate-400">disponible</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const email = profile?.email || '';

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });
  const [dateTo, setDateTo] = useState(() => todayPY());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [deliveryStocks, setDeliveryStocks] = useState<DeliveryStock[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [adSpend, setAdSpend] = useState(() => {
    try { return Number(localStorage.getItem('provider_ad_spend') || 0); } catch { return 0; }
  });

  const loadDashboard = async () => {
    setLoading(true);
    const from = `${dateFrom}T00:00:00`;
    const to = `${dateTo}T23:59:59`;

    const [
      createdRes, guidesRes, deliveredRes, 
      productsRes, ratesRes, stocksRes, profilesRes
    ] = await Promise.all([
      supabase.from('orders').select('*').gte('created_at', from).lte('created_at', to),
      supabase.from('orders').select('*').gte('assigned_at', from).lte('assigned_at', to),
      supabase.from('orders').select('*').gte('delivered_at', from).lte('delivered_at', to),
      supabase.from('products').select('*'),
      supabase.from('delivery_fees').select('*'),
      supabase.from('delivery_stock').select('*'),
      supabase.from('profiles').select('id, email, full_name, avatar_url, role'),
    ]);

    setOrders(mergeOrders(createdRes.data || [], guidesRes.data || [], deliveredRes.data || []));
    setProducts(productsRes.data || []);
    setDeliveryStocks(stocksRes.data || []);
    setProfiles(profilesRes.data || []);

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

  const productImageMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach(p => { if (p.sku && p.image_url) m[p.sku.trim()] = p.image_url; });
    return m;
  }, [products]);

  const productNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach(p => { if (p.sku && p.title) m[p.sku.trim()] = p.title; });
    return m;
  }, [products]);

  const profileMap = useMemo(() => {
    const m: Record<string, any> = {};
    profiles.forEach(p => { if (p.email) m[p.email.toLowerCase()] = p; });
    return m;
  }, [profiles]);

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

  // Top Sellers (para ADMIN y PROVEEDOR)
  const topSellers = useMemo(() => {
    if (role !== 'ADMIN' && role !== 'PROVEEDOR') return [];

    const sellerMap: Record<string, { 
      email: string; 
      revenue: number; 
      orders: number; 
      delivered: number;
      name: string;
      avatar?: string;
    }> = {};

    createdRangeOrders.forEach(o => {
      const sellerEmail = o.created_by?.toLowerCase() || '';
      if (!sellerEmail) return;

      if (role === 'PROVEEDOR') {
        // Solo mostrar vendedores que vendieron productos del proveedor
        try {
          const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
          let hasProviderProduct = false;
          items.forEach((it: any) => {
            const sku = String(it.sku || '').trim();
            if ((skuProviderMap[sku] || '') === email.toLowerCase()) {
              hasProviderProduct = true;
            }
          });
          if (!hasProviderProduct) return;
        } catch { return; }
      }

      if (!sellerMap[sellerEmail]) {
        const sellerProfile = profileMap[sellerEmail];
        sellerMap[sellerEmail] = {
          email: sellerEmail,
          revenue: 0,
          orders: 0,
          delivered: 0,
          name: sellerProfile?.full_name || sellerEmail.split('@')[0] || 'Vendedor',
          avatar: sellerProfile?.avatar_url,
        };
      }
      sellerMap[sellerEmail].revenue += Number(o.total_gs || 0);
      sellerMap[sellerEmail].orders++;
      if (DELIVERED_STATES.has((o.status || '').toUpperCase())) {
        sellerMap[sellerEmail].delivered++;
      }
    });

    return Object.values(sellerMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [createdRangeOrders, role, email, skuProviderMap, profileMap]);

  // Delivery pendientes a rendir (para ADMIN y PROVEEDOR)
  const pendingDeliveries = useMemo(() => {
    if (role !== 'ADMIN' && role !== 'PROVEEDOR') return [];

    const deliveryMap: Record<string, {
      email: string;
      name: string;
      avatar?: string;
      pendingOrders: number;
      pendingAmount: number;
    }> = {};

    deliveredRangeOrders.forEach(o => {
      const deliveryEmail = o.assigned_delivery?.toLowerCase() || '';
      if (!deliveryEmail) return;
      if (o.delivery_settled) return;

      if (role === 'PROVEEDOR') {
        try {
          const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
          let hasProviderProduct = false;
          items.forEach((it: any) => {
            const sku = String(it.sku || '').trim();
            if ((skuProviderMap[sku] || '') === email.toLowerCase()) {
              hasProviderProduct = true;
            }
          });
          if (!hasProviderProduct) return;
        } catch { return; }
      }

      if (!deliveryMap[deliveryEmail]) {
        const deliveryProfile = profileMap[deliveryEmail];
        deliveryMap[deliveryEmail] = {
          email: deliveryEmail,
          name: deliveryProfile?.full_name || deliveryEmail.split('@')[0] || 'Delivery',
          avatar: deliveryProfile?.avatar_url,
          pendingOrders: 0,
          pendingAmount: 0,
        };
      }
      deliveryMap[deliveryEmail].pendingOrders++;
      const fee = Number(o.delivery_fee_gs || 0) || (deliveryRates[(o.city || '').toLowerCase().trim()] || 0);
      deliveryMap[deliveryEmail].pendingAmount += (Number(o.total_gs || 0) - fee);
    });

    return Object.values(deliveryMap)
      .sort((a, b) => b.pendingAmount - a.pendingAmount)
      .slice(0, 10);
  }, [deliveredRangeOrders, role, email, skuProviderMap, profileMap, deliveryRates]);

  // Stock disponible por delivery (para ADMIN y PROVEEDOR)
  const deliveryStockData = useMemo(() => {
    if (role !== 'ADMIN' && role !== 'PROVEEDOR') return [];

    const stocks = deliveryStocks
      .filter(s => {
        if (role === 'PROVEEDOR') {
          // Verificar que el producto pertenece al proveedor
          return skuProviderMap[s.product_sku] === email.toLowerCase();
        }
        return true;
      })
      .map(s => ({
        ...s,
        productName: productNameMap[s.product_sku] || s.product_sku,
        image: productImageMap[s.product_sku],
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return stocks;
  }, [deliveryStocks, role, email, skuProviderMap, productNameMap, productImageMap]);

  // Estadísticas de delivery stock
  const deliveryStockStats = useMemo(() => {
    const totalUnits = deliveryStockData.reduce((sum, s) => sum + s.quantity, 0);
    const totalProducts = deliveryStockData.length;
    return { totalUnits, totalProducts };
  }, [deliveryStockData]);

  const barData = useMemo(() => {
    const byDay: Record<string, number> = {};
    createdRangeOrders.forEach(o => {
      const day = o.created_at.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + Number(o.total_gs || 0);
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date: date.slice(5), value }));
  }, [createdRangeOrders]);

  const lineData = useMemo(() => {
    const byDay: Record<string, { sold: number; delivered: number }> = {};
    createdRangeOrders.forEach(o => {
      const day = o.created_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = { sold: 0, delivered: 0 };
      byDay[day].sold += Number(o.total_gs || 0);
    });
    deliveredRangeOrders.forEach(o => {
      const day = o.delivered_at?.slice(0, 10) || '';
      if (day && byDay[day]) {
        byDay[day].delivered += Number(o.total_gs || 0);
      }
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({
      date: date.slice(5),
      sold: data.sold,
      delivered: data.delivered
    }));
  }, [createdRangeOrders, deliveredRangeOrders]);

  const pieData = useMemo(() => {
    const byStatus: Record<string, number> = {};
    createdRangeOrders.forEach(o => {
      const status = (o.status || 'PENDIENTE').toUpperCase();
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    return Object.entries(byStatus).sort(([,a], [,b]) => b - a).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [createdRangeOrders]);

  const topProducts = useMemo(() => {
    const map: Record<string, { qty: number; delivered: number; sku: string }> = {};
    
    createdRangeOrders.forEach(o => {
      try {
        const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
        items.forEach((it: any) => {
          const key = it.sku || it.title || 'Item';
          if (!map[key]) map[key] = { qty: 0, delivered: 0, sku: it.sku || '' };
          map[key].qty += Number(it.qty || 0);
        });
      } catch {}
    });

    deliveredRangeOrders.forEach(o => {
      try {
        const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
        items.forEach((it: any) => {
          const key = it.sku || it.title || 'Item';
          if (map[key]) {
            map[key].delivered += Number(it.qty || 0);
          }
        });
      } catch {}
    });

    return Object.entries(map)
      .sort(([,a], [,b]) => b.qty - a.qty)
      .slice(0, 10)
      .map(([name, data]) => ({
        name,
        qty: data.qty,
        delivered: data.delivered,
        image: productImageMap[data.sku] || null
      }));
  }, [createdRangeOrders, deliveredRangeOrders, productImageMap]);

  const mapCities = useMemo(() => {
    const byCity: Record<string, { qty: number; delivered: number; revenue: number }> = {};
    
    createdRangeOrders.forEach(o => {
      const city = o.city || 'SIN CIUDAD';
      if (!byCity[city]) byCity[city] = { qty: 0, delivered: 0, revenue: 0 };
      byCity[city].qty++;
      byCity[city].revenue += Number(o.total_gs || 0);
    });

    deliveredRangeOrders.forEach(o => {
      const city = o.city || 'SIN CIUDAD';
      if (byCity[city]) {
        byCity[city].delivered++;
      }
    });

    return Object.entries(byCity)
      .sort(([,a], [,b]) => b.qty - a.qty)
      .slice(0, 10)
      .map(([name, data]) => ({
        name,
        qty: data.qty,
        delivered: data.delivered,
        revenue: data.revenue
      }));
  }, [createdRangeOrders, deliveredRangeOrders]);

  const handleAdSpend = (val: number) => {
    setAdSpend(val);
    try { localStorage.setItem('provider_ad_spend', String(val)); } catch {}
  };

  return (
    <div className="min-h-full w-full overflow-auto bg-[#020617] p-3 text-slate-100 md:p-5">
      <div className="relative w-full overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-2xl shadow-black/30 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,.14),transparent_28%)]" />
        <div className="relative space-y-5">
          {/* Header */}
          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-700/70 bg-slate-900/70 p-4 shadow-xl shadow-black/20 xl:flex-row xl:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-2xl shadow-lg shadow-blue-500/20">📊</div>
              <div>
                <h2 className="text-2xl font-black leading-tight text-white md:text-3xl">Dashboard</h2>
                <p className="text-xs font-semibold text-slate-400">Del {dateFrom} al {dateTo}</p>
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
              <button className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-black text-slate-200 transition hover:bg-slate-700" onClick={() => { 
                const d = new Date();
                d.setDate(1);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                setDateFrom(`${y}-${m}-01`);
                setDateTo(todayPY());
              }}>
                Mes Actual
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard title="Total Vendido" value={`${nf(kpis.sold)} Gs`} subtitle="Del 01 al 18" icon="💰" tone="emerald" />
            <KpiCard title="Pedidos Entregados" value={nf(kpis.delivered)} subtitle="Del 01 al 18" icon="✅" tone="blue" />
            <KpiCard title="Pedidos Cancelados" value={nf(kpis.canceled)} subtitle="Del 01 al 18" icon="✕" tone="rose" />
            <KpiCard title="Devueltos a Depósito" value={nf(0)} subtitle="Del 01 al 18" icon="↩️" tone="amber" />
            <KpiCard title="Ganancia Hoy" value={`${nf(kpis.deliveredTodayProfit || kpis.profit)} Gs`} subtitle="Comisión de hoy" icon="⚡" tone="violet" />
            <KpiCard title="Guías Generadas" value={nf(kpis.guidesGenerated)} subtitle="Del 01 al 18" icon="📦" tone="cyan" />
          </div>

          {/* Top Sellers - solo ADMIN y PROVEEDOR */}
          {(role === 'ADMIN' || role === 'PROVEEDOR') && topSellers.length > 0 && (
            <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">🏆 Top Mejores Vendedores</h3>
                  <p className="text-xs font-semibold text-slate-400">Por volumen de ventas</p>
                </div>
                <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-black text-violet-300">⭐</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {topSellers.map((seller, index) => (
                  <TopSellerCard
                    key={index}
                    name={seller.name}
                    email={seller.email}
                    avatar={seller.avatar}
                    revenue={seller.revenue}
                    orders={seller.orders}
                    delivered={seller.delivered}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Delivery Pendientes a Rendir - solo ADMIN y PROVEEDOR */}
          {(role === 'ADMIN' || role === 'PROVEEDOR') && pendingDeliveries.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">🚚 Delivery Pendientes a Rendir</h3>
                  <p className="text-xs font-semibold text-slate-400">Pedidos entregados no liquidados</p>
                </div>
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-300">⏳</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pendingDeliveries.map((delivery, index) => (
                  <DeliveryPendingCard
                    key={index}
                    name={delivery.name}
                    email={delivery.email}
                    avatar={delivery.avatar}
                    pendingOrders={delivery.pendingOrders}
                    pendingAmount={delivery.pendingAmount}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Stock Disponible por Delivery - solo ADMIN y PROVEEDOR */}
          {(role === 'ADMIN' || role === 'PROVEEDOR') && deliveryStockData.length > 0 && (
            <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-500/5 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">📦 Stock Disponible por Delivery</h3>
                  <p className="text-xs font-semibold text-slate-400">
                    {deliveryStockStats.totalProducts} productos • {nf(deliveryStockStats.totalUnits)} unidades totales
                  </p>
                </div>
                <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-black text-cyan-300">📊</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {deliveryStockData.map((stock, index) => (
                  <DeliveryStockCard
                    key={index}
                    productName={stock.productName}
                    sku={stock.product_sku}
                    quantity={stock.quantity}
                    image={stock.image}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Gráficos principales */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Ventas por día - Barras */}
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">Ventas por día</h3>
                  <p className="text-xs font-semibold text-slate-400">Total vendido por día</p>
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

            {/* Ventas vs Entregas - Líneas */}
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">Ventas vs Entregas</h3>
                  <p className="text-xs font-semibold text-slate-400">Comparativa diaria</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">📈</span>
              </div>
              {lineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={lineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => nf(v)} />
                    <Tooltip
                      contentStyle={{ background: '#020617', border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, color: '#fff' }}
                      formatter={(v: number) => [nf(v) + ' Gs', '']}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#cbd5e1' }} />
                    <Line type="monotone" dataKey="sold" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6' }} name="Vendido" />
                    <Line type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} name="Entregado" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm font-bold text-slate-500">Sin datos</div>
              )}
            </div>
          </div>

          {/* Distribución de estados */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">Distribución de estados</h3>
                  <p className="text-xs font-semibold text-slate-400">Pedidos por estado</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">📊</span>
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

            {/* Reglas / Estado de entregas */}
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">Estado de entregas</h3>
                  <p className="text-xs font-semibold text-slate-400">Resumen de entregas</p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-300">📋</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-800/50 p-4">
                  <span className="font-bold text-slate-300">Total Pedidos</span>
                  <span className="text-xl font-black text-white">{nf(kpis.orders)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-800/50 p-4 border-l-4 border-emerald-500">
                  <span className="font-bold text-slate-300">✅ Entregados</span>
                  <span className="text-xl font-black text-emerald-400">{nf(kpis.delivered)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-800/50 p-4 border-l-4 border-rose-500">
                  <span className="font-bold text-slate-300">✕ Cancelados</span>
                  <span className="text-xl font-black text-rose-400">{nf(kpis.canceled)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-800/50 p-4 border-l-4 border-amber-500">
                  <span className="font-bold text-slate-300">↩️ Devueltos a depósito</span>
                  <span className="text-xl font-black text-amber-400">{nf(0)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Productos con mini fotos */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">🏆 Top Productos</h3>
                <p className="text-xs font-semibold text-slate-400">Vendido vs Entregado</p>
              </div>
              <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-black text-violet-300">🔥</span>
            </div>
            {topProducts.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {topProducts.map((product, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-xl bg-slate-800/50 p-3 transition hover:bg-slate-800/80">
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl">📦</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{product.name}</p>
                      <div className="flex gap-4 text-xs">
                        <span className="font-semibold text-blue-400">Vendido: {nf(product.qty)}</span>
                        <span className="font-semibold text-emerald-400">Entregado: {nf(product.delivered)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm font-bold text-slate-500">Sin datos</div>
            )}
          </div>

          {/* Top Ciudades */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">🏙️ Top Ciudades</h3>
                <p className="text-xs font-semibold text-slate-400">Vendido vs Entregado</p>
              </div>
              <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-300">📍</span>
            </div>
            {mapCities.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {mapCities.map((city, index) => (
                  <div key={index} className="space-y-1 rounded-xl bg-slate-800/50 p-3 transition hover:bg-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-bold text-white">{city.name}</span>
                      <span className="text-xs font-black text-slate-400">Total: {nf(city.qty)}</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-blue-400">Vendido</span>
                          <span className="font-bold text-white">{nf(city.qty)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${(city.qty / Math.max(city.qty, city.delivered, 1)) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-400">Entregado</span>
                          <span className="font-bold text-white">{nf(city.delivered)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(city.delivered / Math.max(city.qty, city.delivered, 1)) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm font-bold text-slate-500">Sin datos</div>
            )}
          </div>

          {/* Información adicional */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-4">
                <span className="font-bold">📅 Rango: {dateFrom} → {dateTo}</span>
                <span className="font-bold">📦 Pedidos: {nf(kpis.orders)}</span>
                <span className="font-bold">💰 Total: {nf(kpis.sold)} Gs</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-emerald-400">✅ Entregados: {nf(kpis.delivered)}</span>
                <span className="font-bold text-rose-400">✕ Cancelados: {nf(kpis.canceled)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
