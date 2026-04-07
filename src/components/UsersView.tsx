import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function UsersView() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: roles } = await supabase.from('user_roles').select('*');

    const merged = (profiles || []).map(p => {
      const r = (roles || []).find(r => r.user_id === p.user_id);
      return { ...p, role: r?.role || 'PENDIENTE', approved: r?.approved || false, role_id: r?.id };
    });
    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = users.filter(u => {
    if (filterRole && u.role !== filterRole) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q);
  });

  const approveUser = async (userId: string) => {
    const { error } = await supabase.from('user_roles').update({ approved: true }).eq('user_id', userId);
    if (error) toast.error(error.message);
    else { toast.success('Usuario aprobado'); loadUsers(); }
  };

  const changeRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('user_roles').update({ role: newRole as any }).eq('user_id', userId);
    if (error) toast.error(error.message);
    else { toast.success('Rol actualizado'); loadUsers(); }
  };

  const kpis = {
    total: users.length,
    pending: users.filter(u => !u.approved).length,
    vendors: users.filter(u => u.role === 'VENDEDOR').length,
    delivery: users.filter(u => u.role === 'DELIVERY').length,
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">👥 Gestión de Usuarios</h3>

      <div className="grid-kpi mb-4">
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Total usuarios</div><div className="text-[22px] font-extrabold">{kpis.total}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Pendientes</div><div className="text-[22px] font-extrabold">{kpis.pending}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Vendedores</div><div className="text-[22px] font-extrabold">{kpis.vendors}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Delivery</div><div className="text-[22px] font-extrabold">{kpis.delivery}</div></div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <input className="app-input flex-1 min-w-[200px]" placeholder="🔎 Buscar por nombre, email, rol..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="app-input !w-auto" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">Todos los roles</option>
          <option value="ADMIN">ADMIN</option>
          <option value="VENDEDOR">VENDEDOR</option>
          <option value="DELIVERY">DELIVERY</option>
          <option value="DESPACHANTE">DESPACHANTE</option>
          <option value="PROVEEDOR">PROVEEDOR</option>
        </select>
        <button className="nav-btn active" onClick={loadUsers}>Filtrar</button>
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[900px]">
          <thead>
            <tr>
              <th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id}>
                <td className="text-sm">{u.name}</td>
                <td className="text-sm">{u.email}</td>
                <td>
                  <select className="app-input !w-auto !py-1 !px-2 text-xs" value={u.role}
                    onChange={e => changeRole(u.user_id, e.target.value)}>
                    <option value="ADMIN">ADMIN</option>
                    <option value="VENDEDOR">VENDEDOR</option>
                    <option value="DELIVERY">DELIVERY</option>
                    <option value="DESPACHANTE">DESPACHANTE</option>
                    <option value="PROVEEDOR">PROVEEDOR</option>
                  </select>
                </td>
                <td>
                  <span className={`badge-status ${u.approved ? 'badge-entregado' : 'badge-pendiente'}`}>
                    {u.approved ? 'Aprobado' : 'Pendiente'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-1">
                    {!u.approved && (
                      <button className="nav-btn active text-xs !py-1 !px-2" onClick={() => approveUser(u.user_id)}>
                        ✅ Aprobar
                      </button>
                    )}
                    {!u.approved && (
                      <button className="nav-btn text-xs !py-1 !px-2 !bg-destructive/20 hover:!bg-destructive/40 text-destructive" onClick={() => rejectUser(u.user_id)}>
                        ❌ Rechazar
                      </button>
                    )}
                    {u.approved && (
                      <button className="nav-btn text-xs !py-1 !px-2" onClick={() => revokeUser(u.user_id)}>
                        Revocar acceso
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
