import { useState, useEffect, useMemo, useCallback } from 'react';
import ImageUploadField from './ImageUploadField';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);
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
}

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

// Función para obtener color según nivel de stock
const getStockColor = (stock: number | null) => {
  const qty = stock ?? 0;
  if (qty <= 0) return 'text-red-600 font-bold';
  if (qty < 10) return 'text-orange-500 font-semibold';
  return 'text-green-600';
};

// Función para obtener color del stock real
const getRealStockColor = (stock: number | null) => {
  const qty = stock ?? 0;
  if (qty <= 0) return 'text-red-600 font-bold';
  if (qty < 10) return 'text-orange-500 font-semibold';
  return 'text-green-600';
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
  const [tab, setTab] = useState<Tab>('general');
  const [userFavorites, setUserFavorites] = useState<Set<string>>(new Set());
  const [editProduct, setEditProduct] = useState<(Product & { isNew?: boolean }) | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imgIndex, setImgIndex] = useState<Record<string, number>>({});
  const [viewingImage, setViewingImage] = useState<{ url: string; title: string } | null>(null);
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());

  // Escuchar cambios en tiempo real en los productos
  useEffect(() => {
    const subscription = supabase
      .channel('products_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [load]);

  // Cargar favoritos desde Supabase
  const loadFavorites = useCallback(async () => {
    if (!myEmail) return;

    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .select('product_id')
        .eq('user_email', myEmail);

      if (error) throw error;

      setUserFavorites(new Set(data?.map(f => f.product_id) || []));
    } catch (error) {
      console.error('Error cargando favoritos:', error);
    }
  }, [myEmail]);

  // Guardar/eliminar favorito en Supabase
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

        setUserFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });

        toast.success('❌ Eliminado de tus favoritos');
      } else {
        const { error } = await supabase
          .from('user_favorites')
          .insert({
            user_email: myEmail,
            product_id: productId
          });

        if (error) throw error;

        setUserFavorites(prev => new Set([...prev, productId]));
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

  useEffect(() => {
    load();
    loadFavorites();
  }, [load, loadFavorites]);

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

    if (search) {
      const q = norm(search);
      list = list.filter((p) => {
        const hay = [p.title, p.sku, p.provider_email, p.description]
          .map((v) => norm(String(v || '')))
          .join(' ');
        return hay.includes(q);
      });
    }

    return list;
  }, [products, tab, search, userFavorites, role, myEmail]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { email: string; name: string; logo: string; phone: string; items: Product[] }
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
        });
      }

      map.get(key)!.items.push(p);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [filtered, profileMap]);

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

  const canEdit = ['admin', 'provider', 'despachante'].includes(role);
  const canSeeRealCost = ['admin', 'provider'].includes(role);
  const canLoadOrder = ['seller', 'despachante', 'delivery'].includes(role);

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Productos</h3>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        {(['general', 'favoritos', 'privados'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`nav-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'general' ? '📦 General' : t === 'favoritos' ? '⭐ Favoritos' : '🔒 Privados'}
          </button>
        ))}

        <input
          className="app-input min-w-[220px] flex-1"
          placeholder="🔎 Buscar por nombre, SKU o proveedor"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {canEdit && <button className="nav-btn active" onClick={openAdd}>+ Agregar producto</button>}

        <span className="chip text-[10px]">{filtered.length} productos</span>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Cargando...</p>}

      {grouped.map((group) => {
        const showLogo = group.logo && group.logo.trim() !== '' && !failedLogos.has(group.email);
        const logoKey = group.email;

        return (
          <div key={group.email || group.name} className="mb-6">
            <div className="flex items-center gap-3 mb-3 p-3 rounded-xl border border-border bg-secondary/50">
              {showLogo ? (
                <img
                  src={group.logo}
                  alt={group.name}
                  className="w-10 h-10 rounded-full object-cover border border-border"
                  onError={() => {
                    setFailedLogos(prev => new Set([...prev, logoKey]));
                  }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-sm text-primary">
                  {getInitials(group.name)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Proveedor
                </div>
                <div className="font-extrabold text-sm truncate">{group.name}</div>
                <div className="text-[10px] text-muted-foreground">{group.email}</div>
              </div>

              {group.phone && canLoadOrder && (
                <a
                  href={`https://wa.me/${group.phone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 nav-btn !px-3 !py-2 !text-xs font-bold text-[#25D366] hover:!bg-[#25D366]/10"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>
              )}

              <span className="chip text-[10px]">
                {group.items.length} producto{group.items.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {group.items.map((p) => {
                const images = getImages(p);
                const mainImg = images[imgIndex[p.id] || 0] || '';
                const isFav = userFavorites.has(p.id);
                const gainUnit = Number(p.provider_price_gs || 0) - Number(p.real_cost_gs || 0);
                const isExpanded = expandedId === p.id;

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
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                        SKU: {p.sku || '—'}
                      </div>
                      <div className="font-extrabold text-[17px] leading-tight">{p.title}</div>

                      {p.description && !isExpanded && (
                        <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
                      )}

                      {isExpanded && p.description && (
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">{p.description}</div>
                      )}

                      <div className="flex flex-wrap gap-1.5 mt-auto">
                        <span className={`chip text-[10px] ${getStockColor(p.stock)}`}>
                          📦 Stock: {p.stock ?? 0}
                        </span>
                        {canSeeRealCost && (
                          <span className={`chip text-[10px] ${getRealStockColor(p.real_stock)}`}>
                            📊 Real: {p.real_stock ?? 0}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center px-3.5 py-3 border-t border-border bg-background/80">
                      <div>
                        <span className="font-extrabold text-sm">{nf(Number(p.provider_price_gs || 0))} Gs</span>
                        {canSeeRealCost && (
                          <div className="text-[10px] text-muted-foreground">
                            💰 Gan/u: {gainUnit >= 0 ? nf(gainUnit) : `-${nf(Math.abs(gainUnit))}`} Gs
                          </div>
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
                            ✏️ Editar
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
        );
      })}

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
                      🗑️ Eliminar
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <button className="nav-btn" onClick={() => setEditProduct(null)}>
                    Cancelar
                  </button>
                  <button className="nav-btn active" onClick={saveProduct}>
                    💾 Guardar
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
