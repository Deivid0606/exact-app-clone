import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  Loader2, History, Package, Truck, XCircle, CheckCircle, 
  TrendingUp, TrendingDown, Calendar, DollarSign, MapPin, 
  ShoppingBag, Award, AlertCircle, Clock 
} from 'lucide-react';

interface BuyerHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  customerName: string;
}

interface OrderHistory {
  total_orders: number;
  delivered: number;
  cancelled: number;
  returned: number;
  in_transit: number;
  total_products: number;
  total_spent: number;
  avg_order_value: number;
  delivery_success_rate: number;
  recent_orders: any[];
  carrier_stats: Record<string, { delivered: number; returned: number; in_transit: number }>;
}

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

// Función para extraer SOLO los últimos 6 dígitos del teléfono
const getLast6Digits = (phone: string): string => {
  if (!phone) return '';
  // Eliminar cualquier caracter que no sea número
  const digits = phone.toString().replace(/\D/g, '');
  // Tomar los últimos 6 dígitos
  return digits.slice(-6);
};

// Función para normalizar y buscar por coincidencia de últimos dígitos
const normalizePhoneForSearch = (phone: string): string => {
  return getLast6Digits(phone);
};

const SimpleDialog = ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) => {
  if (!open) return null;
  
  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300"
      onClick={() => onOpenChange(false)}
    >
      <div 
        className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

export function BuyerHistoryModal({ open, onOpenChange, phone, customerName }: BuyerHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<OrderHistory | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    if (open && phone) {
      const last6 = getLast6Digits(phone);
      setSearchTerm(last6);
      loadBuyerHistory(last6);
    }
  }, [open, phone]);

  const loadBuyerHistory = async (last6Digits: string) => {
    setLoading(true);
    try {
      // Buscar por coincidencia en los últimos 6 dígitos
      // Usamos una consulta que busca cualquier teléfono que termine con estos 6 dígitos
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .or(`phone.ilike.%${last6Digits}, phone.ilike.%${last6Digits}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filtrar manualmente para asegurar que coincidan los últimos 6 dígitos
      const filteredOrders = orders?.filter(order => {
        const orderLast6 = getLast6Digits(order.phone);
        return orderLast6 === last6Digits;
      }) || [];

      const totalOrders = filteredOrders?.length || 0;
      
      const delivered = filteredOrders?.filter(o => o.status === 'delivered' || o.status === 'entregado').length || 0;
      const cancelled = filteredOrders?.filter(o => o.status === 'cancelled' || o.status === 'cancelado').length || 0;
      const returned = filteredOrders?.filter(o => o.status === 'returned' || o.status === 'devuelto').length || 0;
      const inTransit = filteredOrders?.filter(o => o.status === 'in_transit' || o.status === 'transito' || o.status === 'enviado').length || 0;
      
      let totalProducts = 0;
      let totalSpent = 0;
      
      filteredOrders?.forEach(order => {
        if (order.items_json && Array.isArray(order.items_json)) {
          totalProducts += order.items_json.reduce((sum, item) => sum + (item.qty || 0), 0);
        }
        totalSpent += order.total_gs || 0;
      });

      const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
      const successRate = totalOrders > 0 ? (delivered / totalOrders) * 100 : 0;

      // Estadísticas por transportadora
      const carrierStats: Record<string, { delivered: number; returned: number; in_transit: number }> = {};
      filteredOrders?.forEach(order => {
        const carrier = order.carrier || 'No especificada';
        if (!carrierStats[carrier]) {
          carrierStats[carrier] = { delivered: 0, returned: 0, in_transit: 0 };
        }
        if (order.status === 'delivered' || order.status === 'entregado') {
          carrierStats[carrier].delivered++;
        } else if (order.status === 'returned' || order.status === 'devuelto') {
          carrierStats[carrier].returned++;
        } else if (order.status === 'in_transit' || order.status === 'transito') {
          carrierStats[carrier].in_transit++;
        }
      });

      setHistory({
        total_orders: totalOrders,
        delivered,
        cancelled,
        returned,
        in_transit: inTransit,
        total_products: totalProducts,
        total_spent: totalSpent,
        avg_order_value: avgOrderValue,
        delivery_success_rate: successRate,
        recent_orders: filteredOrders?.slice(0, 5) || [],
        carrier_stats: carrierStats
      });
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: string; bg: string; text: string; icon: JSX.Element }> = {
      'delivered': { bg: 'bg-emerald-50', color: 'text-emerald-700', text: 'Entregada', icon: <CheckCircle className="w-3 h-3" /> },
      'entregado': { bg: 'bg-emerald-50', color: 'text-emerald-700', text: 'Entregada', icon: <CheckCircle className="w-3 h-3" /> },
      'cancelled': { bg: 'bg-rose-50', color: 'text-rose-700', text: 'Cancelada', icon: <XCircle className="w-3 h-3" /> },
      'cancelado': { bg: 'bg-rose-50', color: 'text-rose-700', text: 'Cancelada', icon: <XCircle className="w-3 h-3" /> },
      'returned': { bg: 'bg-amber-50', color: 'text-amber-700', text: 'Devuelta', icon: <AlertCircle className="w-3 h-3" /> },
      'devuelto': { bg: 'bg-amber-50', color: 'text-amber-700', text: 'Devuelta', icon: <AlertCircle className="w-3 h-3" /> },
      'in_transit': { bg: 'bg-sky-50', color: 'text-sky-700', text: 'En tránsito', icon: <Truck className="w-3 h-3" /> },
      'transito': { bg: 'bg-sky-50', color: 'text-sky-700', text: 'En tránsito', icon: <Truck className="w-3 h-3" /> },
      'enviado': { bg: 'bg-sky-50', color: 'text-sky-700', text: 'Enviado', icon: <Package className="w-3 h-3" /> }
    };
    const statusInfo = statusMap[status?.toLowerCase()] || { bg: 'bg-gray-50', color: 'text-gray-700', text: status || 'Desconocido', icon: <Package className="w-3 h-3" /> };
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}>
        {statusInfo.icon}
        {statusInfo.text}
      </span>
    );
  };

  const getRiskColor = (rate: number) => {
    if (rate >= 80) return { bg: 'bg-emerald-500', text: 'Segura', color: 'emerald' };
    if (rate >= 50) return { bg: 'bg-amber-500', text: 'Media', color: 'amber' };
    return { bg: 'bg-rose-500', text: 'Riesgo', color: 'rose' };
  };

  if (!open) return null;

  return (
    <SimpleDialog open={open} onOpenChange={onOpenChange}>
      {/* Header mejorado */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-t-2xl px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Historial del Comprador</h2>
              <p className="text-sm text-white/70 mt-0.5">Análisis completo de comportamiento</p>
            </div>
          </div>
          <button 
            onClick={() => onOpenChange(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-3 pt-3 border-t border-white/10 flex gap-4 text-sm">
          {customerName && (
            <div className="flex items-center gap-2">
              <div className="p-1 bg-white/10 rounded-lg">
                <ShoppingBag className="w-3 h-3" />
              </div>
              <span>{customerName}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="p-1 bg-white/10 rounded-lg">
              <MapPin className="w-3 h-3" />
            </div>
            <span>***{searchTerm}</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Cargando historial...</p>
          </div>
        ) : !history || history.total_orders === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex p-4 bg-slate-100 rounded-full mb-4">
              <Package className="w-12 h-12 text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">No se encontraron órdenes previas</p>
            <p className="text-sm text-slate-400 mt-1">Cliente esporádico - sin historial de compras</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI Cards mejoradas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <Package className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-200 px-2 py-0.5 rounded-full">Total</span>
                </div>
                <div className="text-2xl font-bold text-blue-900">{history.total_orders}</div>
                <div className="text-xs text-blue-600 mt-1">Órdenes realizadas</div>
                <div className="text-sm font-semibold text-blue-700 mt-2">{nf(history.total_products)} productos</div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-200 px-2 py-0.5 rounded-full">Éxito</span>
                </div>
                <div className="text-2xl font-bold text-emerald-900">{history.delivered}</div>
                <div className="text-xs text-emerald-600 mt-1">Entregas exitosas</div>
                <div className="text-sm font-semibold text-emerald-700 mt-2">{history.delivery_success_rate.toFixed(1)}% éxito</div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-amber-500 rounded-lg">
                    <DollarSign className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-amber-600 bg-amber-200 px-2 py-0.5 rounded-full">Gastos</span>
                </div>
                <div className="text-2xl font-bold text-amber-900">{nf(history.total_spent)}</div>
                <div className="text-xs text-amber-600 mt-1">Total gastado</div>
                <div className="text-sm font-semibold text-amber-700 mt-2">Gs {nf(history.avg_order_value)} promedio</div>
              </div>

              <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-xl p-4 border border-rose-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-rose-500 rounded-lg">
                    <TrendingDown className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-rose-600 bg-rose-200 px-2 py-0.5 rounded-full">Problemas</span>
                </div>
                <div className="text-2xl font-bold text-rose-900">{history.cancelled + history.returned}</div>
                <div className="text-xs text-rose-600 mt-1">Canceladas/Devueltas</div>
                <div className="text-sm font-semibold text-rose-700 mt-2">
                  Cancel: {history.cancelled} | Dev: {history.returned}
                </div>
              </div>
            </div>

            {/* Probabilidad de entrega mejorada */}
            <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl p-5 border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-5 h-5 text-slate-600" />
                <h4 className="font-bold text-slate-800">Probabilidad de Entrega</h4>
              </div>
              <div className="flex items-center gap-4">
                <div className={`px-4 py-2 rounded-full text-sm font-bold text-white shadow-lg ${
                  getRiskColor(history.delivery_success_rate).bg
                }`}>
                  {getRiskColor(history.delivery_success_rate).text}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>Bajo riesgo</span>
                    <span>Alto riesgo</span>
                  </div>
                  <div className="h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        history.delivery_success_rate >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                        history.delivery_success_rate >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                        'bg-gradient-to-r from-rose-400 to-rose-500'
                      }`}
                      style={{ width: `${history.delivery_success_rate}%` }}
                    />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-800">{history.delivery_success_rate.toFixed(1)}%</div>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                <Clock className="w-3 h-3" />
                <span>Basado en {history.total_orders} órdenes anteriores</span>
              </div>
            </div>

            {/* Estadísticas por transportadora */}
            {Object.keys(history.carrier_stats).length > 0 && (
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Truck className="w-5 h-5 text-slate-600" />
                  <h4 className="font-bold text-slate-800">Estadísticas por Transportadora</h4>
                </div>
                <div className="space-y-3">
                  {Object.entries(history.carrier_stats).map(([carrier, stats]) => (
                    <div key={carrier} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div className="font-medium text-slate-700">{carrier}</div>
                      <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle className="w-3 h-3" /> {stats.delivered}
                        </span>
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertCircle className="w-3 h-3" /> {stats.returned}
                        </span>
                        <span className="flex items-center gap-1 text-sky-600">
                          <Truck className="w-3 h-3" /> {stats.in_transit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Últimas órdenes mejoradas */}
            {history.recent_orders.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-slate-600" />
                  <h4 className="font-bold text-slate-800">Últimas Órdenes</h4>
                </div>
                <div className="space-y-3">
                  {history.recent_orders.map((order, idx) => (
                    <div key={order.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                      <div className="flex flex-wrap justify-between items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              #{order.order_number}
                            </span>
                            {getStatusBadge(order.status)}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(order.created_at).toLocaleDateString('es-PY', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {nf(order.total_gs)} Gs
                            </span>
                          </div>
                          {order.items_json && (
                            <div className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
                              {order.items_json.map((item: any, idx: number) => (
                                <span key={idx}>
                                  {item.title} × {item.qty}
                                  {idx < order.items_json.length - 1 && ' • '}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SimpleDialog>
  );
}
