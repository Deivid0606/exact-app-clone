import { useState, useEffect, useMemo, useCallback } from 'react';
import ImageUploadField from './ImageUploadField';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// ... [Funciones auxiliares: nf, todayPY, firstDayOfMonth, norm, normalizeEmail, normalizeRole, parsePrivateEmails, etc.] ...
// Mantén todas tus funciones auxiliares exactamente como estaban.
// Para ahorrar espacio, las omito aquí, pero debes mantenerlas.
// ... [Todas las funciones auxiliares hasta getOrderAmount] ...

// ... [Componentes ProductImageGallery e ImageFullscreenModal - mantenerlos igual] ...

// ... [Funciones isPrivateProduct, canUserSeeProduct, statusNorm, isDeliveredStatus, etc.] ...

export default function ProductsView({ onLoadProduct }: { onLoadProduct?: (sku: string) => void }) {
  const { profile } = useAuth();

  const role = normalizeRole(profile?.role);
  const myEmail = normalizeEmail(profile?.email);

  // ... [Todos tus useState: products, profiles, search, loading, metricsLoading, tab, viewMode, sortMode, fromDate, toDate, selectedProvider, selectedProductId, showTopSection, adSpendFromDate, adSpendToDate, adAmount, adNote, adTargetType, adTargetProductId, userFavorites, editProduct, expandedId, imgIndex, viewingImage, metricsByProduct, adSpends, syncingStock] ...
  
  // ... [Todas tus funciones: loadFavorites, toggleFavorite, load, loadAdSpends, loadMetrics, syncStockFromOrders, useEffect para listener de órdenes, etc.] ...

  // ... [Todos tus useMemo: visibleProductIds, profileMap, providerOptions, productOptions, getProductAdSpend, generalAdSpend, totalProductAdSpend, filtered, totals, grouped] ...

  // ... [Funciones auxiliares de UI: getImages, getInitials, openAdd, openEdit, saveProduct, deleteProduct, saveAdSpend, deleteAdSpend] ...

  // Colores suaves para proveedores (se pueden mantener o simplificar)
  const softColors = [
    'from-blue-500/5 to-blue-600/5 border-blue-200/30',
    // ... otros colores
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catálogo con métricas, facturación real y rentabilidad por fechas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'}`}
            onClick={() => setViewMode('grid')}
            title="Vista Grid"
          >
            <span>▦</span>
          </button>
          <button
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'compact' ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'}`}
            onClick={() => setViewMode('compact')}
            title="Vista Compacta"
          >
            <span>☰</span>
          </button>
          <button
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${showTopSection ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'}`}
            onClick={() => setShowTopSection(!showTopSection)}
            title="Mostrar/Ocultar panel de control"
          >
            <span>{showTopSection ? '📈' : '📉'}</span>
          </button>
          {canSeeRealStock && (
            <button
              className="px-3 py-1.5 text-sm rounded-md bg-secondary hover:bg-secondary/80 flex items-center gap-1"
              onClick={syncStockFromOrders}
              disabled={syncingStock}
            >
              {syncingStock ? '🔄' : '🔄'} <span className="hidden sm:inline">Sinc. stock</span>
            </button>
          )}
        </div>
      </div>

      {/* Sección superior ocultable */}
      {showTopSection && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-lg border p-4 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Facturación real</div>
              <div className="text-2xl font-bold mt-1">{nf(totals.realRevenue)} <span className="text-xs font-normal text-muted-foreground">Gs</span></div>
              <div className="text-xs text-muted-foreground mt-1">Solo pedidos entregados</div>
            </div>
            <div className="bg-card rounded-lg border p-4 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ganancia bruta</div>
              <div className="text-2xl font-bold mt-1">{nf(totals.grossProfit)} <span className="text-xs font-normal text-muted-foreground">Gs</span></div>
              <div className="text-xs text-muted-foreground mt-1">Facturación real - costo</div>
            </div>
            <div className="bg-card rounded-lg border p-4 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Publicidad total</div>
              <div className="text-2xl font-bold mt-1">{nf(totals.totalAdSpend)} <span className="text-xs font-normal text-muted-foreground">Gs</span></div>
              <div className="text-xs text-muted-foreground mt-1">Global + productos</div>
            </div>
            <div className={`bg-card rounded-lg border p-4 shadow-sm ${totals.netProfit >= 0 ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'}`}>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ganancia neta</div>
              <div className={`text-2xl font-bold mt-1 ${totals.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>{nf(totals.netProfit)} <span className="text-xs font-normal text-muted-foreground">Gs</span></div>
              <div className="text-xs text-muted-foreground mt-1">Bruta - publicidad</div>
            </div>
          </div>

          {/* Filtros y Métricas */}
          <div className="bg-card rounded-lg border p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-base">Filtros de métricas</h3>
                <p className="text-xs text-muted-foreground">Seleccioná el período para calcular ventas, entregas y ganancias</p>
              </div>
              {metricsLoading && <span className="text-xs bg-muted px-2 py-1 rounded-full">🔄 Actualizando...</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Desde</label>
                <input type="date" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Hasta</label>
                <input type="date" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Proveedor</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={selectedProvider} onChange={(e) => { setSelectedProvider(e.target.value); setSelectedProductId('todos'); }}>
                  <option value="todos">Todos los proveedores</option>
                  {providerOptions.map(([email, name]) => (
                    <option key={email} value={email}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Producto</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
                  <option value="todos">Todos los productos</option>
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Ordenar por</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
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
              <label className="block text-xs font-medium mb-1">Buscar producto</label>
              <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Nombre, SKU o proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Gasto Publicitario */}
          <div className="bg-card rounded-lg border p-4 shadow-sm space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-base">💰 Registrar Gasto Publicitario</h3>
                <p className="text-xs text-muted-foreground">Podés asignar el gasto a un período específico y asociarlo a un producto o dejarlo global</p>
              </div>
              <div className="flex gap-2">
                <span className="text-xs bg-muted px-2 py-1 rounded-full">Total: {nf(totals.totalAdSpend)} Gs</span>
                <span className="text-xs bg-muted px-2 py-1 rounded-full">Global: {nf(generalAdSpend)} Gs</span>
                <span className="text-xs bg-muted px-2 py-1 rounded-full">Productos: {nf(totalProductAdSpend)} Gs</span>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">📅 Gasto desde</label>
                    <input type="date" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={adSpendFromDate} onChange={(e) => setAdSpendFromDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">📅 Gasto hasta</label>
                    <input type="date" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={adSpendToDate} onChange={(e) => setAdSpendToDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">🎯 Asignar gasto a</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" value="global" checked={adTargetType === 'global'} onChange={(e) => { setAdTargetType(e.target.value as 'global' | 'producto'); if (e.target.value === 'global') setAdTargetProductId(''); }} /> Global / General
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" value="producto" checked={adTargetType === 'producto'} onChange={(e) => setAdTargetType(e.target.value as 'global' | 'producto')} /> Producto específico
                    </label>
                  </div>
                </div>
                {adTargetType === 'producto' && (
                  <div>
                    <label className="block text-xs font-medium mb-1">📦 Seleccionar producto</label>
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={adTargetProductId} onChange={(e) => setAdTargetProductId(e.target.value)}>
                      <option value="">-- Elegir producto --</option>
                      {productOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.title} {p.sku ? `· ${p.sku}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">💵 Monto (Gs)</label>
                    <input type="number" className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono" value={adAmount || ''} onChange={(e) => setAdAmount(Number(e.target.value))} placeholder="Ej: 50000" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">📝 Nota / Plataforma</label>
                    <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={adNote} onChange={(e) => setAdNote(e.target.value)} placeholder="Facebook, TikTok, Google..." />
                  </div>
                </div>
                <button className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors" onClick={saveAdSpend}>
                  💾 Guardar gasto publicitario
                </button>
              </div>
              <div className="space-y-3">
                <div className="font-semibold text-sm flex items-center gap-2">
                  📋 Últimos gastos registrados <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{adSpends.length}</span>
                </div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-2">
                  {adSpends.length > 0 ? (
                    adSpends.map((s) => {
                      const product = products.find((p) => p.id === s.product_id);
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 hover:shadow-sm transition-all group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">{product ? `📦 ${product.title}` : '🌍 Gasto Global'}</span>
                              {product && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{product.sku}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>📅 {s.spend_date}</span>
                              {s.note && <span>📌 {s.note}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm">{nf(s.amount_gs)} Gs</span>
                            <button className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100" onClick={() => deleteAdSpend(s.id)}>🗑️</button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">No hay gastos registrados en el período seleccionado</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tabs y acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div className="flex gap-1">
          {(['general', 'favoritos', 'privados'] as Tab[]).map((t) => (
            <button key={t} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t ? 'bg-card border-x border-t border-b-0 text-primary' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTab(t)}>
              {t === 'general' && '📦 Todos'}
              {t === 'favoritos' && '⭐ Favoritos'}
              {t === 'privados' && '🔒 Privados'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors" onClick={openAdd}>
              + Agregar
            </button>
          )}
          <div className="flex gap-1 text-xs bg-muted px-2 py-1 rounded-full">
            <span>{filtered.length} productos</span>
            <span className="text-muted-foreground">•</span>
            <span>📦 {totals.sold} vend.</span>
            <span className="text-muted-foreground">•</span>
            <span>🚚 {totals.delivered} ent.</span>
          </div>
        </div>
      </div>

      {/* Lista de productos */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {!loading && grouped.map((group, groupIndex) => (
        <div key={group.email || group.name} className="space-y-3">
          {/* Header del proveedor minimalista */}
          <div className="flex items-center gap-3 bg-muted/40 p-3 rounded-lg">
            {group.logo ? (
              <img src={group.logo} alt={group.name} className="w-8 h-8 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{getInitials(group.name)}</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{group.name}</div>
              <div className="text-xs text-muted-foreground truncate">{group.email}</div>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="font-mono">{group.items.length} prods</span>
              <span className="font-mono">{group.totals.delivered} ent</span>
              {canSeeMoney && <span className={`font-mono ${group.totals.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{nf(group.totals.netProfit)} Gs</span>}
            </div>
            {group.phone && canLoadOrder && (
              <a href={`https://wa.me/${group.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-1 rounded-full hover:bg-green-500/20 transition-colors">💬 WhatsApp</a>
            )}
          </div>

          {/* Grid o lista de productos */}
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5' : 'space-y-2'}>
            {group.items.map((p) => {
              const images = getImages(p);
              const mainImg = images[imgIndex[p.id] || 0] || '';
              const isFav = userFavorites.has(p.id);
              const gainUnit = Number(p.provider_price_gs || 0) - Number(p.real_cost_gs || 0);
              const isExpanded = expandedId === p.id;
              const m = metricsByProduct[p.id] || emptyMetrics;
              const productAdSpend = getProductAdSpend(p.id);
              const netProfit = m.gross_profit_gs - productAdSpend;
              const deliveryRate = m.sold_count > 0 ? Math.round((m.delivered_count / m.sold_count) * 100) : 0;
              const stockCritical = Number(p.stock || 0) <= 3;
              const topProduct = m.delivered_count >= 10 && deliveryRate >= 70;

              if (viewMode === 'compact') {
                return (
                  <div key={p.id} className="bg-card rounded-lg border p-2 flex items-center gap-3 hover:shadow-sm transition-all group">
                    <div className="w-12 h-12 rounded-md bg-muted overflow-hidden flex-shrink-0 cursor-pointer" onClick={() => mainImg && setViewingImage({ url: mainImg, title: p.title, index: 0 })}>
                      {mainImg ? <img src={mainImg} alt={p.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">📷</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{p.title}</div>
                      <div className="text-[10px] text-muted-foreground">SKU: {p.sku || '—'}</div>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-[10px]">Stock: <b className={stockCritical ? 'text-red-500' : ''}>{p.stock || 0}</b></span>
                        {canSeeRealStock && <span className="text-[10px]">Real: <b>{p.real_stock || 0}</b></span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="text-center min-w-[40px]"><div className="font-bold">{m.sold_count}</div><div className="text-muted-foreground">vend</div></div>
                      <div className="text-center min-w-[40px]"><div className="font-bold">{deliveryRate}%</div><div className="text-muted-foreground">ent</div></div>
                      {canSeeMoney && <div className={`text-center min-w-[70px] font-mono font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{nf(netProfit)}</div>}
                      <div className="flex gap-1">
                        <button className="p-1.5 hover:bg-muted rounded-md" onClick={() => toggleFavorite(p.id)}>{isFav ? '★' : '☆'}</button>
                        {canEdit && <button className="p-1.5 hover:bg-muted rounded-md" onClick={() => openEdit(p)}>✏️</button>}
                        {canLoadOrder && p.sku && <button className="p-1.5 bg-primary/10 text-primary rounded-md hover:bg-primary/20" onClick={() => onLoadProduct?.(p.sku!)}>➕</button>}
                      </div>
                    </div>
                  </div>
                );
              }

              // Vista Grid
              return (
                <div key={p.id} className="group bg-card rounded-xl border overflow-hidden hover:shadow-lg transition-all duration-200 flex flex-col">
                  <div className="relative aspect-square bg-muted/20 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <ProductImageGallery images={images} title={p.title} onViewFullscreen={(url) => setViewingImage({ url, title: p.title, index: 0 })} currentIndex={imgIndex[p.id] || 0} onIndexChange={(idx) => setImgIndex((prev) => ({ ...prev, [p.id]: idx }))} />
                    <div className="absolute top-2 left-2 flex gap-1">
                      {stockCritical && <span className="text-[10px] bg-red-500/90 text-white px-1.5 py-0.5 rounded-full">⚠️ Stock bajo</span>}
                      {topProduct && <span className="text-[10px] bg-emerald-500/90 text-white px-1.5 py-0.5 rounded-full">🔥 Top</span>}
                      {isPrivateProduct(p) && <span className="text-[10px] bg-gray-500/90 text-white px-1.5 py-0.5 rounded-full">🔒 Privado</span>}
                    </div>
                    <button className="absolute top-2 right-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-full text-lg hover:scale-110 transition-transform" onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}>
                      {isFav ? '★' : '☆'}
                    </button>
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="text-[10px] font-mono text-muted-foreground">{p.sku || '—'}</div>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">✅ {deliveryRate}%</span>
                    </div>
                    <div className="font-semibold text-sm leading-tight line-clamp-2">{p.title}</div>
                    {p.description && !isExpanded && <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>}
                    {isExpanded && p.description && <div className="text-xs text-muted-foreground mt-1">{p.description}</div>}
                    <div className="grid grid-cols-3 gap-1 mt-1 text-center">
                      <div className="bg-muted/50 rounded-md p-1"><div className="font-bold text-xs">{m.sold_count}</div><div className="text-[9px] text-muted-foreground">Vendidos</div></div>
                      <div className="bg-muted/50 rounded-md p-1"><div className="font-bold text-xs">{m.delivered_count}</div><div className="text-[9px] text-muted-foreground">Entregados</div></div>
                      <div className="bg-muted/50 rounded-md p-1"><div className="font-bold text-xs">{m.cancelled_count}</div><div className="text-[9px] text-muted-foreground">Cancelados</div></div>
                    </div>
                    {canSeeMoney && (
                      <div className="mt-1 pt-2 border-t">
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Ganancia neta</span><span className={`font-mono font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{nf(netProfit)} Gs</span></div>
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Gasto ads</span><span className="font-mono">{nf(productAdSpend)} Gs</span></div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3 border-t bg-muted/10">
                    <div className="font-bold text-sm font-mono">{nf(Number(p.provider_price_gs || 0))} Gs</div>
                    <div className="flex gap-1">
                      {mainImg && <button className="p-1.5 hover:bg-background rounded-md text-xs" onClick={(e) => { e.stopPropagation(); setViewingImage({ url: mainImg, title: p.title, index: 0 }); }}>👁️</button>}
                      {canEdit && <button className="p-1.5 hover:bg-background rounded-md text-xs" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>✏️</button>}
                      {canLoadOrder && p.sku && <button className="p-1.5 bg-primary/10 text-primary rounded-md text-xs hover:bg-primary/20" onClick={(e) => { e.stopPropagation(); onLoadProduct?.(p.sku!); }}>➕</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <div className="text-4xl mb-2">📦</div>
          <p className="text-muted-foreground">No se encontraron productos</p>
          <p className="text-sm text-muted-foreground">Probá con otros filtros o agregá un nuevo producto</p>
        </div>
      )}

      {/* Modal de edición (sin cambios en estructura) */}
      {editProduct && createPortal(/* ... tu modal de edición existente ... */, document.body)}

      {/* Modal de imagen fullscreen (sin cambios) */}
      {viewingImage && <ImageFullscreenModal images={getImages(products.find(p => p.title === viewingImage.title) || products[0])} initialIndex={viewingImage.index || 0} title={viewingImage.title} onClose={() => setViewingImage(null)} />}
    </div>
  );
}
