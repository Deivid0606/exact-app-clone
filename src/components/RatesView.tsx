import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function RatesView() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'ADMIN';
  const [fees, setFees] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [drEmail, setDrEmail] = useState('');
  const [drCity, setDrCity] = useState('');
  const [drRate, setDrRate] = useState('');
  const [cpCity, setCpCity] = useState('');
  const [cpPrice, setCpPrice] = useState('');

  const load = () => {
    supabase.from('delivery_fees').select('*').order('delivery_email').then(({ data }) => setFees(data || []));
    supabase.from('client_prices').select('*').order('city').then(({ data }) => setPrices(data || []));
  };
  useEffect(() => { load(); }, []);

  const saveRate = async () => {
    if (!drEmail || !drCity || !drRate) { toast.error('Completá todos los campos'); return; }
    const existing = fees.find(f => f.delivery_email?.toLowerCase() === drEmail.toLowerCase() && f.city?.toLowerCase() === drCity.toLowerCase());
    if (existing) {
      await supabase.from('delivery_fees').update({ fee_gs: Number(drRate) }).eq('id', existing.id);
    } else {
      await supabase.from('delivery_fees').insert({ delivery_email: drEmail, city: drCity, fee_gs: Number(drRate) });
    }
    toast.success('Tarifa guardada');
    load();
  };

  const saveClientPrice = async () => {
    if (!cpCity || !cpPrice) { toast.error('Completá todos los campos'); return; }
    const existing = prices.find(p => p.city?.toLowerCase() === cpCity.toLowerCase());
    if (existing) {
      await supabase.from('client_prices').update({ price_gs: Number(cpPrice) }).eq('id', existing.id);
    } else {
      await supabase.from('client_prices').insert({ city: cpCity, price_gs: Number(cpPrice) });
    }
    toast.success('Precio guardado');
    load();
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Costos de delivery por ciudad</h3>

      {isAdmin && (
        <div className="flex flex-wrap gap-2 mb-4">
          <input className="app-input !w-auto" placeholder="delivery@email.com" value={drEmail} onChange={e => setDrEmail(e.target.value)} />
          <input className="app-input !w-auto" placeholder="Ciudad" value={drCity} onChange={e => setDrCity(e.target.value)} />
          <input className="app-input !w-auto" type="number" placeholder="Tarifa (Gs)" value={drRate} onChange={e => setDrRate(e.target.value)} />
          <button className="nav-btn active" onClick={saveRate}>Guardar/Actualizar</button>
        </div>
      )}

      <table className="app-table">
        <thead><tr><th>Email</th><th>Ciudad</th><th className="text-right">Tarifa (Gs)</th></tr></thead>
        <tbody>
          {fees.map(f => (
            <tr key={f.id}>
              <td className="text-sm">{f.delivery_email}</td>
              <td className="text-sm">{f.city}</td>
              <td className="text-right text-sm font-bold">{nf(Number(f.fee_gs || 0))}</td>
            </tr>
          ))}
          {fees.length === 0 && <tr><td colSpan={3} className="text-center text-muted-foreground py-4">Sin tarifas</td></tr>}
        </tbody>
      </table>

      <hr className="border-border my-4" />

      <h3 className="text-lg font-extrabold mb-3">Precio al cliente por ciudad</h3>

      {isAdmin && (
        <div className="flex flex-wrap gap-2 mb-4">
          <input className="app-input !w-auto" placeholder="Ciudad" value={cpCity} onChange={e => setCpCity(e.target.value)} />
          <input className="app-input !w-auto" type="number" placeholder="Precio al cliente (Gs)" value={cpPrice} onChange={e => setCpPrice(e.target.value)} />
          <button className="nav-btn active" onClick={saveClientPrice}>Guardar/Actualizar</button>
          <span className="chip text-[10px]">Impacta en el formulario de pedido</span>
        </div>
      )}

      <table className="app-table">
        <thead><tr><th>Ciudad</th><th className="text-right">Precio cliente (Gs)</th></tr></thead>
        <tbody>
          {prices.map(p => (
            <tr key={p.id}>
              <td className="text-sm">{p.city}</td>
              <td className="text-right text-sm font-bold">{nf(Number(p.price_gs || 0))}</td>
            </tr>
          ))}
          {prices.length === 0 && <tr><td colSpan={2} className="text-center text-muted-foreground py-4">Sin precios</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
