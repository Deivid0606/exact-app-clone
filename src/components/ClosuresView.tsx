import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

const formatDatePY = (dateValue?: string | null) => {
  if (!dateValue) return '—';
  const onlyDate = dateValue.slice(0, 10);
  const [year, month, day] = onlyDate.split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
};

const dateInputValue = (dateValue?: string | null) => {
  if (!dateValue) return '';
  return dateValue.slice(0, 10);
};

// Modal para solicitar comentario y captura
function StatusChangeModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  newStatus,
  uploading 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: (message: string, attachment: File | null) => void; 
  newStatus: string;
  uploading: boolean;
}) {
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

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

  const handleSubmit = () => {
    if (!message.trim()) {
      toast.error('Debes escribir un comentario');
      return;
    }
    if (!attachment) {
      toast.error('Debes adjuntar una captura de pantalla');
      return;
    }
    onConfirm(message, attachment);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/70 z-[10000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-4">
          Cambiar a {newStatus}
        </h3>
        
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
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="app-input w-full"
            />
            {preview && (
              <div className="mt-2">
                <img src={preview} alt="Preview" className="max-h-32 rounded-lg border" />
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

// Modal de historial
function HistoryModal({ isOpen, onClose, order, history, loading }: { 
  isOpen: boolean; 
  onClose: () => void; 
  order: any; 
  history: any[]; 
  loading: boolean;
}) {
  const statusClass = (s: string) => {
    if (s === 'ENTREGADO' || s === 'ENCOMIENDA ENTREGADA') return 'badge-entregado';
    if (['CANCELADO', 'RECHAZADO', 'RECHAZADO EN EL LUGAR', 'NO DESEA', 'CANCELÓ POR WHATSAPP', 'NO CONTESTA'].includes(s)) return 'badge-cancelado';
    if (s === 'EN RUTA') return 'badge-entregado';
    return 'badge-pendiente';
  };

  const getHistoryStats = () => {
    const totalChanges = history.length;
    const uniqueUsers = new Set(history.map(h => h.changed_by_email)).size;
    const statusCounts: Record<string, number> = {};
    history.forEach(h => {
      statusCounts[h.new_status] = (statusCounts[h.new_status] || 0) + 1;
    });
    const mostCommonStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0];
    
    return { totalChanges, uniqueUsers, mostCommonStatus };
  };

  if (!isOpen) return null;

  const stats = getHistoryStats();

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h4 className="text-xl font-extrabold flex items-center gap-2">
              📜 Historial de Estados
              <span className="text-sm font-normal text-muted-foreground">
                Pedido #{order?.order_number || order?.id?.slice(0, 8)}
              </span>
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              Cliente: {order?.customer_name} | Ciudad: {order?.city}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none">✕</button>
        </div>

        {loading ? (
          <div className="text-center py-12">Cargando historial...</div>
        ) : history.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            No hay cambios registrados en este pedido
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                <div className="text-3xl font-bold">{stats.totalChanges}</div>
                <div className="text-sm opacity-90">Cambios totales</div>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
                <div className="text-3xl font-bold">{stats.uniqueUsers}</div>
                <div className="text-sm opacity-90">Usuarios distintos</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                <div className="text-3xl font-bold">{stats.mostCommonStatus?.[1] || 0}</div>
                <div className="text-sm opacity-90">Estado más usado</div>
                <div className="text-xs font-mono mt-1">{stats.mostCommonStatus?.[0] || '—'}</div>
              </div>
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white">
                <div className="text-3xl font-bold">{history[0]?.new_status || '—'}</div>
                <div className="text-sm opacity-90">Estado actual</div>
              </div>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {history.map((item) => (
                <div key={item.id} className="relative pl-8 before:content-[''] before:absolute before:left-3 before:top-0 before:bottom-0 before:w-0.5 before:bg-border">
                  <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                  </div>
                  
                  <div className="bg-background border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                          {new Date(item.created_at).toLocaleString('es-PY', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                          })}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          item.changed_by_role === 'ADMIN' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          item.changed_by_role === 'DELIVERY' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          item.changed_by_role === 'PROVEEDOR' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {item.changed_by_role || 'Usuario'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {item.changed_by_email}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3 flex-wrap mb-3">
                      <span className={`text-sm font-medium px-3 py-1 rounded-lg ${statusClass(item.previous_status || 'PENDIENTE')} bg-opacity-20`}>
                        {item.previous_status || '—'}
                      </span>
                      <span className="text-muted-foreground text-lg">→</span>
                      <span className={`text-sm font-bold px-3 py-1 rounded-lg ${statusClass(item.new_status)}`}>
                        {item.new_status}
                      </span>
                    </div>
                    
                    {item.message && (
                      <div className="mt-2 p-3 bg-muted/30 rounded-lg border-l-4 border-blue-500">
                        <div className="flex items-start gap-2">
                          <span className="text-base">💬</span>
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">Mensaje:</div>
                            <div className="text-sm">{item.message}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {item.attachment_url && (
                      <div className="mt-3">
                        <button
                          onClick={() => window.open(item.attachment_url, '_blank')}
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 rounded-lg transition-colors"
                        >
                          <span>🖼️</span>
                          <span>Ver captura adjunta</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border">
          <button className="nav-btn" onClick={onClose}>Cerrar</button>
          <button 
            className="nav-btn active"
            onClick={() => {
              navigator.clipboard.writeText(
                history.map(h => 
                  `[${new Date(h.created_at).toLocaleString('es-PY')}] ${h.changed_by_role} (${h.changed_by_email}): ${h.previous_status || '—'} → ${h.new_status}${h.message ? ` - Mensaje: ${h.message}` : ''}`
                ).join('\n')
              );
              toast.success('Historial copiado al portapapeles');
            }}
          >
            📋 Copiar historial
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ClosuresView() {
  const { profile } = useAuth();
  const myEmail = profile?.email || '';
  const myRole = profile?.role || '';
  
  const isSupplier = myRole === 'PROVEEDOR';
  const isAdmin = myRole === 'ADMIN';
  const isVendedor = myRole === 'VENDEDOR';
  const isDelivery = myRole === 'DELIVERY';
  
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [clientPrices, setClientPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [filterDeliveries, setFilterDeliveries] = useState<Set<string>>(new Set());
  const [deliverySearch, setDeliverySearch] = useState('');
  const [showDeliveryDropdown, setShowDeliveryDropdown] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [rendicionNote, setRendicionNote] = useState('');
  const [rendicionPagada, setRendicionPagada] = useState<{ id: string; pagado_en: string; nota: string; marcado_por: string } | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterDateBy, setFilterDateBy] = useState<'assigned_at' | 'created_at'>('assigned_at');
  const [totalPedidosAsignados, setTotalPedidosAsignados] = useState(0);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  
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
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Estados para el modal de historial
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Función para subir archivo
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
        changed_by_role: myRole,
        message: message || null,
        attachment_url: attachmentUrl || null
      });
    
    if (error) {
      console.error('Error guardando en historial:', error);
    }
  };

  // Función para cargar el historial
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

  const loadDeliveries = async () => {
    setLoadingDeliveries(true);
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('role', 'delivery');
      
      if (profilesError) throw profilesError;
      
      if (profilesData && profilesData.length > 0) {
        setDeliveries(profilesData);
        return;
      }
      
      const { data: ordersData } = await supabase
        .from('orders')
        .select('assigned_delivery')
        .not('assigned_delivery', 'is', null);
      
      if (ordersData && ordersData.length > 0) {
        const uniqueEmails = [...new Set(ordersData.map(o => o.assigned_delivery))];
        const { data: fallbackProfiles } = await supabase
          .from('profiles')
          .select('email, name')
          .in('email', uniqueEmails);
        
        if (fallbackProfiles && fallbackProfiles.length > 0) {
          setDeliveries(fallbackProfiles);
        } else {
          setDeliveries(uniqueEmails.map(email => ({ email, name: email })));
        }
      }
    } catch (error) {
      console.error('Error loading deliveries:', error);
      toast.error('Error al cargar repartidores');
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('email, name, company_name')
      .eq('role', 'PROVEEDOR');
    
    if (data && data.length > 0) {
      setSuppliers(data.map(s => ({ 
        email: s.email, 
        name: s.company_name || s.name || s.email 
      })));
    } else {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('provider_email')
        .not('provider_email', 'is', null);
      
      if (ordersData && ordersData.length > 0) {
        const uniqueSuppliers = [...new Set(ordersData.map(o => o.provider_email))];
        setSuppliers(uniqueSuppliers.map(email => ({ email, name: email })));
      }
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadDeliveries();
    supabase.from('delivery_fees').select('*').then(({ data }) => setFees(data || []));
    supabase.from('client_prices').select('*').order('city').then(({ data }) => setClientPrices(data || []));
    supabase.from('products').select('*').then(({ data }) => setProducts(data || []));
  }, []);


  const selectedDeliveryList = useMemo(() => Array.from(filterDeliveries), [filterDeliveries]);

  const filteredDeliveryOptions = useMemo(() => {
    if (!deliverySearch.trim()) return deliveries;
    const q = deliverySearch.toLowerCase().trim();
    return deliveries.filter((d: any) =>
      String(d.name || '').toLowerCase().includes(q) ||
      String(d.email || '').toLowerCase().includes(q)
    );
  }, [deliveries, deliverySearch]);

  const toggleDeliveryFilter = (email: string) => {
    setFilterDeliveries(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const selectAllDeliveryFilters = () => {
    if (filterDeliveries.size === deliveries.length) {
      setFilterDeliveries(new Set());
    } else {
      setFilterDeliveries(new Set(deliveries.map((d: any) => d.email)));
    }
  };

  const updateOrderCity = async (orderId: string, city: string) => {
    const { error } = await supabase.from('orders').update({
      city,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);

    if (error) {
      toast.error(error.message);
      loadClosures();
      return;
    }

    toast.success('Ciudad actualizada');
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, city, updated_at: new Date().toISOString() } : o));
  };

  const updateAssignedDelivery = async (orderId: string, deliveryEmail: string) => {
    const { error } = await supabase.from('orders').update({
      assigned_delivery: deliveryEmail || null,
      assigned_at: deliveryEmail ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);

    if (error) {
      toast.error(error.message);
      loadClosures();
      return;
    }

    toast.success(deliveryEmail ? 'Delivery reasignado' : 'Delivery removido');
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      assigned_delivery: deliveryEmail || null,
      assigned_at: deliveryEmail ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    } : o));
  };

  const loadClosures = async () => {
    let dateField = filterDateBy;
    
    if (isDelivery || isSupplier) {
      dateField = 'assigned_at';
    } else if (isVendedor) {
      dateField = 'created_at';
    }
    
    let query = supabase.from('orders').select('*')
      .gte(dateField, dateFrom + 'T00:00:00')
      .lte(dateField, dateTo + 'T23:59:59')
      .order(dateField, { ascending: false });

    if (isSupplier) {
      query = query.eq('provider_email', myEmail);
      if (selectedDeliveryList.length > 0) {
        query = query.in('assigned_delivery', selectedDeliveryList);
      }
    } else if (isVendedor) {
      query = query.eq('created_by', myEmail);
      if (selectedDeliveryList.length > 0) {
        query = query.in('assigned_delivery', selectedDeliveryList);
      }
      if (filterSupplier) {
        query = query.eq('provider_email', filterSupplier);
      }
    } else if (isDelivery) {
      query = query.eq('assigned_delivery', myEmail);
      if (filterSupplier) {
        query = query.eq('provider_email', filterSupplier);
      }
    } else if (isAdmin) {
      if (selectedDeliveryList.length > 0) query = query.in('assigned_delivery', selectedDeliveryList);
      if (filterSupplier) query = query.eq('provider_email', filterSupplier);
    }

    if (filterType && filterType !== '') {
      query = query.eq('status', filterType);
    }

    const { data } = await query;
    setOrders(data || []);
    setTotalPedidosAsignados(data?.length || 0);

    let deliveryToCheck = '';
    if (isDelivery) {
      deliveryToCheck = myEmail;
    } else if ((isAdmin || isSupplier) && selectedDeliveryList.length === 1) {
      deliveryToCheck = selectedDeliveryList[0];
    }
    
    if (deliveryToCheck) {
      const { data: rp } = await supabase.from('rendiciones_pagadas').select('*')
        .eq('delivery_email', deliveryToCheck)
        .gte('pagado_en', dateFrom + 'T00:00:00')
        .lte('pagado_en', dateTo + 'T23:59:59')
        .order('pagado_en', { ascending: false })
        .limit(1);
      setRendicionPagada(rp && rp.length > 0 ? { id: rp[0].id, pagado_en: rp[0].pagado_en, nota: rp[0].nota || '', marcado_por: rp[0].marcado_por || '' } : null);
    } else {
      setRendicionPagada(null);
    }
  };

  useEffect(() => { loadClosures(); }, [filterSupplier, filterDeliveries, filterType, dateFrom, dateTo, filterDateBy]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    
    const term = searchTerm.toLowerCase().trim();
    return orders.filter(order => {
      return (
        (order.customer_name && order.customer_name.toLowerCase().includes(term)) ||
        (order.customer_phone && order.customer_phone.toLowerCase().includes(term)) ||
        (order.order_number && order.order_number.toLowerCase().includes(term)) ||
        (order.id && order.id.toLowerCase().includes(term)) ||
        (order.city && order.city.toLowerCase().includes(term))
      );
    });
  }, [orders, searchTerm]);

  const getFee = (deliveryEmail: string, city: string) => {
    const f = fees.find(f => f.delivery_email?.toLowerCase() === deliveryEmail?.toLowerCase() && f.city?.toLowerCase() === city?.toLowerCase());
    return Number(f?.fee_gs || 0);
  };

  const productCostMap = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach((p: any) => {
      if (p.sku) m[String(p.sku).trim()] = Number(p.real_cost_gs || 0);
    });
    return m;
  }, [products]);

  const getOrderRealProductCost = (order: any) => {
    try {
      const items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : (order.items_json || []);
      return items.reduce((sum: number, it: any) => {
        const sku = String(it.sku || '').trim();
        const qty = Number(it.qty || 0);
        const realCost = Number(productCostMap[sku] || 0);
        return sum + (realCost * qty);
      }, 0);
    } catch {
      return 0;
    }
  };

  const getDeliveryFeeForOrder = (order: any) => {
    return Number(order.delivery_fee_gs) || getFee(order.assigned_delivery || '', order.city || '');
  };

  const delivered = useMemo(() => filteredOrders.filter(o => o.status === 'ENTREGADO' || o.status === 'ENCOMIENDA ENTREGADA'), [filteredOrders]);
  const rendidos = useMemo(() => delivered.filter(o => o.delivery_settled), [delivered]);
  const noRendidos = useMemo(() => delivered.filter(o => !o.delivery_settled), [delivered]);

  const kpis = useMemo(() => {
    const entregados = filteredOrders.filter(o => o.status === 'ENTREGADO');
    const encomiendas = filteredOrders.filter(o => o.status === 'ENCOMIENDA ENTREGADA');
    return {
      entregados: entregados.length,
      entregadosRev: entregados.reduce((s, o) => s + Number(o.total_gs || 0), 0),
      encomiendas: encomiendas.length,
      encomiendaRev: encomiendas.reduce((s, o) => s + Number(o.total_gs || 0), 0),
      deliveryFee: filteredOrders.reduce((s, o) => {
        const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
        return s + fee;
      }, 0),
      rendidos: rendidos.length,
      noRendidos: noRendidos.length,
      montoRendido: rendidos.reduce((s, o) => s + Number(o.total_gs || 0), 0),
      montoPendiente: noRendidos.reduce((s, o) => s + Number(o.total_gs || 0), 0),
    };
  }, [filteredOrders, rendidos, noRendidos]);

  const netRendir = kpis.entregadosRev + kpis.encomiendaRev - kpis.deliveryFee;
  const totalAPagar = useMemo(() => {
    return delivered.reduce((s, o) => {
      const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
      return s + (Number(o.total_gs || 0) - fee);
    }, 0);
  }, [delivered]);

  const financePanel = useMemo(() => {
    const baseOrders = delivered;
    let ventaProductos = 0;
    let costoRealProductos = 0;
    let deliveryCobrado = 0;
    let pagoDelivery = 0;
    let comisiones = 0;

    baseOrders.forEach((o: any) => {
      const total = Number(o.total_gs || 0);
      const deliveryCharged = Number(o.delivery_gs || 0);
      const sellerCommission = Number(o.commission_gs || 0);
      const realProductCost = getOrderRealProductCost(o);
      const realDeliveryPayment = getDeliveryFeeForOrder(o);

      ventaProductos += total;
      costoRealProductos += realProductCost;
      deliveryCobrado += deliveryCharged;
      pagoDelivery += realDeliveryPayment;
      comisiones += sellerCommission;
    });

    const gananciaProductos = ventaProductos - costoRealProductos;
    const gananciaDelivery = deliveryCobrado - pagoDelivery;
    const utilidadFinal = gananciaProductos + gananciaDelivery - comisiones;

    return {
      ventaProductos,
      costoRealProductos,
      gananciaProductos,
      deliveryCobrado,
      pagoDelivery,
      gananciaDelivery,
      comisiones,
      utilidadFinal,
    };
  }, [delivered, productCostMap, fees]);


  // Función principal para cambiar estado con validación
  const handleStatusChangeWithValidation = async (orderId: string, newStatus: string) => {
    // Verificar si es Delivery y el estado requiere comentario y captura
    if (isDelivery && (newStatus === 'NO CONTESTA' || newStatus === 'CANCELADO')) {
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
    if (isDelivery && newStatus === 'DEVUELTO A DEPÓSITO') {
      toast.error('Los repartidores no pueden cambiar a DEVUELTO A DEPÓSITO');
      return;
    }
    
    const order = orders.find(o => o.id === orderId);
    const oldStatus = order?.status || 'PENDIENTE';
    
    // Guardar en historial
    await saveToHistory(orderId, oldStatus, newStatus, message, attachmentUrl || undefined);
    
    const { error } = await supabase.from('orders').update({ 
      status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);
    
    if (error) {
      toast.error(error.message);
    } else { 
      toast.success('Estado actualizado'); 
      loadClosures();
    }
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

  const updateStatus1 = async (orderId: string, status: string) => {
    await handleStatusChangeWithValidation(orderId, status);
  };

  const updateStatus2 = async (orderId: string, status2: string) => {
    const { error } = await supabase.from('orders').update({ 
      status2,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success('Estado 2 actualizado'); loadClosures(); }
  };

  const updateRetiro = async (orderId: string, estado: string) => {
    const { error } = await supabase.from('orders').update({ 
      estado_retiro: estado,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);
    if (error) toast.error(error.message);
    else { toast.success('Estado de retiro actualizado'); loadClosures(); }
  };

  const handleDateChange = async (orderId: string, newDate: string) => {
    if (!newDate) return;

    const newAssignedAt = `${newDate}T12:00:00`;

    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, assigned_at: newAssignedAt, updated_at: new Date().toISOString() }
          : o
      )
    );

    setEditingDateId(null);
    
    const { error } = await supabase
      .from('orders')
      .update({ 
        assigned_at: newAssignedAt, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', orderId);
      
    if (error) {
      toast.error(error.message);
      loadClosures();
    } else {
      toast.success('Fecha actualizada');
    }
  };

  const markSingleRendido = async (orderId: string) => {
    const { error } = await supabase.from('orders').update({
      delivery_settled: true,
      status2: 'RENDIDO',
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success('Marcado como RENDIDO');
    loadClosures();
  };

  const markRendicionPagada = async () => {
    let deliveryEmail = '';
    if (isDelivery) {
      deliveryEmail = myEmail;
    } else if (isAdmin || isSupplier) {
      if (selectedDeliveryList.length !== 1) {
        toast.error('Seleccioná un solo delivery para marcar rendición pagada');
        return;
      }
      deliveryEmail = selectedDeliveryList[0];
    }
    
    if (!deliveryEmail) { toast.error('Seleccioná un delivery primero'); return; }
    if (totalAPagar <= 0) { toast.error('No hay monto para rendir'); return; }
    if (!confirm(`¿Marcar rendición de ${deliveryEmail} por Gs ${nf(totalAPagar)} como PAGADA?`)) return;

    for (const o of delivered) {
      await supabase.from('orders').update({
        delivery_settled: true,
        delivery_paid_at: new Date().toISOString(),
        status2: 'RENDIDO',
      }).eq('id', o.id);
    }

    const { error } = await supabase.from('rendiciones_pagadas').insert({
      delivery_email: deliveryEmail,
      fecha_rendicion: new Date().toISOString().slice(0, 10),
      monto_total: totalAPagar,
      nota: rendicionNote || `Rendición ${dateFrom} a ${dateTo} — ${delivered.length} pedidos`,
      marcado_por: myEmail,
      marcado_en: new Date().toISOString(),
      pagado_en: new Date().toISOString(),
    });

    if (error) { toast.error(error.message); return; }
    toast.success(`Rendición de Gs ${nf(totalAPagar)} marcada como PAGADA`);
    setRendicionNote('');
    loadClosures();
  };

  // ================================
  // GUÍAS, WHATSAPP Y EXPORTACIÓN PDF
  // Disponible para DELIVERY, ADMIN y PROVEEDOR
  // ================================
  const getGuideNumber = (order: any): string => {
    const value =
      order?.guide_number ??
      order?.tracking_number ??
      order?.guide ??
      order?.guia ??
      order?.numero_guia ??
      order?.numero_de_guia ??
      '';

    return String(value || '').trim();
  };

  const normalizeWhatsAppPhone = (phoneValue?: string | null): string => {
    let phone = String(phoneValue || '').replace(/\D/g, '');

    if (!phone) return '';

    // Formato Paraguay: 09XXXXXXXX -> 5959XXXXXXXX
    if (phone.startsWith('0')) {
      phone = `595${phone.slice(1)}`;
    } else if (phone.startsWith('9') && phone.length <= 10) {
      phone = `595${phone}`;
    }

    return phone;
  };

  const buildDeliveryMessage = (order: any): string => {
    const customerName = String(order?.customer_name || '').trim();
    const guideNumber = getGuideNumber(order);

    const lines = [
      `Buenas${customerName ? ` ${customerName}` : ''}, le escribo para coordinar la entrega de su pedido.`,
      '',
      '¿Me podría indicar o enviar la ubicación por Google Maps para poder realizar la entrega?',
    ];

    if (guideNumber) {
      lines.push('', `Su número de guía es: ${guideNumber}`);
    }

    return lines.join('\n');
  };

  const getWhatsAppUrl = (order: any): string => {
    const phone = normalizeWhatsAppPhone(order?.customer_phone);
    if (!phone) return '';

    return `https://wa.me/${phone}?text=${encodeURIComponent(buildDeliveryMessage(order))}`;
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const selectOrClearVisibleOrders = () => {
    const visibleIds = filteredOrders.map(order => String(order.id));
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedOrderIds.has(id));

    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      visibleIds.forEach(id => {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const clearOrderSelection = () => {
    setSelectedOrderIds(new Set());
  };

  const getSelectedVisibleOrders = () =>
    filteredOrders.filter(order => selectedOrderIds.has(String(order.id)));

  const copySelectedGuides = async () => {
    const selected = getSelectedVisibleOrders();

    if (selected.length === 0) {
      toast.error('Seleccioná al menos un pedido');
      return;
    }

    const withGuide = selected.filter(order => getGuideNumber(order));
    if (withGuide.length === 0) {
      toast.error('Los pedidos seleccionados no tienen número de guía');
      return;
    }

    const guideText = withGuide
      .map(order => getGuideNumber(order))
      .join('\n');

    try {
      await navigator.clipboard.writeText(guideText);
      const withoutGuide = selected.length - withGuide.length;
      toast.success(
        withoutGuide > 0
          ? `${withGuide.length} guías copiadas; ${withoutGuide} pedido(s) sin guía`
          : `${withGuide.length} guía(s) copiadas`
      );
    } catch (error) {
      console.error('No se pudo copiar las guías:', error);
      toast.error('No se pudo copiar al portapapeles');
    }
  };

  const escapeHtml = (value: unknown): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const downloadSelectedOrdersPdf = () => {
    const selected = getSelectedVisibleOrders();

    if (selected.length === 0) {
      toast.error('Seleccioná al menos un pedido para descargar el PDF');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1200,height=800');

    if (!printWindow) {
      toast.error('El navegador bloqueó la ventana. Permití ventanas emergentes e intentá otra vez.');
      return;
    }

    const rows = selected.map((order, index) => {
      const whatsappUrl = getWhatsAppUrl(order);
      const phone = String(order.customer_phone || '—');
      const guide = getGuideNumber(order) || '—';
      const orderNumber = order.order_number || String(order.id || '').slice(0, 8);

      const phoneContent = whatsappUrl
        ? `<a href="${escapeHtml(whatsappUrl)}" target="_blank">${escapeHtml(phone)}</a>`
        : escapeHtml(phone);

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(orderNumber)}</td>
          <td>${escapeHtml(order.customer_name || '—')}</td>
          <td>${escapeHtml(order.city || '—')}</td>
          <td>${phoneContent}</td>
          <td>${escapeHtml(guide)}</td>
          <td class="right">${escapeHtml(nf(Number(order.total_gs || 0)))} Gs</td>
          <td>${escapeHtml(order.status || 'PENDIENTE')}</td>
        </tr>`;
    }).join('');

    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Pedidos ${escapeHtml(dateFrom)} a ${escapeHtml(dateTo)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { font-size: 12px; margin-bottom: 14px; color: #444; }
    .notice { font-size: 11px; padding: 8px 10px; margin-bottom: 12px; border: 1px solid #bbb; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #999; padding: 6px; font-size: 10px; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eeeeee; text-align: left; }
    th:nth-child(1), td:nth-child(1) { width: 4%; }
    th:nth-child(2), td:nth-child(2) { width: 9%; }
    th:nth-child(3), td:nth-child(3) { width: 18%; }
    th:nth-child(4), td:nth-child(4) { width: 12%; }
    th:nth-child(5), td:nth-child(5) { width: 15%; }
    th:nth-child(6), td:nth-child(6) { width: 15%; }
    th:nth-child(7), td:nth-child(7) { width: 12%; }
    th:nth-child(8), td:nth-child(8) { width: 15%; }
    a { color: #0563c1; text-decoration: underline; font-weight: 700; }
    .right { text-align: right; }
    @media print {
      .no-print { display: none !important; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px;padding:10px;background:#fff3cd;border:1px solid #ffe69c;border-radius:6px;font-size:13px;">
    En la ventana de impresión elegí <strong>Guardar como PDF</strong>. Los números quedarán clicables en el PDF.
  </div>
  <h1>Pedidos para entrega</h1>
  <div class="meta">
    Periodo: ${escapeHtml(formatDatePY(dateFrom))} al ${escapeHtml(formatDatePY(dateTo))} ·
    Cantidad: ${selected.length}
  </div>
  <div class="notice">
    Al hacer clic en el teléfono se abre WhatsApp con el mensaje de coordinación y el número de guía del pedido.
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Pedido</th>
        <th>Cliente</th>
        <th>Ciudad</th>
        <th>Teléfono / WhatsApp</th>
        <th>Guía</th>
        <th>Total</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  <\/script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    toast.success(`Se preparó el PDF con ${selected.length} pedido(s)`);
  };

  const desmarcarPagado = async () => {
    if (!rendicionPagada) return;
    if (!confirm('¿Desmarcar esta rendición como pagada?')) return;

    for (const o of delivered) {
      await supabase.from('orders').update({
        delivery_settled: false,
        delivery_paid_at: null,
        status2: '--',
      }).eq('id', o.id);
    }

    await supabase.from('rendiciones_pagadas').delete().eq('id', rendicionPagada.id);
    toast.success('Rendición desmarcada');
    loadClosures();
  };

  const status1Opts = ['PENDIENTE', 'EN RUTA', 'ENTREGADO', 'ENCOMIENDA ENTREGADA', 'CANCELADO', 'DEVUELTO A DEPÓSITO', 'REAGENDADO', 'NO CONTESTA'];
  const state2Opts = ['--', 'GUIA GENERADA', 'FUERA DE COBERTURA', 'CANCELADO', 'REPETIDO', 'RENDIDO'];
  const retiroOpts = ['', 'PENDIENTE', 'REALIZADO', 'CANCELADO'];
  
  let deliveryName = '';
  if (isDelivery) {
    deliveryName = profile?.name || myEmail;
  } else if ((isAdmin || isSupplier) && selectedDeliveryList.length === 1) {
    const found = deliveries.find((d: any) => d.email === selectedDeliveryList[0]);
    deliveryName = found?.name || selectedDeliveryList[0];
  } else if ((isAdmin || isSupplier) && selectedDeliveryList.length > 1) {
    deliveryName = `${selectedDeliveryList.length} repartidores seleccionados`;
  }
  
  const allRendered = noRendidos.length === 0 && delivered.length > 0;
  
  const canEditFull = isAdmin || isSupplier;
  const canEditStatus1 = isAdmin || isSupplier || isDelivery || isVendedor;
  const canManageRendicion = isAdmin || isSupplier;
  const canManageGuides = isDelivery || isAdmin || isSupplier;
  const selectedVisibleCount = filteredOrders.filter(order => selectedOrderIds.has(String(order.id))).length;
  const allVisibleOrdersSelected = filteredOrders.length > 0 && filteredOrders.every(order => selectedOrderIds.has(String(order.id)));
  const canViewRendicion = isAdmin || isSupplier || isDelivery;

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Cierres</h3>

      {isDelivery && (
        <div className="mb-3">
          <span className="badge-status badge-entregado">✏️ DELIVERY: solo podés editar Estado 1</span>
          <p className="text-xs text-muted-foreground mt-1">Podés actualizar el estado de tus pedidos. No podés cambiar a DEVUELTO A DEPÓSITO.</p>
        </div>
      )}

      {(isSupplier || isAdmin) && (
        <div className="mb-3">
          <span className="badge-status badge-entregado">✏️ PROVEEDOR/ADMIN: edición completa</span>
          <p className="text-xs text-muted-foreground mt-1">Podés actualizar estados, fechas, ciudades y gestionar rendiciones.</p>
        </div>
      )}

      {isVendedor && (
        <div className="mb-3">
          <span className="badge-status badge-entregado">✏️ VENDEDOR: solo podés ver tus pedidos</span>
          <p className="text-xs text-muted-foreground mt-1">Podés filtrar por fecha, estado y proveedor. Todos los pedidos que ves son los que vos creaste.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        
        {(isSupplier || isAdmin) && (
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              className="app-input !w-auto min-w-[280px] text-left"
              onClick={() => setShowDeliveryDropdown(!showDeliveryDropdown)}
            >
              {selectedDeliveryList.length === 0
                ? 'Todos los repartidores'
                : `${selectedDeliveryList.length} repartidor${selectedDeliveryList.length > 1 ? 'es' : ''} seleccionado${selectedDeliveryList.length > 1 ? 's' : ''}`}
            </button>

            <button
              className="nav-btn !bg-gray-500 text-xs !py-1 !px-2"
              onClick={() => loadDeliveries()}
              title="Recargar repartidores"
              type="button"
            >
              🔄
            </button>

            {showDeliveryDropdown && (
              <div className="absolute top-full left-0 z-50 mt-1 w-[360px] max-h-96 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                <div className="p-2 border-b border-border">
                  <input
                    className="app-input w-full text-sm"
                    placeholder="🔎 Buscar delivery por nombre o correo..."
                    value={deliverySearch}
                    onChange={e => setDeliverySearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 p-2 border-b border-border">
                  <button className="nav-btn !py-1 text-xs" type="button" onClick={selectAllDeliveryFilters}>
                    {filterDeliveries.size === deliveries.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                  <button className="nav-btn !py-1 text-xs" type="button" onClick={() => setFilterDeliveries(new Set())}>
                    Limpiar
                  </button>
                </div>
                <div className="max-h-64 overflow-auto">
                  {loadingDeliveries ? (
                    <div className="p-3 text-sm text-muted-foreground">Cargando repartidores...</div>
                  ) : filteredDeliveryOptions.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No hay repartidores disponibles</div>
                  ) : (
                    filteredDeliveryOptions.map((d: any) => (
                      <label key={d.email} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-secondary">
                        <input
                          type="checkbox"
                          checked={filterDeliveries.has(d.email)}
                          onChange={() => toggleDeliveryFilter(d.email)}
                        />
                        <span className="font-bold">{d.name || d.email}</span>
                        {d.name && <span className="ml-auto text-xs text-muted-foreground">{d.email}</span>}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {(isVendedor || isDelivery || isAdmin) && suppliers.length > 0 && (
          <select className="app-input !w-auto min-w-[280px]" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {suppliers.map(s => (
              <option key={s.email} value={s.email}>
                {s.name || s.email}
              </option>
            ))}
          </select>
        )}

        <select className="app-input !w-auto min-w-[200px]" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="ENTREGADO">ENTREGADO</option>
          <option value="ENCOMIENDA ENTREGADA">ENCOMIENDA ENTREGADA</option>
          <option value="EN RUTA">EN RUTA</option>
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="CANCELADO">CANCELADO</option>
          <option value="DEVUELTO A DEPÓSITO">DEVUELTO A DEPÓSITO</option>
          <option value="REAGENDADO">REAGENDADO</option>
          <option value="NO CONTESTA">NO CONTESTA</option>
        </select>
        
        {!isVendedor && !isSupplier && (
          <select className="app-input !w-auto" value={filterDateBy} onChange={e => setFilterDateBy(e.target.value as any)}>
            <option value="assigned_at">📅 Filtrar por fecha de asignación</option>
            <option value="created_at">📅 Filtrar por fecha de creación</option>
          </select>
        )}
        
        <button className="nav-btn active" onClick={loadClosures}>Aplicar</button>
      </div>

      {(selectedDeliveryList.length > 0 || isDelivery || isSupplier || isVendedor) && (
        <div className="grid-kpi mb-4">
          <div className="kpi-card">
            <div className="text-xs text-muted-foreground mb-1">📦 Pedidos</div>
            <div className="text-[22px] font-extrabold">{filteredOrders.length}</div>
            <div className="text-xs text-muted-foreground">en el período</div>
          </div>
        </div>
      )}

      {canViewRendicion && delivered.length > 0 && (
        <div className="app-card !p-4 mb-4 border-l-4 border-l-[hsl(var(--primary))]">
          <h4 className="font-extrabold mb-3">📋 Control de Rendición</h4>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="chip text-[11px]">Delivery:</span>
              <span className="text-sm font-bold">{deliveryName || (isDelivery ? profile?.name : 'Seleccionar')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="chip text-[11px]">Fecha:</span>
              <span className="text-sm">{dateFrom} a {dateTo}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="chip text-[11px]">Total a pagar:</span>
              <span className="text-lg font-extrabold">{nf(totalAPagar)} Gs</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="chip text-[11px]">Estado:</span>
              <span className={`badge-status ${rendicionPagada ? 'badge-entregado' : allRendered ? 'badge-entregado' : 'badge-pendiente'}`}>
                {rendicionPagada ? '💰 PAGADO' : allRendered ? '✅ RENDIDO' : '⏳ PENDIENTE'}
              </span>
            </div>
          </div>
          
          {rendicionPagada ? (
            <div className="p-3 rounded-xl border border-[#4ade80]/30 bg-[#4ade80]/10">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-sm text-[#4ade80] border border-[#4ade80]/30">
                  💰 PAGADO
                </span>
                <div className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Pagado el:</span> {new Date(rendicionPagada.pagado_en).toLocaleString('es-PY')}
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Por:</span> {rendicionPagada.marcado_por}
                </div>
                {rendicionPagada.nota && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">Nota:</span> {rendicionPagada.nota}
                  </div>
                )}
                {canManageRendicion && (
                  <button
                    onClick={desmarcarPagado}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-destructive/30 text-destructive hover:bg-destructive/10 transition-all"
                  >
                    ↩ Desmarcar
                  </button>
                )}
              </div>
            </div>
          ) : (
            canManageRendicion && (
              <div className="flex flex-wrap items-center gap-3">
                <input className="app-input flex-1 min-w-[250px]" placeholder="Agregar nota (opcional)"
                  value={rendicionNote} onChange={e => setRendicionNote(e.target.value)} />
                <button
                  onClick={markRendicionPagada}
                  disabled={((selectedDeliveryList.length !== 1) && !isDelivery) || totalAPagar <= 0}
                  className="nav-btn active"
                >
                  ✅ MARCAR COMO PAGADO
                </button>
              </div>
            )
          )}
        </div>
      )}

      <p className="chip mb-3 text-[10px]">Los KPIs se calculan <strong>solo</strong> con Estado 1 = ENTREGADO.</p>

      <div className="grid-kpi mb-4">
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">ENTREGADOS</div><div className="text-[22px] font-extrabold">{kpis.entregados}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.entregadosRev)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">ENCOMIENDAS</div><div className="text-[22px] font-extrabold">{kpis.encomiendas}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.encomiendaRev)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Ganancia Delivery</div><div className="text-[22px] font-extrabold">{nf(kpis.deliveryFee)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Neto a Rendir</div><div className="text-[22px] font-extrabold">{nf(netRendir)}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Pendientes rendir</div><div className="text-[22px] font-extrabold" style={{ color: '#eab308' }}>{kpis.noRendidos}</div><div className="text-xs text-muted-foreground">Neto (Gs) {nf(noRendidos.reduce((s, o) => s + (Number(o.total_gs || 0) - getDeliveryFeeForOrder(o)), 0))}</div></div>
        <div className="kpi-card"><div className="text-xs text-muted-foreground mb-1">Ya rendidos</div><div className="text-[22px] font-extrabold" style={{ color: '#4ade80' }}>{kpis.rendidos}</div><div className="text-xs text-muted-foreground">Gs {nf(kpis.montoRendido)}</div></div>
      </div>

      {(isAdmin || isSupplier) && delivered.length > 0 && (
        <div className="app-card !p-4 mb-4 border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h4 className="font-extrabold text-lg">💰 Panel de Ganancia Real</h4>
              <p className="text-xs text-muted-foreground">
                Calculado con pedidos entregados/encomienda entregada del período. El costo del producto usa products.real_cost_gs.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">UTILIDAD FINAL</div>
              <div className="text-2xl font-extrabold text-emerald-400">Gs {nf(financePanel.utilidadFinal)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="kpi-card border border-blue-500/20 bg-blue-500/10">
              <div className="text-xs text-blue-200 mb-2 font-bold">📦 Resumen productos</div>
              <div className="flex justify-between text-xs mb-1"><span>Venta productos</span><strong>Gs {nf(financePanel.ventaProductos)}</strong></div>
              <div className="flex justify-between text-xs mb-1"><span>Costo real productos</span><strong className="text-red-400">- Gs {nf(financePanel.costoRealProductos)}</strong></div>
              <div className="border-t border-blue-500/20 mt-2 pt-2 flex justify-between text-sm">
                <span className="font-bold">Ganancia productos</span>
                <strong className="text-blue-300">Gs {nf(financePanel.gananciaProductos)}</strong>
              </div>
            </div>

            <div className="kpi-card border border-cyan-500/20 bg-cyan-500/10">
              <div className="text-xs text-cyan-200 mb-2 font-bold">🚚 Resumen delivery</div>
              <div className="flex justify-between text-xs mb-1"><span>Delivery cobrado</span><strong>Gs {nf(financePanel.deliveryCobrado)}</strong></div>
              <div className="flex justify-between text-xs mb-1"><span>Pago delivery</span><strong className="text-red-400">- Gs {nf(financePanel.pagoDelivery)}</strong></div>
              <div className="border-t border-cyan-500/20 mt-2 pt-2 flex justify-between text-sm">
                <span className="font-bold">Ganancia delivery</span>
                <strong className="text-cyan-300">Gs {nf(financePanel.gananciaDelivery)}</strong>
              </div>
            </div>

            <div className="kpi-card border border-amber-500/20 bg-amber-500/10">
              <div className="text-xs text-amber-200 mb-2 font-bold">👨‍💼 Comisiones</div>
              <div className="flex justify-between text-xs mb-1"><span>Comisión vendedor</span><strong className="text-red-400">- Gs {nf(financePanel.comisiones)}</strong></div>
              <div className="border-t border-amber-500/20 mt-2 pt-2 text-[11px] text-muted-foreground">
                Tomado desde orders.commission_gs
              </div>
            </div>

            <div className="kpi-card border border-emerald-500/20 bg-emerald-500/10">
              <div className="text-xs text-emerald-200 mb-2 font-bold">💎 Utilidad neta final</div>
              <div className="text-[11px] text-muted-foreground mb-2">
                Ganancia productos + Ganancia delivery - Comisiones
              </div>
              <div className="text-3xl font-extrabold text-emerald-400">Gs {nf(financePanel.utilidadFinal)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="🔍 Buscar por nombre, teléfono, ID o ciudad..."
            className="app-input w-full pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
            🔍
          </span>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
        {searchTerm && (
          <p className="text-xs text-muted-foreground mt-1">
            Mostrando {filteredOrders.length} de {orders.length} pedidos
          </p>
        )}
      </div>

      {canManageGuides && (
        <div className="app-card !p-3 mb-4 border border-blue-500/20 bg-blue-500/5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="nav-btn"
              onClick={selectOrClearVisibleOrders}
              disabled={filteredOrders.length === 0}
            >
              {allVisibleOrdersSelected ? '☐ Deseleccionar visibles' : '☑ Seleccionar visibles'}
            </button>

            <button
              type="button"
              className="nav-btn"
              onClick={clearOrderSelection}
              disabled={selectedVisibleCount === 0}
            >
              Limpiar selección
            </button>

            <button
              type="button"
              className="nav-btn active"
              onClick={copySelectedGuides}
              disabled={selectedVisibleCount === 0}
            >
              📋 Copiar guías ({selectedVisibleCount})
            </button>

            <button
              type="button"
              className="nav-btn active"
              onClick={downloadSelectedOrdersPdf}
              disabled={selectedVisibleCount === 0}
            >
              📄 Descargar PDF ({selectedVisibleCount})
            </button>

            <span className="text-xs text-muted-foreground ml-auto">
              Seleccionados: <strong>{selectedVisibleCount}</strong> de {filteredOrders.length}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            El número de teléfono del PDF abre WhatsApp con el mensaje de coordinación y el número de guía.
          </p>
        </div>
      )}

      <div className="overflow-auto">
        <table className="app-table min-w-[1980px]">
          <thead>
            <tr>
              {canManageGuides && (
                <th className="text-center">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los pedidos visibles"
                    checked={allVisibleOrdersSelected}
                    onChange={selectOrClearVisibleOrders}
                    disabled={filteredOrders.length === 0}
                  />
                </th>
              )}
              <th>Fecha Asignación</th>
              <th>Fecha Creación</th>
              <th>ID</th>
              <th>Ciudad</th>
              <th>Cliente</th>
              <th>Teléfono / WhatsApp</th>
              {canManageGuides && <th>Guía</th>}
              <th>Proveedor</th>
              <th>Delivery</th>
              <th className="text-right">Total (Gs)</th>
              <th className="text-right">Tarifa (Gs)</th>
              <th className="text-right">Neto (Gs)</th>
              <th>Estado 1</th>
              <th>Estado de retiro</th>
              <th>Estado 2 (cierre)</th>
              <th>Historial</th>
              {canManageRendicion && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(o => {
              const fee = Number(o.delivery_fee_gs) || getFee(o.assigned_delivery || '', o.city || '');
              const net = Number(o.total_gs || 0) - fee;
              const isSettled = o.delivery_settled;
              
              const getStatusBadgeClass = (status: string) => {
                if (status === 'ENTREGADO' || status === 'ENCOMIENDA ENTREGADA') return 'badge-entregado';
                if (status === 'CANCELADO' || status === 'NO CONTESTA') return 'badge-cancelado';
                if (status === 'DEVUELTO A DEPÓSITO') return 'badge-warning';
                if (status === 'REAGENDADO') return 'badge-info';
                return 'badge-pendiente';
              };
              
              return (
                <tr key={o.id} className={isSettled ? 'opacity-60' : ''}>
                  {canManageGuides && (
                    <td className="text-center">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar pedido ${o.order_number || o.id}`}
                        checked={selectedOrderIds.has(String(o.id))}
                        onChange={() => toggleOrderSelection(String(o.id))}
                      />
                    </td>
                  )}
                  <td className="text-xs whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span>
                        {formatDatePY(o.assigned_at)}
                      </span>
                      {canEditFull && editingDateId === o.id ? (
                        <input
                          type="date"
                          className="app-input !py-0 !px-1 text-xs w-auto"
                          defaultValue={dateInputValue(o.assigned_at)}
                          onChange={(e) => handleDateChange(o.id, e.target.value)}
                          onBlur={() => setEditingDateId(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setEditingDateId(null);
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        canEditFull && (
                          <button
                            onClick={() => setEditingDateId(o.id)}
                            className="text-xs opacity-60 hover:opacity-100 transition-opacity"
                            title="Cambiar fecha"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                          >
                            📅
                          </button>
                        )
                      )}
                    </div>
                   </td>
                  <td className="text-xs whitespace-nowrap">
                    {formatDatePY(o.created_at)}
                   </td>
                  <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="text-xs">
                    {canEditFull ? (
                      <select
                        className="app-input !w-auto !py-1 !px-2 text-xs min-w-[160px]"
                        value={o.city || ''}
                        onChange={e => updateOrderCity(o.id, e.target.value)}
                      >
                        <option value="">Seleccionar ciudad</option>
                        {clientPrices.map((cp: any) => (
                          <option key={cp.city} value={cp.city}>{cp.city}</option>
                        ))}
                        {o.city && !clientPrices.some((cp: any) => cp.city === o.city) && (
                          <option value={o.city}>{o.city}</option>
                        )}
                      </select>
                    ) : (
                      <span>{o.city || '—'}</span>
                    )}
                  </td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-xs whitespace-nowrap">
                    {o.customer_phone ? (
                      getWhatsAppUrl(o) ? (
                        <a
                          href={getWhatsAppUrl(o)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-green-600 hover:underline"
                          title="Abrir WhatsApp con mensaje y guía"
                        >
                          📱 {o.customer_phone}
                        </a>
                      ) : (
                        <span>{o.customer_phone}</span>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  {canManageGuides && (
                    <td className="text-xs font-mono whitespace-nowrap">
                      {getGuideNumber(o) || '—'}
                    </td>
                  )}
                  <td className="text-xs">{o.provider_email || '—'}</td>
                  <td className="text-xs">
                    {canEditFull ? (
                      <select
                        className="app-input !w-auto !py-1 !px-2 text-xs min-w-[220px]"
                        value={o.assigned_delivery || ''}
                        onChange={e => updateAssignedDelivery(o.id, e.target.value)}
                      >
                        <option value="">Seleccionar delivery</option>
                        {deliveries.map((d: any) => (
                          <option key={d.email} value={d.email}>
                            {d.name || d.email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>
                        {(() => {
                          const found = deliveries.find((d: any) => d.email === o.assigned_delivery);
                          return found?.name || o.assigned_delivery || '—';
                        })()}
                      </span>
                    )}
                  </td>
                  <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                  <td className="text-right text-xs">{nf(fee)}</td>
                  <td className="text-right text-xs">{nf(net)}</td>
                  <td>
                    {canEditStatus1 ? (
                      <select 
                        className="app-input !w-auto !py-1 !px-2 text-xs"
                        value={o.status || 'PENDIENTE'}
                        onChange={e => updateStatus1(o.id, e.target.value)}
                        disabled={isVendedor}
                      >
                        {status1Opts.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className={`badge-status ${getStatusBadgeClass(o.status)}`}>{o.status}</span>
                    )}
                  </td>
                  <td>
                    {canEditFull ? (
                      <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.estado_retiro || ''}
                        onChange={e => updateRetiro(o.id, e.target.value)}>
                        {retiroOpts.map(s => <option key={s} value={s}>{s || '—'}</option>)}
                      </select>
                    ) : <span className="text-xs">{o.estado_retiro || '—'}</span>}
                  </td>
                  <td>
                    {canEditFull ? (
                      <select className="app-input !w-auto !py-1 !px-2 text-xs" value={o.status2 || '--'}
                        onChange={e => updateStatus2(o.id, e.target.value)}>
                        {state2Opts.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <span className="text-xs">{o.status2 || '—'}</span>}
                  </td>
                  <td>
                    <button
                      onClick={() => loadOrderHistory(o)}
                      className="nav-btn !py-1 !px-2 text-[11px] !bg-blue-600/20 hover:!bg-blue-600/40 text-blue-700"
                      title="Ver historial"
                    >
                      📜 Historial
                    </button>
                  </td>
                  {canManageRendicion && (
                    <td>
                      <div className="flex items-center gap-1">
                        {!isSettled && (o.status === 'ENTREGADO' || o.status === 'ENCOMIENDA ENTREGADA') && (
                          <button
                            onClick={() => markSingleRendido(o.id)}
                            className="nav-btn active !py-1 !px-2 text-[11px]"
                          >
                            RENDIDO
                          </button>
                        )}
                        {isSettled && (
                          <span className="text-xs font-bold" style={{ color: '#4ade80' }}>RENDIDO</span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={(canManageRendicion ? 16 : 15) + (canManageGuides ? 2 : 0)} className="text-center text-muted-foreground py-8">
                  {searchTerm ? 'No se encontraron resultados para tu búsqueda' : 'Sin resultados en este período'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal para solicitar comentario y captura */}
      <StatusChangeModal
        isOpen={statusChangeModal.isOpen}
        onClose={() => setStatusChangeModal({ isOpen: false, orderId: '', newStatus: '', oldStatus: '' })}
        onConfirm={processStatusChangeWithData}
        newStatus={statusChangeModal.newStatus}
        uploading={uploadingFile}
      />

      {/* Modal de historial */}
      <HistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        order={selectedOrder}
        history={orderHistory}
        loading={loadingHistory}
      />
    </div>
  );
}
