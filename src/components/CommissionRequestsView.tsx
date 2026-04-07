import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function CommissionRequestsView() {
  const { profile } = useAuth();
  const role = profile?.role;
  const [requests, setRequests] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVendor, setFilterVendor] = useState('');

  const load = async () => {
    let query = supabase.from('commission_requests').select('*').order('requested_at', { ascending: false });
    if (filterStatus) query = query.eq('status', filterStatus);
    const { data } = await query;
    setRequests(data || []);
  };

  useEffect(() => { load(); }, []);

  const filtered = requests.filter(r => {
    if (filterVendor && r.vendor_email?.toLowerCase() !== filterVendor.toLowerCase()) return false;
    if (role === 'VENDEDOR' && r.vendor_email?.toLowerCase() !== profile?.email?.toLowerCase()) return false;
    return true;
  });

  const approve = async (id: string) => {
    const note = prompt('Nota de aprobación (opcional):') || '';
    await supabase.from('commission_requests').update({
      status: 'APROBADO', approved_at: new Date().toISOString(),
      approved_by: profile?.email, approval_note: note,
    }).eq('id', id);
    toast.success('Solicitud aprobada');
    load();
  };

  const reject = async (id: string) => {
    const note = prompt('Motivo del rechazo:') || '';
    await supabase.from('commission_requests').update({
      status: 'RECHAZADO', rejected_at: new Date().toISOString(),
      rejected_by: profile?.email, approval_note: note,
    }).eq('id', id);
    toast.success('Solicitud rechazada');
    load();
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Solicitud de comisiones</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="app-input !w-auto min-w-[180px]" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); }}>
          <option value="">Todas</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="APROBADO">Aprobadas</option>
          <option value="RECHAZADO">Rechazadas</option>
        </select>
        <button className="nav-btn active" onClick={load}>Actualizar</button>
      </div>

      <div className="overflow-auto">
        <table className="app-table">
          <thead>
            <tr><th>Fecha</th><th>Vendedor</th><th>Proveedor</th><th className="text-right">Monto (Gs)</th><th>Rango</th><th>Nota</th><th>Estado</th><th>Acción</th></tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="text-xs whitespace-nowrap">{r.requested_at ? new Date(r.requested_at).toLocaleDateString('es-PY') : ''}</td>
                <td className="text-xs">{r.vendor_email}</td>
                <td className="text-xs">{r.provider_email}</td>
                <td className="text-right text-xs font-bold">{nf(Number(r.amount_gs || 0))}</td>
                <td className="text-xs">{r.range_from} — {r.range_to}</td>
                <td className="text-xs">{r.note}</td>
                <td>
                  <span className={`badge-status ${r.status === 'APROBADO' ? 'badge-entregado' : r.status === 'RECHAZADO' ? 'badge-cancelado' : 'badge-pendiente'}`}>
                    {r.status}
                  </span>
                </td>
                <td>
                  {r.status === 'PENDIENTE' && (role === 'ADMIN' || role === 'PROVEEDOR') && (
                    <div className="flex gap-1">
                      <button className="nav-btn active text-xs !py-1 !px-2" onClick={() => approve(r.id)}>Aprobar</button>
                      <button className="nav-btn text-xs !py-1 !px-2" onClick={() => reject(r.id)}>Rechazar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Sin solicitudes</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
