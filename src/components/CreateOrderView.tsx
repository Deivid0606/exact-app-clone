import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

const normalizeEmail = (value: any) => String(value || '').trim().toLowerCase();

const normalizeRole = (value: any) => {
  const r = String(value || '').trim().toLowerCase();

  if (['admin', 'administrador'].includes(r)) return 'admin';
  if (['provider', 'proveedor'].includes(r)) return 'provider';
  if (['seller', 'vendedor'].includes(r)) return 'seller';
  if (['despachante', 'dispatcher'].includes(r)) return 'despachante';
  if (['delivery', 'repartidor'].includes(r)) return 'delivery';

  return r;
};

const parsePrivateEmails = (value: any): string[] =>
  String(value || '')
    .split(',')
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);

const isPrivateProduct = (product: any) =>
  Boolean(product?.is_private_stock ?? product?.is_private);

const canAccessProduct = (product: any, profile: any) => {
  const role = normalizeRole(profile?.role);
  const userEmail = normalizeEmail(profile?.email);
  const providerEmail = normalizeEmail(product?.provider_email);
  const privateEmails = parsePrivateEmails(product?.private_to_emails);
  const isPrivate = isPrivateProduct(product);

  if (!role || !userEmail) return false;

  if (role === 'admin') {
    return true;
  }

  if (role === 'provider') {
    return providerEmail === userEmail;
  }

  if (['seller', 'despachante', 'delivery'].includes(role)) {
    if (!isPrivate) return true;
    return privateEmails.includes(userEmail);
  }

  return false;
};

export default function CreateOrderView({
  initialSku,
  onSkuConsumed,
}: {
  initialSku?: string | null;
  onSkuConsumed?: () => void;
}) {
  const { profile } = useAuth();

  const [products, setProducts] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [district, setDistrict] = useState('');
  const [email, setEmail] = useState('');
  const [obs, setObs] = useState('');
  const [items, setItems] = useState<{ sku: string; sale_gs: number; qty: number }[]>([
    { sku: '', sale_gs: 0, qty: 1 },
  ]);
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!profile?.email || !profile?.role) return;

      setLoadingProducts(true);

      try {
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .order('title');

        if (productsError) throw productsError;

        const allProducts = productsData || [];
        const visibleProducts = allProducts.filter((p: any) => canAccessProduct(p, profile));

        setProducts(visibleProducts);

        if (initialSku) {
          const found = visibleProducts.find((p: any) => p.sku === initialSku);
          if (found) {
            setItems([{ sku: initialSku, sale_gs: 0, qty: 1 }]);
          }
          onSkuConsumed?.();
        }

        const { data: pricesData, error: pricesError } = await supabase
          .from('client_prices')
          .select('*')
          .order('city');

        if (pricesError) throw pricesError;

        setClientPrices(pricesData || []);
      } catch (error: any) {
        console.error('Error cargando datos de CreateOrderView:', error);
        toast.error(error?.message || 'No se pudieron cargar los productos');
      } finally {
        setLoadingProducts(false);
      }
    };

    loadData();
  }, [initialSku, onSkuConsumed, profile?.email, profile?.role]);

  const catalogMap: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    products.forEach((p) => {
      if (p.sku) map[p.sku] = p;
    });
    return map;
  }, [products]);

  const deliveryPrice =
    clientPrices.find((c) => c.city?.toLowerCase() === city.toLowerCase())?.price_gs || 0;

  const totalVenta = items.reduce(
    (s, i) => s + Number(i.sale_gs || 0) * Number(i.qty || 0),
    0
  );

  const totalProv = items.reduce((s, i) => {
    const p = catalogMap[i.sku];
    return s + (p ? Number(p.provider_price_gs || 0) * Number(i.qty || 0) : 0);
  }, 0);

  const commission = totalVenta - (totalProv + Number(deliveryPrice || 0));

  const addItem = () => setItems([...items, { sku: '', sale_gs: 0, qty: 1 }]);

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const copy = [...items];
    (copy[idx] as any)[field] = value;

    if (field === 'sku') {
      const selected = catalogMap[value];
      if (selected && !copy[idx].sale_gs) {
        copy[idx].sale_gs = Number(selected.sale_price_gs || 0);
      }
    }

    setItems(copy);
  };

  const resetForm = () => {
    setCustomer('');
    setPhone('');
    setCity('');
    setStreet('');
    setDistrict('');
    setEmail('');
    setObs('');
    setItems([{ sku: '', sale_gs: 0, qty: 1 }]);
  };

  const saveOrder = async () => {
    if (saving) return;

    if (!customer || !phone || !city) {
      toast.error('Completá cliente / teléfono / ciudad');
      return;
    }

    const validItems = items.filter(
      (i) => i.sku && Number(i.sale_gs) > 0 && Number(i.qty) > 0 && catalogMap[i.sku]
    );

    if (validItems.length === 0) {
      toast.error('Agregá al menos 1 ítem válido');
      return;
    }

    setSaving(true);

    try {
      const providerEmails = [
        ...new Set(validItems.map((i) => catalogMap[i.sku]?.provider_email).filter(Boolean)),
      ];

      const payload = {
        created_by: profile?.email || null,
        customer_name: customer,
        phone,
        city,
        street,
        district,
        email,
        obs,
        items_json: validItems.map((i) => ({
          sku: i.sku,
          title: catalogMap[i.sku]?.title || i.sku,
          sale_gs: Number(i.sale_gs),
          qty: Number(i.qty),
          provider_price_gs: Number(catalogMap[i.sku]?.provider_price_gs || 0),
          provider_email: catalogMap[i.sku]?.provider_email || '',
        })),
        total_gs: totalVenta,
        delivery_gs: Number(deliveryPrice),
        commission_gs: commission,
        provider_emails_list: providerEmails.join(','),
      };

      const { data: insertedOrder, error: insertError } = await supabase
        .from('orders')
        .insert(payload)
        .select('id, order_number')
        .single();

      if (insertError) throw insertError;

      const generatedOrderNumber = insertedOrder?.order_number || insertedOrder?.id || 'SIN-NUMERO';

      const { error: newsError } = await supabase.from('news').insert({
        order_id: String(generatedOrderNumber),
        actor_email: profile?.email,
        role_scope: profile?.role,
        message: `Nuevo pedido ${generatedOrderNumber} - ${customer} - ${city} - Gs ${nf(totalVenta)}`,
      });

      if (newsError) {
        console.error('Error al crear noticia:', newsError);
      }

      toast.success(`✅ Pedido ${generatedOrderNumber} guardado`);
      resetForm();
    } catch (error: any) {
      console.error('Error guardando pedido:', error);
      toast.error(error?.message || 'No se pudo guardar el pedido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Cargar pedido</h3>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[320px]">
          <label className="app-label">Cliente</label>
          <input
            className="app-input"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />

          <label className="app-label">Teléfono</label>
          <input
            className="app-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <label className="app-label">Ciudad</label>
          <select
            className="app-input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="">Selecciona ciudad…</option>
            {clientPrices.map((c) => (
              <option key={c.id} value={c.city}>
                {c.city}
              </option>
            ))}
          </select>

          {deliveryPrice > 0 && (
            <div className="chip mt-1">Delivery cobrado: {nf(Number(deliveryPrice))} Gs</div>
          )}

          <label className="app-label">Calle</label>
          <input
            className="app-input"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
          />

          <label className="app-label">Barrio</label>
          <input
            className="app-input"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          />

          <label className="app-label">Email</label>
          <input
            className="app-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Opcional"
          />

          <label className="app-label">Observación</label>
          <textarea
            className="app-input"
            rows={2}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </div>

        <div className="flex-[2] min-w-[420px]">
          <label className="app-label !mt-0">Items</label>

          {items.map((item, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2 mb-2">
              <select
                className="app-input !w-auto flex-[2]"
                value={item.sku}
                onChange={(e) => updateItem(idx, 'sku', e.target.value)}
              >
                <option value="">
                  {loadingProducts ? 'Cargando productos…' : 'Seleccionar producto…'}
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.sku} disabled={(p.stock || 0) <= 0}>
                    {p.title} — {p.sku} (Prov {nf(Number(p.provider_price_gs || 0))}){' '}
                    {p.provider_email ? `[${p.provider_email}]` : ''}
                  </option>
                ))}
              </select>

              <span className="chip text-[10px]">
                Prov: {nf(Number(catalogMap[item.sku]?.provider_price_gs || 0))}
              </span>

              <input
                className="app-input !w-auto flex-1"
                type="number"
                placeholder="Venta TOTAL (Gs)"
                value={item.sale_gs || ''}
                onChange={(e) => updateItem(idx, 'sale_gs', Number(e.target.value))}
              />

              <input
                className="app-input !w-[80px]"
                type="number"
                placeholder="Cant."
                value={item.qty}
                onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))}
              />

              <span className="chip text-[10px]">
                Prov×Cant: {nf(Number(catalogMap[item.sku]?.provider_price_gs || 0) * item.qty)}
              </span>

              <button className="nav-btn text-xs" onClick={() => removeItem(idx)}>
                Quitar
              </button>
            </div>
          ))}

          <button className="nav-btn active text-xs mt-2" onClick={addItem}>
            + Agregar ítem
          </button>

          <span className="chip ml-2 text-[10px]">Catálogo: {products.length} productos</span>

          <div className="flex gap-3 mt-4">
            <div className="flex-1">
              <label className="app-label">Total (Gs)</label>
              <input className="app-input bg-secondary" readOnly value={nf(totalVenta)} />
            </div>

            <div className="flex-1">
              <label className="app-label">Delivery cobrado (Gs)</label>
              <input
                className="app-input bg-secondary"
                readOnly
                value={nf(Number(deliveryPrice))}
              />
            </div>

            <div className="flex-1">
              <label className="app-label">Comisión estimada (Gs)</label>
              <input className="app-input bg-secondary" readOnly value={nf(commission)} />
            </div>
          </div>

          <button className="nav-btn active mt-4" onClick={saveOrder} disabled={saving || loadingProducts}>
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="btn-spinner" /> Guardando...
              </span>
            ) : (
              'Guardar pedido'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
