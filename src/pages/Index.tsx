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
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const [currentView, setCurrentView] = useState<ViewName>('auth');
  const [lastUpdate, setLastUpdate] = useState(() => new Date().toLocaleString('es-PY'));
  const [preSelectedSku, setPreSelectedSku] = useState<string | null>(null);

  const handleLoadProduct = (sku: string) => {
    setPreSelectedSku(sku);
    setCurrentView('order');
  };

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

  // Block unapproved users
  if (!profile.approved) {
    return (
      <div className="max-w-full mx-auto px-6 py-5">
        <AppHeader onRefresh={handleRefresh} lastUpdate={lastUpdate} />
        <div className="app-card text-center py-12">
          <h3 className="text-xl font-extrabold mb-3">Cuenta pendiente de aprobación</h3>
          <p className="text-muted-foreground mb-2">
            Tu cuenta fue creada exitosamente pero necesita ser aprobada por un administrador.
          </p>
          <p className="text-muted-foreground text-sm mb-6">
            Una vez aprobada, podrás acceder al sistema con tu rol asignado.
          </p>
          <div className="flex gap-2 justify-center">
            <button className="nav-btn" onClick={() => { refreshProfile(); handleRefresh(); }}>
              Verificar estado
            </button>
            <button className="nav-btn" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        </div>
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
      case 'products': return <ProductsView onLoadProduct={handleLoadProduct} />;
      case 'profile': return <ProfileView />;
      case 'users': return <UsersView />;
      case 'order': return <CreateOrderView initialSku={preSelectedSku} onSkuConsumed={() => setPreSelectedSku(null)} />;
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
