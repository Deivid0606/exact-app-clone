import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function RendicionesPagadasView() {
  const [rendiciones, setRendiciones] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [filterDelivery, setFilterDelivery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('email, name').then(({ data }) => setDeliveries(data || []));
    load();
  }, []);

  const load = async () => {
    let query = supabase.from('rendiciones_pagadas').select('*').order('pagado_en', { ascending: false });
    if (filterDelivery) query = query.eq('delivery_email', filterDelivery);
    const { data } = await query;
    setRendiciones(data || []);
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Rendiciones pagadas</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="app-input !w-auto min-w-[260px]" value={filterDelivery} onChange={e => setFilterDelivery(e.target.value)}>
          <option value="">Todos los delivery</option>
          {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
        </select>
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <button className="nav-btn active" onClick={load}>Actualizar</button>
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1100px]">
          <thead>
            <tr><th>Delivery</th><th>Fecha</th><th className="text-right">Monto Total (Gs)</th><th>Nota</th><th>Marcado por</th><th>Marcado en</th><th>Pagado en</th></tr>
          </thead>
          <tbody>
            {rendiciones.map(r => (
              <tr key={r.id}>
                <td className="text-sm">{r.delivery_email}</td>
                <td className="text-sm">{r.fecha_rendicion}</td>
                <td className="text-right text-sm font-bold">{nf(Number(r.monto_total || 0))}</td>
                <td className="text-sm">{r.nota}</td>
                <td className="text-sm">{r.marcado_por}</td>
                <td className="text-sm">{r.marcado_en ? new Date(r.marcado_en).toLocaleString('es-PY') : ''}</td>
                <td className="text-sm">{r.pagado_en ? new Date(r.pagado_en).toLocaleString('es-PY') : ''}</td>
              </tr>
            ))}
            {rendiciones.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">Sin rendiciones</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
