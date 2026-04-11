import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

interface ShopifyOrder {
  shopify_id: number;
  order_number: string;
  created_at: string;
  customer_name: string;
  phone: string;
  email: string;
  city: string;
  street: string;
  district: string;
  total: number;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  items: { title: string; qty: number; price: number; sku: string }[];
  note: string;
}

export default function ShopifyInboxView() {
  const { profile } = useAuth();
  const myEmail = profile?.email || '';

  const [shopifyOrders, setShopifyOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [imported, setImported] = useState<any[]>([]);

  // Load already-imported Shopify order IDs to avoid duplicates
  const loadImported = async () => {
    const { data } = await supabase.from('orders').select('obs')
      .ilike('obs', '%shopify_id:%');
    setImported(data || []);
  };

  const importedShopifyIds = useMemo(() => {
    const ids = new Set<number>();
    (imported || []).forEach((o: any) => {
      const match = (o.obs || '').match(/shopify_id:(\d+)/);
      if (match) ids.add(Number(match[1]));
    });
    return ids;
  }, [imported]);

  const fetchShopifyOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-orders', {
        body: null,
      });
      if (error) throw error;
      setShopifyOrders(data?.orders || []);
    } catch (err: any) {
      toast.error(`Error al cargar pedidos de Shopify: ${err.message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchShopifyOrders();
    loadImported();
  }, []);

  const normalizePhone = (p: string) => {
    let phone = String(p || '').replace(/[\s\-().+]/g, '').trim();
    if (phone.startsWith('595')) phone = '0' + phone.slice(3);
    return phone;
  };

  const confirmOrder = async (order: ShopifyOrder) => {
    setConfirming(prev => new Set(prev).add(order.shopify_id));
    try {
      const totalGs = Math.round(order.total);
      const itemsJson = order.items.map(li => ({
        title: li.title,
        qty: li.qty,
        sale_gs: Math.round(li.price),
        sku: li.sku,
      }));

      const { error } = await supabase.from('orders').insert({
        order_number: `SH-${order.order_number}`,
        created_by: myEmail,
        customer_name: order.customer_name,
        phone: normalizePhone(order.phone),
        email: order.email,
        city: order.city,
        street: order.street,
        district: order.district,
        items_json: itemsJson,
        total_gs: totalGs,
        status: 'PENDIENTE',
        obs: `Importado desde Shopify | shopify_id:${order.shopify_id}`,
      });

      if (error) throw error;
      toast.success(`✅ Pedido ${order.order_number} confirmado y cargado`);
      setConfirmed(prev => new Set(prev).add(order.shopify_id));
      loadImported();
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
    setConfirming(prev => {
      const n = new Set(prev);
      n.delete(order.shopify_id);
      return n;
    });
  };

  const confirmAll = async () => {
    const pending = filtered.filter(o => !importedShopifyIds.has(o.shopify_id) && !confirmed.has(o.shopify_id));
    if (!pending.length) { toast.info('No hay pedidos pendientes para confirmar'); return; }
    for (const o of pending) {
      await confirmOrder(o);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return shopifyOrders;
    const q = search.toLowerCase();
    return shopifyOrders.filter(o =>
      o.customer_name.toLowerCase().includes(q) ||
      o.phone.includes(q) ||
      o.order_number.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q)
    );
  }, [shopifyOrders, search]);

  const pendingCount = filtered.filter(o => !importedShopifyIds.has(o.shopify_id) && !confirmed.has(o.shopify_id)).length;

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">🛒 Pedidos de Shopify</h3>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <button className="nav-btn active" onClick={fetchShopifyOrders} disabled={loading}>
          {loading ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Cargando...</span> : '🔄 Sincronizar Shopify'}
        </button>
        {pendingCount > 0 && (
          <button className="nav-btn" onClick={confirmAll}>
            ✅ Confirmar todos ({pendingCount})
          </button>
        )}
        <input className="app-input !w-auto min-w-[240px] flex-1" placeholder="🔎 Buscar por cliente, teléfono, email o ID"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {filtered.length} pedidos desde Shopify • {pendingCount} sin confirmar
      </div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1100px]">
          <thead>
            <tr>
              <th>Fecha</th><th>Nº Pedido</th><th>Cliente</th><th>Teléfono</th>
              <th>Email</th><th>Ciudad</th><th>Productos</th>
              <th className="text-right">Total</th><th>Estado Pago</th><th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => {
              const alreadyImported = importedShopifyIds.has(o.shopify_id) || confirmed.has(o.shopify_id);
              const isConfirming = confirming.has(o.shopify_id);
              return (
                <tr key={o.shopify_id} className={alreadyImported ? 'opacity-50' : ''}>
                  <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                  <td className="text-xs font-bold">{o.order_number}</td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-xs">{o.phone}</td>
                  <td className="text-xs truncate max-w-[150px]">{o.email}</td>
                  <td className="text-xs">{o.city}</td>
                  <td className="text-xs truncate max-w-[200px]">
                    {o.items.map(i => `${i.title} x${i.qty}`).join(', ')}
                  </td>
                  <td className="text-right text-xs font-bold">{nf(o.total)}</td>
                  <td className="text-xs">{o.financial_status}</td>
                  <td>
                    {alreadyImported ? (
                      <span className="text-xs text-green-400 font-bold">✅ Cargado</span>
                    ) : (
                      <button
                        className="nav-btn active !py-1 !px-3 !text-xs"
                        disabled={isConfirming}
                        onClick={() => confirmOrder(o)}
                      >
                        {isConfirming ? '⏳' : '➡️ Confirmar'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center text-muted-foreground py-8">
                {loading ? 'Cargando pedidos de Shopify...' : 'Sin pedidos de Shopify'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
