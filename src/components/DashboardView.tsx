import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function DashboardView() {
  const { profile } = useAuth();
  const role = profile?.role;
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [kpis, setKpis] = useState({ orders: 0, sold: 0, delivered: 0, canceled: 0, profit: 0 });
  const [loading, setLoading] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59');

    if (orders) {
      const delivered = orders.filter(o => o.status === 'ENTREGADO' || o.status === 'ENCOMIENDA ENTREGADA');
      const canceled = orders.filter(o => o.status === 'CANCELADO');
      const totalSold = orders.reduce((s, o) => s + Number(o.total_gs || 0), 0);
      const totalComm = delivered.reduce((s, o) => s + Number(o.commission_gs || 0), 0);

      setKpis({
        orders: orders.length,
        sold: totalSold,
        delivered: delivered.length,
        canceled: canceled.length,
        profit: totalComm,
      });
    }
    setLoading(false);
  };

  useEffect(() => { loadDashboard(); }, []);

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

      {/* KPIs */}
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
        <div className="kpi-card">
          <div className="text-xs text-muted-foreground mb-1.5">
            {role === 'VENDEDOR' ? 'Mi comisión (Gs)' : 'Utilidad Total (Gs)'}
          </div>
          <div className="text-[22px] font-extrabold">{nf(kpis.profit)}</div>
        </div>
      </div>

      {/* Charts placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="kpi-card min-h-[200px] flex items-center justify-center">
          <span className="text-muted-foreground text-sm">📊 Gráfico de barras (próximamente)</span>
        </div>
        <div className="kpi-card min-h-[200px] flex items-center justify-center">
          <span className="text-muted-foreground text-sm">🥧 Gráfico circular (próximamente)</span>
        </div>
      </div>
    </div>
  );
}
