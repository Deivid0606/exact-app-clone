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

  if (role === 'admin') return true;

  if (role === 'provider') {
    return providerEmail === userEmail;
  }

  if (['seller', 'despachante', 'delivery'].includes(role)) {
    if (!isPrivate) return true;
    return privateEmails.includes(userEmail);
  }

  return false;
};

const generateNormalOrderId = async (): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('get_next_order_number');

    if (error) {
      console.error('Error generando ID normal:', error);
      return `A${Date.now()}`;
    }

    return data;
  } catch (err) {
    console.error('Error en generateNormalOrderId:', err);
    return `A${Date.now()}`;
  }
};

export default function CreateOrderView({
  initialSku,
  onSkuConsumed,
  sheetPrefill,
  onPrefillConsumed,
}: {
  initialSku?: string | null;
  onSkuConsumed?: () => void;
  sheetPrefill?: {
    customer?: string;
    phone?: string;
    city?: string;
    street?: string;
    district?: string;
    email?: string;
    productTitle?: string;
    totalGs?: number;
    qty?: number;
    obs?: string;
  } | null;
  onPrefillConsumed?: () => void;
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

        // 🔥 FILTRO: Solo productos PRIVADOS o FAVORITOS
        const filteredProducts = visibleProducts.filter((p: any) => {
          const isPrivate = p.is_private === true;
          const isFavorite = p.is_favorite === true;
          return isPrivate || isFavorite;
        });

        setProducts(filteredProducts);

        if (initialSku) {
          const found = filteredProducts.find((p: any) => p.sku === initialSku);
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

        if (sheetPrefill) {
          if (sheetPrefill.customer) setCustomer(sheetPrefill.customer);
          if (sheetPrefill.phone) setPhone(sheetPrefill.phone);
          if (sheetPrefill.street) setStreet(sheetPrefill.street);
          if (sheetPrefill.district) setDistrict(sheetPrefill.district);
          if (sheetPrefill.email) setEmail(sheetPrefill.email);
          if (sheetPrefill.obs) setObs(sheetPrefill.obs);

          const normCity = (s: string) =>
            s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

          const sheetCityNorm = normCity(sheetPrefill.city || '');

          const findCity = (prices: any[]) => {
            const exact = prices.find((c: any) => normCity(c.city || '') === sheetCityNorm);
            if (exact) return exact;

            const partial = prices.find((c: any) => {
              const pc = normCity(c.city || '');
              return sheetCityNorm.includes(pc) || pc.includes(sheetCityNorm);
            });
            if (partial) return partial;

            const parts = sheetCityNorm
              .split(/[\-–—,\/|]+/)
              .map((s) => s.trim())
              .filter(Boolean);

            for (const part of parts) {
              const m = prices.find((c: any) => {
                const pc = normCity(c.city || '');
                return pc.includes(part) || part.includes(pc);
              });
              if (m) return m;
            }

            return null;
          };

          const cityMatch = findCity(pricesData || []);
          if (cityMatch) {
            setCity(cityMatch.city);
          } else if (sheetPrefill.city) {
            setCity(sheetPrefill.city);
          }

          if (sheetPrefill.productTitle) {
            const titleLower = sheetPrefill.productTitle.toLowerCase().trim();
            const cleanTitle = titleLower
              .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
              .trim();

            const exactMatch = filteredProducts.find(
              (p: any) =>
                p.title?.toLowerCase().trim() === titleLower ||
                p.title?.toLowerCase().trim() === cleanTitle
            );

            if (exactMatch && exactMatch.sku) {
              setItems([
                {
                  sku: exactMatch.sku,
                  sale_gs: sheetPrefill.totalGs || 0,
                  qty: sheetPrefill.qty || 1,
                },
              ]);
              toast.success(`🎯 Producto detectado: ${exactMatch.title}`);
            } else {
              const partialMatch = filteredProducts.find((p: any) => {
                const pTitle = p.title?.toLowerCase().trim() || '';
                return pTitle.includes(cleanTitle) || cleanTitle.includes(pTitle);
              });

              if (partialMatch && partialMatch.sku) {
                setItems([
                  {
                    sku: partialMatch.sku,
                    sale_gs: sheetPrefill.totalGs || 0,
                    qty: sheetPrefill.qty || 1,
                  },
                ]);
                toast.success(`🎯 Producto detectado (parcial): ${partialMatch.title}`);
              } else {
                setItems([
                  {
                    sku: '',
                    sale_gs: sheetPrefill.totalGs || 0,
                    qty: sheetPrefill.qty || 1,
                  },
                ]);
                toast.info(
                  `⚠️ Producto "${sheetPrefill.productTitle}" no encontrado en catálogo. Elegilo manualmente.`
                );
              }
            }
          }

          onPrefillConsumed?.();
        }
      } catch (error: any) {
        console.error('Error cargando datos de CreateOrderView:', error);
        toast.error(error?.message || 'No se pudieron cargar los productos');
      } finally {
        setLoadingProducts(false);
      }
    };

    loadData();
  }, [initialSku, onSkuConsumed, sheetPrefill, onPrefillConsumed, profile?.email, profile?.role]);

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
      const orderNumber = await generateNormalOrderId();

      const providerEmails = [
        ...new Set(validItems.map((i) => catalogMap[i.sku]?.provider_email).filter(Boolean)),
      ];

      const payload = {
        order_number: orderNumber,
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

      const generatedOrderNumber = insertedOrder?.order_number || orderNumber;

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
    <div className="app-card w-full min-w-0 overflow-x-hidden">
      <h3 className="text-lg font-extrabold mb-3">Cargar pedido</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 w-full min-w-0">
          <label className="app-label">Cliente</label>
          <input
            className="app-input w-full min-w-0 text-base"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />

          <label className="app-label">Teléfono</label>
          <input
            className="app-input w-full min-w-0 text-base"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <label className="app-label">Ciudad</label>
          <select
            className="app-input w-full min-w-0 text-base"
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
            <div className="chip mt-1 break-words">
              Delivery cobrado: {nf(Number(deliveryPrice))} Gs
            </div>
          )}

          <label className="app-label">Calle</label>
          <input
            className="app-input w-full min-w-0 text-base"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
          />

          <label className="app-label">Barrio</label>
          <input
            className="app-input w-full min-w-0 text-base"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          />

          <label className="app-label">Email</label>
          <input
            className="app-input w-full min-w-0 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Opcional"
          />

          <label className="app-label">Observación</label>
          <textarea
            className="app-input w-full min-w-0 text-base"
            rows={3}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </div>

        <div className="md:col-span-2 w-full min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <label className="app-label !mt-0">Items</label>
            <span className="chip text-[10px] w-fit">Catálogo: {products.length} productos</span>
          </div>

          {items.map((item, idx) => (
            <div
              key={idx}
              className="border border-border rounded-xl p-3 mb-3 w-full min-w-0"
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                <div className="md:col-span-5 w-full min-w-0">
                  <label className="app-label !mt-0">Producto</label>
                  <select
                    className="app-input w-full min-w-0 text-base"
                    value={item.sku}
                    onChange={(e) => updateItem(idx, 'sku', e.target.value)}
                  >
                    <option value="">
                      {loadingProducts ? 'Cargando productos…' : 'Seleccionar producto…'}
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.sku}>
                        {p.title} — {p.sku} 
                        {p.is_favorite ? ' ⭐' : ''}
                        {p.is_private ? ' 🔒' : ''}
                        (Stock: {p.stock || 0}) 
                        (Prov {nf(Number(p.provider_price_gs || 0))})
                        {p.provider_email ? ` [${p.provider_email}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 w-full min-w-0">
                  <label className="app-label !mt-0">Proveedor</label>
                  <div className="chip text-[10px] break-words w-full">
                    Prov: {nf(Number(catalogMap[item.sku]?.provider_price_gs || 0))}
                  </div>
                </div>

                <div className="md:col-span-3 w-full min-w-0">
                  <label className="app-label !mt-0">Venta TOTAL (Gs)</label>
                  <input
                    className="app-input w-full min-w-0 text-base"
                    type="number"
                    placeholder="Venta TOTAL (Gs)"
                    value={item.sale_gs || ''}
                    onChange={(e) => updateItem(idx, 'sale_gs', Number(e.target.value))}
                  />
                </div>

                <div className="md:col-span-1 w-full min-w-0">
                  <label className="app-label !mt-0">Cant.</label>
                  <input
                    className="app-input w-full min-w-0 text-base"
                    type="number"
                    placeholder="Cant."
                    value={item.qty}
                    onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))}
                  />
                </div>

                <div className="md:col-span-1 w-full min-w-0">
                  <label className="app-label !mt-0 opacity-0 hidden md:block">Acción</label>
                  <button
                    className="nav-btn text-xs w-full"
                    onClick={() => removeItem(idx)}
                  >
                    Quitar
                  </button>
                </div>
              </div>

              <div className="mt-2">
                <span className="chip text-[10px] break-words">
                  Prov×Cant: {nf(Number(catalogMap[item.sku]?.provider_price_gs || 0) * item.qty)}
                </span>
              </div>
            </div>
          ))}

          <button className="nav-btn active text-xs mt-2 w-full sm:w-auto" onClick={addItem}>
            + Agregar ítem
          </button>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="w-full min-w-0">
              <label className="app-label">Total (Gs)</label>
              <input
                className="app-input bg-secondary w-full min-w-0"
                readOnly
                value={nf(totalVenta)}
              />
            </div>

            <div className="w-full min-w-0">
              <label className="app-label">Delivery cobrado (Gs)</label>
              <input
                className="app-input bg-secondary w-full min-w-0"
                readOnly
                value={nf(Number(deliveryPrice))}
              />
            </div>

            <div className="w-full min-w-0">
              <label className="app-label">Comisión estimada (Gs)</label>
              <input
                className="app-input bg-secondary w-full min-w-0"
                readOnly
                value={nf(commission)}
              />
            </div>
          </div>

          <div className="mt-4 flex">
            <button
              className="nav-btn active w-full md:w-auto md:min-w-[220px]"
              onClick={saveOrder}
              disabled={saving || loadingProducts}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="btn-spinner" /> Guardando...
                </span>
              ) : (
                'Guardar pedido'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
