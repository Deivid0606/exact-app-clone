import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function ShopifyInboxView() {
  const { profile } = useAuth();
  const [paste, setPaste] = useState('');
  const [importing, setImporting] = useState(false);

  const importPaste = async () => {
    if (!paste.trim()) { toast.error('Pegá datos primero'); return; }
    setImporting(true);

    const lines = paste.trim().split('\n').filter(l => l.trim());
    let count = 0;

    for (const line of lines) {
      const cols = line.split('\t');
      if (cols.length < 5) continue;
      // Assume: date, customer, phone, city, product, qty, amount
      const [date, customerName, phone, city, product, qty, amount] = cols;

      if (!customerName || customerName.toLowerCase() === 'cliente') continue;

      await supabase.from('orders').insert({
        order_number: `SH${Date.now().toString(36).toUpperCase()}`,
        created_by: profile?.email,
        customer_name: customerName?.trim(),
        phone: phone?.trim(),
        city: city?.trim(),
        items_json: [{ title: product?.trim(), qty: Number(qty || 1), sale_gs: Number(amount || 0) }],
        total_gs: Number(amount || 0),
        status: 'PENDIENTE',
        obs: 'Importado desde Shopify/WhatsApp',
      });
      count++;
    }

    toast.success(`${count} pedidos importados`);
    setPaste('');
    setImporting(false);
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos de Shopify + WhatsApp</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Pegá aquí las filas copiadas desde tu Google Sheet de Shopify (Ctrl+C / Ctrl+V). Acepta encabezado.
        Luego importá para que queden en estado <b>PENDIENTE</b>.
      </p>

      <label className="app-label">Pegado (tabla)</label>
      <textarea className="app-input" rows={8} placeholder="Pegá acá..." value={paste} onChange={e => setPaste(e.target.value)} />
      <div className="flex gap-2 mt-2">
        <button className="nav-btn active" onClick={importPaste} disabled={importing}>
          {importing ? 'Importando...' : 'Guardar / Importar'}
        </button>
        <button className="nav-btn" onClick={() => setPaste('')}>Limpiar</button>
      </div>
    </div>
  );
}
