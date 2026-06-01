import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// @ts-ignore
const QrScanner = window.QrScanner;

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

export default function QRScannerView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const userEmail = profile?.email || '';
  
  const [orderData, setOrderData] = useState<any>(null);
  const [deliveryUsers, setDeliveryUsers] = useState<any[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState('');
  const [loading, setLoading] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [scanning, setScanning] = useState(true);

  // Cargar librería QrScanner
  useEffect(() => {
    if (!document.querySelector('#qr-scanner-script')) {
      const script = document.createElement('script');
      script.id = 'qr-scanner-script';
      script.src = 'https://unpkg.com/iqr-scanner@1.4.2/dist/iqr-scanner.min.js';
      script.onload = () => {
        console.log('✅ QR Scanner library loaded');
        setScannerReady(true);
      };
      script.onerror = () => {
        console.error('❌ Failed to load QR scanner');
        toast.error('Error al cargar el escáner');
      };
      document.body.appendChild(script);
    } else {
      setScannerReady(true);
    }

    // Verificar ID en URL
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    if (orderId) {
      loadOrderByNumber(orderId);
      setScanning(false);
    }
  }, []);

  const loadOrderByNumber = async (orderNumber: string) => {
    setLoading(true);
    console.log('Buscando pedido:', orderNumber);
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .single();

    if (error) {
      console.error('Error:', error);
      toast.error(`Pedido ${orderNumber} no encontrado`);
      setLoading(false);
      return;
    }

    console.log('Pedido encontrado:', data);
    setOrderData(data);
    setLoading(false);
  };

  const handleScan = (result: any) => {
    if (result && !orderData) {
      const scannedText = typeof result === 'string' ? result : result.data || result.text;
      console.log('📷 QR Escaneado:', scannedText);
      
      // Extraer el número de pedido
      let orderNumber = null;
      
      // Patrón 1: id=XXX
      const idMatch = scannedText.match(/[?&]id=([^&]+)/);
      if (idMatch) {
        orderNumber = idMatch[1];
      }
      // Patrón 2: Solo el número (sin https)
      else if (scannedText.match(/^[A-Z0-9]{10,}$/)) {
        orderNumber = scannedText;
      }
      // Patrón 3: URL completa con #
      else if (scannedText.includes('#/qr?id=')) {
        const hashMatch = scannedText.match(/#\/qr\?id=([^&]+)/);
        if (hashMatch) orderNumber = hashMatch[1];
      }
      
      if (orderNumber) {
        loadOrderByNumber(orderNumber);
        setScanning(false);
      } else {
        toast.error('QR inválido: ' + scannedText.substring(0, 30));
      }
    }
  };

  const loadDeliveryUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'DELIVERY')
      .eq('active', true);
    if (!error && data) setDeliveryUsers(data || []);
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
      if (error) toast.error('Error al asignar');
      else {
        toast.success('✅ Pedido asignado a ti');
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
      if (error) toast.error('Error al asignar');
      else {
        toast.success(`✅ Pedido asignado a ${selectedDelivery}`);
        window.location.href = '#/qr';
      }
    }
  };

  useEffect(() => {
    if (role === 'ADMIN' || role === 'PROVEEDOR') loadDeliveryUsers();
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
              {idx + 1}. {item.title || item.sku} x{item.qty} — Gs {nf(Number(item.sale_gs || 0) * Number(item.qty || 1))}
            </p>
          ))}
        </div>
        <div className="border-t pt-2">
          <p className="font-semibold">💰 Total: Gs {nf(Number(order.total_gs || 0))}</p>
        </div>
      </div>
    );
  };

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
                  <button className="w-full bg-green-500 text-white py-3 rounded-lg font-bold" onClick={assignOrder}>
                    ✅ Asignarme este pedido
                  </button>
                ) : (role === 'ADMIN' || role === 'PROVEEDOR') && (
                  <>
                    <select className="w-full p-2 border rounded-lg mb-2" value={selectedDelivery} onChange={(e) => setSelectedDelivery(e.target.value)}>
                      <option value="">Seleccionar repartidor...</option>
                      {deliveryUsers.map(user => (
                        <option key={user.email} value={user.email}>{user.full_name || user.email}</option>
                      ))}
                    </select>
                    <button className="w-full bg-green-500 text-white py-3 rounded-lg font-bold" onClick={assignOrder}>
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

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-center mb-6">📷 QR Delivery - Asignar Pedidos</h2>
          
          {scannerReady && scanning ? (
            <div>
              <video id="qr-video" style={{ width: '100%', maxHeight: '400px', objectFit: 'cover' }}></video>
              <canvas id="qr-canvas" style={{ display: 'none' }}></canvas>
              <p className="text-center text-sm text-gray-500 mt-4">
                📷 Acerca el código QR a la cámara
              </p>
              <button 
                className="w-full mt-2 bg-blue-500 text-white py-2 rounded-lg"
                onClick={() => {
                  if (window.IQrScanner) {
                    const video = document.getElementById('qr-video');
                    const scanner = new window.IQrScanner(video, result => handleScan(result));
                    scanner.start();
                  }
                }}
              >
                Iniciar Escáner
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
              <p className="mt-2 text-gray-500">Cargando escáner...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
