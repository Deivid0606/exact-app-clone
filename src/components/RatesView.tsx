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
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [filtroDepartamento, setFiltroDepartamento] = useState('');

  const load = () => {
    supabase.from('delivery_fees').select('*').order('delivery_email').then(({ data }) => setFees(data || []));
    supabase.from('client_prices').select('*').order('city').then(({ data }) => setPrices(data || []));
    supabase.from('profiles').select('email, name, user_id').then(async ({ data }) => {
      const profiles = data || [];
      const { data: roles } = await supabase.from('user_roles').select('user_id, role').eq('role', 'DELIVERY');
      const deliveryIds = new Set((roles || []).map(r => r.user_id));
      setDeliveries(profiles.filter(p => deliveryIds.has(p.user_id)));
    });
  };
  
  useEffect(() => { load(); }, []);

  const visibleFees = role === 'PROVEEDOR'
    ? fees.filter(f => f.delivery_email?.toLowerCase() === myEmail.toLowerCase() ||
        deliveries.some(d => d.email === f.delivery_email))
    : fees;

  const saveRate = async () => {
    if (!drEmail || !drCity || !drRate) { toast.error('Completá todos los campos'); return; }
    const existing = fees.find(f => f.delivery_email?.toLowerCase() === drEmail.toLowerCase() && f.city?.toLowerCase() === drCity.toLowerCase());
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
    if (!confirm('¿Eliminar esta tarifa?')) return;
    const { error } = await supabase.from('delivery_fees').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Tarifa eliminada'); load(); }
  };

  const saveClientPrice = async () => {
    if (!cpCity || !cpPrice) { toast.error('Completá todos los campos'); return; }
    
    let departamento = cpDepartamento;
    if (!departamento && ciudadDepartamentoMap[cpCity]) {
      departamento = ciudadDepartamentoMap[cpCity];
    }
    
    if (!departamento) {
      toast.error('Por favor seleccioná un departamento para esta ciudad');
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

      {canManage && (
        <div className="app-card !p-4 mb-4">
          <h4 className="font-bold mb-3">
            {role === 'PROVEEDOR' ? 'Configurar tarifa de tu delivery' : 'Agregar/Actualizar tarifa'}
          </h4>
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="app-label">Delivery</label>
              {role === 'PROVEEDOR' ? (
                <input className="app-input" placeholder="email del delivery" value={drEmail} onChange={e => setDrEmail(e.target.value)} />
              ) : (
                <select className="app-input" value={drEmail} onChange={e => setDrEmail(e.target.value)}>
                  <option value="">Seleccionar delivery…</option>
                  {deliveries.map(d => <option key={d.email} value={d.email}>{d.name || d.email}</option>)}
                </select>
              )}
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
            <th>Delivery</th>
            <th>Ciudad</th>
            <th className="text-right">Tarifa (Gs)</th>
            {canManage && <th>Acción</th>}
          </tr>
        </thead>
        <tbody>
          {visibleFees.map(f => (
            <tr key={f.id}>
              <td className="text-sm">{f.delivery_email}</td>
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
        <div className="flex flex-wrap gap-2 mb-4">
          <input 
            className="app-input !w-auto" 
            placeholder="Ciudad" 
            value={cpCity} 
            onChange={e => setCpCity(e.target.value)} 
          />
          <select 
            className="app-input !w-auto" 
            value={cpDepartamento} 
            onChange={e => setCpDepartamento(e.target.value)}
          >
            <option value="">Seleccionar departamento...</option>
            {DEPARTAMENTOS.map(depto => (
              <option key={depto} value={depto}>{depto}</option>
            ))}
          </select>
          <input 
            className="app-input !w-auto" 
            type="number" 
            placeholder="Precio al cliente (Gs)" 
            value={cpPrice} 
            onChange={e => setCpPrice(e.target.value)} 
          />
          <button className="nav-btn active" onClick={saveClientPrice}>Guardar/Actualizar</button>
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
                <span className={`px-2 py-1 rounded text-xs ${
                  getDepartamento(p.city, p) === 'Capital' ? 'bg-yellow-100 text-yellow-800' :
                  getDepartamento(p.city, p) === 'Central' ? 'bg-green-100 text-green-800' :
                  getDepartamento(p.city, p) === 'Alto Paraná' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
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
