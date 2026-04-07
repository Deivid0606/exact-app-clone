import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function ProductsView() {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('products').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setProducts(data || []); setLoading(false); });
  }, []);

  const filtered = products.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.title || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
  });

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Productos</h3>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <input className="app-input min-w-[260px] flex-1" placeholder="🔎 Buscar por nombre o SKU"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading && <p className="text-muted-foreground text-sm">Cargando...</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(p => (
          <div key={p.id} className="bg-secondary border border-border rounded-[18px] overflow-hidden cursor-pointer
            flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative group">
            {/* Top gradient line */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand to-brand-glow opacity-85 z-10" />

            {/* Image */}
            <div className="relative w-full h-[220px] overflow-hidden bg-background border-b border-border">
              {p.image_url ? (
                <img src={p.image_url} alt={p.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Sin imagen</div>
              )}
            </div>

            {/* Body */}
            <div className="p-3.5 flex flex-col gap-2 flex-grow min-h-[140px]">
              <div className="font-extrabold text-[17px] leading-tight min-h-[44px]">{p.title}</div>
              {p.sku && <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">SKU: {p.sku}</div>}
              <div className="flex flex-wrap gap-1.5 mt-auto">
                <span className="chip text-[10px]">Stock: {p.stock ?? 0}</span>
                {p.provider_email && <span className="chip text-[10px]">{p.provider_email}</span>}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-3.5 py-3 border-t border-border bg-background/80">
              <span className="font-extrabold text-sm">{nf(Number(p.provider_price_gs || 0))} Gs</span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && !loading && (
        <p className="text-center text-muted-foreground py-8">Sin productos encontrados</p>
      )}
    </div>
  );
}
