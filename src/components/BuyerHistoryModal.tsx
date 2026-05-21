import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, History, Package, Truck, XCircle, CheckCircle } from 'lucide-react';

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
  delivery_success_rate: number;
  recent_orders: any[];
}

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

// Componente Dialog simple sin shadcn/ui
const SimpleDialog = ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) => {
  if (!open) return null;
  
  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={() => onOpenChange(false)}
      >
        <div 
          className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>
  );
};

const SimpleDialogHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b px-6 py-4">
    {children}
  </div>
);

const SimpleDialogTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xl font-semibold flex items-center gap-2">
    {children}
  </h2>
);

const SimpleDialogContent = ({ children }: { children: React.ReactNode }) => (
  <div className="px-6 py-4">
    {children}
  </div>
);

export function BuyerHistoryModal({ open, onOpenChange, phone, customerName }: BuyerHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<OrderHistory | null>(null);

  useEffect(() => {
    if (open && phone) {
      loadBuyerHistory();
    }
  }, [open, phone]);

  const loadBuyerHistory = async () => {
    setLoading(true);
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('phone', phone)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const totalOrders = orders?.length || 0;
      
      const delivered = orders?.filter(o => o.status === 'delivered' || o.status === 'entregado').length || 0;
      const cancelled = orders?.filter(o => o.status === 'cancelled' || o.status === 'cancelado').length || 0;
      const returned = orders?.filter(o => o.status === 'returned' || o.status === 'devuelto').length || 0;
      const inTransit = orders?.filter(o => o.status === 'in_transit' || o.status === 'transito' || o.status === 'enviado').length || 0;
      
      let totalProducts = 0;
      orders?.forEach(order => {
        if (order.items_json && Array.isArray(order.items_json)) {
          totalProducts += order.items_json.reduce((sum, item) => sum + (item.qty || 0), 0);
        }
      });

      const successRate = totalOrders > 0 ? (delivered / totalOrders) * 100 : 0;

      setHistory({
        total_orders: totalOrders,
        delivered,
        cancelled,
        returned,
        in_transit: inTransit,
        total_products: totalProducts,
        delivery_success_rate: successRate,
        recent_orders: orders?.slice(0, 5) || []
      });
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      'delivered': { color: 'bg-green-100 text-green-800', text: 'Entregada' },
      'entregado': { color: 'bg-green-100 text-green-800', text: 'Entregada' },
      'cancelled': { color: 'bg-red-100 text-red-800', text: 'Cancelada' },
      'cancelado': { color: 'bg-red-100 text-red-800', text: 'Cancelada' },
      'returned': { color: 'bg-orange-100 text-orange-800', text: 'Devuelta' },
      'devuelto': { color: 'bg-orange-100 text-orange-800', text: 'Devuelta' },
      'in_transit': { color: 'bg-blue-100 text-blue-800', text: 'En tránsito' },
      'transito': { color: 'bg-blue-100 text-blue-800', text: 'En tránsito' },
      'enviado': { color: 'bg-blue-100 text-blue-800', text: 'Enviado' }
    };
    const statusInfo = statusMap[status?.toLowerCase()] || { color: 'bg-gray-100 text-gray-800', text: status || 'Desconocido' };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>{statusInfo.text}</span>;
  };

  return (
    <SimpleDialog open={open} onOpenChange={onOpenChange}>
      <SimpleDialogHeader>
        <SimpleDialogTitle>
          <History className="w-5 h-5" />
          Historial del comprador
        </SimpleDialogTitle>
        <div className="text-sm text-gray-600 mt-1">
          {customerName && <p><strong>Cliente:</strong> {customerName}</p>}
          <p><strong>Teléfono:</strong> {phone}</p>
        </div>
      </SimpleDialogHeader>

      <SimpleDialogContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !history || history.total_orders === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p>No se encontraron órdenes previas para este número</p>
            <p className="text-sm mt-2">Cliente esporádico</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <Package className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                <div className="text-2xl font-bold text-blue-700">{history.total_orders}</div>
                <div className="text-xs text-blue-600">Total órdenes</div>
                <div className="text-sm font-semibold mt-1">{nf(history.total_products)} productos</div>
              </div>

              <div className="bg-green-50 rounded-lg p-4 text-center">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-600" />
                <div className="text-2xl font-bold text-green-700">{history.delivered}</div>
                <div className="text-xs text-green-600">Entregas exitosas</div>
                <div className="text-sm font-semibold mt-1">{history.delivery_success_rate.toFixed(0)}% éxito</div>
              </div>

              <div className="bg-red-50 rounded-lg p-4 text-center">
                <XCircle className="w-8 h-8 mx-auto mb-2 text-red-600" />
                <div className="text-2xl font-bold text-red-700">{history.cancelled + history.returned}</div>
                <div className="text-xs text-red-600">Canceladas/Devueltas</div>
                <div className="text-xs text-gray-600 mt-1">
                  Cancel: {history.cancelled} | Dev: {history.returned}
                </div>
              </div>

              <div className="bg-yellow-50 rounded-lg p-4 text-center">
                <Truck className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                <div className="text-2xl font-bold text-yellow-700">{history.in_transit}</div>
                <div className="text-xs text-yellow-600">En tránsito</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold mb-2">Probabilidad de entrega</h4>
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  history.delivery_success_rate >= 80 ? 'bg-green-500 text-white' :
                  history.delivery_success_rate >= 50 ? 'bg-yellow-500 text-white' :
                  'bg-red-500 text-white'
                }`}>
                  {history.delivery_success_rate >= 80 ? 'Segura' :
                   history.delivery_success_rate >= 50 ? 'Media' : 'Riesgo'}
                </div>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 rounded-full h-2 transition-all"
                    style={{ width: `${history.delivery_success_rate}%` }}
                  />
                </div>
                <span className="text-sm font-semibold">{history.delivery_success_rate.toFixed(0)}%</span>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Basado en {history.total_orders} órdenes anteriores
              </p>
            </div>

            {history.recent_orders.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3">Últimas órdenes</h4>
                <div className="space-y-2">
                  {history.recent_orders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-mono text-sm font-semibold">{order.order_number}</p>
                          <p className="text-xs text-gray-600">
                            {new Date(order.created_at).toLocaleDateString('es-PY')}
                          </p>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(order.status)}
                          <p className="text-sm font-semibold mt-1">{nf(order.total_gs)} Gs</p>
                        </div>
                      </div>
                      {order.items_json && (
                        <div className="mt-2 text-xs text-gray-600">
                          {order.items_json.map((item: any, idx: number) => (
                            <span key={idx}>
                              {item.title} x{item.qty}
                              {idx < order.items_json.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SimpleDialogContent>
    </SimpleDialog>
  );
}
