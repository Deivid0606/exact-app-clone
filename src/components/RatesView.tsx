import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

// Definir departamentos de Paraguay
const DEPARTAMENTOS = [
  "Capital", "Central", "Alto Paraná", "Itapúa", "Cordillera",
  "Caaguazú", "Guairá", "Ñeembucú", "Concepción", "Amambay",
  "Canindeyú", "Caazapá", "Misiones", "Paraguarí", "Presidente Hayes",
  "Boquerón", "Alto Paraguay"
];

// Mapeo de ciudades a departamentos
const ciudadDepartamentoMap: { [key: string]: string } = {
  "Altos": "Cordillera",
  "Aregua": "Central",
  "Asuncion": "Capital",
  "Asunción": "Capital",
  "Atyra": "Cordillera",
  "Atyrá": "Cordillera",
  "Benjamín Aceval": "Presidente Hayes",
  "Caacupe": "Cordillera",
  "Capiata": "Central",
  "Ciudad del este - ALTO PARANÁ": "Alto Paraná",
  "Colonia Yguazu - ALTO PARANÁ": "Alto Paraná",
  "Emboscada": "Cordillera",
  "Eusebio Ayala": "Cordillera",
  "Fernando de la Mora": "Central",
  "Guarambare": "Central",
  "Hernandarias - ALTO PARANÁ": "Alto Paraná",
  "INTERIOR PAGO ANTICIPADO": "Varios",
  "Ita": "Central",
  "Itacurubí de la Cordillera": "Cordillera",
  "Itaugua": "Central",
  "J. Augusto Saldívar": "Central",
  "Juan leon malloriquin - ALTO PARANÁ": "Alto Paraná",
  "Lambare": "Central",
  "Limpio": "Central",
  "Loma Grande": "Cordillera",
  "Luque": "Central",
  "Mariano Roque Alonso": "Central",
  "Minga Guazu - ALTO PARANÁ": "Alto Paraná",
  "Ñemby": "Central",
  "Nueva Italia": "Cordillera",
  "Paraguarí": "Paraguarí",
  "PIRAYÚ": "Paraguarí",
  "Piribebuy": "Cordillera",
  "Presidente franco": "Alto Paraná",
  "Puerto Pdte. Franco - ALTO PARANÁ": "Alto Paraná",
  "Remansito": "Presidente Hayes",
  "San Alberto - ALTO PARANÁ": "Alto Paraná",
  "San Antonio": "Central",
  "San Bernardino": "Cordillera",
  "San Lorenzo": "Central",
  "SANTA RITA - ALTO PARANÁ": "Alto Paraná",
  "Tobatí": "Cordillera",
  "Villa Elisa": "Central",
  "Villa Hayes": "Presidente Hayes",
  "Villarrica": "Guairá",
  "Villeta": "Paraguarí",
  "YAGUARON": "Paraguarí",
  "Yguazu": "Alto Paraná",
  "YGUAZU - ALTO PARANÁ": "Alto Paraná",
  "Ypacaraí": "Cordillera",
  "Ypane": "Central",
};

export default function RatesView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const myEmail = profile?.email || '';
  const canManage = role === 'ADMIN' || role === 'PROVEEDOR';

  const [fees, setFees] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [drEmail, setDrEmail] = useState('');
  const [drCity, setDrCity] = useState('');
  const [drRate, setDrRate] = useState('');
  const [cpCity, setCpCity] = useState('');
  const [cpDepartamento, setCpDepartamento] = useState('');
  const [cpPrice, setCpPrice] = useState('');
  const [rateUsers, setRateUsers] = useState<any[]>([]);
  const [filtroDepartamento, setFiltroDepartamento] = useState('');

  const load = () => {
    supabase.from('delivery_fees').select('*').order('delivery_email').then(({ data }) => setFees(data || []));
    supabase.from('client_prices').select('*').order('city').then(({ data }) => setPrices(data || []));
    supabase.from('profiles').select('email, name, user_id').then(async ({ data }) => {
      const profiles = data || [];

      // Cargar usuarios aprobados que pueden tener tarifa:
      // DELIVERY y PROVEEDOR.
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role, approved')
        .in('role', ['DELIVERY', 'PROVEEDOR'])
        .eq('approved', true);

      if (rolesError) {
        console.error('Error cargando usuarios para tarifas:', rolesError);
        setRateUsers([]);
        return;
      }

      const roleByUserId = new Map<string, string>();
      (roles || []).forEach((item: any) => {
        roleByUserId.set(String(item.user_id), String(item.role || ''));
      });

      const users = profiles
        .filter((p: any) => roleByUserId.has(String(p.user_id)))
        .map((p: any) => ({
          ...p,
          role: roleByUserId.get(String(p.user_id)) || '',
        }))
        .filter((p: any) => {
          // ADMIN puede gestionar DELIVERY y PROVEEDOR.
          if (role === 'ADMIN') return true;

          // PROVEEDOR puede gestionarse a sí mismo y también DELIVERY.
          if (role === 'PROVEEDOR') {
            return (
              String(p.email || '').toLowerCase() === myEmail.toLowerCase() ||
              p.role === 'DELIVERY'
            );
          }

          return false;
        })
        .sort((a: any, b: any) =>
          String(a.name || a.email).localeCompare(
            String(b.name || b.email),
            'es',
            { sensitivity: 'base' },
          ),
        );

      setRateUsers(users);
    });
  };
  
  useEffect(() => { load(); }, []);

  const visibleFees = role === 'PROVEEDOR'
    ? fees.filter(f =>
        f.delivery_email?.toLowerCase() === myEmail.toLowerCase() ||
        rateUsers.some(
          user =>
            user.role === 'DELIVERY' &&
            String(user.email || '').toLowerCase() ===
              String(f.delivery_email || '').toLowerCase(),
        )
      )
    : fees;

  const saveRate = async () => {
    if (!drEmail || !drCity || !drRate) {
      toast.error('Completá todos los campos');
      return;
    }

    const selectedUser = rateUsers.find(
      user =>
        String(user.email || '').toLowerCase() === drEmail.toLowerCase(),
    );

    if (!selectedUser) {
      toast.error('El usuario seleccionado no está disponible para cargar tarifa');
      return;
    }

    if (
      role === 'PROVEEDOR' &&
      selectedUser.role === 'PROVEEDOR' &&
      drEmail.toLowerCase() !== myEmail.toLowerCase()
    ) {
      toast.error('Un PROVEEDOR solo puede modificar su propia tarifa');
      return;
    }

    const existing = fees.find(
      f =>
        f.delivery_email?.toLowerCase() === drEmail.toLowerCase() &&
        f.city?.toLowerCase() === drCity.toLowerCase(),
    );
    if (existing) {
      await supabase.from('delivery_fees').update({ fee_gs: Number(drRate) }).eq('id', existing.id);
    } else {
      await supabase.from('delivery_fees').insert({ delivery_email: drEmail, city: drCity, fee_gs: Number(drRate) });
    }
    toast.success('Tarifa guardada');
    setDrEmail(''); setDrCity(''); setDrRate('');
    load();
  };

  const deleteRate = async (id: string) => {
    const rate = fees.find(item => item.id === id);

    if (!rate) {
      toast.error('Tarifa no encontrada');
      return;
    }

    if (role === 'PROVEEDOR') {
      const rateEmail = String(rate.delivery_email || '').toLowerCase();

      const targetUser = rateUsers.find(
        user =>
          String(user.email || '').toLowerCase() === rateEmail,
      );

      const allowed =
        rateEmail === myEmail.toLowerCase() ||
        targetUser?.role === 'DELIVERY';

      if (!allowed) {
        toast.error('No tenés permiso para eliminar la tarifa de otro PROVEEDOR');
        return;
      }
    }

    if (!confirm('¿Eliminar esta tarifa?')) return;

    const { error } = await supabase
      .from('delivery_fees')
      .delete()
      .eq('id', id);

    if (error) toast.error(error.message);
    else {
      toast.success('Tarifa eliminada');
      load();
    }
  };

  const saveClientPrice = async () => {
    if (!cpCity || !cpPrice) { toast.error('Completá todos los campos'); return; }
    
    let departamento = cpDepartamento;
    
    // Si no escribió nada, intentar obtener del mapa automático
    if (!departamento) {
      departamento = ciudadDepartamentoMap[cpCity];
    }
    
    if (!departamento) {
      toast.error('Por favor escribí un departamento para esta ciudad');
      return;
    }
    
    const existing = prices.find(p => p.city?.toLowerCase() === cpCity.toLowerCase());
    
    if (existing) {
      await supabase.from('client_prices').update({ 
        price_gs: Number(cpPrice),
        departamento: departamento 
      }).eq('id', existing.id);
    } else {
      await supabase.from('client_prices').insert({ 
        city: cpCity, 
        price_gs: Number(cpPrice),
        departamento: departamento 
      });
    }
    toast.success('Precio guardado');
    setCpCity('');
    setCpDepartamento('');
    setCpPrice('');
    load();
  };

  const deleteClientPrice = async (id: string) => {
    if (!confirm('¿Eliminar este precio?')) return;
    const { error } = await supabase.from('client_prices').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Precio eliminado'); load(); }
  };

  const getDepartamento = (ciudad: string, precioItem: any) => {
    if (precioItem.departamento) return precioItem.departamento;
    return ciudadDepartamentoMap[ciudad] || 'Sin asignar';
  };

  const pricesFiltrados = filtroDepartamento
    ? prices.filter(p => getDepartamento(p.city, p) === filtroDepartamento)
    : prices;

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Costos de delivery por ciudad</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Las tarifas pueden pertenecer a un DELIVERY o a un PROVEEDOR líder de Equipo de Logística.
        Cuando un PROVEEDOR sea titular del equipo, sus pedidos delegados usarán su tarifa por ciudad.
      </p>

      {canManage && (
        <div className="app-card !p-4 mb-4">
          <h4 className="font-bold mb-3">
            {role === 'PROVEEDOR' ? 'Configurar tarifa propia o de delivery' : 'Agregar/Actualizar tarifa de Delivery o Proveedor'}
          </h4>
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="app-label">Titular de la tarifa</label>
              <select 
                className="app-input" 
                value={drEmail} 
                onChange={e => setDrEmail(e.target.value)}
              >
                <option value="">Seleccionar usuario…</option>
                {rateUsers.map(user => (
                  <option key={`${user.role}-${user.email}`} value={user.email}>
                    {user.role === 'PROVEEDOR' ? '🏢 PROVEEDOR — ' : '🚚 DELIVERY — '}
                    {user.name || user.email}
                    {String(user.email || '').toLowerCase() === myEmail.toLowerCase()
                      ? ' (Vos)'
                      : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="app-label">Ciudad</label>
              <select className="app-input" value={drCity} onChange={e => setDrCity(e.target.value)}>
                <option value="">Seleccionar ciudad…</option>
                {prices.map(c => <option key={c.id} value={c.city}>{c.city}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="app-label">Tarifa (Gs)</label>
              <input className="app-input" type="number" placeholder="Tarifa" value={drRate} onChange={e => setDrRate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button className="nav-btn active" onClick={saveRate}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <table className="app-table">
        <thead>
          <tr>
            <th>Titular</th>
            <th>Ciudad</th>
            <th className="text-right">Tarifa (Gs)</th>
            {canManage && <th>Acción</th>}
          </tr>
        </thead>
        <tbody>
          {visibleFees.map(f => (
            <tr key={f.id}>
              <td className="text-sm">
                <div className="font-bold">{f.delivery_email}</div>
                {(() => {
                  const user = rateUsers.find(
                    item =>
                      String(item.email || '').toLowerCase() ===
                      String(f.delivery_email || '').toLowerCase(),
                  );

                  return user ? (
                    <span className="text-[10px] text-muted-foreground">
                      {user.role === 'PROVEEDOR' ? '🏢 PROVEEDOR' : '🚚 DELIVERY'}
                    </span>
                  ) : null;
                })()}
              </td>
              <td className="text-sm">{f.city}</td>
              <td className="text-right text-sm font-bold">{nf(Number(f.fee_gs || 0))}</td>
              {canManage && (
                <td>
                  <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => deleteRate(f.id)}>Eliminar</button>
                </td>
              )}
            </tr>
          ))}
          {visibleFees.length === 0 && (
            <tr>
              <td colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground py-4">
                Sin tarifas
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <hr className="border-border my-4" />

      <h3 className="text-lg font-extrabold mb-3">Precio al cliente por ciudad</h3>

      {/* Filtro por departamento */}
      <div className="mb-4 flex gap-2 items-center flex-wrap">
        <label className="app-label mb-0">Filtrar por departamento:</label>
        <select 
          className="app-input !w-auto" 
          value={filtroDepartamento} 
          onChange={(e) => setFiltroDepartamento(e.target.value)}
        >
          <option value="">Todos los departamentos</option>
          {DEPARTAMENTOS.map(depto => (
            <option key={depto} value={depto}>{depto}</option>
          ))}
        </select>
        {filtroDepartamento && (
          <button 
            className="nav-btn !px-2 !py-1" 
            onClick={() => setFiltroDepartamento('')}
          >
            Limpiar filtro
          </button>
        )}
      </div>

      {role === 'ADMIN' && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2 mb-2 items-end">
            <div>
              <label className="app-label">Ciudad</label>
              <input 
                className="app-input" 
                placeholder="Ej: Nueva Ciudad" 
                value={cpCity} 
                onChange={e => setCpCity(e.target.value)} 
              />
            </div>
            
            <div>
              <label className="app-label">Departamento</label>
              <input 
                className="app-input" 
                placeholder="Ej: Central, Capital, o cualquier nombre" 
                value={cpDepartamento} 
                onChange={e => setCpDepartamento(e.target.value)} 
              />
              <p className="text-xs text-muted-foreground mt-1">
                💡 Puedes escribir cualquier departamento (aunque no esté en la lista)
              </p>
            </div>
            
            <div>
              <label className="app-label">Precio (Gs)</label>
              <input 
                className="app-input" 
                type="number" 
                placeholder="Ej: 25000" 
                value={cpPrice} 
                onChange={e => setCpPrice(e.target.value)} 
              />
            </div>
            
            <button className="nav-btn active" onClick={saveClientPrice}>Guardar</button>
          </div>
          
          <span className="chip text-[10px]">Impacta en el formulario de pedido</span>
        </div>
      )}

      <table className="app-table">
        <thead>
          <tr>
            <th>Ciudad</th>
            <th>Departamento</th>
            <th className="text-right">Precio cliente (Gs)</th>
            {role === 'ADMIN' && <th>Acción</th>}
          </tr>
        </thead>
        <tbody>
          {pricesFiltrados.map(p => (
            <tr key={p.id}>
              <td className="text-sm">{p.city}</td>
              <td className="text-sm">
                <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">
                  {getDepartamento(p.city, p)}
                </span>
              </td>
              <td className="text-right text-sm font-bold">{nf(Number(p.price_gs || 0))}</td>
              {role === 'ADMIN' && (
                <td>
                  <button 
                    className="nav-btn !px-2 !py-1 !text-[10px]" 
                    onClick={() => deleteClientPrice(p.id)}
                  >
                    Eliminar
                  </button>
                </td>
              )}
            </tr>
          ))}
          {pricesFiltrados.length === 0 && (
            <tr>
              <td colSpan={role === 'ADMIN' ? 4 : 3} className="text-center text-muted-foreground py-4">
                Sin precios
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
