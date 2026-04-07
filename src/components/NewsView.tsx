import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function NewsView() {
  const { profile } = useAuth();
  const [news, setNews] = useState<any[]>([]);
  const [filterRole, setFilterRole] = useState('');

  const load = () => {
    supabase.from('news').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setNews(data || []));
  };

  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv); }, []);

  const filtered = news.filter(n => {
    if (filterRole && n.role_scope !== filterRole) return false;
    return true;
  });

  const iconFor = (msg: string) => {
    if (msg?.includes('ENTREGADO')) return '✅';
    if (msg?.includes('CANCELADO') || msg?.includes('RECHAZADO')) return '❌';
    if (msg?.includes('EN RUTA')) return '🚚';
    if (msg?.includes('asignó')) return '📦';
    if (msg?.includes('comisión') || msg?.includes('COMISIÓN')) return '💰';
    if (msg?.includes('rendición') || msg?.includes('RENDICIÓN')) return '🧾';
    return '📢';
  };

  return (
    <div className="app-card">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-extrabold">📢 Novedades</h3>
        <div className="flex gap-2">
          <select className="app-input !w-auto" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
            <option value="">Todas</option>
            <option value="ADMIN">ADMIN</option>
            <option value="VENDEDOR">VENDEDOR</option>
            <option value="DELIVERY">DELIVERY</option>
            <option value="PROVEEDOR">PROVEEDOR</option>
          </select>
          <button className="nav-btn !px-2 !py-1 text-xs" onClick={load}>↻</button>
        </div>
      </div>

      {filtered.length === 0 && <p className="text-muted-foreground text-sm">Sin novedades aún.</p>}

      <div className="flex flex-col gap-2">
        {filtered.map(n => (
          <div key={n.id} className="kpi-card !p-3 hover:border-primary/20 transition-colors">
            <div className="flex justify-between items-start gap-3">
              <div className="flex items-start gap-2">
                <span className="text-lg">{iconFor(n.message)}</span>
                <div>
                  <span className="text-sm">{n.message}</span>
                  <div className="flex gap-1.5 mt-1">
                    {n.order_id && <span className="chip text-[9px]">📦 {n.order_id}</span>}
                    {n.actor_email && <span className="chip text-[9px]">👤 {n.actor_email}</span>}
                    {n.role_scope && <span className="chip text-[9px]">{n.role_scope}</span>}
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {new Date(n.created_at).toLocaleString('es-PY')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
