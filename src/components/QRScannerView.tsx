import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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
  const [cameraError, setCameraError] = useState(false);
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cargar la librería HTML5-QRCODE
  useEffect(() => {
    const loadScript = () => {
      if (document.querySelector('script[src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"]')) {
        console.log('Script ya cargado');
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      script.async = true;
      script.onload = () => {
        console.log('Librería QR cargada exitosamente');
        if (scanning && !orderData) {
          setTimeout(() => startCamera(), 500);
        }
      };
      script.onerror = () => {
        console.error('Error al cargar la librería QR');
        toast.error('Error al cargar el escáner QR');
        setCameraError(true);
      };
      document.body.appendChild(script);
    };
    
    loadScript();
    
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  // Obtener ID de la URL
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

  const startCamera = async () => {
    if (!window.Html5Qrcode) {
      console.log('Esperando librería...');
      setTimeout(() => startCamera(), 500);
      return;
    }
    
    if (!containerRef.current) return;
    
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      }
      
      // Limpiar el contenedor
      containerRef.current.innerHTML = '';
      
      const html5QrCode = new window.Html5Qrcode("qr-reader-container");
      scannerRef.current = html5QrCode;
      
      const config = { 
        fps: 10, 
        qrbox: { width: 300, height: 300 },
        aspectRatio: 1.0
      };
      
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText: string) => {
          console.log("QR escaneado:", decodedText);
          const match = decodedText.match(/[?&]id=([^&]+)/);
          if (match && match[1]) {
            loadOrderByNumber(match[1]);
            setScanning(false);
            html5QrCode.stop().catch(console.error);
          } else {
            toast.error('QR inválido - No contiene ID de pedido');
          }
        },
        (errorMessage: string) => {
          // Ignorar errores de escaneo
        }
      );
      setCameraError(false);
    } catch (err) {
      console.error("Error al iniciar cámara:", err);
      setCameraError(true);
      toast.error('No se pudo acceder a la cámara. Verifica permisos.');
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error("Error al detener cámara:", err);
      }
    }
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
          status2: 'EN RUTA',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderData.id);

      if (error) {
        toast.error('Error al asignar pedido');
      } else {
        toast.success('✅ Pedido asignado a ti correctamente');
        setOrderData(null);
        setScanning(true);
        setTimeout(() => startCamera(), 500);
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
          status2: 'EN RUTA',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderData.id);

      if (error) {
        toast.error('Error al asignar pedido');
      } else {
        toast.success(`✅ Pedido asignado a ${selectedDelivery}`);
        setOrderData(null);
        setSelectedDelivery('');
        setScanning(true);
        setTimeout(() => startCamera(), 500);
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
          <p><span className="font-semibold">Dirección:</span> {order.street || ''} {order.district ? `- ${order.district}` : ''}</p>
        </div>
        
        <div className="border-t pt-2">
          <p className="font-semibold">📦 Productos:</p>
          {items.map((item: any, idx: number) => (
            <p key={idx} className="text-sm pl-2">
              {idx + 1}. {item.title || item.sku} x{item.qty} — Gs {nf(Number(item.sale_gs || 0) * Number(item.qty || 1))}
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
          
          {scanning && !orderData && (
            <div className="mb-6">
              <div 
                id="qr-reader-container" 
                ref={containerRef}
                style={{ 
                  width: '100%', 
                  minHeight: '400px',
                  backgroundColor: '#000',
                  borderRadius: '12px',
                  overflow: 'hidden'
                }}
              ></div>
              {cameraError && (
                <div className="text-center mt-4">
                  <p className="text-red-500 mb-2">No se pudo acceder a la cámara</p>
                  <button
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg"
                    onClick={() => {
                      setCameraError(false);
                      startCamera();
                    }}
                  >
                    🔄 Reintentar
                  </button>
                </div>
              )}
              <p className="text-center text-sm text-gray-500 mt-4">
                📷 Escanea el código QR del pedido
              </p>
            </div>
          )}
          
          {orderData && (
            <div className="border-2 border-purple-300 rounded-lg p-4 bg-purple-50">
              {renderGuideDetails(orderData)}
              
              <div className="mt-4">
                {role === 'DELIVERY' ? (
                  <button
                    className="w-full bg-green-500 text-white py-3 rounded-lg font-bold hover:bg-green-600 transition"
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
                      className="w-full bg-green-500 text-white py-3 rounded-lg font-bold hover:bg-green-600 transition"
                      onClick={assignOrder}
                    >
                      🚚 Asignar pedido
                    </button>
                  </>
                )}
                
                <button
                  className="w-full mt-2 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition"
                  onClick={() => {
                    setOrderData(null);
                    setScanning(true);
                    startCamera();
                  }}
                >
                  🔄 Escanear otro QR
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
