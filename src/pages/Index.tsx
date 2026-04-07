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
import CreateOrderView from '@/components/CreateOrderView';
import RatesView from '@/components/RatesView';
import CommissionsView from '@/components/CommissionsView';
import CommissionRequestsView from '@/components/CommissionRequestsView';
import ClosuresView from '@/components/ClosuresView';
import EarningsView from '@/components/EarningsView';
import ChatView from '@/components/ChatView';
import AssignOrdersView from '@/components/AssignOrdersView';
import RankingDeliveryView from '@/components/RankingDeliveryView';
import RendicionesPagadasView from '@/components/RendicionesPagadasView';
import WithGuidesView from '@/components/WithGuidesView';
import CounterView from '@/components/CounterView';
import MapView from '@/components/MapView';
import ShopifyInboxView from '@/components/ShopifyInboxView';

export default function Index() {
  const { user, profile, loading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewName>('auth');
  const [lastUpdate, setLastUpdate] = useState(() => new Date().toLocaleString('es-PY'));

  const handleAuthSuccess = () => setCurrentView('dashboard');
  const handleRefresh = () => setLastUpdate(new Date().toLocaleString('es-PY'));

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

  if (!user || !profile) {
    return (
      <div className="max-w-full mx-auto px-6 py-5">
        <AppHeader onRefresh={handleRefresh} lastUpdate={lastUpdate} />
        <AuthView onSuccess={handleAuthSuccess} />
      </div>
    );
  }

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
      case 'order': return <CreateOrderView />;
      case 'rates': return <RatesView />;
      case 'commissions': return <CommissionsView />;
      case 'commissionRequests': return <CommissionRequestsView />;
      case 'closures': return <ClosuresView />;
      case 'earnings': return <EarningsView />;
      case 'chat': return <ChatView />;
      case 'assignOrders': return <AssignOrdersView />;
      case 'rankingDelivery': return <RankingDeliveryView />;
      case 'rendicionesPagadas': return <RendicionesPagadasView />;
      case 'withGuides': return <WithGuidesView />;
      case 'counter': return <CounterView />;
      case 'mapa': return <MapView />;
      case 'shopifyInbox': return <ShopifyInboxView />;
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
