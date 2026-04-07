import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function NewsView() {
  const [news, setNews] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('news').select('*').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setNews(data || []));
  }, []);

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Novedades</h3>
      {news.length === 0 && <p className="text-muted-foreground text-sm">Sin novedades aún.</p>}
      <div className="flex flex-col gap-2">
        {news.map(n => (
          <div key={n.id} className="kpi-card !p-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-sm">{n.message}</span>
                {n.order_id && <span className="chip ml-2 text-[10px]">{n.order_id}</span>}
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
