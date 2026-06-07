// Modal de detalles del producto - VERSIÓN CORREGIDA (fondo oscuro y tabla de deliveries visible)
const ProductDetailModal = ({
  product,
  metrics,
  productAdSpend,
  onClose,
  onEdit,
  onDelete,
  canEdit,
  canSeeRealStock,
  canSeeRealCost,
  onLoadProduct,
  getImages,
  nf,
  providerName,
  providerPhone,
  isDelivery,
  deliveryStockQuantity,
  showDeliveryStock,
  deliveryStocksList,
  deliveryMovements,
  onRefreshDeliveryStock,
}: {
  product: Product;
  metrics: ProductMetrics;
  productAdSpend: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canSeeRealStock: boolean;
  canSeeRealCost: boolean;
  onLoadProduct?: (sku: string) => void;
  getImages: (p: Product) => string[];
  nf: (n: number) => string;
  providerName?: string;
  providerPhone?: string;
  isDelivery?: boolean;
  deliveryStockQuantity?: number;
  showDeliveryStock?: boolean;
  deliveryStocksList?: { delivery_email: string; quantity: number; delivery_name: string }[];
  deliveryMovements?: DeliveryStockMovement[];
  onRefreshDeliveryStock?: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<"detalles" | "garantias" | "recursos" | "metricas" | "delivery_stock">("detalles");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [metricsFromDate, setMetricsFromDate] = useState(firstDayOfMonth());
  const [metricsToDate, setMetricsToDate] = useState(todayPY());
  const [customMetrics, setCustomMetrics] = useState<ProductMetrics | null>(null);
  const [customMetricsLoading, setCustomMetricsLoading] = useState(false);
  
  const images = getImages(product);
  const stockCritical = isDelivery ? (deliveryStockQuantity || 0) <= 3 : (Number(product.stock || 0) <= 3);
  const gainPerUnit = (Number(product.suggested_price_gs || 0) - Number(product.real_cost_gs || 0));
  const netProfit = (customMetrics?.gross_profit_gs || metrics.gross_profit_gs) - productAdSpend;

  // Función para cargar métricas por fecha
  const loadMetricsByDate = useCallback(async () => {
    if (!metricsFromDate || !metricsToDate) return;
    
    setCustomMetricsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .gte("created_at", `${metricsFromDate}T00:00:00`)
        .lte("created_at", `${metricsToDate}T23:59:59`);

      if (error) throw error;

      let m = {
        ...emptyMetrics,
        product_id: product.id,
        sku: product.sku || "",
      };

      for (const order of data || []) {
        const orderSku = getOrderSku(order);
        if (orderSku !== product.sku) continue;

        const qty = getOrderQuantity(order);
        const unitFallbackPrice = Number(product.provider_price_gs || 0) * qty;
        const saleAmount = getOrderAmount(order, unitFallbackPrice);
        const realCost = Number(product.real_cost_gs || 0) * qty;
        const status = getOrderStatus(order);
        const delivered = isDeliveredStatus(status);
        const cancelled = isCancelledStatus(status);
        const returned = isReturnedStatus(status);
        const noAnswer = isNoAnswerStatus(status);
        const billed = isBilledStatus(status);

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
      }

      setCustomMetrics(m);
    } catch (error) {
      console.error("Error cargando métricas por fecha:", error);
      toast.error("No se pudieron cargar las métricas");
    } finally {
      setCustomMetricsLoading(false);
    }
  }, [product, metricsFromDate, metricsToDate]);

  // Cargar métricas al cambiar fechas
  useEffect(() => {
    if (activeTab === "metricas") {
      loadMetricsByDate();
    }
  }, [activeTab, metricsFromDate, metricsToDate, loadMetricsByDate]);

  const displayMetrics = customMetrics || metrics;

  // Función para establecer fecha a hoy
  const setToday = () => {
    setMetricsFromDate(todayPY());
    setMetricsToDate(todayPY());
  };

  // Función para establecer fecha a este mes
  const setThisMonth = () => {
    setMetricsFromDate(firstDayOfMonth());
    setMetricsToDate(todayPY());
  };

  // Función para establecer fecha al mes pasado
  const setLastMonth = () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    setMetricsFromDate(`${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`);
    setMetricsToDate(`${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, "0")}-${lastMonthEnd.getDate()}`);
  };

  // Solicitar muestra al proveedor
  const requestSample = () => {
    if (providerPhone) {
      const message = encodeURIComponent(`Hola! Me gustaría solicitar una MUESTRA del producto: ${product.title} (SKU: ${product.sku})`);
      window.open(`https://wa.me/${providerPhone.replace(/[^0-9]/g, "")}?text=${message}`, "_blank");
    } else {
      toast.info("No hay número de teléfono del proveedor para solicitar muestra");
    }
  };

  // Ver informe de ventas
  const viewReport = () => {
    toast.info(`Informe de ventas para ${product.title}: ${displayMetrics.sold_count} vendidos, ${displayMetrics.delivered_count} entregados`);
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4 overflow-auto"
      onClick={onClose}
    >
      <div
        className="relative bg-gradient-to-br from-[#0a0d14] via-[#0f1320] to-[#05070b] rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0f1320]/95 backdrop-blur-md border-b border-white/10 p-5 z-10">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-white uppercase">{product.title}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-white/50 font-mono">SKU: {product.sku || "—"}</span>
                <div className="flex gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">Hogar</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">Limpieza</span>
                </div>
              </div>
              <div className="text-xs text-white/40 mt-1">
                Tipo de producto: Simple
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 flex items-center justify-center transition-all"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Imagen del producto */}
          <div className="bg-[#1a1f2e] rounded-xl p-6 flex items-center justify-center min-h-[280px] border border-white/10">
            {images.length > 0 ? (
              <img
                src={images[currentImageIndex]}
                alt={product.title}
                className="max-h-[200px] object-contain cursor-pointer"
              />
            ) : (
              <div className="text-center text-white/40">
                <div className="text-6xl mb-2">📷</div>
                <div className="text-sm">Sin imagen del producto</div>
              </div>
            )}
          </div>
          
          {/* Miniaturas */}
          {images.length > 1 && (
            <div className="flex justify-center gap-2">
              {images.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`w-16 h-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                    idx === currentImageIndex
                      ? "border-primary"
                      : "border-white/20 hover:border-white/40"
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {/* Disponibilidad y Stock */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-xs text-white/50 uppercase mb-1">Producto disponible en:</div>
              <div className="font-medium text-white">
                {product.warehouse_city || "Caaguazú / Asunción"}
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs text-white/50 uppercase mb-1">Stock disponible</div>
                  <div className={`font-bold text-xl ${stockCritical ? "text-red-400" : "text-white"}`}>
                    {isDelivery ? (deliveryStockQuantity || 0) : (product.stock || 0)} unidades
                  </div>
                </div>
                {canSeeRealStock && !isDelivery && (
                  <div className="text-right">
                    <div className="text-xs text-white/50 uppercase mb-1">Stock real / Privado</div>
                    <div className="font-bold text-xl text-white">
                      {product.real_stock || 0} unidades
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Precios */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-xs text-white/50 uppercase mb-1">Precio del proveedor</div>
              <div className="text-2xl font-bold text-white">
                {nf(Number(product.provider_price_gs || 0))} Gs
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-xs text-white/50 uppercase mb-1">Precio sugerido</div>
              <div className="text-2xl font-bold text-primary">
                {nf(Number(product.suggested_price_gs || 0))} Gs
              </div>
              <div className="text-xs text-white/40 mt-1">*Precio sugerido para vender</div>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={requestSample}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <span>🎁</span> Solicitar muestra
            </button>
            <button
              onClick={viewReport}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <span>📊</span> Ver informe
            </button>
          </div>

          {/* Vendido por */}
          <div className="border-t border-white/10 pt-4">
            <div className="text-xs text-white/50 uppercase mb-2">Vendido por:</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-white uppercase">{providerName || product.provider_email || "PROVEEDOR"}</div>
                <div className="text-sm text-white/40">
                  Bodegas: {product.warehouse_city || "CAAGUAZÚ, ASUNCIÓN"}
                </div>
              </div>
              {providerPhone && (
                <a
                  href={`https://wa.me/${providerPhone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-500 hover:text-green-400 text-sm flex items-center gap-1"
                >
                  <span>💬</span> Contactar
                </a>
              )}
            </div>
          </div>

          {/* TABS */}
          <div className="border-b border-white/10">
            <div className="flex gap-6 overflow-x-auto">
              <button
                onClick={() => setActiveTab("detalles")}
                className={`pb-3 text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "detalles"
                    ? "text-primary border-b-2 border-primary"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                Detalles
              </button>
              <button
                onClick={() => setActiveTab("garantias")}
                className={`pb-3 text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "garantias"
                    ? "text-primary border-b-2 border-primary"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                Garantías
              </button>
              <button
                onClick={() => setActiveTab("recursos")}
                className={`pb-3 text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "recursos"
                    ? "text-primary border-b-2 border-primary"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                Recursos adicionales
              </button>
              <button
                onClick={() => setActiveTab("metricas")}
                className={`pb-3 text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "metricas"
                    ? "text-primary border-b-2 border-primary"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                📊 Métricas
              </button>
              {showDeliveryStock && (
                <button
                  onClick={() => setActiveTab("delivery_stock")}
                  className={`pb-3 text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === "delivery_stock"
                      ? "text-primary border-b-2 border-primary"
                      : "text-white/50 hover:text-white/80"
                  }`}
                >
                  🚚 Stock en deliveries
                </button>
              )}
            </div>
          </div>

          {/* CONTENIDO DE TABS */}
          <div className="min-h-[200px]">
            {activeTab === "detalles" && (
              <div className="prose prose-sm prose-invert max-w-none">
                <p className="text-white/80 whitespace-pre-wrap leading-relaxed">
                  {product.description || "✨ Descripción no cargada por el proveedor."}
                </p>
                
                {canSeeRealCost && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <h4 className="text-sm font-semibold text-white mb-2">Información comercial</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/50">Costo real:</span>
                        <span className="font-medium text-white">{nf(Number(product.real_cost_gs || 0))} Gs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Ganancia por unidad (según sugerido):</span>
                        <span className="font-medium text-green-400">{nf(gainPerUnit)} Gs</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "garantias" && (
              <div className="prose prose-sm prose-invert max-w-none">
                <p className="text-white/80 whitespace-pre-wrap">
                  {product.warranty_info || "El proveedor no ha cargado condiciones de garantía aún."}
                </p>
              </div>
            )}

            {activeTab === "recursos" && (
              <div className="prose prose-sm prose-invert max-w-none">
                <div className="text-white/80 whitespace-pre-wrap">
                  {product.additional_resources ? (
                    <div dangerouslySetInnerHTML={{ __html: product.additional_resources.replace(/\n/g, "<br/>") }} />
                  ) : (
                    "El proveedor no ha cargado recursos adicionales aún."
                  )}
                </div>
              </div>
            )}

            {activeTab === "metricas" && (
              <div className="space-y-4">
                {/* Selector de fechas */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="text-xs text-white/50 uppercase mb-2">Filtrar por fecha</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                    <button
                      onClick={setToday}
                      className="text-xs py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-all"
                    >
                      Hoy
                    </button>
                    <button
                      onClick={setThisMonth}
                      className="text-xs py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-all"
                    >
                      Este mes
                    </button>
                    <button
                      onClick={setLastMonth}
                      className="text-xs py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-all"
                    >
                      Mes pasado
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-white/50">Desde</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:border-primary"
                        value={metricsFromDate}
                        onChange={(e) => setMetricsFromDate(e.target.value)}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-white/50">Hasta</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:border-primary"
                        value={metricsToDate}
                        onChange={(e) => setMetricsToDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {customMetricsLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <p className="text-sm text-white/50 mt-2">Cargando métricas...</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                        <div className="text-2xl font-black text-white">{displayMetrics.sold_count}</div>
                        <div className="text-[10px] text-white/50">Vendidos</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                        <div className="text-2xl font-black text-green-400">{displayMetrics.delivered_count}</div>
                        <div className="text-[10px] text-white/50">Entregados</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                        <div className="text-2xl font-black text-red-400">{displayMetrics.cancelled_count}</div>
                        <div className="text-[10px] text-white/50">Cancelados</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                        <div className="text-2xl font-black text-orange-400">{displayMetrics.returned_count}</div>
                        <div className="text-[10px] text-white/50">Devueltos</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                        <div className="text-2xl font-black text-yellow-400">{displayMetrics.no_answer_count}</div>
                        <div className="text-[10px] text-white/50">Sin respuesta</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                        <div className="text-2xl font-black text-blue-400">{displayMetrics.billed_count}</div>
                        <div className="text-[10px] text-white/50">Facturados</div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-xl p-4 space-y-2 border border-white/10">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Facturación real:</span>
                        <span className="font-bold text-white">{nf(displayMetrics.real_revenue_gs)} Gs</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Ganancia bruta:</span>
                        <span className="font-bold text-green-400">{nf(displayMetrics.gross_profit_gs)} Gs</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Gasto publicitario:</span>
                        <span className="font-bold text-orange-400">{nf(productAdSpend)} Gs</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-white/10">
                        <span className="text-white/70 font-medium">Ganancia neta:</span>
                        <span className={`font-bold text-lg ${netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {nf(netProfit)} Gs
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-white/40 text-center">
                      📅 Período: {metricsFromDate} al {metricsToDate}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === "delivery_stock" && showDeliveryStock && (
              <div className="space-y-4">
                {/* Tabla de stock por delivery */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="text-left py-3 px-3 text-white/60 font-medium">Delivery</th>
                        <th className="text-center py-3 px-3 text-white/60 font-medium">Stock actual</th>
                        <th className="text-right py-3 px-3 text-white/60 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryStocksList && deliveryStocksList.length > 0 ? (
                        deliveryStocksList.map((ds) => (
                          <tr key={ds.delivery_email} className="border-b border-white/5 hover:bg-white/5 transition-all">
                            <td className="py-3 px-3">
                              <div className="font-medium text-white">{ds.delivery_name}</div>
                              <div className="text-xs text-white/40">{ds.delivery_email}</div>
                            </td>
                            <td className="text-center py-3 px-3">
                              <span className={`font-bold ${ds.quantity <= 3 ? "text-red-400" : "text-white"}`}>
                                {ds.quantity}
                              </span>
                            </td>
                            <td className="text-right py-3 px-3">
                              {ds.quantity <= 3 ? (
                                <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400">
                                  ⚠️ Stock bajo
                                </span>
                              ) : ds.quantity > 0 ? (
                                <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                                  ✅ Con stock
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/50">
                                  ❌ Sin stock
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="text-center py-8 text-white/40">
                            No hay deliveries con stock asignado
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Movimientos recientes */}
                {deliveryMovements && deliveryMovements.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-white mb-3">📋 Últimos movimientos</h4>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {deliveryMovements.slice(0, 10).map((mov) => (
                        <div key={mov.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg text-sm border border-white/10">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${mov.quantity_change > 0 ? "text-green-400" : "text-red-400"}`}>
                                {mov.quantity_change > 0 ? `+${mov.quantity_change}` : mov.quantity_change}
                              </span>
                              <span className="text-white/70">{mov.reason}</span>
                            </div>
                            <div className="text-xs text-white/40 mt-1">{mov.delivery_email}</div>
                          </div>
                          <div className="text-xs text-white/40">
                            {new Date(mov.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={onRefreshDeliveryStock}
                  className="w-full py-2 rounded-lg bg-white/10 text-white/80 text-sm font-medium hover:bg-white/20 transition-all"
                >
                  🔄 Actualizar
                </button>
              </div>
            )}
          </div>

          {/* Botones de edición y eliminación */}
          {canEdit && (
            <div className="flex gap-3 pt-4 border-t border-white/10">
              <button
                onClick={onEdit}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium py-2 px-4 rounded-lg transition-all border border-white/10"
              >
                ✏️ Editar producto
              </button>
              <button
                onClick={() => {
                  if (confirm(`¿Eliminar "${product.title}" permanentemente?`)) {
                    onDelete();
                    onClose();
                  }
                }}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium py-2 px-4 rounded-lg transition-all border border-red-500/30"
              >
                🗑️ Eliminar producto
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
