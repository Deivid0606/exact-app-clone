import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  TrendingUp, TrendingDown, ShoppingBag, Truck, XCircle, 
  Users, DollarSign, Package, MapPin, Award, 
  CheckCircle, BarChart3, RefreshCw, ChevronDown, Box, UserPlus
} from 'lucide-react';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(Math.round(Number(n || 0)));
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#f97316', '#a855f7'];
const CANCEL_STATES = new Set(['CANCELADO','RECHAZADO','RECHAZADO EN EL LUGAR','NO DESEA','CANCELÓ POR WHATSAPP']);
const DELIVERED_STATES = new Set(['ENTREGADO', 'ENCOMIENDA ENTREGADA']);

// ... (interfaces igual que antes)

// ─── Componentes UI ──────────────────────────────────────────────────────────

const StatCard = ({ title, value, subtitle, icon: Icon, tone = 'blue' }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  tone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'pink' | 'indigo';
}) => {
  const tones = {
    blue: 'from-blue-500/20 to-cyan-500/10 border-blue-500/20 text-blue-300',
    emerald: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/20 text-emerald-300',
    amber: 'from-amber-500/20 to-orange-500/10 border-amber-500/20 text-amber-300',
    rose: 'from-rose-500/20 to-red-500/10 border-rose-500/20 text-rose-300',
    violet: 'from-violet-500/20 to-fuchsia-500/10 border-violet-500/20 text-violet-300',
    cyan: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/20 text-cyan-300',
    pink: 'from-pink-500/20 to-rose-500/10 border-pink-500/20 text-pink-300',
    indigo: 'from-indigo-500/20 to-violet-500/10 border-indigo-500/20 text-indigo-300',
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${tones[tone]} p-4 shadow-lg transition-all duration-300 hover:border-white/30`}>
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 truncate">{title}</div>
          <div className="mt-0.5 text-xl font-black leading-tight text-white md:text-2xl">{value}</div>
          {subtitle && <div className="mt-0.5 text-[10px] font-medium text-slate-400 truncate">{subtitle}</div>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <Icon className="h-4 w-4 text-white/80" />
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ title, subtitle, action }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
    <div>
      <h3 className="text-base font-black text-white tracking-tight">{title}</h3>
      {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
    </div>
    {action && <div className="flex items-center gap-2">{action}</div>}
  </div>
);

const ActionButton = ({ children, variant = 'primary', onClick, icon: Icon, disabled }: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'success';
  onClick?: () => void;
  icon?: React.ElementType;
  disabled?: boolean;
}) => {
  const variants = {
    primary: 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:shadow-lg hover:shadow-blue-500/25',
    secondary: 'bg-slate-800/80 text-slate-200 border border-slate-700 hover:bg-slate-700/80',
    ghost: 'bg-transparent text-slate-400 border border-slate-700/50 hover:bg-slate-800/50',
    success: 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:shadow-lg hover:shadow-emerald-500/25',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
};

// ─── Tabla de Comisiones ──────────────────────────────────────────────────────

const CommissionsTable = ({ commissions, onSettle }: {
  commissions: any[];
  onSettle: (email: string) => void;
}) => {
  if (commissions.length === 0) {
    return (
      <div className="text-center py-6">
        <DollarSign className="h-8 w-8 text-slate-500 mx-auto mb-1" />
        <p className="text-slate-400 text-sm font-medium">No hay comisiones pendientes</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left py-2 px-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Vendedor</th>
            <th className="text-center py-2 px-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Entregas</th>
            <th className="text-center py-2 px-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Total</th>
            <th className="text-center py-2 px-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Pendiente</th>
            <th className="text-center py-2 px-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Liquidado</th>
            <th className="text-right py-2 px-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Acción</th>
          </tr>
        </thead>
        <tbody>
          {commissions.map((comm) => (
            <tr key={comm.seller_email} className="border-b border-white/5 hover:bg-white/5 transition-all">
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">
                    {comm.seller_avatar ? (
                      <img src={comm.seller_avatar} alt={comm.seller_name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      comm.seller_name?.charAt(0).toUpperCase() || 'V'
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate text-xs">{comm.seller_name}</div>
                    <div className="text-[9px] text-slate-400 truncate">{comm.seller_email}</div>
                  </div>
                </div>
              </td>
              <td className="text-center py-2 px-2 font-bold text-white">{comm.total_delivered}</td>
              <td className="text-center py-2 px-2 font-bold text-emerald-400">{nf(comm.total_commission)} Gs</td>
              <td className="text-center py-2 px-2 font-bold text-amber-400">{nf(comm.pending_commission)} Gs</td>
              <td className="text-center py-2 px-2 font-bold text-cyan-400">{nf(comm.settled_commission)} Gs</td>
              <td className="text-right py-2 px-2">
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
};

// ─── Componente: Top Bar ──────────────────────────────────────────────────────

const TopBar = ({ dateFrom, dateTo, onDateChange, onRefresh, loading }: {
  dateFrom: string;
  dateTo: string;
  onDateChange: (from: string, to: string) => void;
  onRefresh: () => void;
  loading: boolean;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25">
        <BarChart3 className="h-4 w-4 text-white" />
      </div>
      <div>
        <h1 className="text-lg font-black text-white tracking-tight">Dashboard</h1>
        <p className="text-[9px] text-slate-400">Panel de control</p>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 bg-black/30 rounded-lg border border-white/10 p-0.5">
        <input
          type="date"
          className="bg-transparent px-2 py-1 text-[10px] font-medium text-white outline-none border-0 focus:ring-0 w-28"
          value={dateFrom}
          onChange={e => onDateChange(e.target.value, dateTo)}
        />
        <span className="text-slate-500 text-[10px]">→</span>
        <input
          type="date"
          className="bg-transparent px-2 py-1 text-[10px] font-medium text-white outline-none border-0 focus:ring-0 w-28"
          value={dateTo}
          onChange={e => onDateChange(dateFrom, e.target.value)}
        />
      </div>
      
      <ActionButton variant="secondary" onClick={onRefresh} icon={RefreshCw}>
        {loading ? 'Cargando...' : 'Actualizar'}
      </ActionButton>
    </div>
  </div>
);

// ─── Componente: Stock por Delivery ──────────────────────────────────────────

const DeliveryStockSection = ({ deliveries }: { deliveries: any[] }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (deliveries.length === 0) {
    return (
      <div className="text-center py-6">
        <Package className="h-8 w-8 text-cyan-400/50 mx-auto mb-1" />
        <p className="text-white/60 text-sm font-medium">No hay stock asignado</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-white/5 p-2 text-center border border-white/5">
          <div className="text-lg font-black text-cyan-400">{deliveries.length}</div>
          <div className="text-[9px] text-slate-400">Deliveries</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2 text-center border border-white/5">
          <div className="text-lg font-black text-emerald-400">{nf(deliveries.reduce((s, d) => s + d.total_products, 0))}</div>
          <div className="text-[9px] text-slate-400">Productos</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2 text-center border border-white/5">
          <div className="text-lg font-black text-blue-400">{nf(deliveries.reduce((s, d) => s + d.total_units, 0))}</div>
          <div className="text-[9px] text-slate-400">Unidades</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2 text-center border border-white/5">
          <div className="text-lg font-black text-violet-400">{nf(deliveries.filter(d => d.total_units > 0).length)}</div>
          <div className="text-[9px] text-slate-400">Con stock</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {deliveries.map((delivery) => (
          <div key={delivery.email} className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
            <div 
              className="flex items-center gap-3 p-2.5 cursor-pointer"
              onClick={() => setExpanded(expanded === delivery.email ? null : delivery.email)}
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">
                {delivery.avatar ? (
                  <img src={delivery.avatar} alt={delivery.name} className="h-full w-full rounded-full object-cover" />
                ) : (
                  delivery.name?.charAt(0).toUpperCase() || 'D'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-xs">{delivery.name}</div>
                <div className="text-[9px] text-slate-400 truncate">{delivery.email}</div>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="font-bold text-cyan-400">{delivery.total_products}</span>
                <span className="font-bold text-emerald-400">{delivery.total_units}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded === delivery.email ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {expanded === delivery.email && (
              <div className="border-t border-white/10 p-2.5 bg-black/20">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {delivery.products.map((product: any) => (
                    <div key={product.id} className="flex items-center gap-2 rounded-lg bg-white/5 p-2 border border-white/5">
                      <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded border border-white/10 bg-slate-900">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm">📦</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white text-[10px] truncate">{product.name}</div>
                        <div className="text-[8px] text-slate-400">SKU: {product.sku}</div>
                      </div>
                      <div className="text-sm font-black text-emerald-400">{product.quantity}</div>
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

  // ... (todas las funciones de carga y mapeos igual que antes)

  return (
    <div className="w-full min-h-screen bg-[#020617] p-3 text-slate-100">
      <div className="w-full space-y-3">
        
        {/* Top Bar */}
        <TopBar 
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
          onRefresh={handleRefresh}
          loading={loading}
        />

        {/* KPIs Grid - 6 columnas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
          <StatCard title="Total" value={`${nf(kpis.sold)}`} subtitle="Gs" icon={DollarSign} tone="emerald" />
          <StatCard title="Pedidos" value={nf(kpis.orders)} subtitle="Totales" icon={ShoppingBag} tone="blue" />
          <StatCard title="Entregados" value={nf(kpis.delivered)} subtitle="Del 01 al 18" icon={Truck} tone="cyan" />
          <StatCard title="Cancelados" value={nf(kpis.canceled)} subtitle="Del 01 al 18" icon={XCircle} tone="rose" />
          <StatCard title="Ganancias" value={`${nf(kpis.profit)}`} subtitle="Gs" icon={TrendingUp} tone="violet" />
          <StatCard title="Guías" value={nf(kpis.guidesGenerated)} subtitle="Generadas" icon={Package} tone="amber" />
        </div>

        {/* Top Vendedores */}
        {(role === 'ADMIN' || role === 'PROVEEDOR') && topSellers.length > 0 && (
          <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 p-3 shadow-xl">
            <SectionHeader 
              title="🏆 Top Vendedores" 
              subtitle="Mejor rendimiento por volumen de ventas"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {topSellers.slice(0, 9).map((seller, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg bg-white/5 p-2 border border-white/5 hover:bg-white/10 transition-all">
                  <div className="relative">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-[10px]">
                      {seller.avatar ? (
                        <img src={seller.avatar} alt={seller.name} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        seller.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-violet-500/80 text-[7px] font-black text-white flex items-center justify-center border border-[#020617]">
                      {index + 1}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-xs truncate">{seller.name}</div>
                    <div className="text-[9px] text-slate-400 truncate">{seller.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-emerald-400">{nf(seller.revenue)} Gs</div>
                    <div className="text-[8px] text-slate-400">{seller.delivered} entregados</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comisiones Pendientes */}
        {(role === 'ADMIN' || role === 'PROVEEDOR') && (
          <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 p-3 shadow-xl">
            <SectionHeader 
              title="💰 Comisiones Pendientes a Pagar" 
              subtitle="Pedidos entregados con estado rendido"
              action={
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                  Total: {nf(sellerCommissions.reduce((sum, s) => sum + s.pending_commission, 0))} Gs
                </span>
              }
            />
            <CommissionsTable 
              commissions={sellerCommissions} 
              onSettle={handleSettleCommission}
            />
          </div>
        )}

        {/* Stock por Delivery */}
        {(role === 'ADMIN' || role === 'PROVEEDOR') && (
          <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 p-3 shadow-xl">
            <SectionHeader 
              title="📦 Stock por Delivery" 
              subtitle={`${deliveryStockData.length} deliveries con stock`}
              action={
                <ActionButton variant="primary" icon={UserPlus} onClick={handleManageStock}>
                  Gestionar
                </ActionButton>
              }
            />
            <DeliveryStockSection deliveries={deliveryStockData} />
          </div>
        )}

        {/* Gráficos - 2 columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-xl">
            <SectionHeader title="Ventas por día" subtitle="Total vendido por día" />
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} tickFormatter={v => nf(v)} />
                  <Tooltip
                    contentStyle={{ 
                      background: 'rgba(2,6,23,0.95)', 
                      border: '1px solid rgba(148,163,184,0.15)', 
                      borderRadius: 8, 
                      color: '#fff',
                      padding: '8px 12px',
                      fontSize: '11px'
                    }}
                    formatter={(v: number) => [nf(v) + ' Gs', 'Ventas']}
                  />
                  <Bar dataKey="value" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
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

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-xl">
            <SectionHeader title="Ventas vs Entregas" subtitle="Comparativa diaria" />
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} tickFormatter={v => nf(v)} />
                  <Tooltip
                    contentStyle={{ 
                      background: 'rgba(2,6,23,0.95)', 
                      border: '1px solid rgba(148,163,184,0.15)', 
                      borderRadius: 8, 
                      color: '#fff',
                      padding: '8px 12px',
                      fontSize: '11px'
                    }}
                    formatter={(v: number) => [nf(v) + ' Gs', '']}
                  />
                  <Legend wrapperStyle={{ fontSize: 9, color: '#94a3b8', paddingTop: 4 }} />
                  <Line type="monotone" dataKey="sold" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} name="Vendido" />
                  <Line type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} name="Entregado" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Distribución y Top Productos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-xl">
            <SectionHeader title="Distribución de estados" subtitle="Pedidos por estado" />
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={pieData} 
                    dataKey="value" 
                    nameKey="name" 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={45} 
                    outerRadius={70} 
                    paddingAngle={2}
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: 'rgba(148,163,184,0.2)', strokeWidth: 1 }}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ 
                      background: 'rgba(2,6,23,0.95)', 
                      border: '1px solid rgba(148,163,184,0.15)', 
                      borderRadius: 8, 
                      color: '#fff',
                      padding: '8px 12px',
                      fontSize: '11px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 9, color: '#94a3b8', paddingTop: 4 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-xl">
            <SectionHeader title="Top Productos" subtitle="Vendido vs Entregado" />
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {topProducts.slice(0, 8).map((product, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg bg-white/5 p-1.5 hover:bg-white/10 transition-all">
                  <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded border border-white/10 bg-slate-900">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm">📦</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-[10px] truncate">{product.name}</div>
                    <div className="flex gap-3 text-[9px]">
                      <span className="font-semibold text-blue-400">V: {nf(product.qty)}</span>
                      <span className="font-semibold text-emerald-400">E: {nf(product.delivered)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-bold text-slate-400">
                      {product.delivered > 0 ? Math.round((product.delivered / product.qty) * 100) : 0}%
                    </div>
                    <div className="w-10 h-1 rounded-full bg-slate-700 mt-0.5">
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
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-xl">
          <SectionHeader title="Top Ciudades" subtitle="Mayor volumen de pedidos" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {mapCities.slice(0, 10).map((city, index) => (
              <div key={index} className="rounded-lg bg-white/5 p-2 border border-white/5 hover:bg-white/10 transition-all">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs truncate">{city.name}</span>
                  <span className="text-[9px] font-bold text-slate-400">{nf(city.qty)}</span>
                </div>
                <div className="mt-1 flex gap-1 text-[8px]">
                  <div className="flex-1">
                    <div className="flex justify-between text-slate-400">
                      <span>V</span>
                      <span className="font-bold text-white">{nf(city.qty)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-slate-700 mt-0.5">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${(city.qty / Math.max(city.qty, city.delivered, 1)) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-slate-400">
                      <span>E</span>
                      <span className="font-bold text-white">{nf(city.delivered)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-slate-700 mt-0.5">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(city.delivered / Math.max(city.qty, city.delivered, 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500">
            <div className="flex items-center gap-3">
              <span>📅 {dateFrom} → {dateTo}</span>
              <span>📦 {nf(kpis.orders)} pedidos</span>
              <span>💰 {nf(kpis.sold)} Gs</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400">✅ {nf(kpis.delivered)} entregados</span>
              <span className="text-rose-400">✕ {nf(kpis.canceled)} cancelados</span>
              <span className="text-slate-500">🔄 {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
