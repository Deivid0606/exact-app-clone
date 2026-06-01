import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

declare global {
  interface Window {
    Html5Qrcode: any;
  }
}

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function QRScannerView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const userEmail = profile?.email || '';
  
  const [orderData, setOrderData] = useState<any>(null);
  const [deliveryUsers, setDeliveryUsers] = useState<any[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanner, setScanner] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(true);

  // Cargar y iniciar el escáner
  useEffect(() => {
    // Verificar si hay ID en la URL
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    
    if (orderId) {
      // Si hay ID, cargar directamente sin escáner
      loadOrderByNumber(orderId);
      setIsScanning(false);
      return;
    }
    
    // Si no hay ID, iniciar el escáner
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.async = true;
    script.onload = () => {
      initScanner();
    };
    document.body.appendChild(script);
    
    return () => {
      if (scanner) {
        scanner.stop().catch(console.error);
      }
    };
  }, []);

  const initScanner = async () => {
    if (!window.Html5Qrcode) {
      console.log('Esperando librería...');
      setTimeout(initScanner, 500);
      return;
    }
    
    const elementId = "qr-reader";
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.innerHTML = '';
    
    try {
      const html5QrCode = new window.Html5Qrcode(elementId);
      setScanner(html5QrCode);
      
      const config = {
        fps: 10,
        qrbox: { width: 300, height: 300 }
      };
      
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        (errorMessage: string) => {
          // Ignorar errores normales de escaneo
          console.log("Buscando QR...");
        }
      );
      console.log("✅ Escáner iniciado");
    } catch (err) {
      console.error("Error:", err);
      toast.error('No se pudo iniciar la cámara');
    }
  };

  const onScanSuccess = (decodedText: string) => {
    console.log("✅ QR Detectado:", decodedText);
    
    // Extraer el ID del QR
    let orderNumber = null;
    
    // Buscar patrón id=XXX
    const match = decodedText.match(/[?&]id=([^&]+)/);
    if (match) {
      orderNumber = match[1];
    } else if (decodedText.match(/^[A-Z0-9]+$/)) {
      // Si es solo el número
      orderNumber = decodedText;
    }
    
    if (orderNumber) {
      // Detener el escáner
      if (scanner) {
        scanner.stop().catch(console.error);
      }
      // Cargar el pedido
      loadOrderByNumber(orderNumber);
      setIsScanning(false);
    } else {
      toast.error('QR no válido: ' + decodedText.substring(0, 30));
    }
  };

  const loadOrderByNumber = async (orderNumber: string) => {
    setLoading(true);
    console.log("Buscando pedido:", orderNumber);
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .single();

    if (error) {
      console.error("Error:", error);
      toast.error(`Pedido ${orderNumber} no encontrado`);
      setLoading(false);
      return;
    }

    console.log("Pedido encontrado:", data);
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
        // Recargar la página para volver a escanear
        window.location.href = '#/qr';
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
        // Recargar la página para volver a escanear
        window.location.href = '#/qr';
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

  // Si hay un pedido cargado, mostrar detalles
  if (orderData) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-center mb-6">
              🚚 QR Delivery - Asignar Pedidos
            </h2>
            
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
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar escáner
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-center mb-6">
            🚚 QR Delivery - Asignar Pedidos
          </h2>
          
          <div className="mb-6">
            <div 
              id="qr-reader"
              style={{ 
                width: '100%', 
                minHeight: '400px',
                backgroundColor: '#000',
                borderRadius: '12px',
                overflow: 'hidden'
              }}
            ></div>
            <p className="text-center text-sm text-gray-500 mt-4">
              📷 Acerca el código QR a la cámara
            </p>
            <p className="text-center text-xs text-gray-400">
              Asegúrate de tener buena iluminación
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
