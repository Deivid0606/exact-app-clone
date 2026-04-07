import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

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
}

const emptyProduct: Omit<Product, 'id'> = {
  title: '', sku: '', provider_price_gs: 0, real_cost_gs: 0, stock: 0, real_stock: 0,
  image_url: '', image_url_2: '', image_url_3: '', description: '', provider_email: '', private_to_emails: '', is_private: false,
};

export default function ProductsView({ onLoadProduct }: { onLoadProduct?: (sku: string) => void }) {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const myEmail = profile?.email || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [profiles, setProfiles] = useState<{ email: string; name: string | null; logo_url: string | null }[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('general');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`favorites_${myEmail}`) || '[]'); } catch { return []; }
  });
  const [editProduct, setEditProduct] = useState<(Product & { isNew?: boolean }) | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imgIndex, setImgIndex] = useState<Record<string, number>>({});
  const [viewingImage, setViewingImage] = useState<{ url: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [prodRes, profRes] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('email, name, logo_url'),
    ]);
    setProducts((prodRes.data || []) as Product[]);
    setProfiles(profRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Save favorites to localStorage
  useEffect(() => {
    if (myEmail) localStorage.setItem(`favorites_${myEmail}`, JSON.stringify(favorites));
  }, [favorites, myEmail]);

  const toggleFavorite = (sku: string) => {
    setFavorites(prev => prev.includes(sku) ? prev.filter(s => s !== sku) : [...prev, sku]);
  };

  const profileMap = useMemo(() => {
    const m: Record<string, { name: string; logo: string }> = {};
    profiles.forEach(p => { m[p.email.toLowerCase()] = { name: p.name || p.email, logo: p.logo_url || '' }; });
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    let list = products;
    if (tab === 'favoritos') list = list.filter(p => p.sku && favorites.includes(p.sku));
    if (tab === 'privados') list = list.filter(p => {
      const allowed = (p.private_to_emails || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      return allowed.includes(myEmail.toLowerCase());
    });
    if (search) {
      const q = norm(search);
      list = list.filter(p => {
        const hay = [p.title, p.sku, p.provider_email, p.description].map(norm).join(' ');
        return hay.includes(q);
      });
    }
    return list;
  }, [products, tab, search, favorites, myEmail]);

  // Group by provider
  const grouped = useMemo(() => {
    const map = new Map<string, { email: string; name: string; logo: string; items: Product[] }>();
    filtered.forEach(p => {
      const key = (p.provider_email || '__sin_proveedor__').toLowerCase().trim();
      if (!map.has(key)) {
        const info = profileMap[key] || { name: p.provider_email || 'Sin proveedor', logo: '' };
        map.set(key, { email: p.provider_email || '', name: info.name, logo: info.logo, items: [] });
      }
      map.get(key)!.items.push(p);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [filtered, profileMap]);

  const getImages = (p: Product) => [p.image_url, p.image_url_2, p.image_url_3].filter(Boolean) as string[];
  const getInitials = (name: string) => name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'PR';

  const openAdd = () => {
    setEditProduct({
      id: '', ...emptyProduct, isNew: true,
      provider_email: role === 'PROVEEDOR' ? myEmail : '',
    } as any);
  };

  const openEdit = (p: Product) => setEditProduct({ ...p });

  const saveProduct = async () => {
    if (!editProduct) return;
    const { isNew, id, ...data } = editProduct as any;
    if (!data.title || !data.sku) { toast.error('Título y SKU son obligatorios'); return; }
    if (role === 'PROVEEDOR') data.provider_email = myEmail;

    if (isNew) {
      const { error } = await supabase.from('products').insert(data);
      if (error) { toast.error(error.message); return; }
      toast.success('Producto creado');
    } else {
      const { error } = await supabase.from('products').update(data).eq('id', id);
      if (error) { toast.error(error.message); return; }
      toast.success('Producto actualizado');
    }
    setEditProduct(null);
    load();
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('¿Estás seguro de que querés eliminar este producto?')) return;
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) { toast.error(error.message); return; }
    toast.success('Producto eliminado');
    setEditProduct(null);
    load();
  };

  const canEdit = role === 'ADMIN' || role === 'PROVEEDOR' || role === 'DESPACHANTE';
  const canSeeRealCost = role === 'ADMIN' || role === 'PROVEEDOR';

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Productos</h3>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        {(['general', 'favoritos', 'privados'] as Tab[]).map(t => (
          <button key={t} className={`nav-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'general' ? '📦 General' : t === 'favoritos' ? '⭐ Favoritos' : '🔒 Privados'}
          </button>
        ))}
        <input className="app-input min-w-[220px] flex-1" placeholder="🔎 Buscar por nombre, SKU o proveedor"
          value={search} onChange={e => setSearch(e.target.value)} />
        {canEdit && (
          <button className="nav-btn active" onClick={openAdd}>+ Agregar producto</button>
        )}
        <span className="chip text-[10px]">{filtered.length} productos</span>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Cargando...</p>}

      {/* Grouped by provider */}
      {grouped.map(group => (
        <div key={group.email} className="mb-6">
          {/* Provider header */}
          <div className="flex items-center gap-3 mb-3 p-3 rounded-xl border border-border bg-secondary/50">
            {group.logo ? (
              <img src={group.logo} alt={group.name} className="w-10 h-10 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-sm text-primary">
                {getInitials(group.name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Proveedor</div>
              <div className="font-extrabold text-sm truncate">{group.name}</div>
              <div className="text-[10px] text-muted-foreground">{group.email}</div>
            </div>
            <span className="chip text-[10px]">{group.items.length} producto{group.items.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Product cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {group.items.map(p => {
              const images = getImages(p);
              const mainImg = images[imgIndex[p.id] || 0] || '';
              const isFav = p.sku ? favorites.includes(p.sku) : false;
              const gainUnit = Number(p.provider_price_gs || 0) - Number(p.real_cost_gs || 0);
              const isExpanded = expandedId === p.id;

              return (
                <div key={p.id} className="bg-secondary border border-border rounded-[18px] overflow-hidden
                  flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative group">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary to-primary/60 opacity-85 z-10" />

                  {/* Image */}
                  <div className="relative w-full h-[180px] overflow-hidden bg-background border-b border-border flex items-center justify-center"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    {mainImg ? (
                      <img src={mainImg} alt={p.title} className="max-w-full max-h-full object-contain p-2" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Sin imagen</div>
                    )}
                    {/* Favorite button */}
                    {p.sku && (
                      <button className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center text-lg border border-border hover:scale-110 transition-transform"
                        onClick={e => { e.stopPropagation(); toggleFavorite(p.sku!); }}>
                        {isFav ? '★' : '☆'}
                      </button>
                    )}
                  </div>

                  {/* Thumbnails if multiple images */}
                  {images.length > 1 && (
                    <div className="flex gap-1 px-2 py-1.5 border-b border-border bg-background/50">
                      {images.map((url, i) => (
                        <img key={i} src={url} alt="" className={`w-12 h-12 rounded-lg object-cover cursor-pointer border-2 transition-all ${(imgIndex[p.id] || 0) === i ? 'border-primary' : 'border-border opacity-60 hover:opacity-100'}`}
                          onClick={() => setImgIndex(prev => ({ ...prev, [p.id]: i }))} />
                      ))}
                    </div>
                  )}

                  {/* Body */}
                  <div className="p-3.5 flex flex-col gap-2 flex-grow min-h-[120px]" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">SKU: {p.sku || '—'}</div>
                    <div className="font-extrabold text-[17px] leading-tight">{p.title}</div>
                    {p.description && !isExpanded && (
                      <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
                    )}
                    {isExpanded && p.description && (
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap">{p.description}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-auto">
                      <span className="chip text-[10px]">Stock: {p.stock ?? 0}</span>
                      {canSeeRealCost && <span className="chip text-[10px]">Real: {p.real_stock ?? 0}</span>}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-between items-center px-3.5 py-3 border-t border-border bg-background/80">
                    <div>
                      <span className="font-extrabold text-sm">{nf(Number(p.provider_price_gs || 0))} Gs</span>
                      {canSeeRealCost && (
                        <div className="text-[10px] text-muted-foreground">Gan/u: {nf(gainUnit)} Gs</div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {mainImg && (
                        <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={e => { e.stopPropagation(); setViewingImage({ url: mainImg, title: p.title }); }}>👁 Ver</button>
                      )}
                      {canEdit && (
                        <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={e => { e.stopPropagation(); openEdit(p); }}>Editar</button>
                      )}
                      {role === 'VENDEDOR' && p.sku && (
                        <button className="nav-btn active !px-2 !py-1 !text-[10px]" onClick={e => { e.stopPropagation(); onLoadProduct?.(p.sku!); }}>➕ Cargar</button>
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

      {/* Edit/Add Product Modal */}
      {editProduct && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-start justify-center p-2 sm:p-4 overflow-auto" onClick={() => setEditProduct(null)}>
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 w-full max-w-3xl my-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold">{(editProduct as any).isNew ? '➕ Agregar Producto' : '✏️ Editar Producto'}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="app-label">Título *</label>
                <input className="app-input" value={editProduct.title} onChange={e => setEditProduct({ ...editProduct, title: e.target.value })} />
              </div>
              <div>
                <label className="app-label">SKU *</label>
                <input className="app-input" value={editProduct.sku || ''} onChange={e => setEditProduct({ ...editProduct, sku: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Precio venta (Gs)</label>
                <input type="number" className="app-input" value={editProduct.provider_price_gs || 0} onChange={e => setEditProduct({ ...editProduct, provider_price_gs: Number(e.target.value) })} />
              </div>
              <div>
                <label className="app-label">Costo real (Gs)</label>
                <input type="number" className="app-input" value={editProduct.real_cost_gs || 0} onChange={e => setEditProduct({ ...editProduct, real_cost_gs: Number(e.target.value) })} />
              </div>
              <div>
                <label className="app-label">Stock</label>
                <input type="number" className="app-input" value={editProduct.stock || 0} onChange={e => setEditProduct({ ...editProduct, stock: Number(e.target.value) })} />
              </div>
              <div>
                <label className="app-label">Stock real</label>
                <input type="number" className="app-input" value={editProduct.real_stock || 0} onChange={e => setEditProduct({ ...editProduct, real_stock: Number(e.target.value) })} />
              </div>
              <div>
                <label className="app-label">Imagen URL 1</label>
                <input className="app-input" value={editProduct.image_url || ''} onChange={e => setEditProduct({ ...editProduct, image_url: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Imagen URL 2</label>
                <input className="app-input" value={editProduct.image_url_2 || ''} onChange={e => setEditProduct({ ...editProduct, image_url_2: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Imagen URL 3</label>
                <input className="app-input" value={editProduct.image_url_3 || ''} onChange={e => setEditProduct({ ...editProduct, image_url_3: e.target.value })} />
              </div>
              {role !== 'PROVEEDOR' && (
                <div>
                  <label className="app-label">Email proveedor</label>
                  <input className="app-input" value={editProduct.provider_email || ''} onChange={e => setEditProduct({ ...editProduct, provider_email: e.target.value })} />
                </div>
              )}
              <div className="col-span-1 sm:col-span-2">
                <label className="app-label">Privado para (emails separados por coma)</label>
                <input className="app-input" value={editProduct.private_to_emails || ''} onChange={e => setEditProduct({ ...editProduct, private_to_emails: e.target.value })} placeholder="email1@x.com, email2@x.com" />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="app-label">Descripción</label>
                <textarea className="app-input min-h-[80px]" value={editProduct.description || ''} onChange={e => setEditProduct({ ...editProduct, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 justify-between">
              <div>
                {!(editProduct as any).isNew && (
                  <button className="nav-btn !bg-destructive/20 hover:!bg-destructive/40 text-destructive" onClick={() => deleteProduct(editProduct.id)}>Eliminar</button>
                )}
              </div>
              <div className="flex gap-2">
                <button className="nav-btn" onClick={() => setEditProduct(null)}>Cancelar</button>
                <button className="nav-btn active" onClick={saveProduct}>Guardar</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Image Viewer Modal */}
      {viewingImage && createPortal(
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4" onClick={() => setViewingImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <img src={viewingImage.url} alt={viewingImage.title} className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl" />
            <div className="flex gap-3 items-center">
              <span className="text-white font-bold text-sm">{viewingImage.title}</span>
              <a href={viewingImage.url} download target="_blank" rel="noopener noreferrer"
                className="nav-btn active !px-4 !py-2 !text-xs">
                ⬇ Descargar
              </a>
              <button className="nav-btn !px-4 !py-2 !text-xs" onClick={() => setViewingImage(null)}>Cerrar</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
