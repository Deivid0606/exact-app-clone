// Función para extraer últimos 6 dígitos
const getLast6Digits = (phone: string): string => {
  if (!phone) return '';
  const digits = phone.toString().replace(/\D/g, '');
  return digits.slice(-6);
};

// Actualiza la función checkBuyerHistory
const checkBuyerHistory = async (phoneNumber: string) => {
  if (!phoneNumber || phoneNumber.length < 6) {
    setHasHistory(false);
    return;
  }

  setCheckingHistory(true);
  try {
    const last6Digits = getLast6Digits(phoneNumber);
    
    // Buscar por coincidencia en los últimos 6 dígitos
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: false })
      .or(`phone.ilike.%${last6Digits}`);

    if (error) throw error;
    
    // Filtrar manualmente para asegurar coincidencia exacta de últimos 6 dígitos
    const matchingOrders = orders?.filter(order => {
      const orderLast6 = getLast6Digits(order.phone);
      return orderLast6 === last6Digits;
    }) || [];
    
    setHasHistory(matchingOrders.length > 0);
  } catch (error) {
    console.error('Error verificando historial:', error);
    setHasHistory(false);
  } finally {
    setCheckingHistory(false);
  }
};
