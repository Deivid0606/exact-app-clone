import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  TrendingUp, TrendingDown, ShoppingBag, Truck, XCircle, 
  Users, DollarSign, Package, MapPin, Award, Clock, 
  AlertCircle, CheckCircle, BarChart3, PieChart as PieChartIcon,
  Calendar, Filter, Download, RefreshCw, ChevronDown,
  Eye, Edit, Trash2, MoreVertical, UserPlus, Box
} from 'lucide-react';

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
  commission_settled?: boolean | null;
}

interface DeliveryStock {
  id: string;
  delivery_email: string;
  product_id: string;
  quantity: number;
}

interface Product {
  id: string;
  title: string;
  sku: string | null;
  image_url: string | null;
  provider_email: string | null;
  real_cost_gs?: number;
  provider_price_gs?: number;
}

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
}

interface DeliveryWithStock {
  email: string;
  name: string;
  avatar?: string;
  total_products: number;
  total_units: number;
  products: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    image?: string;
  }[];
}

type KpiTone = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'pink' | 'indigo' | 'slate';

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

// ─── Componentes UI ──────────────────────────────────────────────────────────

const StatCard = ({ 
  title, value, subtitle, icon: Icon, trend, trendValue, tone = 'blue', isLoading 
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  tone?: KpiTone;
  isLoading?: boolean;
}) => {
  const tones: Record<KpiTone, string> = {
    blue: 'from-blue-500/20 to-cyan-500/10 border-blue-500/20 text-blue-300 shadow-blue-500/5',
    emerald: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/20 text-emerald-300 shadow-emerald-500/5',
    amber: 'from-amber-500/20 to-orange-500/10 border-amber-500/20 text-amber-300 shadow-amber-500/5',
    rose: 'from-rose-500/20 to-red-500/10 border-rose-500/20 text-rose-300 shadow-rose-500/5',
    violet: 'from-violet-500/20 to-fuchsia-500/10 border-violet-500/20 text-violet-300 shadow-violet-500/5',
    cyan: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/20 text-cyan-300 shadow-cyan-500/5',
    pink: 'from-pink-500/20 to-rose-500/10 border-pink-500/20 text-pink-300 shadow-pink-500/5',
    indigo: 'from-indigo-500/20 to-violet-500/10 border-indigo-500/20 text-indigo-300 shadow-indigo-500/5',
    slate: 'from-slate-500/20 to-slate-600/10 border-slate-500/20 text-slate-300 shadow-slate-500/5',
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${tones[tone]} p-5 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:border-white/30 group`}>
      <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/5 blur-2xl group-hover:scale-150 transition-transform duration-700" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{title}</div>
          {isLoading ? (
            <div className="mt-2 h-8 w-32 animate-pulse rounded-lg bg-slate-700/50" />
          ) : (
            <div className="mt-1 text-2xl font-black leading-tight text-white md:text-3xl">{value}</div>
          )}
          {subtitle && <div className="mt-1 text-xs font-medium text-slate-400">{subtitle}</div>}
          {trend && trendValue && (
            <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
              trend === 'up' ? 'bg-emerald-500/20 text-emerald-400' :
              trend === 'down' ? 'bg-rose-500/20 text-rose-400' :
              'bg-slate-500/20 text-slate-400'
            }`}>
              {trend === 'up' && <TrendingUp className="h-3 w-3" />}
              {trend === 'down' && <TrendingDown className="h-3 w-3" />}
              {trendValue}
            </div>
          )}
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-inner">
          <Icon className="h-5 w-5 text-white/80" />
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ title, subtitle, action, icon }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
    <div>
      <div className="flex items-center gap-2">
        {icon && <span className="text-xl">{icon}</span>}
        <h3 className="text-lg font-black text-white tracking-tight">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="flex items-center gap-2">{action}</div>}
  </div>
);

const ActionButton = ({ children, variant = 'primary', onClick, icon: Icon, loading, disabled }: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  onClick?: () => void;
  icon?: React.ElementType;
  loading?: boolean;
  disabled?: boolean;
}) => {
  const variants = {
    primary: 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:shadow-lg hover:shadow-blue-500/25 border-0',
    secondary: 'bg-slate-800/80 text-slate-200 border border-slate-700 hover:bg-slate-700/80',
    ghost: 'bg-transparent text-slate-400 border border-slate-700/50 hover:bg-slate-800/50',
    danger: 'bg-gradient-to-r from-rose-600 to-red-500 text-white hover:shadow-lg hover:shadow-rose-500/25 border-0',
    success: 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:shadow-lg hover:shadow-emerald-500/25 border-0',
  };

  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {loading ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        Icon && <Icon className="h-4 w-4" />
      )}
      {children}
    </button>
  );
};

// ─── Tabla de Comisiones ──────────────────────────────────────────────────────

const CommissionsTable = ({ commissions, onSettle }: {
  commissions: any[];
  onSettle: (email: string) => void;
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/10">
          <th className="text-left py-3 px-3 text-xs font-black uppercase tracking-wider text-slate-400">Vendedor</th>
          <th className="text-center py-3 px-3 text-xs font-black uppercase tracking-wider text-slate-400">Entregas</th>
          <th className="text-center py-3 px-3 text-xs font-black uppercase tracking-wider text-slate-400">Total Comisión</th>
          <th className="text-center py-3 px-3 text-xs font-black uppercase tracking-wider text-slate-400">Pendiente</th>
          <th className="text-center py-3 px-3 text-xs font-black uppercase tracking-wider text-slate-400">Liquidado</th>
          <th className="text-right py-3 px-3 text-xs font-black uppercase tracking-wider text-slate-400">Acción</th>
        </tr>
      </thead>
      <tbody>
        {commissions.map(comm => (
          <tr key={comm.seller_email} className="border-b border-white/5 hover:bg-white/5 transition-all">
            <td className="py-3 px-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
                  {comm.seller_avatar ? (
                    <img src={comm.seller_avatar} alt={comm.seller_name} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    comm.seller_name?.charAt(0).toUpperCase() || 'V'
                  )}
                </div>
                <div>
                  <div className="font-bold text-white">{comm.seller_name}</div>
                  <div className="text-xs text-slate-400">{comm.seller_email}</div>
                </div>
              </div>
            </td>
            <td className="text-center py-3 px-3 font-bold text-white">{comm.total_delivered}</td>
            <td className="text-center py-3 px-3 font-bold text-emerald-400">{nf(comm.total_commission)} Gs</td>
            <td className="text-center py-3 px-3 font-bold text-amber-400">{nf(comm.pending_commission)} Gs</td>
            <td className="text-center py-3 px-3 font-bold text-cyan-400">{nf(comm.settled_commission)} Gs</td>
            <td className="text-right py-3 px-3">
              <ActionButton 
                variant="success" 
                onClick={() => onSettle(comm.seller_email)}
                disabled={comm.pending_commission === 0}
                icon={CheckCircle}
              >
                Liquidar
              </ActionButton>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Componente: Top Bar ──────────────────────────────────────────────────────

const TopBar = ({ dateFrom, dateTo, onDateChange, onRefresh, loading }: {
  dateFrom: string;
  dateTo: string;
  onDateChange: (from: string, to: string) => void;
  onRefresh: () => void;
  loading: boolean;
}) => (
  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] backdrop-blur-sm">
    <div className="flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25">
        <BarChart3 className="h-6 w-6 text-white" />
      </div>
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Dashboard</h1>
        <p className="text-xs text-slate-400">Panel de control empresarial</p>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 bg-black/30 rounded-xl border border-white/10 p-1">
        <input
          type="date"
          className="bg-transparent px-3 py-1.5 text-xs font-medium text-white outline-none border-0 focus:ring-0"
          value={dateFrom}
          onChange={e => onDateChange(e.target.value, dateTo)}
        />
        <span className="text-slate-500 text-xs">→</span>
        <input
          type="date"
          className="bg-transparent px-3 py-1.5 text-xs font-medium text-white outline-none border-0 focus:ring-0"
          value={dateTo}
          onChange={e => onDateChange(dateFrom, e.target.value)}
        />
      </div>
      
      <ActionButton variant="secondary" onClick={onRefresh} icon={RefreshCw} loading={loading}>
        Actualizar
      </ActionButton>
      <ActionButton variant="secondary" icon={Download}>
        Exportar
      </ActionButton>
    </div>
  </div>
);

// ─── Componente: Stock por Delivery (mejorado) ──────────────────────────────

const DeliveryStockSection = ({ deliveries, onManage }: {
  deliveries: DeliveryWithStock[];
  onManage: () => void;
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (deliveries.length === 0) {
    return (
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 p-8 text-center">
        <Package className="h-12 w-12 text-cyan-400/50 mx-auto mb-3" />
        <p className="text-white/60 font-medium">No hay stock asignado a deliveries</p>
        <p className="text-sm text-slate-500">Asigna stock desde el módulo de productos</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white/5 p-3 border border-white/5 text-center">
          <div className="text-2xl font-black text-cyan-400">{deliveries.length}</div>
          <div className="text-xs text-slate-400">Deliveries</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3 border border-white/5 text-center">
          <div className="text-2xl font-black text-emerald-400">
            {nf(deliveries.reduce((sum, d) => sum + d.total_products, 0))}
          </div>
          <div className="text-xs text-slate-400">Productos distintos</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3 border border-white/5 text-center">
          <div className="text-2xl font-black text-blue-400">
            {nf(deliveries.reduce((sum, d) => sum + d.total_units, 0))}
          </div>
          <div className="text-xs text-slate-400">Unidades totales</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3 border border-white/5 text-center">
          <div className="text-2xl font-black text-violet-400">
            {nf(deliveries.filter(d => d.total_units > 0).length)}
          </div>
          <div className="text-xs text-slate-400">Con stock activo</div>
        </div>
      </div>

      {/* Lista de Deliveries */}
      <div className="grid grid-cols-1 gap-4">
        {deliveries.map((delivery) => (
          <div 
            key={delivery.email} 
            className="rounded-xl border border-white/10 bg-white/5 overflow-hidden hover:bg-white/[0.07] transition-all"
          >
            {/* Header del Delivery */}
            <div 
              className="flex items-center gap-4 p-4 cursor-pointer"
              onClick={() => setExpanded(expanded === delivery.email ? null : delivery.email)}
            >
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                {delivery.avatar ? (
                  <img src={delivery.avatar} alt={delivery.name} className="h-full w-full rounded-full object-cover" />
                ) : (
                  delivery.name?.charAt(0).toUpperCase() || 'D'
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-base">{delivery.name}</div>
                <div className="text-xs text-slate-400">{delivery.email}</div>
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="font-bold text-cyan-400">{delivery.total_products}</div>
                  <div className="text-[10px] text-slate-500">Productos</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-emerald-400">{delivery.total_units}</div>
                  <div className="text-[10px] text-slate-500">Unidades</div>
                </div>
                <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform duration-300 ${expanded === delivery.email ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* Detalle de Productos (expandido) */}
            {expanded === delivery.email && (
              <div className="border-t border-white/10 p-4 bg-black/20">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {delivery.products.map((product) => (
                    <div 
                      key={product.id} 
                      className="flex items-center gap-3 rounded-lg bg-white/5 p-3 border border-white/5 hover:bg-white/10 transition-all"
                    >
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-slate-900">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-2xl">📦</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white text-sm truncate">{product.name}</div>
                        <div className="text-xs text-slate-400">SKU: {product.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-emerald-400">{product.quantity}</div>
                        <div className="text-[10px] text-slate-500">unidades</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Dashboard Principal ──────────────────────────────────────────────────────

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
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [deliveryStocks, setDeliveryStocks] = useState<DeliveryStock[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adSpend, setAdSpend] = useState(() => {
    try { return Number(localStorage.getItem('provider_ad_spend') || 0); } catch { return 0; }
  });

  const loadDashboard = useCallback(async () => {
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
      supabase.from('products').select('id, title, sku, image_url, provider_email, real_cost_gs, provider_price_gs'),
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
  }, [dateFrom, dateTo]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // ─── Mapeos ──────────────────────────────────────────────────────────────────

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach(p => { if (p.email) m[p.email.toLowerCase()] = p; });
    return m;
  }, [profiles]);

  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach(p => { if (p.id) m[p.id] = p; });
    return m;
  }, [products]);

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

  // ─── Filtros ─────────────────────────────────────────────────────────────────

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

  // ─── KPIs ────────────────────────────────────────────────────────────────────

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

  // ─── Top Sellers ─────────────────────────────────────────────────────────────

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

  // ─── Delivery Pendientes a Rendir ───────────────────────────────────────────

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

  // ─── Stock por Delivery (MEJORADO) ────────────────────────────────────────────

  const deliveryStockData = useMemo((): DeliveryWithStock[] => {
    if (role !== 'ADMIN' && role !== 'PROVEEDOR') return [];

    const providerProductIds = new Set<string>();
    if (role === 'PROVEEDOR') {
      products.forEach(p => {
        if (p.provider_email?.toLowerCase() === email.toLowerCase()) {
          providerProductIds.add(p.id);
        }
      });
    }

    const grouped: Record<string, DeliveryWithStock> = {};

    deliveryStocks.forEach(stock => {
      // Filtrar por proveedor si es necesario
      if (role === 'PROVEEDOR' && !providerProductIds.has(stock.product_id)) return;
      
      const product = productMap[stock.product_id];
      if (!product) return;

      const deliveryProfile = profileMap[stock.delivery_email];
      if (!deliveryProfile) return;

      if (!grouped[stock.delivery_email]) {
        grouped[stock.delivery_email] = {
          email: stock.delivery_email,
          name: deliveryProfile.full_name || stock.delivery_email,
          avatar: deliveryProfile.avatar_url,
          total_products: 0,
          total_units: 0,
          products: [],
        };
      }

      grouped[stock.delivery_email].products.push({
        id: product.id,
        name: product.title || product.sku || 'Producto',
        sku: product.sku || '',
        quantity: stock.quantity,
        image: product.image_url,
      });
      grouped[stock.delivery_email].total_products++;
      grouped[stock.delivery_email].total_units += stock.quantity;
    });

    return Object.values(grouped)
      .sort((a, b) => b.total_units - a.total_units);
  }, [deliveryStocks, role, email, products, productMap, profileMap]);

  // ─── Comisiones por Vendedor ────────────────────────────────────────────────

  const sellerCommissions = useMemo(() => {
    if (role !== 'ADMIN' && role !== 'PROVEEDOR') return [];

    const sellerMap: Record<string, any> = {};

    deliveredRangeOrders.forEach(o => {
      const sellerEmail = o.created_by?.toLowerCase() || '';
      if (!sellerEmail) return;
      
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

      const commission = Number(o.commission_gs || 0);
      const isSettled = o.commission_settled || false;

      if (!sellerMap[sellerEmail]) {
        const sellerProfile = profileMap[sellerEmail];
        sellerMap[sellerEmail] = {
          seller_email: sellerEmail,
          seller_name: sellerProfile?.full_name || sellerEmail.split('@')[0] || 'Vendedor',
          seller_avatar: sellerProfile?.avatar_url,
          total_delivered: 0,
          total_commission: 0,
          pending_commission: 0,
          settled_commission: 0,
          orders: [],
        };
      }

      sellerMap[sellerEmail].total_delivered++;
      sellerMap[sellerEmail].total_commission += commission;
      if (isSettled) {
        sellerMap[sellerEmail].settled_commission += commission;
      } else {
        sellerMap[sellerEmail].pending_commission += commission;
      }
      sellerMap[sellerEmail].orders.push(o);
    });

    return Object.values(sellerMap)
      .sort((a, b) => b.pending_commission - a.pending_commission);
  }, [deliveredRangeOrders, role, email, skuProviderMap, profileMap]);

  // ─── Gráficos ────────────────────────────────────────────────────────────────

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

    const skuToImage: Record<string, string> = {};
    products.forEach(p => {
      if (p.sku && p.image_url) {
        skuToImage[p.sku.trim()] = p.image_url;
      }
    });

    return Object.entries(map)
      .sort(([,a], [,b]) => b.qty - a.qty)
      .slice(0, 10)
      .map(([name, data]) => ({
        name,
        qty: data.qty,
        delivered: data.delivered,
        image: skuToImage[data.sku] || null
      }));
  }, [createdRangeOrders, deliveredRangeOrders, products]);

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

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleRefresh = () => loadDashboard();

  const handleSettleCommission = async (sellerEmail: string) => {
    if (!confirm(`¿Liquidar todas las comisiones pendientes para ${sellerEmail}?`)) return;
    
    const sellerOrders = deliveredRangeOrders.filter(
      o => o.created_by?.toLowerCase() === sellerEmail.toLowerCase() && !o.commission_settled
    );

    for (const order of sellerOrders) {
      await supabase.from('orders').update({ commission_settled: true }).eq('id', order.id);
    }

    toast.success(`Comisiones liquidadas para ${sellerEmail}`);
    handleRefresh();
  };

  const handleManageStock = () => {
    toast.info('Abrir gestión de stock');
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full bg-[#020617] p-4 md:p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* Top Bar */}
        <TopBar 
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
          onRefresh={handleRefresh}
          loading={loading}
        />

        {/* KPIs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          <StatCard 
            title="Total Ventas" 
            value={`${nf(kpis.sold)} Gs`} 
            subtitle="Del 01 al 18" 
            icon={DollarSign} 
            tone="emerald"
            trend="up"
            trendValue="+12.5%"
          />
          <StatCard 
            title="Pedidos" 
            value={nf(kpis.orders)} 
            subtitle="Total pedidos" 
            icon={ShoppingBag} 
            tone="blue"
          />
          <StatCard 
            title="Entregados" 
            value={nf(kpis.delivered)} 
            subtitle="Del 01 al 18" 
            icon={Truck} 
            tone="cyan"
          />
          <StatCard 
            title="Cancelados" 
            value={nf(kpis.canceled)} 
            subtitle="Del 01 al 18" 
            icon={XCircle} 
            tone="rose"
          />
          <StatCard 
            title="Ganancia Hoy" 
            value={`${nf(kpis.deliveredTodayProfit || kpis.profit)} Gs`} 
            subtitle="Comisión de hoy" 
            icon={TrendingUp} 
            tone="violet"
          />
          <StatCard 
            title="Guías" 
            value={nf(kpis.guidesGenerated)} 
            subtitle="Generadas" 
            icon={Package} 
            tone="amber"
          />
        </div>

        {/* Top Sellers - ADMIN & PROVEEDOR */}
        {(role === 'ADMIN' || role === 'PROVEEDOR') && topSellers.length > 0 && (
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 p-5 shadow-xl">
            <SectionHeader 
              title="🏆 Top Vendedores" 
              subtitle="Mejor rendimiento por volumen de ventas"
              action={<ActionButton variant="secondary" icon={Users}>Ver todos</ActionButton>}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {topSellers.map((seller, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 border border-white/5 hover:bg-white/10 transition-all">
                  <div className="relative">
                    <div className="h-11 w-11 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
                      {seller.avatar ? (
                        <img src={seller.avatar} alt={seller.name} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        seller.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-violet-500/80 text-[9px] font-black text-white flex items-center justify-center border-2 border-[#020617]">
                      {index + 1}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm">{seller.name}</div>
                    <div className="text-xs text-slate-400">{seller.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-400">{nf(seller.revenue)} Gs</div>
                    <div className="text-xs text-slate-400">{seller.delivered} entregados</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comisiones Pendientes - ADMIN & PROVEEDOR */}
        {(role === 'ADMIN' || role === 'PROVEEDOR') && sellerCommissions.length > 0 && (
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 p-5 shadow-xl">
            <SectionHeader 
              title="💰 Comisiones Pendientes a Pagar" 
              subtitle="Pedidos entregados con estado rendido"
              action={
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-full">
                    Total: {nf(sellerCommissions.reduce((sum, s) => sum + s.pending_commission, 0))} Gs
                  </span>
                  <ActionButton variant="success" icon={CheckCircle}>Liquidar todo</ActionButton>
                </div>
              }
            />
            <CommissionsTable 
              commissions={sellerCommissions} 
              onSettle={handleSettleCommission}
            />
          </div>
        )}

        {/* STOCK POR DELIVERY - MEJORADO Y MÁS GRANDE */}
        {(role === 'ADMIN' || role === 'PROVEEDOR') && (
          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 p-5 shadow-xl">
            <SectionHeader 
              title="📦 Stock por Delivery" 
              subtitle={`${deliveryStockData.length} deliveries con stock asignado`}
              icon={<Box className="h-5 w-5 text-cyan-400" />}
              action={
                <div className="flex items-center gap-3">
                  {deliveryStockData.length > 0 && (
                    <span className="text-xs font-bold text-cyan-400 bg-cyan-500/20 px-4 py-1.5 rounded-full">
                      Total: {nf(deliveryStockData.reduce((sum, d) => sum + d.total_units, 0))} unidades
                    </span>
                  )}
                  <ActionButton variant="primary" icon={UserPlus} onClick={handleManageStock}>
                    Gestionar Stock
                  </ActionButton>
                </div>
              }
            />
            
            {/* Componente de Stock mejorado */}
            <DeliveryStockSection 
              deliveries={deliveryStockData} 
              onManage={handleManageStock}
            />
          </div>
        )}

        {/* Gráficos */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Ventas por día */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
            <SectionHeader 
              title="Ventas por día" 
              subtitle="Total vendido por día"
            />
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => nf(v)} />
                  <Tooltip
                    contentStyle={{ 
                      background: 'rgba(2,6,23,0.95)', 
                      border: '1px solid rgba(148,163,184,0.2)', 
                      borderRadius: 12, 
                      color: '#fff',
                      padding: '12px 16px'
                    }}
                    formatter={(v: number) => [nf(v) + ' Gs', 'Ventas']}
                  />
                  <Bar dataKey="value" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ventas vs Entregas */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
            <SectionHeader 
              title="Ventas vs Entregas" 
              subtitle="Comparativa diaria"
            />
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => nf(v)} />
                  <Tooltip
                    contentStyle={{ 
                      background: 'rgba(2,6,23,0.95)', 
                      border: '1px solid rgba(148,163,184,0.2)', 
                      borderRadius: 12, 
                      color: '#fff',
                      padding: '12px 16px'
                    }}
                    formatter={(v: number) => [nf(v) + ' Gs', '']}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
                  <Line type="monotone" dataKey="sold" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 4 }} name="Vendido" />
                  <Line type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} name="Entregado" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Distribución de estados y Top Productos */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Distribución de estados */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
            <SectionHeader 
              title="Distribución de estados" 
              subtitle="Pedidos por estado"
            />
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={pieData} 
                    dataKey="value" 
                    nameKey="name" 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={60} 
                    outerRadius={90} 
                    paddingAngle={3}
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: 'rgba(148,163,184,0.3)' }}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ 
                      background: 'rgba(2,6,23,0.95)', 
                      border: '1px solid rgba(148,163,184,0.2)', 
                      borderRadius: 12, 
                      color: '#fff',
                      padding: '12px 16px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Productos */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
            <SectionHeader 
              title="Top Productos" 
              subtitle="Vendido vs Entregado"
            />
            <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
              {topProducts.map((product, index) => (
                <div key={index} className="flex items-center gap-3 rounded-lg bg-white/5 p-2 hover:bg-white/10 transition-all">
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-slate-900">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg">📦</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm truncate">{product.name}</div>
                    <div className="flex gap-4 text-xs">
                      <span className="font-semibold text-blue-400">Vendido: {nf(product.qty)}</span>
                      <span className="font-semibold text-emerald-400">Entregado: {nf(product.delivered)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-400">
                      {product.delivered > 0 ? Math.round((product.delivered / product.qty) * 100) : 0}%
                    </div>
                    <div className="w-12 h-1 rounded-full bg-slate-700 mt-1">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
                        style={{ width: `${Math.min(100, (product.delivered / product.qty) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Ciudades */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
          <SectionHeader 
            title="Top Ciudades" 
            subtitle="Mayor volumen de pedidos"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {mapCities.map((city, index) => (
              <div key={index} className="rounded-xl bg-white/5 p-3 border border-white/5 hover:bg-white/10 transition-all">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm truncate">{city.name}</span>
                  <span className="text-xs font-bold text-slate-400">{nf(city.qty)}</span>
                </div>
                <div className="mt-2 flex gap-2 text-[10px]">
                  <div className="flex-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Vendido</span>
                      <span className="font-bold text-white">{nf(city.qty)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-700 mt-0.5">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${(city.qty / Math.max(city.qty, city.delivered, 1)) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Entregado</span>
                      <span className="font-bold text-white">{nf(city.delivered)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-700 mt-0.5">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(city.delivered / Math.max(city.qty, city.delivered, 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span>📅 {dateFrom} → {dateTo}</span>
              <span>📦 {nf(kpis.orders)} pedidos</span>
              <span>💰 {nf(kpis.sold)} Gs</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-emerald-400">✅ {nf(kpis.delivered)} entregados</span>
              <span className="text-rose-400">✕ {nf(kpis.canceled)} cancelados</span>
              <span className="text-slate-400">🔄 Actualizado: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
