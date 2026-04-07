import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function CounterView() {
  const { profile } = useAuth();
  const [seq, setSeq] = useState<{ counter: number; prefix: string; pad: number } | null>(null);
  const [newCounter, setNewCounter] = useState('');

  useState(() => {
    supabase.from('order_sequence').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) setSeq({ counter: data.counter || 0, prefix: data.prefix || 'A', pad: data.pad || 3 });
    });
  });

  const save = async () => {
    if (!newCounter) { toast.error('Ingresá un número'); return; }
    const { error } = await supabase.from('order_sequence').update({ counter: Number(newCounter) }).eq('id', 1);
    if (error) toast.error(error.message);
    else {
      toast.success('Contador actualizado');
      setSeq(prev => prev ? { ...prev, counter: Number(newCounter) } : prev);
      setNewCounter('');
    }
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Actualizar Contador de Órdenes</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="chip">Prefijo: <b>{seq?.prefix || 'A'}</b></span>
        <span className="chip">Padding: <b>{seq?.pad || 3}</b></span>
        <span className="chip">Contador actual: <b>{seq?.counter || 0}</b></span>
      </div>
      <div className="flex gap-2">
        <input className="app-input !w-auto" type="number" placeholder="Nuevo contador (ej. 356)"
          value={newCounter} onChange={e => setNewCounter(e.target.value)} />
        <button className="nav-btn active" onClick={save}>Guardar contador</button>
      </div>
      <p className="chip mt-2 text-[10px]">Ejemplo: si ponés 356, el próximo ID será A357</p>
    </div>
  );
}
