import { useState, useEffect } from 'react';
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
  const [scannerActive, setScannerActive] = useState(true);
  const [manualNumber, setManualNumber] = useState('');
  const [scanError, setScanError] = useState('');

  // Inicializar escáner cuando el componente se monta
  useEffect(() => {
    // Verificar si hay ID en la URL
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    if (orderId) {
      console.log("📦 ID encontrado en URL:", orderId);
      loadOrderByNumber(orderId);
      setScannerActive(false);
      return;
    }

    // Cargar script de html5-qrcode
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.onload = () => {
      console.log('✅ Librería cargada');
      startScanner();
    };
    script.onerror = () => {
      toast.error('Error al cargar el escáner');
    };
    document.body.appendChild(script);

    return () => {
      const scanner = (window as any).currentScanner;
      if (scanner) {
        scanner.stop().catch(console.error);
      }
    };
  }, []);

  const startScanner = async () => {
    if (!(window as any).Html5Qrcode) {
      setTimeout(startScanner, 500);
      return;
    }

    const elementId = "qr-reader";
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = '';

    try {
      const html5QrCode = new (window as any).Html5Qrcode(elementId);
      (window as any).currentScanner = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText: string) => {
          console.log("✅ QR DETECTADO:", decodedText);
          
          // Detener escáner inmediatamente
          html5QrCode.stop().catch(console.error);
          
          // Extraer número de pedido de diferentes formatos
          let orderNumber = null;
          
          // Formato 1: ?id=XXX
          const match1 = decodedText.match(/[?&]id=([^&]+)/);
          if (match1) {
            orderNumber = match1[1];
          }
          // Formato 2: #/qr?id=XXX
          const match2 = decodedText.match(/#\/qr\?id=([^&]+)/);
          if (match2) {
            orderNumber = match2[1];
          }
          // Formato 3: Solo el número
          const match3 = decodedText.match(/([A-Z0-9]{10,})/);
          if (match3 && !orderNumber) {
            orderNumber = match3[1];
          }
          
          console.log("🔍 Número de pedido extraído:", orderNumber);
          
          if (orderNumber) {
            setScanError('');
            loadOrderByNumber(orderNumber);
            setScannerActive(false);
          } else {
            setScanError("No se pudo extraer el número de pedido del QR");
            toast.error('QR no válido. Escanea el QR de Delivery.');
            // Reiniciar escáner después de 2 segundos
            setTimeout(() => {
              setScanError('');
              startScanner();
              setScannerActive(true);
            }, 3000);
          }
        },
        (errorMessage: string) => {
          // Ignorar errores normales de escaneo
        }
      );
      console.log("✅ Escáner iniciado - esperando QR");
    } catch (err) {
      console.error("Error al iniciar:", err);
      toast.error('No se pudo iniciar la cámara');
    }
  };

  const loadOrderByNumber = async (orderNumber: string) => {
    setLoading(true);
    console.log("🔍 Buscando pedido en Supabase:", orderNumber);
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .single();

    if (error) {
      console.error("❌ Error al buscar:", error);
      toast.error(`Pedido ${orderNumber} no encontrado`);
      setLoading(false);
      setScannerActive(true);
      // Reiniciar escáner
      setTimeout(() => startScanner(), 1000);
      return;
    }

    console.log("✅ Pedido encontrado:", data);
    setOrderData(data);
    setLoading(false);
  };

  const handleManualSearch = () => {
    if (manualNumber.trim()) {
      loadOrderByNumber(manualNumber.trim());
      setScannerActive(false);
    } else {
      toast.error('Ingresa un número de pedido');
    }
  };

  const resetScanner = () => {
    setOrderData(null);
    setScannerActive(true);
    setManualNumber('');
    setScanError('');
    setTimeout(() => startScanner(), 500);
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
    
    console.log("📦 Asignando pedido:", orderData.order_number);
    console.log("👤 Rol:", role);
    console.log("👤 Usuario:", userEmail);
    
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
        console.error("❌ Error al asignar:", error);
        toast.error('Error al asignar pedido');
      } else {
        console.log("✅ Pedido asignado exitosamente");
        toast.success('✅ Pedido asignado a ti correctamente');
        resetScanner();
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
        console.error("❌ Error al asignar:", error);
        toast.error('Error al asignar pedido');
      } else {
        console.log("✅ Pedido asignado exitosamente a:", selectedDelivery);
        toast.success(`✅ Pedido asignado a ${selectedDelivery}`);
        resetScanner();
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

  // Mostrar pedido encontrado
  if (orderData) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-center mb-6">🚚 Asignar Pedido</h2>
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
                  onClick={resetScanner}
                >
                  🔄 Escanear otro QR
                </button>
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
          
          {scanError && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center">
              ❌ {scanError}
            </div>
          )}
          
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

          <div className="border-t pt-4 mt-2">
            <p className="text-center text-sm text-gray-500 mb-2">O ingresa el número de pedido manualmente:</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 p-2 border rounded-lg"
                placeholder="Ej: A178033883496909665"
                value={manualNumber}
                onChange={(e) => setManualNumber(e.target.value)}
              />
              <button
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                onClick={handleManualSearch}
              >
                Buscar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
