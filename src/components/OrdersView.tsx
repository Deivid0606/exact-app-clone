import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const getLocalDate = (value: string | null | undefined) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getSafeDateRange = (fromDate: string, toDate: string) => {
  return fromDate <= toDate
    ? { from: fromDate, to: toDate }
    : { from: toDate, to: fromDate };
};

const STATUS1_ALL = [
  'PENDIENTE', 'EN RUTA', 'ENTREGADO', 'ENCOMIENDA ENTREGADA',
  'CANCELADO', 'REAGENDADO', 'NO CONTESTA', 'RECHAZADO',
  'RECHAZADO EN EL LUGAR', 'NO DESEA', 'CANCELÓ POR WHATSAPP', 'DEVUELTO A DEPÓSITO'
];
const STATUS1_DELIVERY = STATUS1_ALL.filter(s => s !== 'DEVUELTO A DEPÓSITO');
const STATUS2_ALL = ['--', 'GUIA GENERADA', 'FUERA DE COBERTURA', 'CANCELADO', 'REPETIDO', 'RENDIDO'];

interface EditOrder {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  street: string;
  district: string;
  email: string;
  obs: string;
  assigned_at: string;
  provider_email?: string;
}

interface HistoryEntry {
  id: string;
  previous_status: string | null;
  new_status: string;
  changed_by_email: string;
  changed_by_role: string;
  message: string | null;
  attachment_url: string | null;
  created_at: string;
}

function isProviderAllowed(order: any, userEmail: string): boolean {
  const orderProviderEmail = order.provider_email;
  if (!orderProviderEmail) return false;
  return norm(orderProviderEmail) === norm(userEmail);
}

// Componente de gráfico de torta simple
function SimplePieChart({ data }: { data: Record<string, number> }) {
  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];
  
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  let currentAngle = 0;
  
  const segments = Object.entries(data).map(([label, value], index) => {
    const percentage = (value / total) * 100;
    const angle = (value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;
    
    // Calcular coordenadas para el arco
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    
    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);
    
    const largeArc = angle > 180 ? 1 : 0;
    
    const pathData = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;
    
    return { pathData, color: colors[index % colors.length], label, percentage, value };
  });
  
  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="180" viewBox="0 0 100 100" className="mb-3">
        {segments.map((segment, idx) => (
          <path key={idx} d={segment.pathData} fill={segment.color} stroke="#fff" strokeWidth="1" />
        ))}
        <circle cx="50" cy="50" r="25" fill="white" className="dark:fill-gray-900" />
        <text x="50" y="45" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="bold">
          {total}
        </text>
        <text x="50" y="57" textAnchor="middle" fontSize="6" fill="currentColor">
          total
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        {segments.map((segment, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }} />
            <span>{segment.label}: {segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Modal para solicitar comentario y captura MEJORADO
function StatusChangeModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  newStatus,
  uploading 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: (message: string, attachmentUrl: string | null) => void; 
  newStatus: string;
  uploading: boolean;
}) {
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachment(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setAttachment(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      toast.error('Por favor, sube un archivo de imagen válido');
    }
  };

  const handleSubmit = () => {
    if (!message.trim()) {
      toast.error('Debes escribir un comentario');
      return;
    }
    if (!attachment) {
      toast.error('Debes adjuntar una captura de pantalla');
      return;
    }
    onConfirm(message, null);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/70 z-[10000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">
            Cambiar a {newStatus}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Comentario <span className="text-red-500">*</span>
            </label>
            <textarea
              className="app-input w-full min-h-[100px]"
              placeholder="Ej: Llamé 3 veces y no contestó..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Captura de pantalla <span className="text-red-500">*</span>
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/10' : 'border-border'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <span className="text-2xl">📸</span>
                <span className="text-sm text-muted-foreground">
                  Haz clic o arrastra una imagen aquí
                </span>
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, GIF hasta 5MB
                </span>
              </label>
            </div>
            {preview && (
              <div className="mt-3">
                <div className="relative inline-block">
                  <img 
                    src={preview} 
                    alt="Preview" 
                    className="max-h-40 rounded-lg border shadow-sm"
                  />
                  <button
                    onClick={() => {
                      setAttachment(null);
                      setPreview(null);
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button className="nav-btn" onClick={onClose} disabled={uploading}>
            Cancelar
          </button>
          <button className="nav-btn active" onClick={handleSubmit} disabled={uploading}>
            {uploading ? 'Subiendo...' : 'Confirmar cambio'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Componente de Timeline para el historial MEJORADO
function HistoryTimelineItem({ item, statusClass, onImageClick }: { 
  item: HistoryEntry; 
  statusClass: (s: string) => string;
  onImageClick: (url: string) => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className="relative pl-8 pb-6 last:pb-0 before:content-[''] before:absolute before:left-3 before:top-0 before:bottom-0 before:w-0.5 before:bg-gradient-to-b before:from-primary before:to-transparent">
      {/* Círculo de timeline */}
      <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center ring-4 ring-background">
        <div className="w-2 h-2 rounded-full bg-primary"></div>
      </div>
      
      <div className="bg-background border border-border rounded-xl p-4 hover:shadow-lg transition-all duration-200">
        {/* Header del cambio */}
        <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono bg-muted px-2 py-1 rounded-md">
              {new Date(item.created_at).toLocaleString('es-PY', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
              })}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              item.changed_by_role === 'ADMIN' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
              item.changed_by_role === 'DELIVERY' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
              item.changed_by_role === 'PROVEEDOR' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {item.changed_by_role || 'Usuario'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>👤</span>
            <span className="font-mono">{item.changed_by_email}</span>
          </div>
        </div>
        
        {/* Cambio de estado */}
        <div className="flex items-center gap-3 flex-wrap mb-3 p-3 rounded-lg" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.1) 100%)' }}>
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${statusClass(item.previous_status || 'PENDIENTE')}`}>
            {item.previous_status || '—'}
          </span>
          <span className="text-muted-foreground text-lg">→</span>
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${statusClass(item.new_status)}`}>
            {item.new_status}
          </span>
        </div>
        
        {/* Mensaje si existe - CON COLOR MEJORADO */}
        {item.message && (
          <div className="mt-3 p-3 rounded-lg border-l-4 border-amber-500" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0.05) 100%)' }}>
            <div className="flex items-start gap-2">
              <span className="text-base">💬</span>
              <div className="flex-1">
                <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Comentario:</div>
                <div className="text-sm whitespace-pre-wrap">{item.message}</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Adjunto si existe - CON MINIATURA VISIBLE */}
        {item.attachment_url && (
          <div className="mt-3">
            <div 
              className="relative cursor-pointer group inline-block rounded-lg overflow-hidden border border-border"
              onClick={() => onImageClick(item.attachment_url!)}
            >
              <img 
                src={item.attachment_url} 
                alt="Captura adjunta" 
                className="max-h-48 w-auto rounded-lg object-cover transition-transform duration-200 group-hover:scale-105"
                onLoad={() => setImageLoaded(true)}
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-sm font-medium">🔍 Ampliar</span>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => window.open(item.attachment_url!, '_blank')}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/30"
              >
                <span>🖼️</span>
                <span>Abrir en nueva pestaña</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrdersView() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const myEmail = profile?.email || '';

  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => '2024-01-01');
  const [dateTo, setDateTo] = useState(() => getLocalDate(new Date().toISOString()));
  const [loading, setLoading] = useState(false);
  const [editOrder, setEditOrder] = useState<EditOrder | null>(null);
  const [guideText, setGuideText] = useState('');
  const [guideOrderId, setGuideOrderId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Estados para el historial
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderHistory, setOrderHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  
  // Estados para el modal de cambio de estado
  const [statusChangeModal, setStatusChangeModal] = useState<{
    isOpen: boolean;
    orderId: string;
    newStatus: string;
    oldStatus: string;
  }>({
    isOpen: false,
    orderId: '',
    newStatus: '',
    oldStatus: ''
  });

  const fetchAllOrdersPaginated = async () => {
    const pageSize = 1000;
    let from = 0;
    let to = pageSize - 1;
    let allData: any[] = [];
    let keepGoing = true;

    while (keepGoing) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows = data || [];
      allData = [...allData, ...rows];

      if (rows.length < pageSize) {
        keepGoing = false;
      } else {
        from += pageSize;
        to += pageSize;
      }
    }

    return allData;
  };

  const loadOrders = async () => {
    setLoading(true);

    let allOrdersData: any[] = [];

    try {
      allOrdersData = await fetchAllOrdersPaginated();
    } catch (ordersError: any) {
      console.error('Error cargando pedidos:', ordersError);
      toast.error('Error al cargar pedidos: ' + (ordersError?.message || 'Error desconocido'));
      setLoading(false);
      return;
    }

    console.log('TOTAL DE PEDIDOS CARGADOS:', allOrdersData?.length);

    if (allOrdersData && allOrdersData.length > 0) {
      const fechas = allOrdersData.map(o => o.created_at).sort();
      console.log('Pedido más antiguo:', fechas[0]);
      console.log('Pedido más reciente:', fechas[fechas.length - 1]);
    }

    const [deliveriesRes, providersRes] = await Promise.all([
      supabase.from('profiles').select('email, name, user_id').then(async (profilesRes) => {
        const profiles = profilesRes.data || [];
        const { data: roles } = await supabase.from('user_roles').select('user_id, role').eq('role', 'DELIVERY');
        const deliveryUserIds = new Set((roles || []).map(r => r.user_id));
        return profiles.filter(p => deliveryUserIds.has(p.user_id));
      }),
      supabase.from('profiles').select('email, name, company_name').eq('role', 'PROVEEDOR')
    ]);

    setAllOrders(allOrdersData || []);

    const { from, to } = getSafeDateRange(dateFrom, dateTo);

    const filteredByDate = (allOrdersData || []).filter(order => {
      const orderDate = getLocalDate(order.created_at);
      if (!orderDate) return false;
      return orderDate >= from && orderDate <= to;
    });

    console.log('Pedidos después de filtro de fecha:', filteredByDate.length);
    console.log('Rango de fechas seleccionado:', from, 'a', to);

    setOrders(filteredByDate);
    setDeliveries(deliveriesRes);
    setProviders(providersRes.data || []);
    setLoading(false);
    supabase.from('client_prices').select('*').order('city').then(({ data }) => setClientPrices(data || []));
  };

  useEffect(() => {
    if (allOrders.length > 0) {
      const { from, to } = getSafeDateRange(dateFrom, dateTo);

      const filteredByDate = allOrders.filter(order => {
        const orderDate = getLocalDate(order.created_at);
        if (!orderDate) return false;
        return orderDate >= from && orderDate <= to;
      });

      setOrders(filteredByDate);
    }
  }, [dateFrom, dateTo, allOrders]);

  useEffect(() => {
    loadOrders();
  }, []);

  const filtered = useMemo(() => {
    const q = norm(search);
    return orders.filter(o => {
      if (role === 'VENDEDOR' && norm(o.created_by || '') !== norm(myEmail)) return false;
      if (role === 'DELIVERY' && norm(o.assigned_delivery || '') !== norm(myEmail)) return false;
      if (role === 'PROVEEDOR' && !isProviderAllowed(o, myEmail)) return false;

      if (statusFilter && (o.status || 'PENDIENTE') !== statusFilter) return false;

      if (q) {
        const idNum = String(o.order_number || o.id || '').replace(/^[a-z]+/i, '');
        const hay = [o.customer_name, o.phone, o.order_number, o.id, idNum, o.city, o.created_by, o.assigned_delivery, o.provider_email].map(norm).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter, role, myEmail]);

  const postNews = async (message: string, orderNum: string) => {
    await supabase.from('news').insert({
      message, order_id: orderNum, actor_email: myEmail, role_scope: role,
    });
  };

  // Función para subir archivo a Supabase Storage
  const uploadAttachment = async (file: File, orderId: string): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${orderId}_${Date.now()}.${fileExt}`;
    const filePath = `order_attachments/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('order_attachments')
      .upload(filePath, file);
      
    if (uploadError) {
      toast.error('Error al subir la imagen: ' + uploadError.message);
      return null;
    }
    
    const { data: urlData } = supabase.storage
      .from('order_attachments')
      .getPublicUrl(filePath);
      
    return urlData.publicUrl;
  };

  // Función para guardar en el historial
  const saveToHistory = async (
    orderId: string, 
    previousStatus: string, 
    newStatus: string, 
    message?: string, 
    attachmentUrl?: string
  ) => {
    const { error } = await supabase
      .from('order_status_history')
      .insert({
        order_id: orderId,
        previous_status: previousStatus,
        new_status: newStatus,
        changed_by_email: myEmail,
        changed_by_role: role,
        message: message || null,
        attachment_url: attachmentUrl || null
      });
    
    if (error) {
      console.error('Error guardando en historial:', error);
    }
  };

  // Función principal para cambiar estado con validación para Delivery
  const handleStatusChangeWithValidation = async (orderId: string, newStatus: string) => {
    // Verificar si es Delivery y el estado requiere comentario y captura
    if (role === 'DELIVERY' && (newStatus === 'NO CONTESTA' || newStatus === 'CANCELADO')) {
      const order = orders.find(o => o.id === orderId);
      setStatusChangeModal({
        isOpen: true,
        orderId,
        newStatus,
        oldStatus: order?.status || 'PENDIENTE'
      });
      return;
    }
    
    // Si no es Delivery o no requiere validación, proceder normalmente
    await executeStatusChange(orderId, newStatus, '', null);
  };

  // Ejecutar el cambio de estado
  const executeStatusChange = async (
    orderId: string, 
    newStatus: string, 
    message: string = '', 
    attachmentUrl: string | null = null
  ) => {
    if (role === 'DELIVERY' && newStatus === 'DEVUELTO A DEPÓSITO') {
      toast.error('No podés usar DEVUELTO A DEPÓSITO');
      return false;
    }
    
    const order = orders.find(o => o.id === orderId);
    const oldStatus = order?.status || 'PENDIENTE';
    const orderNum = order?.order_number || orderId.slice(0, 8);
    
    const updates: any = { 
      status: newStatus, 
      updated_at: new Date().toISOString() 
    };
    
    if (newStatus === 'ENTREGADO' || newStatus === 'ENCOMIENDA ENTREGADA') {
      updates.delivered_at = new Date().toISOString();
    }
    
    // Guardar en historial
    await saveToHistory(orderId, oldStatus, newStatus, message, attachmentUrl || undefined);
    
    const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (error) { 
      toast.error(error.message); 
      return false;
    }
    
    toast.success(`Estado → ${newStatus}`);
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
    postNews(`Pedido ${orderNum} cambió a ${newStatus} por ${myEmail}`, orderNum);
    return true;
  };

  // Procesar el cambio con comentario y captura
  const processStatusChangeWithData = async (message: string, attachment: File | null) => {
    setUploadingFile(true);
    
    let attachmentUrl = null;
    if (attachment) {
      attachmentUrl = await uploadAttachment(attachment, statusChangeModal.orderId);
    }
    
    await executeStatusChange(
      statusChangeModal.orderId,
      statusChangeModal.newStatus,
      message,
      attachmentUrl
    );
    
    setUploadingFile(false);
    setStatusChangeModal({ isOpen: false, orderId: '', newStatus: '', oldStatus: '' });
  };

  const handleStatus1Change = async (orderId: string, newStatus: string) => {
    await handleStatusChangeWithValidation(orderId, newStatus);
  };

  const handleStatus2Change = async (orderId: string, newStatus2: string) => {
    const val = newStatus2 === '--' ? null : newStatus2;
    const order = orders.find(o => o.id === orderId);
    const orderNum = order?.order_number || orderId.slice(0, 8);

    const updates: any = {
      status2: val,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(val ? `Estado 2 → ${val}` : 'Guía removida: vuelve a Pedidos con guías');

    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));

    if (val) {
      postNews(`Pedido ${orderNum} estado 2 → ${val}`, orderNum);
    } else {
      postNews(`Pedido ${orderNum} quedó sin guía generada por ${myEmail}`, orderNum);
    }
  };

  const handleAssignDelivery = async (orderId: string, deliveryEmail: string) => {
    const order = orders.find(o => o.id === orderId);
    const orderNum = order?.order_number || orderId.slice(0, 8);
    const updates: any = {
      assigned_delivery: deliveryEmail || null,
      assigned_at: deliveryEmail ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    if (deliveryEmail) updates.status = 'EN RUTA';
    const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(deliveryEmail ? `Asignado a ${deliveryEmail}` : 'Delivery removido');
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
    if (deliveryEmail) postNews(`${myEmail} asignó pedido ${orderNum} a ${deliveryEmail}`, orderNum);
  };

  const handleAssignProvider = async (orderId: string, providerEmail: string) => {
    const order = orders.find(o => o.id === orderId);
    const orderNum = order?.order_number || orderId.slice(0, 8);

    const { error } = await supabase
      .from('orders')
      .update({
        provider_email: providerEmail || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(providerEmail ? `Proveedor: ${providerEmail}` : 'Proveedor removido');
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, provider_email: providerEmail } : o));
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, provider_email: providerEmail } : o));
    if (providerEmail) {
      postNews(`${myEmail} asignó pedido ${orderNum} al proveedor ${providerEmail}`, orderNum);
    }
  };

  // Función para cargar el historial de un pedido
  const loadOrderHistory = async (order: any) => {
    setLoadingHistory(true);
    setSelectedOrder(order);
    
    const { data, error } = await supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false });
      
    if (error) {
      toast.error('Error cargando historial: ' + error.message);
      setOrderHistory([]);
    } else {
      setOrderHistory(data || []);
    }
    
    setLoadingHistory(false);
    setHistoryModalOpen(true);
  };

  const openEdit = (o: any) => {
    setEditOrder({
      id: o.id,
      customer_name: o.customer_name || '',
      phone: o.phone || '',
      city: o.city || '',
      street: o.street || '',
      district: o.district || '',
      email: o.email || '',
      obs: o.obs || '',
      assigned_at: o.assigned_at ? new Date(o.assigned_at).toISOString().slice(0, 16) : '',
      provider_email: o.provider_email || '',
    });
  };

  const saveEdit = async () => {
    if (!editOrder) return;
    if (!editOrder.customer_name || !editOrder.phone || !editOrder.city) {
      toast.error('Cliente, teléfono y ciudad son obligatorios');
      return;
    }
    const { id, assigned_at, provider_email, ...data } = editOrder;
    const updates: any = { ...data, updated_at: new Date().toISOString() };
    if (assigned_at) updates.assigned_at = new Date(assigned_at).toISOString();
    if (provider_email !== undefined) updates.provider_email = provider_email;
    const { error } = await supabase.from('orders').update(updates).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Pedido actualizado');
    setAllOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
    setEditOrder(null);
  };

  const cancelOrder = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    const orderNum = order?.order_number || orderId.slice(0, 8);
    
    // Guardar en historial antes de cancelar
    await saveToHistory(orderId, order?.status || 'PENDIENTE', 'CANCELADO', 'Pedido cancelado por usuario');
    
    const { error } = await supabase.from('orders').update({ status: 'CANCELADO', updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success('Pedido cancelado');
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'CANCELADO' } : o));
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'CANCELADO' } : o));
    postNews(`Pedido ${orderNum} fue CANCELADO por ${myEmail}`, orderNum);
  };

  const deleteOrderPermanently = async (orderId: string) => {
    if (!['ADMIN', 'DESPACHANTE', 'PROVEEDOR'].includes(role)) {
      toast.error('No tienes permiso para eliminar pedidos');
      return;
    }

    const order = orders.find(o => o.id === orderId);

    if (role === 'PROVEEDOR' && !isProviderAllowed(order, myEmail)) {
      toast.error('No puedes eliminar pedidos de otros proveedores');
      return;
    }

    const orderNum = order?.order_number || orderId.slice(0, 8);

    const { error } = await supabase.from('orders').delete().eq('id', orderId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Pedido ELIMINADO permanentemente');
    setAllOrders(prev => prev.filter(o => o.id !== orderId));
    setOrders(prev => prev.filter(o => o.id !== orderId));
    await postNews(`Pedido ${orderNum} fue ELIMINADO PERMANENTEMENTE por ${myEmail}`, orderNum);
  };

  const generateGuide = (o: any) => {
    try {
      const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : (o.items_json || []);
      const itemsText = items.map((it: any, i: number) =>
        `${i + 1}. ${it.title || it.sku || 'Item'} x${it.qty || 1} — Gs ${nf(Number(it.sale_gs || 0) * Number(it.qty || 1))}`
      ).join('\n');

      const text = [
        `GUÍA DE ENVÍO — ${o.order_number || o.id.slice(0, 8)}`,
        `━━━━━━━━━━━━━━━━━━`,
        `Cliente: ${o.customer_name || ''}`,
        `Teléfono: ${o.phone || ''}`,
        `Email: ${o.email || ''}`,
        `Ciudad: ${o.city || ''}`,
        `Dirección: ${o.street || ''} ${o.district ? '- ' + o.district : ''}`,
        `━━━━━━━━━━━━━━━━━━`,
        `Productos:`,
        itemsText,
        `━━━━━━━━━━━━━━━━━━`,
        `Total: Gs ${nf(Number(o.total_gs || 0))}`,
        `Delivery: Gs ${nf(Number(o.delivery_gs || 0))}`,
        o.obs ? `Observación: ${o.obs}` : '',
        `━━━━━━━━━━━━━━━━━━`,
        `Vendedor: ${o.created_by || ''}`,
        `Delivery: ${o.assigned_delivery || 'Sin asignar'}`,
        `Proveedor: ${o.provider_email || 'Sin proveedor'}`,
      ].filter(Boolean).join('\n');

      setGuideText(text);
      setGuideOrderId(o.order_number || o.id.slice(0, 8));
    } catch {
      toast.error('Error generando guía');
    }
  };

  const copyGuide = () => {
    navigator.clipboard.writeText(guideText);
    toast.success('Guía copiada al portapapeles');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(o => o.id)));
    }
  };

  const bulkGenerateGuides = () => {
    const selected = filtered.filter(o => selectedIds.has(o.id));
    if (selected.length === 0) { toast.error('Seleccioná pedidos primero'); return; }
    const allText = selected.map(o => {
      const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json || '[]') : (o.items_json || []);
      const itemsText = items.map((it: any, i: number) => `  ${i + 1}. ${it.title || it.sku} x${it.qty}`).join('\n');
      return `${o.order_number || o.id.slice(0, 8)} — ${o.customer_name} — ${o.city}\nTeléfono: ${o.phone}\nDirección: ${o.street || ''} ${o.district || ''}\n${itemsText}\nTotal: Gs ${nf(Number(o.total_gs || 0))}\nProveedor: ${o.provider_email || 'Sin proveedor'}\n${o.obs ? 'Obs: ' + o.obs : ''}`;
    }).join('\n\n════════════════════\n\n');
    navigator.clipboard.writeText(allText);
    toast.success(`${selected.length} guías copiadas`);
  };

  const statusClass = (s: string) => {
    if (s === 'ENTREGADO' || s === 'ENCOMIENDA ENTREGADA') return 'badge-entregado';
    if (['CANCELADO', 'RECHAZADO', 'RECHAZADO EN EL LUGAR', 'NO DESEA', 'CANCELÓ POR WHATSAPP', 'NO CONTESTA'].includes(s)) return 'badge-cancelado';
    if (s === 'EN RUTA') return 'badge-entregado';
    return 'badge-pendiente';
  };

  // Función para obtener estadísticas del historial MEJORADA
  const getHistoryStats = () => {
    const totalChanges = orderHistory.length;
    const uniqueUsers = new Set(orderHistory.map(h => h.changed_by_email)).size;
    const statusCounts: Record<string, number> = {};
    const userChanges: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};
    
    orderHistory.forEach(h => {
      statusCounts[h.new_status] = (statusCounts[h.new_status] || 0) + 1;
      userChanges[h.changed_by_email] = (userChanges[h.changed_by_email] || 0) + 1;
      roleCounts[h.changed_by_role || 'USUARIO'] = (roleCounts[h.changed_by_role || 'USUARIO'] || 0) + 1;
    });
    
    const mostCommonStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0];
    const mostActiveUser = Object.entries(userChanges).sort((a, b) => b[1] - a[1])[0];
    const mostActiveRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0];
    
    // Calcular tiempo promedio entre cambios
    let avgTimeBetweenChanges = 0;
    if (orderHistory.length > 1) {
      let totalDiff = 0;
      for (let i = 0; i < orderHistory.length - 1; i++) {
        const diff = new Date(orderHistory[i].created_at).getTime() - new Date(orderHistory[i + 1].created_at).getTime();
        totalDiff += Math.abs(diff);
      }
      avgTimeBetweenChanges = totalDiff / (orderHistory.length - 1);
    }
    
    return { 
      totalChanges, 
      uniqueUsers, 
      mostCommonStatus,
      mostActiveUser,
      mostActiveRole,
      avgTimeBetweenChanges,
      statusDistribution: statusCounts
    };
  };

  const canEditStatus1 = role !== 'VENDEDOR';
  const canEditStatus2 = role === 'ADMIN' || role === 'DESPACHANTE' || role === 'PROVEEDOR';
  const canAssign = role === 'ADMIN' || role === 'PROVEEDOR';
  const canEdit = role === 'ADMIN' || role === 'DESPACHANTE' || role === 'PROVEEDOR';
  const canDeletePermanently = ['ADMIN', 'DESPACHANTE', 'PROVEEDOR'].includes(role);
  const canAssignProvider = role === 'ADMIN' || role === 'DESPACHANTE';

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos</h3>

      <div className="flex flex-col sm:flex-row flex-wrap items-center gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <label className="app-label !mt-0">Desde</label>
          <input type="date" className="app-input flex-1 sm:!w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <label className="app-label !mt-0">Hasta</label>
          <input type="date" className="app-input flex-1 sm:!w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <select className="app-input w-full sm:!w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {STATUS1_ALL.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="app-input w-full sm:!w-auto sm:min-w-[250px] sm:flex-1" placeholder="🔎 Buscar por cliente, teléfono, ID, ciudad o proveedor"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active w-full sm:w-auto" onClick={loadOrders} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
        {selectedIds.size > 0 && (
          <button className="nav-btn w-full sm:w-auto" onClick={bulkGenerateGuides}>📋 Copiar {selectedIds.size} guías</button>
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {filtered.length} pedidos {allOrders.length > 0 && `(Total en BD: ${allOrders.length})`}
      </div>

      {/* Vista Desktop/Tablet - Tabla (igual que antes, no cambio) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="app-table min-w-[1000px]">
          <thead>
            <tr>
              <th className="!w-[40px] text-center">
                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll} title="Seleccionar todos" />
              </th>
              <th>Fecha</th>
              <th>ID</th>
              <th>Ciudad</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Proveedor</th>
              {role !== 'DESPACHANTE' && <th>Delivery</th>}
              <th className="text-right">Total (Gs)</th>
              <th className="text-right">{role === 'DELIVERY' ? 'Tarifa (Gs)' : 'Comisión (Gs)'}</th>
              <th>Estado 1</th>
              {role !== 'DELIVERY' && <th>Estado 2</th>}
              {canAssign && <th>Asignar Delivery</th>}
              <th>Guía</th>
              {canEdit && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={16} className="text-center text-muted-foreground py-8">Sin pedidos</td></tr>
            )}
            {filtered.map(o => {
              const feeStored = Number(o.delivery_fee_gs || 0);
              const commVal = role === 'DELIVERY' ? feeStored : Number(o.commission_gs || 0);
              const dateShown = (role === 'DELIVERY' && o.assigned_at)
                ? new Date(o.assigned_at).toLocaleString('es-PY')
                : new Date(o.created_at).toLocaleString('es-PY');

              return (
                <tr key={o.id}>
                  <td className="text-center">
                    <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                  </td>
                  <td className="whitespace-nowrap text-xs">{dateShown}</td>
                  <td className="font-bold text-xs">{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="text-xs">{o.city}</td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-xs">{o.created_by}</td>
                  <td className="text-xs">
                    {canAssignProvider ? (
                      <select
                        className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[180px]"
                        value={o.provider_email || ''}
                        onChange={e => handleAssignProvider(o.id, e.target.value)}
                      >
                        <option value="">-- Sin proveedor --</option>
                        {providers.map(p => (
                          <option key={p.email} value={p.email}>
                            {p.email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-medium text-blue-600">{o.provider_email || '—'}</span>
                    )}
                  </td>
                  {role !== 'DESPACHANTE' && <td className="text-xs">{o.assigned_delivery || '—'}</td>}
                  <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                  <td className="text-right text-xs">{nf(commVal)}</td>
                  <td>
                    {canEditStatus1 ? (
                      <select
                        className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[130px]"
                        value={o.status || 'PENDIENTE'}
                        onChange={e => handleStatus1Change(o.id, e.target.value)}
                      >
                        {(role === 'DELIVERY' ? STATUS1_DELIVERY : STATUS1_ALL).map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge-status ${statusClass(o.status || '')}`}>{o.status || 'PENDIENTE'}</span>
                    )}
                  </td>
                  {role !== 'DELIVERY' && (
                    <td>
                      {canEditStatus2 ? (
                        <select
                          className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[120px]"
                          value={o.status2 || '--'}
                          onChange={e => handleStatus2Change(o.id, e.target.value)}
                        >
                          {STATUS2_ALL.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{o.status2 || '—'}</span>
                      )}
                    </td>
                  )}
                  {canAssign && (
                    <td>
                      <select
                        className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[140px]"
                        value={o.assigned_delivery || ''}
                        onChange={e => handleAssignDelivery(o.id, e.target.value)}
                      >
                        <option value="">-- Sin asignar --</option>
                        {deliveries.map(d => (
                          <option key={d.email} value={d.email}>{d.name || d.email}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td>
                    <div className="flex gap-1">
                      <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => generateGuide(o)} title="Ver guía">📄</button>
                      <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => { generateGuide(o); setTimeout(copyGuide, 100); }} title="Copiar guía">📋</button>
                      <button 
                        className="nav-btn !px-2 !py-1 !text-[10px] !bg-blue-600/20 hover:!bg-blue-600/40 text-blue-700"
                        onClick={() => loadOrderHistory(o)}
                        title="Ver historial de cambios"
                      >
                        📜 Historial
                      </button>
                    </div>
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex gap-1">
                        <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={() => openEdit(o)}>✏️ Editar</button>
                        <button
                          className="nav-btn !px-2 !py-1 !text-[10px] !bg-yellow-600/20 hover:!bg-yellow-600/40 text-yellow-700"
                          onClick={() => {
                            if (confirm('¿Cancelar este pedido? (Solo cambiará el estado a CANCELADO)'))
                              cancelOrder(o.id);
                          }}
                        >
                          ⛔ Cancelar
                        </button>
                        {canDeletePermanently && (
                          <button
                            className="nav-btn !px-2 !py-1 !text-[10px] !bg-red-600/20 hover:!bg-red-600/40 text-red-700"
                            onClick={() => {
                              if (confirm('⚠️ ¿ELIMINAR PERMANENTEMENTE este pedido?\n\nEsta acción NO se puede deshacer y borrará todos los datos del pedido de la base de datos.'))
                                deleteOrderPermanently(o.id);
                            }}
                          >
                            🗑️ Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Vista Celular - Tarjetas (igual que antes, no cambio) */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-8">Sin pedidos</div>
        )}
        {filtered.map(o => {
          const feeStored = Number(o.delivery_fee_gs || 0);
          const commVal = role === 'DELIVERY' ? feeStored : Number(o.commission_gs || 0);
          const dateShown = (role === 'DELIVERY' && o.assigned_at)
            ? new Date(o.assigned_at).toLocaleString('es-PY')
            : new Date(o.created_at).toLocaleString('es-PY');

          return (
            <div key={o.id} className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-bold text-sm">{o.order_number || o.id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{dateShown}</div>
                </div>
                <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
              </div>

              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-1">
                  <span className="font-medium">Cliente:</span>
                  <span className="text-right">{o.customer_name}</span>
                  <span className="font-medium">Ciudad:</span>
                  <span className="text-right">{o.city}</span>
                  <span className="font-medium">Vendedor:</span>
                  <span className="text-right">{o.created_by}</span>
                  <span className="font-medium">Proveedor:</span>
                  <span className="text-right font-medium text-blue-600">{o.provider_email || '—'}</span>
                  {role !== 'DESPACHANTE' && (
                    <>
                      <span className="font-medium">Delivery:</span>
                      <span className="text-right">{o.assigned_delivery || '—'}</span>
                    </>
                  )}
                  <span className="font-medium">Total:</span>
                  <span className="text-right font-bold">Gs {nf(Number(o.total_gs || 0))}</span>
                  <span className="font-medium">{role === 'DELIVERY' ? 'Tarifa:' : 'Comisión:'}</span>
                  <span className="text-right">Gs {nf(commVal)}</span>
                </div>

                <div className="pt-2">
                  <span className="font-medium block mb-1">Estado 1:</span>
                  {canEditStatus1 ? (
                    <select
                      className="app-input !py-2 !px-2 !text-sm w-full"
                      value={o.status || 'PENDIENTE'}
                      onChange={e => handleStatus1Change(o.id, e.target.value)}
                    >
                      {(role === 'DELIVERY' ? STATUS1_DELIVERY : STATUS1_ALL).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`inline-block badge-status ${statusClass(o.status || '')}`}>{o.status || 'PENDIENTE'}</span>
                  )}
                </div>

                {role !== 'DELIVERY' && (
                  <div>
                    <span className="font-medium block mb-1">Estado 2:</span>
                    {canEditStatus2 ? (
                      <select
                        className="app-input !py-2 !px-2 !text-sm w-full"
                        value={o.status2 || '--'}
                        onChange={e => handleStatus2Change(o.id, e.target.value)}
                      >
                        {STATUS2_ALL.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className="text-sm text-muted-foreground">{o.status2 || '—'}</span>
                    )}
                  </div>
                )}

                {canAssign && (
                  <div>
                    <span className="font-medium block mb-1">Asignar Delivery:</span>
                    <select
                      className="app-input !py-2 !px-2 !text-sm w-full"
                      value={o.assigned_delivery || ''}
                      onChange={e => handleAssignDelivery(o.id, e.target.value)}
                    >
                      <option value="">-- Sin asignar --</option>
                      {deliveries.map(d => (
                        <option key={d.email} value={d.email}>{d.name || d.email}</option>
                      ))}
                    </select>
                  </div>
                )}

                {canAssignProvider && (
                  <div>
                    <span className="font-medium block mb-1">Asignar Proveedor:</span>
                    <select
                      className="app-input !py-2 !px-2 !text-sm w-full"
                      value={o.provider_email || ''}
                      onChange={e => handleAssignProvider(o.id, e.target.value)}
                    >
                      <option value="">-- Sin proveedor --</option>
                      {providers.map(p => (
                        <option key={p.email} value={p.email}>
                          {p.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button className="nav-btn flex-1 !py-2 !text-sm" onClick={() => generateGuide(o)}>
                    📄 Ver Guía
                  </button>
                  <button className="nav-btn flex-1 !py-2 !text-sm" onClick={() => { generateGuide(o); setTimeout(copyGuide, 100); }}>
                    📋 Copiar
                  </button>
                  <button 
                    className="nav-btn flex-1 !py-2 !text-sm !bg-blue-600/20 text-blue-700"
                    onClick={() => loadOrderHistory(o)}
                  >
                    📜 Historial
                  </button>
                  {canEdit && (
                    <>
                      <button className="nav-btn flex-1 !py-2 !text-sm" onClick={() => openEdit(o)}>
                        ✏️ Editar
                      </button>
                      <button
                        className="nav-btn !py-2 !text-sm !bg-yellow-600/20 text-yellow-700"
                        onClick={() => confirm('¿Cancelar?') && cancelOrder(o.id)}
                      >
                        ⛔
                      </button>
                    </>
                  )}
                </div>
                {canDeletePermanently && canEdit && (
                  <button
                    className="nav-btn w-full !py-2 !text-sm !bg-red-600/20 text-red-700 mt-1"
                    onClick={() => confirm('⚠️ ¿ELIMINAR PERMANENTEMENTE?') && deleteOrderPermanently(o.id)}
                  >
                    🗑️ Eliminar Permanentemente
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modales (Editar, Guía, StatusChange - iguales que antes) */}
      {editOrder && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-2 sm:p-4" onClick={() => setEditOrder(null)}>
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold">Editar Pedido</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="app-label">Cliente *</label>
                <input className="app-input" value={editOrder.customer_name} onChange={e => setEditOrder({ ...editOrder, customer_name: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Teléfono *</label>
                <input className="app-input" value={editOrder.phone} onChange={e => setEditOrder({ ...editOrder, phone: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Ciudad *</label>
                <select className="app-input" value={editOrder.city} onChange={e => setEditOrder({ ...editOrder, city: e.target.value })}>
                  <option value="">Seleccionar ciudad…</option>
                  {clientPrices.map(c => <option key={c.id} value={c.city}>{c.city}</option>)}
                  {editOrder.city && !clientPrices.find(c => c.city === editOrder.city) && (
                    <option value={editOrder.city}>{editOrder.city}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="app-label">Fecha asignación</label>
                <input type="datetime-local" className="app-input" value={editOrder.assigned_at}
                  onChange={e => setEditOrder({ ...editOrder, assigned_at: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Calle</label>
                <input className="app-input" value={editOrder.street} onChange={e => setEditOrder({ ...editOrder, street: e.target.value })} />
              </div>
              <div>
                <label className="app-label">Barrio</label>
                <input className="app-input" value={editOrder.district} onChange={e => setEditOrder({ ...editOrder, district: e.target.value })} />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="app-label">Email</label>
                <input className="app-input" value={editOrder.email} onChange={e => setEditOrder({ ...editOrder, email: e.target.value })} />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="app-label">Proveedor</label>
                <select
                  className="app-input"
                  value={editOrder.provider_email || ''}
                  onChange={e => setEditOrder({ ...editOrder, provider_email: e.target.value })}
                >
                  <option value="">-- Sin proveedor --</option>
                  {providers.map(p => (
                    <option key={p.email} value={p.email}>
                      {p.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="app-label">Observaciones</label>
              <textarea className="app-input min-h-[60px]" value={editOrder.obs} onChange={e => setEditOrder({ ...editOrder, obs: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="nav-btn" onClick={() => setEditOrder(null)}>Cancelar</button>
              <button className="nav-btn active" onClick={saveEdit}>Guardar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {guideText && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-2 sm:p-4" onClick={() => setGuideText('')}>
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold mb-3">Guía — {guideOrderId}</h4>
            <pre className="text-xs sm:text-sm whitespace-pre-wrap bg-background p-3 sm:p-5 rounded-xl border border-border max-h-[60vh] overflow-auto leading-relaxed">{guideText}</pre>
            <div className="flex gap-2 justify-end mt-4">
              <button className="nav-btn" onClick={() => setGuideText('')}>Cerrar</button>
              <button className="nav-btn active" onClick={copyGuide}>Copiar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <StatusChangeModal
        isOpen={statusChangeModal.isOpen}
        onClose={() => setStatusChangeModal({ isOpen: false, orderId: '', newStatus: '', oldStatus: '' })}
        onConfirm={processStatusChangeWithData}
        newStatus={statusChangeModal.newStatus}
        uploading={uploadingFile}
      />

      {/* Modal Historial ULTRA PRO con gráfico de torta */}
      {historyModalOpen && selectedOrder && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-2 sm:p-4" onClick={() => setHistoryModalOpen(false)}>
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-between items-start mb-6 sticky top-0 bg-card pb-2 z-10">
              <div>
                <h4 className="text-xl font-extrabold flex items-center gap-2">
                  📜 Historial de Estados
                  <span className="text-sm font-normal text-muted-foreground">
                    Pedido #{selectedOrder.order_number || selectedOrder.id.slice(0, 8)}
                  </span>
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Cliente: {selectedOrder.customer_name} | Ciudad: {selectedOrder.city}
                </p>
              </div>
              <button onClick={() => setHistoryModalOpen(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">✕</button>
            </div>

            {loadingHistory ? (
              <div className="text-center py-12">Cargando historial...</div>
            ) : orderHistory.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                No hay cambios registrados en este pedido
              </div>
            ) : (
              <>
                {/* Dashboard de Estadísticas con GRÁFICO DE TORTA */}
                {(() => {
                  const stats = getHistoryStats();
                  const formatTime = (ms: number) => {
                    const hours = Math.floor(ms / (1000 * 60 * 60));
                    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
                    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
                    if (hours > 0) return `${hours}h ${minutes}m`;
                    return `${minutes}m`;
                  };
                  
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                      {/* Tarjetas de estadísticas - columna izquierda */}
                      <div className="lg:col-span-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
                            <div className="text-3xl font-bold">{stats.totalChanges}</div>
                            <div className="text-sm opacity-90">Cambios totales</div>
                          </div>
                          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white shadow-lg">
                            <div className="text-3xl font-bold">{stats.uniqueUsers}</div>
                            <div className="text-sm opacity-90">Usuarios distintos</div>
                          </div>
                          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
                            <div className="text-3xl font-bold">{stats.mostCommonStatus?.[1] || 0}</div>
                            <div className="text-sm opacity-90">Estado más usado</div>
                            <div className="text-xs font-mono mt-1 truncate">{stats.mostCommonStatus?.[0] || '—'}</div>
                          </div>
                          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white shadow-lg">
                            <div className="text-3xl font-bold">{orderHistory[0]?.new_status || '—'}</div>
                            <div className="text-sm opacity-90">Estado actual</div>
                          </div>
                          {stats.mostActiveUser && (
                            <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-4 text-white shadow-lg">
                              <div className="text-sm opacity-90">Usuario más activo</div>
                              <div className="text-lg font-bold truncate">{stats.mostActiveUser[0]}</div>
                              <div className="text-2xl font-bold mt-1">{stats.mostActiveUser[1]} cambios</div>
                            </div>
                          )}
                          {stats.mostActiveRole && (
                            <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl p-4 text-white shadow-lg">
                              <div className="text-sm opacity-90">Rol más activo</div>
                              <div className="text-lg font-bold">{stats.mostActiveRole[0]}</div>
                              <div className="text-2xl font-bold mt-1">{stats.mostActiveRole[1]} cambios</div>
                            </div>
                          )}
                          {stats.avgTimeBetweenChanges > 0 && (
                            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white shadow-lg col-span-1 sm:col-span-2">
                              <div className="text-sm opacity-90">Tiempo promedio entre cambios</div>
                              <div className="text-2xl font-bold">{formatTime(stats.avgTimeBetweenChanges)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* GRÁFICO DE TORTA - columna derecha */}
                      <div className="bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-900 dark:to-gray-950 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center">
                        <h5 className="text-white text-sm font-medium mb-3">Distribución de Estados</h5>
                        <SimplePieChart data={stats.statusDistribution} />
                      </div>
                    </div>
                  );
                })()}

                {/* Timeline de cambios */}
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 mt-4">
                  {orderHistory.map((item) => (
                    <HistoryTimelineItem 
                      key={item.id} 
                      item={item} 
                      statusClass={statusClass}
                      onImageClick={(url) => setFullImageUrl(url)}
                    />
                  ))}
                </div>
              </>
            )}
            
            {/* Footer */}
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border sticky bottom-0 bg-card">
              <button className="nav-btn" onClick={() => setHistoryModalOpen(false)}>
                Cerrar
              </button>
              <button 
                className="nav-btn active"
                onClick={() => {
                  const historyText = orderHistory.map(h => 
                    `[${new Date(h.created_at).toLocaleString('es-PY')}] ${h.changed_by_role} (${h.changed_by_email}): ${h.previous_status || '—'} → ${h.new_status}${h.message ? `\n  💬 ${h.message}` : ''}${h.attachment_url ? `\n  📎 Ver captura: ${h.attachment_url}` : ''}`
                  ).join('\n\n');
                  navigator.clipboard.writeText(historyText);
                  toast.success('Historial copiado al portapapeles');
                }}
              >
                📋 Copiar historial
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de imagen ampliada */}
      {fullImageUrl && (
        <div className="fixed inset-0 bg-black/90 z-[10001] flex items-center justify-center p-4" onClick={() => setFullImageUrl(null)}>
          <div className="relative max-w-5xl max-h-[90vh]">
            <img 
              src={fullImageUrl} 
              alt="Captura ampliada" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setFullImageUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
