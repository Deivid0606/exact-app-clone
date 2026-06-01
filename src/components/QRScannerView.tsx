import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { QrReader } from 'react-qr-reader';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function QRScannerView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const userEmail = profile?.email || '';
  
  const [orderData, setOrderData] = useState<any>(null);
  const [deliveryUsers, setDeliveryUsers] = useState<any[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(true);

  // Obtener ID de la URL si existe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    if (orderId) {
      loadOrderByNumber(orderId);
      setScanning(false);
    }
  }, []);

  const loadOrderByNumber = async (orderNumber: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .single();

    if (error) {
      toast.error('Pedido no encontrado');
      setLoading(false);
      return;
    }

    setOrderData(data);
    
    if (role === 'DELIVERY') {
      if (data.assigned_delivery === userEmail) {
        toast.success('✅ Este pedido ya está asignado a ti');
      } else if (data.assigned_delivery && data.assigned_delivery !== userEmail) {
        toast.error('❌ Este pedido ya está asignado a otro delivery');
        setOrderData(null);
      }
    }
    
    setLoading(false);
  };

  const handleScan = async (result: any) => {
    if (result && !orderData) {
      const scannedText = result?.text || result;
      const match = scannedText.match(/[?&]id=([^&]+)/);
      if (match && match[1]) {
        await loadOrderByNumber(match[1]);
        setScanning(false);
      } else {
        toast.error('QR inválido');
      }
    }
  };

  const handleError = (err: any) => {
    console.error(err);
    toast.error('Error al acceder a la cámara');
  };

  const loadDeliveryUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'DELIVERY')
      .eq('active', true);

    if (!error && data) {
      setDeliveryUsers(data || []);
    }
  };

  const assignOrder = async () => {
    if (!orderData) return;
    
    if (role === 'DELIVERY') {
      const { error } = await supabase
        .from('orders')
        .update({ 
          assigned_delivery: userEmail,
          status2: 'EN RUTA'
        })
        .eq('id', orderData.id);

      if (error) {
        toast.error('Error al asignar');
      } else {
        toast.success('✅ Pedido asignado a ti');
        setOrderData(null);
        setScanning(true);
      }
    } else if (role === 'ADMIN' || role === 'PROVEEDOR') {
      if (!selectedDelivery) {
        toast.error('Selecciona un repartidor');
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({ 
          assigned_delivery: selectedDelivery,
          status2: 'EN RUTA'
        })
        .eq('id', orderData.id);

      if (error) {
        toast.error('Error al asignar');
      } else {
        toast.success(`✅ Asignado a ${selectedDelivery}`);
        setOrderData(null);
        setSelectedDelivery('');
        setScanning(true);
      }
    }
  };

  useEffect(() => {
    if (role === 'ADMIN' || role === 'PROVEEDOR') {
      loadDeliveryUsers();
    }
  }, [role]);

  const renderGuideDetails = (order: any) => {
    const items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : (order.items_json || []);
    
    return (
      <div className="space-y-3">
        <div className="border-b pb-2">
          <h3 className="font-bold text-xl">📋 GUÍA DE ENVÍO — {order.order_number || order.id.slice(0, 8)}</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          <p><span className="font-semibold">Cliente:</span> {order.customer_name}</p>
          <p><span className="font-semibold">Teléfono:</span> {order.phone}</p>
          <p><span className="font-semibold">Email:</span> {order.email || '—'}</p>
          <p><span className="font-semibold">Departamento:</span> {order.departamento || '—'}</p>
          <p><span className="font-semibold">Ciudad:</span> {order.city || '—'}</p>
          <p><span className="font-semibold">Dirección:</span> {order.street || ''}</p>
        </div>
        
        <div className="border-t pt-2">
          <p className="font-semibold">📦 Productos:</p>
          {items.map((item: any, idx: number) => (
            <p key={idx} className="text-sm pl-2">
              {idx + 1}. {item.title} x{item.qty} — Gs {nf(Number(item.sale_gs || 0) * Number(item.qty || 1))}
            </p>
          ))}
        </div>
        
        <div className="border-t pt-2">
          <p className="font-semibold">💰 Total: Gs {nf(Number(order.total_gs || 0))}</p>
        </div>
        
        <div className="border-t pt-2 text-sm">
          <p><span className="font-semibold">👤 Vendedor:</span> {order.created_by || '—'}</p>
          <p><span className="font-semibold">🏢 Proveedor:</span> {order.provider_emails_list || order.provider_email || '—'}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-center mb-6">
            🚚 QR Delivery - Asignar Pedidos
          </h2>
          
          {/* Escáner QR */}
          {scanning && !orderData && (
            <div className="mb-6">
              <div className="bg-black rounded-lg overflow-hidden">
                <QrReader
                  onResult={handleScan}
                  onError={handleError}
                  constraints={{ facingMode: 'environment' }}
                  style={{ width: '100%' }}
                />
              </div>
              <p className="text-center text-sm text-gray-500 mt-2">
                📷 Escanea el código QR del pedido
              </p>
            </div>
          )}
          
          {/* Detalles del pedido */}
          {orderData && (
            <div className="border-2 border-purple-300 rounded-lg p-4 bg-purple-50">
              {renderGuideDetails(orderData)}
              
              <div className="mt-4">
                {role === 'DELIVERY' ? (
                  <button
                    className="w-full bg-green-500 text-white py-2 rounded-lg font-bold"
                    onClick={assignOrder}
                  >
                    ✅ Asignarme este pedido
                  </button>
                ) : (role === 'ADMIN' || role === 'PROVEEDOR') && (
                  <>
                    <select
                      className="w-full p-2 border rounded-lg mb-2"
                      value={selectedDelivery}
                      onChange={(e) => setSelectedDelivery(e.target.value)}
                    >
                      <option value="">Seleccionar repartidor...</option>
                      {deliveryUsers.map(user => (
                        <option key={user.email} value={user.email}>
                          {user.full_name || user.email}
                        </option>
                      ))}
                    </select>
                    <button
                      className="w-full bg-green-500 text-white py-2 rounded-lg font-bold"
                      onClick={assignOrder}
                    >
                      🚚 Asignar pedido
                    </button>
                  </>
                )}
                
                <button
                  className="w-full mt-2 bg-gray-300 text-gray-700 py-2 rounded-lg"
                  onClick={() => {
                    setOrderData(null);
                    setScanning(true);
                  }}
                >
                  🔄 Escanear otro QR
                </button>
              </div>
            </div>
          )}
          
          {!scanning && !orderData && (
            <div className="text-center py-8">
              <button
                className="bg-purple-500 text-white px-6 py-2 rounded-lg"
                onClick={() => setScanning(true)}
              >
                📷 Comenzar a escanear
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
