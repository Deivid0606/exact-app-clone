import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AppHeader from '@/components/AppHeader';
import AppNav, { type ViewName } from '@/components/AppNav';
import AuthView from '@/components/AuthView';
import DashboardView from '@/components/DashboardView';
import OrdersView from '@/components/OrdersView';
import NewsView from '@/components/NewsView';
import ProductsView from '@/components/ProductsView';
import ProfileView from '@/components/ProfileView';
import UsersView from '@/components/UsersView';
import PlaceholderView from '@/components/PlaceholderView';

export default function Index() {
  const { user, profile, loading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewName>('auth');
  const [lastUpdate, setLastUpdate] = useState(() => new Date().toLocaleString('es-PY'));

  const handleAuthSuccess = () => setCurrentView('dashboard');

  const handleRefresh = () => {
    setLastUpdate(new Date().toLocaleString('es-PY'));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3">
          <span className="btn-spinner !w-6 !h-6 !border-brand !border-t-brand-glow" />
          <span className="text-muted-foreground">Cargando...</span>
        </div>
      </div>
    );
  }

  // If not logged in, show auth
  if (!user || !profile) {
    return (
      <div className="max-w-full mx-auto px-6 py-5">
        <AppHeader onRefresh={handleRefresh} lastUpdate={lastUpdate} />
        <AuthView onSuccess={handleAuthSuccess} />
      </div>
    );
  }

  // Auto-navigate on first load
  if (currentView === 'auth') {
    const defaultView = (profile.role === 'DESPACHANTE' || profile.role === 'DELIVERY') ? 'orders' : 'dashboard';
    setCurrentView(defaultView as ViewName);
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView />;
      case 'orders': return <OrdersView />;
      case 'news': return <NewsView />;
      case 'products': return <ProductsView />;
      case 'profile': return <ProfileView />;
      case 'users': return <UsersView />;
      case 'chat': return <PlaceholderView title="Chat" icon="💬" />;
      case 'earnings': return <PlaceholderView title="Ganancias" icon="💹" />;
      case 'order': return <PlaceholderView title="Cargar pedido" icon="🛒" />;
      case 'rates': return <PlaceholderView title="Costos delivery" icon="🚚" />;
      case 'commissions': return <PlaceholderView title="Pago de comisiones" icon="💸" />;
      case 'commissionRequests': return <PlaceholderView title="Solicitud de comisiones" icon="📋" />;
      case 'counter': return <PlaceholderView title="Actualizar contador" icon="🔢" />;
      case 'closures': return <PlaceholderView title="Cierres" icon="✅" />;
      case 'rendicionesPagadas': return <PlaceholderView title="Rendiciones pagadas" icon="🏷️" />;
      case 'withGuides': return <PlaceholderView title="Pedidos con guías" icon="📦" />;
      case 'shopifyInbox': return <PlaceholderView title="Pedidos Shopify + WhatsApp" icon="🛍️" />;
      case 'assignOrders': return <PlaceholderView title="Asignar Pedidos" icon="📌" />;
      case 'rankingDelivery': return <PlaceholderView title="🏆 Ranking Delivery" icon="🏆" />;
      case 'mapa': return <PlaceholderView title="Mapa" icon="🗺️" />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="max-w-full mx-auto px-6 py-5">
      <AppHeader onRefresh={handleRefresh} lastUpdate={lastUpdate} />
      <AppNav currentView={currentView} onNavigate={setCurrentView} />
      {renderView()}
    </div>
  );
}
