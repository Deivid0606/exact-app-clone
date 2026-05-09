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

const getOrderValue = (order: any, keys: string[]) => {
  for (const key of keys) {
    if (order?.[key] !== undefined && order?.[key] !== null && String(order?.[key]).trim() !== '') {
      return order[key];
    }
  }
  return null;
};

const getOrderSku = (order: any) =>
  String(
    getOrderValue(order, [
      'sku',
      'product_sku',
      'producto_sku',
      'productSku',
      'codigo',
      'codigo_producto',
      'product_code',
    ]) || ''
  ).trim();

const getOrderProductId = (order: any) =>
  String(
    getOrderValue(order, [
      'product_id',
      'producto_id',
      'productId',
      'product',
    ]) || ''
  ).trim();

const getOrderStatus = (order: any) =>
  String(
    getOrderValue(order, [
      'status',
      'order_status',
      'estado',
      'estado_pedido',
      'delivery_status',
      'shipping_status',
    ]) || ''
  ).trim();

const getOrderProviderEmail = (order: any) =>
  normalizeEmail(
    getOrderValue(order, [
      'provider_email',
      'proveedor_email',
      'supplier_email',
      'email_proveedor',
    ])
  );

const getOrderSellerEmail = (order: any) =>
  normalizeEmail(
    getOrderValue(order, [
      'seller_email',
      'vendedor_email',
      'email_vendedor',
      'created_by_email',
      'user_email',
    ])
  );

const getOrderQuantity = (order: any) =>
  Number(getOrderValue(order, ['quantity', 'qty', 'cantidad', 'units', 'unidades']) || 1);

const getOrderAmount = (order: any, fallbackPrice: number) =>
  Number(
    getOrderValue(order, [
      'total_gs',
      'total_amount_gs',
      'amount_gs',
      'total',
      'monto_total',
      'precio_total',
      'price_gs',
      'precio',
    ]) || fallbackPrice || 0
  );

// Componente de galería de imágenes profesional
const ProductImageGallery = ({ 
  images, 
  title, 
  onViewFullscreen,
  currentIndex = 0,
  onIndexChange 
}: { 
  images: string[]; 
  title: string;
  onViewFullscreen: (url: string) => void;
  currentIndex: number;
  onIndexChange: (index: number) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  if (!images.length) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-secondary/50 to-secondary/30 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">📷</div>
          <div className="text-[10px] text-muted-foreground">Sin imagen</div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="relative w-full h-full group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        className="w-full h-full flex items-center justify-center cursor-pointer bg-gradient-to-br from-background/50 to-background/30"
        onClick={() => onViewFullscreen(images[currentIndex])}
      >
        <img 
          src={images[currentIndex]} 
          alt={title}
          className="max-w-full max-h-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full font-mono">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {images.length > 1 && isHovered && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((currentIndex - 1 + images.length) % images.length);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100"
          >
            ◀
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((currentIndex + 1) % images.length);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100"
          >
            ▶
          </button>
        </>
      )}

      {images.length > 1 && isHovered && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/50 backdrop-blur-sm px-2 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200">
          {images.map((img, idx) => (
            <div
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                onIndexChange(idx);
              }}
              className={`w-8 h-8 rounded-md overflow-hidden cursor-pointer transition-all ${
                idx === currentIndex 
                  ? 'ring-2 ring-white scale-110' 
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Modal de pantalla completa para imágenes
const ImageFullscreenModal = ({ 
  images, 
  initialIndex,
  title,
  onClose 
}: { 
  images: string[]; 
  initialIndex: number;
  title: string;
  onClose: () => void;
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev + 1) % images.length);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="relative w-full h-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition-all"
        >
          ✕
        </button>

        <div className="absolute top-4 left-4 z-20 text-white bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg">
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="text-xs opacity-75">{currentIndex + 1} / {images.length}</p>
        </div>

        <div className="relative w-full h-full flex items-center justify-center p-8">
          <img
            src={images[currentIndex]}
            alt={`${title} - ${currentIndex + 1}`}
            className="max-w-full max-h-[85vh] object-contain"
          />
        </div>

        {images.length > 1 && (
          <>
            <button
              onClick={() => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition-all text-2xl"
            >
              ◀
            </button>
            <button
              onClick={() => setCurrentIndex((prev) => (prev + 1) % images.length)}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition-all text-2xl"
            >
              ▶
            </button>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/50 backdrop-blur-sm px-3 py-2 rounded-full">
              {images.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-12 h-12 rounded-lg overflow-hidden cursor-pointer transition-all ${
                    idx === currentIndex 
                      ? 'ring-2 ring-white scale-110' 
                      : 'opacity-50 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>

            <a
              href={images[currentIndex]}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-4 right-4 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition-all"
            >
              ⬇
            </a>
          </>
        )}
      </div>
    </div>,
    document.body
  );
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
  
  // Estado para ocultar/mostrar sección superior
  const [showTopSection, setShowTopSection] = useState(true);
  
  // Ad spend states
  const [adSpendFromDate, setAdSpendFromDate] = useState(todayPY());
  const [adSpendToDate, setAdSpendToDate] = useState(todayPY());
  const [adAmount, setAdAmount] = useState<number>(0);
  const [adNote, setAdNote] = useState<string>('');
  const [adTargetType, setAdTargetType] = useState<'global' | 'producto'>('global');
  const [adTargetProductId, setAdTargetProductId] = useState<string>('');
  const [userFavorites, setUserFavorites] = useState<Set<string>>(new Set());
  const [editProduct, setEditProduct] = useState<(Product & { isNew?: boolean }) | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imgIndex, setImgIndex] = useState<Record<string, number>>({});
  const [viewingImage, setViewingImage] = useState<{ url: string; title: string; index?: number } | null>(null);
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

  const loadAdSpends = useCallback(async () => {
    if (!myEmail || !adSpendFromDate || !adSpendToDate) return;

    try {
      let query = supabase
        .from('ad_spend')
        .select('*')
        .gte('spend_date', adSpendFromDate)
        .lte('spend_date', adSpendToDate)
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
  }, [myEmail, role, adSpendFromDate, adSpendToDate, selectedProvider, selectedProductId]);

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
        if (p.sku) productMapBySku.set(String(p.sku).trim(), p);
        productMapById.set(p.id, p);
      });

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', `${fromDate}T00:00:00`)
        .lte('created_at', `${toDate}T23:59:59`);

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
        const orderSku = getOrderSku(order);
        const orderProductId = getOrderProductId(order);
        const orderProviderEmail = getOrderProviderEmail(order);
        const orderSellerEmail = getOrderSellerEmail(order);

        const product =
          productMapById.get(orderProductId) ||
          productMapBySku.get(orderSku) ||
          products.find((p) => String(p.sku || '').trim() === orderSku);

        if (!product) return;

        const productProviderEmail = normalizeEmail(product.provider_email);

        if (!canUserSeeProduct(product, role, myEmail)) return;

        if (role === 'provider' && productProviderEmail !== myEmail && orderProviderEmail !== myEmail) return;
        if (role === 'seller' && orderSellerEmail && orderSellerEmail !== myEmail) return;

        if (selectedProvider !== 'todos' && productProviderEmail !== selectedProvider && orderProviderEmail !== selectedProvider) return;
        if (selectedProductId !== 'todos' && product.id !== selectedProductId) return;

        const m = next[product.id] || {
          ...emptyMetrics,
          product_id: product.id,
          sku: product.sku || orderSku,
        };

        const qty = getOrderQuantity(order);
        const unitFallbackPrice = Number(product.provider_price_gs || 0) * qty;
        const saleAmount = getOrderAmount(order, unitFallbackPrice);
        const realCost = Number(product.real_cost_gs || 0) * qty;
        const status = getOrderStatus(order);
        const billed = Boolean(
          order.is_billed ||
            order.facturado ||
            order.billed ||
            order.invoiced ||
            isBilledStatus(status)
        );
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
      toast.error(error?.message || 'No se pudieron cargar métricas. Revisá la tabla orders.');
    } finally {
      setMetricsLoading(false);
    }
  }, [role, myEmail, visibleProductIds.length, fromDate, toDate, products, selectedProvider, selectedProductId]);

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

    if (!adSpendToDate) {
      toast.error('Seleccioná una fecha de gasto');
      return;
    }

    if (!adAmount || Number(adAmount) <= 0) {
      toast.error('Ingresá un gasto publicitario válido');
      return;
    }

    if (adTargetType === 'producto' && !adTargetProductId) {
      toast.error('Seleccioná el producto para asignar el gasto');
      return;
    }

    const spendDate = adSpendToDate;
    const targetProductId = adTargetType === 'producto' ? adTargetProductId : null;
    const selectedAdProduct = products.find((p) => p.id === targetProductId);

    const providerEmail =
      role === 'provider'
        ? myEmail
        : selectedAdProduct?.provider_email || (selectedProvider !== 'todos' ? selectedProvider : null);

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
      setAdTargetType('global');
      setAdTargetProductId('');
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

  // Colores suaves para proveedores
  const softColors = [
    'from-blue-500/5 to-blue-600/5 border-blue-200/30',
    'from-emerald-500/5 to-emerald-600/5 border-emerald-200/30',
    'from-purple-500/5 to-purple-600/5 border-purple-200/30',
    'from-amber-500/5 to-amber-600/5 border-amber-200/30',
    'from-rose-500/5 to-rose-600/5 border-rose-200/30',
    'from-cyan-500/5 to-cyan-600/5 border-cyan-200/30',
    'from-indigo-500/5 to-indigo-600/5 border-indigo-200/30',
    'from-teal-500/5 to-teal-600/5 border-teal-200/30',
    'from-orange-500/5 to-orange-600/5 border-orange-200/30',
    'from-pink-500/5 to-pink-600/5 border-pink-200/30',
  ];

  return (
    <div className="app-card space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h3 className="text-2xl font-extrabold tracking-tight">Productos</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Catálogo con métricas, facturación real y rentabilidad por fechas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={`nav-btn !px-4 !py-2.5 !text-sm ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            ▦ Vista Grid
          </button>
          <button
            className={`nav-btn !px-4 !py-2.5 !text-sm ${viewMode === 'compact' ? 'active' : ''}`}
            onClick={() => setViewMode('compact')}
          >
            ☰ Vista Compacta
          </button>
          <button
            className={`nav-btn !px-4 !py-2.5 !text-sm ${showTopSection ? 'active' : ''}`}
            onClick={() => setShowTopSection(!showTopSection)}
          >
            {showTopSection ? '🔽 Ocultar panel' : '🔼 Mostrar panel'}
          </button>
        </div>
      </div>

      {/* Sección superior ocultable */}
      {showTopSection && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary/80 to-secondary/40 p-5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Facturación real</div>
              <div className="font-black text-2xl mt-2">{nf(totals.realRevenue)} Gs</div>
              <div className="text-xs text-muted-foreground mt-1">Solo pedidos entregados</div>
            </div>

            <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary/80 to-secondary/40 p-5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Ganancia bruta</div>
              <div className="font-black text-2xl mt-2">{nf(totals.grossProfit)} Gs</div>
              <div className="text-xs text-muted-foreground mt-1">Facturación real - costo</div>
            </div>

            <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary/80 to-secondary/40 p-5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Publicidad total</div>
              <div className="font-black text-2xl mt-2">{nf(totals.totalAdSpend)} Gs</div>
              <div className="text-xs text-muted-foreground mt-1">Global + productos</div>
            </div>

            <div className={`rounded-2xl border p-5 ${totals.netProfit >= 0 ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5' : 'border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-500/5'}`}>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Ganancia neta</div>
              <div className={`font-black text-2xl mt-2 ${totals.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{nf(totals.netProfit)} Gs</div>
              <div className="text-xs text-muted-foreground mt-1">Bruta - publicidad</div>
            </div>
          </div>

          {/* Filtros y Métricas */}
          <div className="rounded-2xl border border-border bg-background/60 p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-extrabold text-base">Filtros de métricas</div>
                <div className="text-xs text-muted-foreground">Seleccioná el período para calcular ventas, entregas y ganancias</div>
              </div>
              {metricsLoading && <span className="chip text-xs">🔄 Actualizando métricas...</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="app-label text-xs">Desde</label>
                <input type="date" className="app-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>

              <div>
                <label className="app-label text-xs">Hasta</label>
                <input type="date" className="app-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>

              <div>
                <label className="app-label text-xs">Proveedor</label>
                <select
                  className="app-input"
                  value={selectedProvider}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value);
                    setSelectedProductId('todos');
                  }}
                >
                  <option value="todos">Todos los proveedores</option>
                  {providerOptions.map(([email, name]) => (
                    <option key={email} value={email}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="app-label text-xs">Producto</label>
                <select className="app-input" value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
                  <option value="todos">Todos los productos</option>
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="app-label text-xs">Ordenar por</label>
                <select className="app-input" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="recientes">📅 Más recientes</option>
                  <option value="mas_vendidos">🏆 Más vendidos</option>
                  <option value="mas_entregados">🚚 Más entregados</option>
                  <option value="mayor_facturacion">💰 Mayor facturación</option>
                  <option value="mayor_ganancia">📈 Mayor ganancia</option>
                  <option value="stock_bajo">⚠️ Stock bajo</option>
                </select>
              </div>
            </div>

            <div>
              <label className="app-label text-xs">Buscar producto</label>
              <input
                className="app-input"
                placeholder="Nombre, SKU o proveedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Gasto Publicitario */}
          <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary/40 to-secondary/20 p-5 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-extrabold text-base">💰 Registrar Gasto Publicitario</div>
                <div className="text-xs text-muted-foreground">Podés asignar el gasto a un período específico (desde - hasta) y asociarlo a un producto o dejarlo global</div>
              </div>
              <div className="flex gap-2">
                <span className="chip text-xs bg-primary/20">Total: {nf(totals.totalAdSpend)} Gs</span>
                <span className="chip text-xs">Global: {nf(generalAdSpend)} Gs</span>
                <span className="chip text-xs">Productos: {nf(totalProductAdSpend)} Gs</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="app-label text-xs">📅 Gasto desde</label>
                    <input type="date" className="app-input" value={adSpendFromDate} onChange={(e) => setAdSpendFromDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="app-label text-xs">📅 Gasto hasta</label>
                    <input type="date" className="app-input" value={adSpendToDate} onChange={(e) => setAdSpendToDate(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="app-label text-xs">🎯 Asignar gasto a</label>
                  <div className="flex gap-3 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="global"
                        checked={adTargetType === 'global'}
                        onChange={(e) => {
                          setAdTargetType(e.target.value as 'global' | 'producto');
                          if (e.target.value === 'global') setAdTargetProductId('');
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Global / General</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="producto"
                        checked={adTargetType === 'producto'}
                        onChange={(e) => setAdTargetType(e.target.value as 'global' | 'producto')}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Producto específico</span>
                    </label>
                  </div>
                </div>

                {adTargetType === 'producto' && (
                  <div>
                    <label className="app-label text-xs">📦 Seleccionar producto</label>
                    <select className="app-input" value={adTargetProductId} onChange={(e) => setAdTargetProductId(e.target.value)}>
                      <option value="">-- Elegir producto --</option>
                      {productOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} {p.sku ? `· ${p.sku}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="app-label text-xs">💵 Monto (Gs)</label>
                    <input
                      type="number"
                      className="app-input font-mono"
                      value={adAmount || ''}
                      onChange={(e) => setAdAmount(Number(e.target.value))}
                      placeholder="Ej: 50000"
                    />
                  </div>
                  <div>
                    <label className="app-label text-xs">📝 Nota / Plataforma</label>
                    <input
                      className="app-input"
                      value={adNote}
                      onChange={(e) => setAdNote(e.target.value)}
                      placeholder="Facebook, TikTok, Google..."
                    />
                  </div>
                </div>

                <button className="nav-btn active w-full py-3 text-sm font-bold" onClick={saveAdSpend}>
                  💾 Guardar gasto publicitario
                </button>
              </div>

              <div className="space-y-3">
                <div className="font-bold text-sm flex items-center gap-2">
                  📋 Últimos gastos registrados
                  <span className="chip text-xs">{adSpends.length} gastos</span>
                </div>
                
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-2">
                  {adSpends.length > 0 ? (
                    adSpends.map((s) => {
                      const product = products.find((p) => p.id === s.product_id);
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/80 p-3 hover:shadow-md transition-all group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold">
                                {product ? `📦 ${product.title}` : '🌍 Gasto Global'}
                              </span>
                              {product && <span className="chip text-[10px]">{product.sku}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>📅 {s.spend_date}</span>
                              {s.note && <span>📌 {s.note}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm font-mono">{nf(s.amount_gs)} Gs</span>
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity nav-btn !px-2 !py-1 !text-xs" onClick={() => deleteAdSpend(s.id)}>
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No hay gastos registrados en el período seleccionado
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tabs y acciones */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {(['general', 'favoritos', 'privados'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`nav-btn px-4 py-2.5 ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'general' && '📦 Todos los productos'}
              {t === 'favoritos' && '⭐ Mis favoritos'}
              {t === 'privados' && '🔒 Productos privados'}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          {canEdit && (
            <button className="nav-btn active px-4 py-2.5" onClick={openAdd}>
              + Agregar producto
            </button>
          )}
          <span className="chip text-xs px-3 py-1.5">{filtered.length} productos</span>
          <span className="chip text-xs px-3 py-1.5">📦 {totals.sold} vendidos</span>
          <span className="chip text-xs px-3 py-1.5">🚚 {totals.delivered} entregados</span>
        </div>
      </div>

      {/* Lista de productos */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-muted-foreground text-sm mt-3">Cargando productos...</p>
        </div>
      )}

      {grouped.map((group, groupIndex) => {
        const colorIndex = groupIndex % softColors.length;
        const headerColor = softColors[colorIndex];
        
        return (
          <div key={group.email || group.name} className="space-y-4">
            {/* Header del proveedor */}
            <div className={`flex flex-col lg:flex-row lg:items-center gap-4 p-4 rounded-2xl border bg-gradient-to-r ${headerColor} backdrop-blur-sm transition-all hover:shadow-md`}>
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {group.logo && group.logo.trim() !== '' ? (
                  <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm p-0.5 border-2 border-border shadow-md flex-shrink-0">
                    <img
                      src={group.logo}
                      alt={group.name}
                      className="w-full h-full rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          const initialsDiv = document.createElement('div');
                          initialsDiv.className = 'w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/20 flex items-center justify-center font-bold text-base text-primary';
                          initialsDiv.textContent = getInitials(group.name);
                          parent.appendChild(initialsDiv);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/20 flex items-center justify-center font-bold text-base text-primary shadow-md flex-shrink-0">
                    {getInitials(group.name)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
                    <span>Proveedor</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50"></span>
                  </div>
                  <div className="font-extrabold text-lg truncate">{group.name}</div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-2 mt-0.5">
                    <span>📧 {group.email}</span>
                    {group.phone && <span>📱 {group.phone}</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 flex-1">
                <div className="text-center bg-background/50 rounded-lg p-2">
                  <div className="font-black text-sm">{group.items.length}</div>
                  <div className="text-[10px] text-muted-foreground">Productos</div>
                </div>
                <div className="text-center bg-background/50 rounded-lg p-2">
                  <div className="font-black text-sm">{group.totals.sold}</div>
                  <div className="text-[10px] text-muted-foreground">Vendidos</div>
                </div>
                <div className="text-center bg-background/50 rounded-lg p-2">
                  <div className="font-black text-sm">{group.totals.delivered}</div>
                  <div className="text-[10px] text-muted-foreground">Entregados</div>
                </div>
                <div className="text-center bg-background/50 rounded-lg p-2">
                  <div className="font-black text-sm">{group.totals.deliveryRate}%</div>
                  <div className="text-[10px] text-muted-foreground">Entrega</div>
                </div>
                {canSeeMoney && (
                  <>
                    <div className="text-center bg-background/50 rounded-lg p-2">
                      <div className="font-black text-sm">{nf(group.totals.realRevenue)}</div>
                      <div className="text-[10px] text-muted-foreground">Facturación</div>
                    </div>
                    <div className="text-center bg-background/50 rounded-lg p-2">
                      <div className={`font-black text-sm ${group.totals.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {nf(group.totals.netProfit)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Ganancia neta</div>
                    </div>
                  </>
                )}
              </div>

              {group.phone && canLoadOrder && (
                <a
                  href={`https://wa.me/${group.phone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 nav-btn !px-4 !py-2.5 text-sm font-bold text-[#25D366] hover:!bg-[#25D366]/10 transition-all"
                >
                  <span>💬</span> WhatsApp
                </a>
              )}
            </div>

            <div className={`h-px bg-gradient-to-r ${headerColor.split(' ')[0]} from-${headerColor.split(' ')[0].split('/')[0]}/30 to-transparent ml-4`}></div>

            <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5' : 'space-y-3'}>
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
                      className="bg-secondary border border-border rounded-xl p-3 flex flex-col md:flex-row gap-3 md:items-center hover:shadow-md transition-all group"
                    >
                      <div 
                        className="w-16 h-16 rounded-xl bg-gradient-to-br from-background to-secondary/30 border border-border overflow-hidden flex items-center justify-center shrink-0 cursor-pointer relative group"
                        onClick={() => mainImg && setViewingImage({ url: mainImg, title: p.title, index: 0 })}
                      >
                        {mainImg ? (
                          <>
                            <img src={mainImg} alt={p.title} className="w-full h-full object-contain p-1 transition-transform group-hover:scale-110" />
                            {images.length > 1 && (
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-white text-[10px] font-bold bg-black/60 px-1.5 py-0.5 rounded-full">
                                  +{images.length}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] text-muted-foreground text-center px-1">Sin img</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase text-muted-foreground font-bold">SKU: {p.sku || '—'}</div>
                        <div className="font-extrabold text-sm truncate">{p.title}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stockCritical && <span className="chip text-[10px] bg-red-500/15">⚠️ Stock bajo</span>}
                          {topProduct && <span className="chip text-[10px] bg-emerald-500/15">🔥 Top ventas</span>}
                          {isPrivateProduct(p) && <span className="chip text-[10px]">🔒 Privado</span>}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
                        <div><div className="font-black text-sm">{m.sold_count}</div><div className="text-[10px] text-muted-foreground">Vend.</div></div>
                        <div><div className="font-black text-sm">{m.delivered_count}</div><div className="text-[10px] text-muted-foreground">Ent.</div></div>
                        <div><div className="font-black text-sm">{deliveryRate}%</div><div className="text-[10px] text-muted-foreground">Efic.</div></div>
                        {canSeeMoney && (
                          <>
                            <div><div className="font-black text-sm">{nf(productAdSpend)}</div><div className="text-[10px] text-muted-foreground">Ads</div></div>
                            <div><div className={`font-black text-sm ${netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{nf(netProfit)}</div><div className="text-[10px] text-muted-foreground">Neto</div></div>
                          </>
                        )}
                      </div>

                      <div className="flex gap-1 justify-end">
                        <button className="nav-btn !px-2 !py-1 text-sm" onClick={() => toggleFavorite(p.id)}>{isFav ? '★' : '☆'}</button>
                        {canEdit && <button className="nav-btn !px-2 !py-1 text-sm" onClick={() => openEdit(p)}>✏️</button>}
                        {canLoadOrder && p.sku && <button className="nav-btn active !px-2 !py-1 text-sm" onClick={() => onLoadProduct?.(p.sku!)}>➕</button>}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={p.id}
                    className="bg-secondary border border-border rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-xl relative group"
                  >
                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${headerColor.split(' ')[0]} ${headerColor.split(' ')[1]} z-10`} />

                    <div
                      className="relative w-full h-56 overflow-hidden bg-gradient-to-br from-background to-secondary/20 border-b border-border cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    >
                      <ProductImageGallery
                        images={images}
                        title={p.title}
                        onViewFullscreen={(url) => setViewingImage({ url, title: p.title, index: 0 })}
                        currentIndex={imgIndex[p.id] || 0}
                        onIndexChange={(idx) => setImgIndex((prev) => ({ ...prev, [p.id]: idx }))}
                      />

                      <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                        {stockCritical && <span className="chip text-[10px] bg-red-500/20 border-red-500/40 backdrop-blur-sm">⚠️ Stock bajo</span>}
                        {topProduct && <span className="chip text-[10px] bg-emerald-500/20 border-emerald-500/40 backdrop-blur-sm">🔥 Top ventas</span>}
                        {isPrivateProduct(p) && <span className="chip text-[10px] backdrop-blur-sm">🔒 Privado</span>}
                      </div>

                      <button
                        className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-lg border border-border hover:scale-110 transition-transform"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(p.id);
                        }}
                      >
                        {isFav ? '★' : '☆'}
                      </button>
                    </div>

                    <div
                      className="p-4 flex flex-col gap-3 flex-grow cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                          SKU: {p.sku || '—'}
                        </div>
                        <span className="chip text-[10px]">✅ {deliveryRate}% entrega</span>
                      </div>
                      
                      <div className="font-extrabold text-base leading-tight line-clamp-2">{p.title}</div>

                      {p.description && !isExpanded && (
                        <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
                      )}

                      {isExpanded && p.description && (
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">{p.description}</div>
                      )}

                      <div className="grid grid-cols-3 gap-2 mt-1">
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
                      </div>

                      {canSeeMoney && (
                        <div className="rounded-xl border border-border bg-background/70 p-3 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Facturación real</span>
                            <b className="font-mono">{nf(m.real_revenue_gs)} Gs</b>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Gasto publicitario</span>
                            <b className="font-mono">{nf(productAdSpend)} Gs</b>
                          </div>
                          <div className="flex justify-between text-sm pt-1 border-t border-border">
                            <span className="font-bold">Ganancia neta</span>
                            <b className={`font-mono ${netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{nf(netProfit)} Gs</b>
                          </div>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="rounded-xl border border-border bg-background/70 p-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                          <div>Cancelación: <b>{cancelRate}%</b></div>
                          <div>Facturación bruta: <b>{nf(m.gross_revenue_gs)} Gs</b></div>
                          <div>Stock actual: <b>{p.stock ?? 0}</b></div>
                          {canSeeRealCost && <div>Stock real: <b>{p.real_stock ?? 0}</b></div>}
                          <div>Precio venta: <b>{nf(Number(p.provider_price_gs || 0))} Gs</b></div>
                          {canSeeRealCost && <div>Ganancia/unidad: <b>{nf(gainUnit)} Gs</b></div>}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center px-4 py-3 border-t border-border bg-background/80">
                      <div>
                        <span className="font-extrabold text-base font-mono">{nf(Number(p.provider_price_gs || 0))} Gs</span>
                        {canSeeRealCost && (
                          <div className="text-[10px] text-muted-foreground">Ganancia: {nf(gainUnit)} Gs/unidad</div>
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        {mainImg && (
                          <button
                            className="nav-btn !px-2.5 !py-1.5 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingImage({ url: mainImg, title: p.title, index: 0 });
                            }}
                          >
                            👁️ Ver
                          </button>
                        )}

                        {canEdit && (
                          <button
                            className="nav-btn !px-2.5 !py-1.5 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(p);
                            }}
                          >
                            ✏️ Editar
                          </button>
                        )}

                        {canLoadOrder && p.sku && (
                          <button
                            className="nav-btn active !px-2.5 !py-1.5 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoadProduct?.(p.sku!);
                            }}
                          >
                            ➕ Cargar pedido
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && !loading && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-muted-foreground">No se encontraron productos</p>
          <p className="text-sm text-muted-foreground mt-1">Probá con otros filtros o agregá un nuevo producto</p>
        </div>
      )}

      {/* Modal de edición */}
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

      {/* Modal de imagen fullscreen */}
      {viewingImage && (
        <ImageFullscreenModal
          images={getImages(products.find(p => p.title === viewingImage.title) || products[0])}
          initialIndex={viewingImage.index || 0}
          title={viewingImage.title}
          onClose={() => setViewingImage(null)}
        />
      )}
    </div>
  );
}
