import { useState, useEffect, useMemo, useCallback } from 'react';
import ImageUploadField from './ImageUploadField';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(Math.round(Number(n || 0)));

const todayPY = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const firstDayOfMonth = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
};

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizeEmail = (s: string | null | undefined) => (s || '').trim().toLowerCase();

const normalizeRole = (s: string | null | undefined) => {
  const r = (s || '').trim().toLowerCase();

  if (['admin', 'administrador'].includes(r)) return 'admin';
  if (['provider', 'proveedor'].includes(r)) return 'provider';
  if (['seller', 'vendedor'].includes(r)) return 'seller';
  if (['despachante', 'dispatcher'].includes(r)) return 'despachante';
  if (['delivery', 'repartidor'].includes(r)) return 'delivery';

  return r;
};

const parsePrivateEmails = (value: string | null | undefined) =>
  (value || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

type Tab = 'general' | 'favoritos' | 'privados';
type ViewMode = 'grid' | 'compact';
type SortMode = 'recientes' | 'mas_vendidos' | 'mas_entregados' | 'mayor_facturacion' | 'mayor_ganancia' | 'stock_bajo';

interface Product {
  id: string;
  title: string;
  sku: string | null;
  provider_price_gs: number | null;
  real_cost_gs: number | null;
  stock: number | null;
  real_stock: number | null;
  image_url: string | null;
  image_url_2: string | null;
  image_url_3: string | null;
  description: string | null;
  provider_email: string | null;
  private_to_emails: string | null;
  is_private: boolean | null;
  is_private_stock?: boolean | null;
  created_at?: string | null;
}

interface ProductMetrics {
  product_id: string;
  sku: string;
  sold_count: number;
  delivered_count: number;
  cancelled_count: number;
  returned_count: number;
  no_answer_count: number;
  billed_count: number;
  gross_revenue_gs: number;
  real_revenue_gs: number;
  product_cost_gs: number;
  gross_profit_gs: number;
}

interface AdSpend {
  id: string;
  user_email: string;
  provider_email: string | null;
  product_id: string | null;
  spend_date: string;
  amount_gs: number;
  note: string | null;
  created_at?: string | null;
}

const emptyMetrics: ProductMetrics = {
  product_id: '',
  sku: '',
  sold_count: 0,
  delivered_count: 0,
  cancelled_count: 0,
  returned_count: 0,
  no_answer_count: 0,
  billed_count: 0,
  gross_revenue_gs: 0,
  real_revenue_gs: 0,
  product_cost_gs: 0,
  gross_profit_gs: 0,
};

const emptyProduct: Omit<Product, 'id'> = {
  title: '',
  sku: '',
  provider_price_gs: 0,
  real_cost_gs: 0,
  stock: 0,
  real_stock: 0,
  image_url: '',
  image_url_2: '',
  image_url_3: '',
  description: '',
  provider_email: '',
  private_to_emails: '',
  is_private: false,
  is_private_stock: false,
};

const isPrivateProduct = (p: Product) => Boolean(p.is_private_stock ?? p.is_private);

const canUserSeeProduct = (p: Product, role: string, myEmail: string) => {
  const userEmail = normalizeEmail(myEmail);
  const providerEmail = normalizeEmail(p.provider_email);
  const privateEmails = parsePrivateEmails(p.private_to_emails);
  const isPrivate = isPrivateProduct(p);

  if (!userEmail || !role) return false;

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

const statusNorm = (s: string | null | undefined) => norm(String(s || ''));

const isDeliveredStatus = (s: string | null | undefined) => {
  const v = statusNorm(s);
  return ['entregado', 'entregada', 'delivered', 'delivery_ok', 'completado', 'completada'].includes(v);
};

const isCancelledStatus = (s: string | null | undefined) => {
  const v = statusNorm(s);
  return ['cancelado', 'cancelada', 'cancelled', 'canceled'].includes(v);
};

const isReturnedStatus = (s: string | null | undefined) => {
  const v = statusNorm(s);
  return ['devuelto', 'devuelta', 'returned', 'devolucion', 'devolucion total'].includes(v);
};

const isNoAnswerStatus = (s: string | null | undefined) => {
  const v = statusNorm(s);
  return ['no contesta', 'no_contesta', 'no answer', 'no_answer', 'sin respuesta'].includes(v);
};

const isBilledStatus = (s: string | null | undefined) => {
  const v = statusNorm(s);
  return ['facturado', 'facturada', 'billed', 'invoiced'].includes(v);
};

export default function ProductsView({ onLoadProduct }: { onLoadProduct?: (sku: string) => void }) {
  const { profile } = useAuth();

  const role = normalizeRole(profile?.role);
  const myEmail = normalizeEmail(profile?.email);

  const [products, setProducts] = useState<Product[]>([]);
  const [profiles, setProfiles] = useState<
    { email: string; name: string | null; logo_url: string | null; phone: string | null }[]
  >([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('general');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('recientes');
  const [fromDate, setFromDate] = useState(firstDayOfMonth());
  const [toDate, setToDate] = useState(todayPY());
  const [selectedProvider, setSelectedProvider] = useState<string>('todos');
  const [selectedProductId, setSelectedProductId] = useState<string>('todos');
  const [adAmount, setAdAmount] = useState<number>(0);
  const [adNote, setAdNote] = useState<string>('');
  const [adProductMode, setAdProductMode] = useState<'general' | 'producto'>('general');
  const [userFavorites, setUserFavorites] = useState<Set<string>>(new Set());
  const [editProduct, setEditProduct] = useState<(Product & { isNew?: boolean }) | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imgIndex, setImgIndex] = useState<Record<string, number>>({});
  const [viewingImage, setViewingImage] = useState<{ url: string; title: string } | null>(null);
  const [metricsByProduct, setMetricsByProduct] = useState<Record<string, ProductMetrics>>({});
  const [adSpends, setAdSpends] = useState<AdSpend[]>([]);

  const loadFavorites = useCallback(async () => {
    if (!myEmail) return;

    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .select('product_id')
        .eq('user_email', myEmail);

      if (error) throw error;

      setUserFavorites(new Set(data?.map((f) => f.product_id) || []));
    } catch (error) {
      console.error('Error cargando favoritos:', error);
    }
  }, [myEmail]);

  const toggleFavorite = async (productId: string) => {
    if (!myEmail) {
      toast.error('Debes iniciar sesión');
      return;
    }

    const isFavorite = userFavorites.has(productId);

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_email', myEmail)
          .eq('product_id', productId);

        if (error) throw error;

        setUserFavorites((prev) => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });

        toast.success('❌ Eliminado de tus favoritos');
      } else {
        const { error } = await supabase.from('user_favorites').insert({
          user_email: myEmail,
          product_id: productId,
        });

        if (error) throw error;

        setUserFavorites((prev) => new Set([...prev, productId]));
        toast.success('⭐ Agregado a tus favoritos');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('No se pudo actualizar favorito');
    }
  };

  const load = useCallback(async () => {
    if (!role || !myEmail) {
      setProducts([]);
      setProfiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [prodRes, profRes] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('email, name, logo_url, phone'),
    ]);

    if (prodRes.error) {
      console.error('Error cargando products:', prodRes.error);
      toast.error(prodRes.error.message);
      setLoading(false);
      return;
    }

    if (profRes.error) {
      console.error('Error cargando profiles:', profRes.error);
      toast.error(profRes.error.message);
      setLoading(false);
      return;
    }

    const allProducts = (prodRes.data || []) as Product[];
    const visibleProducts = allProducts.filter((p) => canUserSeeProduct(p, role, myEmail));

    setProducts(visibleProducts);
    setProfiles(profRes.data || []);
    setLoading(false);
  }, [role, myEmail]);

  const visibleProductIds = useMemo(() => products.map((p) => p.id), [products]);
  const visibleSkus = useMemo(() => products.map((p) => p.sku).filter(Boolean) as string[], [products]);

  const loadAdSpends = useCallback(async () => {
    if (!myEmail || !fromDate || !toDate) return;

    try {
      let query = supabase
        .from('ad_spend')
        .select('*')
        .gte('spend_date', fromDate)
        .lte('spend_date', toDate)
        .order('spend_date', { ascending: false });

      if (role !== 'admin') {
        query = query.eq('user_email', myEmail);
      }

      if (role === 'provider') {
        query = query.eq('provider_email', myEmail);
      }

      if (selectedProvider !== 'todos') {
        query = query.eq('provider_email', selectedProvider);
      }

      if (selectedProductId !== 'todos') {
        query = query.eq('product_id', selectedProductId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setAdSpends((data || []) as AdSpend[]);
    } catch (error: any) {
      console.error('Error cargando publicidad:', error);
      toast.error(error?.message || 'No se pudo cargar gasto publicitario');
    }
  }, [myEmail, role, fromDate, toDate, selectedProvider, selectedProductId]);

  const loadMetrics = useCallback(async () => {
    if (!role || !myEmail || visibleProductIds.length === 0 || !fromDate || !toDate) {
      setMetricsByProduct({});
      return;
    }

    setMetricsLoading(true);

    try {
      const productMapBySku = new Map<string, Product>();
      const productMapById = new Map<string, Product>();
      products.forEach((p) => {
        if (p.sku) productMapBySku.set(String(p.sku), p);
        productMapById.set(p.id, p);
      });

      let query = supabase
        .from('orders')
        .select('*')
        .gte('created_at', `${fromDate}T00:00:00`)
        .lte('created_at', `${toDate}T23:59:59`);

      if (visibleSkus.length > 0) {
        query = query.in('sku', visibleSkus);
      }

      if (role === 'seller') {
        query = query.eq('seller_email', myEmail);
      }

      if (role === 'provider') {
        query = query.eq('provider_email', myEmail);
      }

      if (selectedProvider !== 'todos') {
        query = query.eq('provider_email', selectedProvider);
      }

      if (selectedProductId !== 'todos') {
        const selectedProduct = productMapById.get(selectedProductId);
        if (selectedProduct?.sku) query = query.eq('sku', selectedProduct.sku);
      }

      const { data, error } = await query;
      if (error) throw error;

      const next: Record<string, ProductMetrics> = {};

      products.forEach((p) => {
        next[p.id] = {
          ...emptyMetrics,
          product_id: p.id,
          sku: p.sku || '',
        };
      });

      (data || []).forEach((order: any) => {
        const sku = String(order.sku || '');
        const product = productMapBySku.get(sku);
        if (!product) return;

        const m = next[product.id] || {
          ...emptyMetrics,
          product_id: product.id,
          sku,
        };

        const qty = Number(order.quantity || order.qty || 1);
        const saleAmount = Number(
          order.total_gs ||
            order.total_amount_gs ||
            order.amount_gs ||
            order.price_gs ||
            product.provider_price_gs ||
            0
        );
        const realCost = Number(product.real_cost_gs || 0) * qty;
        const status = order.status || order.order_status || order.estado;
        const billed = Boolean(order.is_billed || order.facturado || isBilledStatus(status));
        const delivered = isDeliveredStatus(status);
        const cancelled = isCancelledStatus(status);
        const returned = isReturnedStatus(status);
        const noAnswer = isNoAnswerStatus(status);

        m.sold_count += qty;
        if (delivered) m.delivered_count += qty;
        if (cancelled) m.cancelled_count += qty;
        if (returned) m.returned_count += qty;
        if (noAnswer) m.no_answer_count += qty;
        if (billed) m.billed_count += qty;

        m.gross_revenue_gs += saleAmount;

        if (delivered) {
          m.real_revenue_gs += saleAmount;
          m.product_cost_gs += realCost;
          m.gross_profit_gs += saleAmount - realCost;
        }

        next[product.id] = m;
      });

      setMetricsByProduct(next);
    } catch (error: any) {
      console.error('Error cargando métricas:', error);
      toast.error(error?.message || 'No se pudieron cargar métricas. Revisá nombres de columnas de orders.');
    } finally {
      setMetricsLoading(false);
    }
  }, [role, myEmail, visibleProductIds.length, visibleSkus, fromDate, toDate, products, selectedProvider, selectedProductId]);

  useEffect(() => {
    load();
    loadFavorites();
  }, [load, loadFavorites]);

  useEffect(() => {
    loadMetrics();
    loadAdSpends();
  }, [loadMetrics, loadAdSpends]);

  const profileMap = useMemo(() => {
    const m: Record<string, { name: string; logo: string; phone: string }> = {};
    profiles.forEach((p) => {
      m[normalizeEmail(p.email)] = {
        name: p.name || p.email,
        logo: p.logo_url || '',
        phone: p.phone || '',
      };
    });
    return m;
  }, [profiles]);

  const providerOptions = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      const email = normalizeEmail(p.provider_email);
      if (!email) return;
      map.set(email, profileMap[email]?.name || p.provider_email || email);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [products, profileMap]);

  const productOptions = useMemo(() => {
    let list = [...products];
    if (selectedProvider !== 'todos') {
      list = list.filter((p) => normalizeEmail(p.provider_email) === selectedProvider);
    }
    return list.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  }, [products, selectedProvider]);

  const getProductAdSpend = useCallback(
    (productId: string) =>
      adSpends
        .filter((s) => s.product_id === productId)
        .reduce((sum, s) => sum + Number(s.amount_gs || 0), 0),
    [adSpends]
  );

  const generalAdSpend = useMemo(
    () => adSpends.filter((s) => !s.product_id).reduce((sum, s) => sum + Number(s.amount_gs || 0), 0),
    [adSpends]
  );

  const totalProductAdSpend = useMemo(
    () => adSpends.filter((s) => s.product_id).reduce((sum, s) => sum + Number(s.amount_gs || 0), 0),
    [adSpends]
  );

  const filtered = useMemo(() => {
    let list = [...products];

    if (tab === 'favoritos') {
      list = list.filter((p) => userFavorites.has(p.id));
    }

    if (tab === 'privados') {
      list = list.filter((p) => {
        const privateEmails = parsePrivateEmails(p.private_to_emails);
        const isPrivate = isPrivateProduct(p);

        if (!isPrivate) return false;

        if (role === 'admin') return true;

        if (role === 'provider') {
          return normalizeEmail(p.provider_email) === myEmail;
        }

        if (['seller', 'despachante', 'delivery'].includes(role)) {
          return privateEmails.includes(myEmail);
        }

        return false;
      });
    }

    if (selectedProvider !== 'todos') {
      list = list.filter((p) => normalizeEmail(p.provider_email) === selectedProvider);
    }

    if (selectedProductId !== 'todos') {
      list = list.filter((p) => p.id === selectedProductId);
    }

    if (search) {
      const q = norm(search);
      list = list.filter((p) => {
        const hay = [p.title, p.sku, p.provider_email, p.description]
          .map((v) => norm(String(v || '')))
          .join(' ');
        return hay.includes(q);
      });
    }

    list.sort((a, b) => {
      const ma = metricsByProduct[a.id] || emptyMetrics;
      const mb = metricsByProduct[b.id] || emptyMetrics;

      if (sortMode === 'mas_vendidos') return mb.sold_count - ma.sold_count;
      if (sortMode === 'mas_entregados') return mb.delivered_count - ma.delivered_count;
      if (sortMode === 'mayor_facturacion') return mb.real_revenue_gs - ma.real_revenue_gs;
      if (sortMode === 'mayor_ganancia') {
        const netA = ma.gross_profit_gs - getProductAdSpend(a.id);
        const netB = mb.gross_profit_gs - getProductAdSpend(b.id);
        return netB - netA;
      }
      if (sortMode === 'stock_bajo') return Number(a.stock || 0) - Number(b.stock || 0);

      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

    return list;
  }, [products, tab, search, userFavorites, role, myEmail, selectedProvider, selectedProductId, sortMode, metricsByProduct, getProductAdSpend]);

  const totals = useMemo(() => {
    const base = filtered.reduce(
      (acc, p) => {
        const m = metricsByProduct[p.id] || emptyMetrics;
        acc.sold += m.sold_count;
        acc.delivered += m.delivered_count;
        acc.cancelled += m.cancelled_count;
        acc.returned += m.returned_count;
        acc.noAnswer += m.no_answer_count;
        acc.billed += m.billed_count;
        acc.grossRevenue += m.gross_revenue_gs;
        acc.realRevenue += m.real_revenue_gs;
        acc.productCost += m.product_cost_gs;
        acc.grossProfit += m.gross_profit_gs;
        acc.productAdSpend += getProductAdSpend(p.id);
        return acc;
      },
      {
        sold: 0,
        delivered: 0,
        cancelled: 0,
        returned: 0,
        noAnswer: 0,
        billed: 0,
        grossRevenue: 0,
        realRevenue: 0,
        productCost: 0,
        grossProfit: 0,
        productAdSpend: 0,
      }
    );

    const totalAdSpend = generalAdSpend + base.productAdSpend;
    const netProfit = base.grossProfit - totalAdSpend;

    return {
      ...base,
      generalAdSpend,
      totalAdSpend,
      netProfit,
      deliveryRate: base.sold > 0 ? Math.round((base.delivered / base.sold) * 100) : 0,
    };
  }, [filtered, metricsByProduct, getProductAdSpend, generalAdSpend]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { email: string; name: string; logo: string; phone: string; items: Product[]; totals: typeof totals }
    >();

    filtered.forEach((p) => {
      const key = normalizeEmail(p.provider_email || '__sin_proveedor__');

      if (!map.has(key)) {
        const info = profileMap[key] || {
          name: p.provider_email || 'Sin proveedor',
          logo: '',
          phone: '',
        };

        map.set(key, {
          email: p.provider_email || '',
          name: info.name,
          logo: info.logo,
          phone: info.phone,
          items: [],
          totals: {
            sold: 0,
            delivered: 0,
            cancelled: 0,
            returned: 0,
            noAnswer: 0,
            billed: 0,
            grossRevenue: 0,
            realRevenue: 0,
            productCost: 0,
            grossProfit: 0,
            productAdSpend: 0,
            generalAdSpend: 0,
            totalAdSpend: 0,
            netProfit: 0,
            deliveryRate: 0,
          },
        });
      }

      const group = map.get(key)!;
      const m = metricsByProduct[p.id] || emptyMetrics;
      const productAd = getProductAdSpend(p.id);

      group.items.push(p);
      group.totals.sold += m.sold_count;
      group.totals.delivered += m.delivered_count;
      group.totals.cancelled += m.cancelled_count;
      group.totals.returned += m.returned_count;
      group.totals.noAnswer += m.no_answer_count;
      group.totals.billed += m.billed_count;
      group.totals.grossRevenue += m.gross_revenue_gs;
      group.totals.realRevenue += m.real_revenue_gs;
      group.totals.productCost += m.product_cost_gs;
      group.totals.grossProfit += m.gross_profit_gs;
      group.totals.productAdSpend += productAd;
      group.totals.totalAdSpend += productAd;
      group.totals.netProfit = group.totals.grossProfit - group.totals.totalAdSpend;
      group.totals.deliveryRate = group.totals.sold > 0 ? Math.round((group.totals.delivered / group.totals.sold) * 100) : 0;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [filtered, profileMap, metricsByProduct, getProductAdSpend, totals]);

  const getImages = (p: Product) =>
    [p.image_url, p.image_url_2, p.image_url_3].filter(Boolean) as string[];

  const getInitials = (name: string) =>
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || 'PR';

  const openAdd = () => {
    setEditProduct({
      id: '',
      ...emptyProduct,
      isNew: true,
      provider_email: role === 'provider' ? myEmail : '',
    } as any);
  };

  const openEdit = (p: Product) => setEditProduct({ ...p });

  const saveProduct = async () => {
    if (!editProduct) return;

    const { isNew, id, ...data } = editProduct as any;

    if (!data.title || !data.sku) {
      toast.error('Título y SKU son obligatorios');
      return;
    }

    if (role === 'provider') {
      data.provider_email = myEmail;
    }

    if (isNew) {
      const { error } = await supabase.from('products').insert(data);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Producto creado');
    } else {
      const { error } = await supabase.from('products').update(data).eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Producto actualizado');
    }

    setEditProduct(null);
    load();
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('¿Estás seguro de que querés eliminar este producto?')) return;

    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Producto eliminado');
    setEditProduct(null);
    load();
  };

  const saveAdSpend = async () => {
    if (!myEmail) {
      toast.error('Debes iniciar sesión');
      return;
    }

    if (!fromDate || !toDate) {
      toast.error('Seleccioná fechas');
      return;
    }

    if (!adAmount || Number(adAmount) <= 0) {
      toast.error('Ingresá un gasto publicitario válido');
      return;
    }

    const spendDate = toDate;
    const targetProductId = adProductMode === 'producto' && selectedProductId !== 'todos' ? selectedProductId : null;
    const selectedProduct = products.find((p) => p.id === targetProductId);
    const providerEmail =
      role === 'provider'
        ? myEmail
        : selectedProduct?.provider_email || (selectedProvider !== 'todos' ? selectedProvider : null);

    try {
      const { error } = await supabase.from('ad_spend').insert({
        user_email: myEmail,
        provider_email: providerEmail,
        product_id: targetProductId,
        spend_date: spendDate,
        amount_gs: Number(adAmount),
        note: adNote || null,
      });

      if (error) throw error;

      toast.success('Gasto publicitario guardado');
      setAdAmount(0);
      setAdNote('');
      loadAdSpends();
    } catch (error: any) {
      console.error('Error guardando publicidad:', error);
      toast.error(error?.message || 'No se pudo guardar gasto publicitario');
    }
  };

  const deleteAdSpend = async (id: string) => {
    if (!confirm('¿Eliminar este gasto publicitario?')) return;

    try {
      const { error } = await supabase.from('ad_spend').delete().eq('id', id);
      if (error) throw error;
      toast.success('Gasto eliminado');
      loadAdSpends();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo eliminar');
    }
  };

  const canEdit = ['admin', 'provider', 'despachante'].includes(role);
  const canSeeRealCost = ['admin', 'provider'].includes(role);
  const canLoadOrder = ['seller', 'despachante', 'delivery'].includes(role);
  const canSeeMoney = ['admin', 'provider', 'seller', 'despachante'].includes(role);

  return (
    <div className="app-card space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold">Productos</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Catálogo con métricas, facturación real y rentabilidad por fechas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={`nav-btn !px-3 !py-2 !text-xs ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            ▦ Grid
          </button>
          <button
            className={`nav-btn !px-3 !py-2 !text-xs ${viewMode === 'compact' ? 'active' : ''}`}
            onClick={() => setViewMode('compact')}
          >
            ☰ Compacto
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <div className="rounded-2xl border border-border bg-secondary/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Facturación real</div>
          <div className="font-black text-base mt-1">{nf(totals.realRevenue)} Gs</div>
          <div className="text-[10px] text-muted-foreground">Solo entregados</div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Costo</div>
          <div className="font-black text-base mt-1">{nf(totals.productCost)} Gs</div>
          <div className="text-[10px] text-muted-foreground">Costo real entregado</div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Ganancia bruta</div>
          <div className="font-black text-base mt-1">{nf(totals.grossProfit)} Gs</div>
          <div className="text-[10px] text-muted-foreground">Antes de publicidad</div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Publicidad</div>
          <div className="font-black text-base mt-1">{nf(totals.totalAdSpend)} Gs</div>
          <div className="text-[10px] text-muted-foreground">General + producto</div>
        </div>

        <div className={`rounded-2xl border p-3 ${totals.netProfit >= 0 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Ganancia neta</div>
          <div className="font-black text-base mt-1">{nf(totals.netProfit)} Gs</div>
          <div className="text-[10px] text-muted-foreground">Bruta - publicidad</div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Conversión</div>
          <div className="font-black text-base mt-1">{totals.deliveryRate}%</div>
          <div className="text-[10px] text-muted-foreground">{totals.delivered}/{totals.sold} entregados</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-background/60 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="font-extrabold text-sm">Filtros y rentabilidad</div>
            <div className="text-[11px] text-muted-foreground">Seleccioná fechas para calcular ventas, entregas y ganancias.</div>
          </div>
          {metricsLoading && <span className="chip text-[10px]">Actualizando métricas...</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <div>
            <label className="app-label">Desde</label>
            <input type="date" className="app-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>

          <div>
            <label className="app-label">Hasta</label>
            <input type="date" className="app-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>

          <div>
            <label className="app-label">Proveedor</label>
            <select
              className="app-input"
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                setSelectedProductId('todos');
              }}
            >
              <option value="todos">Todos</option>
              {providerOptions.map(([email, name]) => (
                <option key={email} value={email}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="app-label">Producto</label>
            <select className="app-input" value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
              <option value="todos">Todos</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="app-label">Ordenar</label>
            <select className="app-input" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="recientes">Recientes</option>
              <option value="mas_vendidos">Más vendidos</option>
              <option value="mas_entregados">Más entregados</option>
              <option value="mayor_facturacion">Mayor facturación</option>
              <option value="mayor_ganancia">Mayor ganancia</option>
              <option value="stock_bajo">Stock bajo</option>
            </select>
          </div>

          <div>
            <label className="app-label">Buscar</label>
            <input
              className="app-input"
              placeholder="Nombre, SKU o proveedor"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-secondary/40 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="font-extrabold text-sm">Gasto publicitario</div>
            <div className="text-[11px] text-muted-foreground">
              Se guarda en la fecha Hasta. Podés asociarlo al filtro general o a un producto seleccionado.
            </div>
          </div>
          <span className="chip text-[10px]">Total período: {nf(totals.totalAdSpend)} Gs</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
          <div>
            <label className="app-label">Tipo</label>
            <select className="app-input" value={adProductMode} onChange={(e) => setAdProductMode(e.target.value as any)}>
              <option value="general">General</option>
              <option value="producto">Producto seleccionado</option>
            </select>
          </div>

          <div>
            <label className="app-label">Monto Gs</label>
            <input
              type="number"
              className="app-input"
              value={adAmount || ''}
              onChange={(e) => setAdAmount(Number(e.target.value))}
              placeholder="Ej: 50000"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="app-label">Nota</label>
            <input
              className="app-input"
              value={adNote}
              onChange={(e) => setAdNote(e.target.value)}
              placeholder="Ej: Facebook Ads / TikTok Ads"
            />
          </div>

          <button className="nav-btn active h-[42px]" onClick={saveAdSpend}>
            Guardar gasto
          </button>
        </div>

        {adSpends.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {adSpends.slice(0, 8).map((s) => {
              const product = products.find((p) => p.id === s.product_id);
              return (
                <span key={s.id} className="chip text-[10px] flex items-center gap-1">
                  📣 {s.spend_date} · {nf(s.amount_gs)} Gs {product ? `· ${product.title}` : '· General'}
                  <button className="ml-1 opacity-70 hover:opacity-100" onClick={() => deleteAdSpend(s.id)}>×</button>
                </span>
              );
            })}
            {adSpends.length > 8 && <span className="chip text-[10px]">+{adSpends.length - 8} más</span>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {(['general', 'favoritos', 'privados'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`nav-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'general' ? '📦 General' : t === 'favoritos' ? '⭐ Favoritos' : '🔒 Privados'}
          </button>
        ))}

        {canEdit && <button className="nav-btn active" onClick={openAdd}>+ Agregar producto</button>}

        <span className="chip text-[10px]">{filtered.length} productos</span>
        <span className="chip text-[10px]">Vendidos: {totals.sold}</span>
        <span className="chip text-[10px]">Entregados: {totals.delivered}</span>
        <span className="chip text-[10px]">Cancelados: {totals.cancelled}</span>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Cargando...</p>}

      {grouped.map((group) => (
        <div key={group.email || group.name} className="mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3 p-3 rounded-2xl border border-border bg-secondary/50">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {group.logo ? (
                <img
                  src={group.logo}
                  alt={group.name}
                  className="w-11 h-11 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center font-bold text-sm text-primary">
                  {getInitials(group.name)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Proveedor
                </div>
                <div className="font-extrabold text-sm truncate">{group.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{group.email}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 flex-1">
              <span className="chip text-[10px]">{group.items.length} productos</span>
              <span className="chip text-[10px]">📦 {group.totals.sold} vendidos</span>
              <span className="chip text-[10px]">🚚 {group.totals.delivered} entregados</span>
              <span className="chip text-[10px]">❌ {group.totals.cancelled} cancelados</span>
              {canSeeMoney && <span className="chip text-[10px]">💰 {nf(group.totals.realRevenue)} Gs</span>}
              {canSeeMoney && <span className="chip text-[10px]">✅ {nf(group.totals.netProfit)} Gs neto</span>}
            </div>

            {group.phone && canLoadOrder && (
              <a
                href={`https://wa.me/${group.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 nav-btn !px-3 !py-2 !text-xs font-bold text-[#25D366] hover:!bg-[#25D366]/10"
              >
                WhatsApp
              </a>
            )}
          </div>

          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-2'}>
            {group.items.map((p) => {
              const images = getImages(p);
              const mainImg = images[imgIndex[p.id] || 0] || '';
              const isFav = userFavorites.has(p.id);
              const gainUnit = Number(p.provider_price_gs || 0) - Number(p.real_cost_gs || 0);
              const isExpanded = expandedId === p.id;
              const m = metricsByProduct[p.id] || emptyMetrics;
              const productAdSpend = getProductAdSpend(p.id);
              const netProfit = m.gross_profit_gs - productAdSpend;
              const cancelRate = m.sold_count > 0 ? Math.round((m.cancelled_count / m.sold_count) * 100) : 0;
              const deliveryRate = m.sold_count > 0 ? Math.round((m.delivered_count / m.sold_count) * 100) : 0;
              const stockCritical = Number(p.stock || 0) <= 3;
              const topProduct = m.delivered_count >= 10 && deliveryRate >= 70;

              if (viewMode === 'compact') {
                return (
                  <div
                    key={p.id}
                    className="bg-secondary border border-border rounded-2xl p-3 flex flex-col md:flex-row gap-3 md:items-center hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-16 h-16 rounded-xl bg-background border border-border overflow-hidden flex items-center justify-center shrink-0">
                        {mainImg ? <img src={mainImg} alt={p.title} className="w-full h-full object-contain p-1" /> : <span className="text-[10px] text-muted-foreground">Sin img</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase text-muted-foreground font-bold">SKU: {p.sku || '—'}</div>
                        <div className="font-extrabold text-sm truncate">{p.title}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stockCritical && <span className="chip text-[10px]">⚠️ Stock bajo</span>}
                          {topProduct && <span className="chip text-[10px]">🔥 Top</span>}
                          <span className="chip text-[10px]">Stock: {p.stock ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center flex-1">
                      <div><div className="font-black text-sm">{m.sold_count}</div><div className="text-[10px] text-muted-foreground">Vendidos</div></div>
                      <div><div className="font-black text-sm">{m.delivered_count}</div><div className="text-[10px] text-muted-foreground">Entregados</div></div>
                      <div><div className="font-black text-sm">{m.cancelled_count}</div><div className="text-[10px] text-muted-foreground">Cancelados</div></div>
                      <div><div className="font-black text-sm">{m.returned_count}</div><div className="text-[10px] text-muted-foreground">Devueltos</div></div>
                      <div><div className="font-black text-sm">{m.no_answer_count}</div><div className="text-[10px] text-muted-foreground">No contesta</div></div>
                      <div><div className="font-black text-sm">{m.billed_count}</div><div className="text-[10px] text-muted-foreground">Facturados</div></div>
                    </div>

                    {canSeeMoney && (
                      <div className="min-w-[180px]">
                        <div className="text-[10px] text-muted-foreground">Real: {nf(m.real_revenue_gs)} Gs</div>
                        <div className="text-[10px] text-muted-foreground">Ads: {nf(productAdSpend)} Gs</div>
                        <div className={`font-black text-sm ${netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Neto: {nf(netProfit)} Gs</div>
                      </div>
                    )}

                    <div className="flex gap-1 justify-end">
                      <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => toggleFavorite(p.id)}>{isFav ? '★' : '☆'}</button>
                      {canEdit && <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => openEdit(p)}>Editar</button>}
                      {canLoadOrder && p.sku && <button className="nav-btn active !px-2 !py-1 !text-[10px]" onClick={() => onLoadProduct?.(p.sku!)}>➕ Cargar</button>}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={p.id}
                  className="bg-secondary border border-border rounded-[18px] overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative group"
                >
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary to-primary/60 opacity-85 z-10" />

                  <div
                    className="relative w-full h-[180px] overflow-hidden bg-background border-b border-border flex items-center justify-center cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    {mainImg ? (
                      <img src={mainImg} alt={p.title} className="max-w-full max-h-full object-contain p-2" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                        Sin imagen
                      </div>
                    )}

                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {stockCritical && <span className="chip text-[10px] bg-red-500/15 border-red-500/30">⚠️ Stock bajo</span>}
                      {topProduct && <span className="chip text-[10px] bg-emerald-500/15 border-emerald-500/30">🔥 Top ventas</span>}
                      {isPrivateProduct(p) && <span className="chip text-[10px]">🔒 Privado</span>}
                    </div>

                    <button
                      className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center text-lg border border-border hover:scale-110 transition-transform"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(p.id);
                      }}
                    >
                      {isFav ? '★' : '☆'}
                    </button>
                  </div>

                  {images.length > 1 && (
                    <div className="flex gap-1 px-2 py-1.5 border-b border-border bg-background/50">
                      {images.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt=""
                          className={`w-12 h-12 rounded-lg object-cover cursor-pointer border-2 transition-all ${
                            (imgIndex[p.id] || 0) === i
                              ? 'border-primary'
                              : 'border-border opacity-60 hover:opacity-100'
                          }`}
                          onClick={() => setImgIndex((prev) => ({ ...prev, [p.id]: i }))}
                        />
                      ))}
                    </div>
                  )}

                  <div
                    className="p-3.5 flex flex-col gap-2 flex-grow min-h-[120px] cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                        SKU: {p.sku || '—'}
                      </div>
                      <span className="chip text-[10px]">{deliveryRate}% entrega</span>
                    </div>
                    <div className="font-extrabold text-[17px] leading-tight">{p.title}</div>

                    {p.description && !isExpanded && (
                      <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
                    )}

                    {isExpanded && p.description && (
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap">{p.description}</div>
                    )}

                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      <div className="rounded-xl bg-background/70 border border-border p-2 text-center">
                        <div className="font-black text-sm">{m.sold_count}</div>
                        <div className="text-[9px] text-muted-foreground">Vendidos</div>
                      </div>
                      <div className="rounded-xl bg-background/70 border border-border p-2 text-center">
                        <div className="font-black text-sm">{m.delivered_count}</div>
                        <div className="text-[9px] text-muted-foreground">Entregados</div>
                      </div>
                      <div className="rounded-xl bg-background/70 border border-border p-2 text-center">
                        <div className="font-black text-sm">{m.cancelled_count}</div>
                        <div className="text-[9px] text-muted-foreground">Cancelados</div>
                      </div>
                      <div className="rounded-xl bg-background/70 border border-border p-2 text-center">
                        <div className="font-black text-sm">{m.returned_count}</div>
                        <div className="text-[9px] text-muted-foreground">Devueltos</div>
                      </div>
                      <div className="rounded-xl bg-background/70 border border-border p-2 text-center">
                        <div className="font-black text-sm">{m.no_answer_count}</div>
                        <div className="text-[9px] text-muted-foreground">No contesta</div>
                      </div>
                      <div className="rounded-xl bg-background/70 border border-border p-2 text-center">
                        <div className="font-black text-sm">{m.billed_count}</div>
                        <div className="text-[9px] text-muted-foreground">Facturados</div>
                      </div>
                    </div>

                    {canSeeMoney && (
                      <div className="rounded-2xl border border-border bg-background/70 p-2 space-y-1">
                        <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Fact. real</span><b>{nf(m.real_revenue_gs)} Gs</b></div>
                        <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Costo</span><b>{nf(m.product_cost_gs)} Gs</b></div>
                        <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Publicidad</span><b>{nf(productAdSpend)} Gs</b></div>
                        <div className="flex justify-between text-[12px] pt-1 border-t border-border">
                          <span className="font-bold">Neto</span>
                          <b className={netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}>{nf(netProfit)} Gs</b>
                        </div>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="rounded-2xl border border-border bg-background/70 p-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                        <div>Cancelación: <b>{cancelRate}%</b></div>
                        <div>Fact. total: <b>{nf(m.gross_revenue_gs)} Gs</b></div>
                        <div>Stock: <b>{p.stock ?? 0}</b></div>
                        {canSeeRealCost && <div>Stock real: <b>{p.real_stock ?? 0}</b></div>}
                        <div>Precio: <b>{nf(Number(p.provider_price_gs || 0))} Gs</b></div>
                        {canSeeRealCost && <div>Gan/u: <b>{nf(gainUnit)} Gs</b></div>}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center px-3.5 py-3 border-t border-border bg-background/80">
                    <div>
                      <span className="font-extrabold text-sm">{nf(Number(p.provider_price_gs || 0))} Gs</span>
                      {canSeeRealCost && (
                        <div className="text-[10px] text-muted-foreground">Gan/u: {nf(gainUnit)} Gs</div>
                      )}
                    </div>

                    <div className="flex gap-1">
                      {mainImg && (
                        <button
                          className="nav-btn !px-2 !py-1 !text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingImage({ url: mainImg, title: p.title });
                          }}
                        >
                          👁 Ver
                        </button>
                      )}

                      {canEdit && (
                        <button
                          className="nav-btn !px-2 !py-1 !text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(p);
                          }}
                        >
                          Editar
                        </button>
                      )}

                      {canLoadOrder && p.sku && (
                        <button
                          className="nav-btn active !px-2 !py-1 !text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLoadProduct?.(p.sku!);
                          }}
                        >
                          ➕ Cargar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && !loading && (
        <p className="text-center text-muted-foreground py-8">Sin productos encontrados</p>
      )}

      {editProduct &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 z-[9999] flex items-start justify-center p-2 sm:p-4 overflow-auto"
            onClick={() => setEditProduct(null)}
          >
            <div
              className="bg-card border border-border rounded-2xl p-4 sm:p-6 w-full max-w-3xl my-4 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-lg font-extrabold">
                {(editProduct as any).isNew ? '➕ Agregar Producto' : '✏️ Editar Producto'}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="app-label">Título *</label>
                  <input
                    className="app-input"
                    value={editProduct.title}
                    onChange={(e) => setEditProduct({ ...editProduct, title: e.target.value })}
                  />
                </div>

                <div>
                  <label className="app-label">SKU *</label>
                  <input
                    className="app-input"
                    value={editProduct.sku || ''}
                    onChange={(e) => setEditProduct({ ...editProduct, sku: e.target.value })}
                  />
                </div>

                <div>
                  <label className="app-label">Precio venta (Gs)</label>
                  <input
                    type="number"
                    className="app-input"
                    value={editProduct.provider_price_gs || 0}
                    onChange={(e) =>
                      setEditProduct({ ...editProduct, provider_price_gs: Number(e.target.value) })
                    }
                  />
                </div>

                <div>
                  <label className="app-label">Costo real (Gs)</label>
                  <input
                    type="number"
                    className="app-input"
                    value={editProduct.real_cost_gs || 0}
                    onChange={(e) =>
                      setEditProduct({ ...editProduct, real_cost_gs: Number(e.target.value) })
                    }
                  />
                </div>

                <div>
                  <label className="app-label">Stock</label>
                  <input
                    type="number"
                    className="app-input"
                    value={editProduct.stock || 0}
                    onChange={(e) => setEditProduct({ ...editProduct, stock: Number(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="app-label">Stock real</label>
                  <input
                    type="number"
                    className="app-input"
                    value={editProduct.real_stock || 0}
                    onChange={(e) =>
                      setEditProduct({ ...editProduct, real_stock: Number(e.target.value) })
                    }
                  />
                </div>

                <ImageUploadField
                  label="Imagen 1"
                  value={editProduct.image_url || ''}
                  onChange={(v) => setEditProduct({ ...editProduct, image_url: v })}
                />
                <ImageUploadField
                  label="Imagen 2"
                  value={editProduct.image_url_2 || ''}
                  onChange={(v) => setEditProduct({ ...editProduct, image_url_2: v })}
                />
                <ImageUploadField
                  label="Imagen 3"
                  value={editProduct.image_url_3 || ''}
                  onChange={(v) => setEditProduct({ ...editProduct, image_url_3: v })}
                />

                {role !== 'provider' && (
                  <div>
                    <label className="app-label">Email proveedor</label>
                    <input
                      className="app-input"
                      value={editProduct.provider_email || ''}
                      onChange={(e) =>
                        setEditProduct({ ...editProduct, provider_email: e.target.value })
                      }
                    />
                  </div>
                )}

                <div className="col-span-1 sm:col-span-2">
                  <label className="app-label">Privado para (emails separados por coma)</label>
                  <input
                    className="app-input"
                    value={editProduct.private_to_emails || ''}
                    onChange={(e) =>
                      setEditProduct({ ...editProduct, private_to_emails: e.target.value })
                    }
                    placeholder="email1@x.com, email2@x.com"
                  />
                </div>

                <div className="col-span-1 sm:col-span-2">
                  <label className="app-label">Descripción</label>
                  <textarea
                    className="app-input min-h-[80px]"
                    value={editProduct.description || ''}
                    onChange={(e) =>
                      setEditProduct({ ...editProduct, description: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-between">
                <div>
                  {!(editProduct as any).isNew && (
                    <button
                      className="nav-btn !bg-destructive/20 hover:!bg-destructive/40 text-destructive"
                      onClick={() => deleteProduct(editProduct.id)}
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <button className="nav-btn" onClick={() => setEditProduct(null)}>
                    Cancelar
                  </button>
                  <button className="nav-btn active" onClick={saveProduct}>
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {viewingImage &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4"
            onClick={() => setViewingImage(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] flex flex-col items-center gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={viewingImage.url}
                alt={viewingImage.title}
                className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
              />
              <div className="flex gap-3 items-center">
                <span className="text-white font-bold text-sm">{viewingImage.title}</span>
                <a
                  href={viewingImage.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-btn active !px-4 !py-2 !text-xs"
                >
                  ⬇ Descargar
                </a>
                <button
                  className="nav-btn !px-4 !py-2 !text-xs"
                  onClick={() => setViewingImage(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
