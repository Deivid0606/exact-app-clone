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
import ShopifyConnectionView from '@/components/ShopifyConnectionView';

export interface SheetPrefill {
  customer?: string;
  phone?: string;
  city?: string;
  street?: string;
  district?: string;
  email?: string;
  productTitle?: string;
  totalGs?: number;
  qty?: number;
  obs?: string;
}

export default function Index() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const [currentView, setCurrentView] = useState<ViewName>('auth');
  const [lastUpdate, setLastUpdate] = useState(() => new Date().toLocaleString('es-PY'));
  const [preSelectedSku, setPreSelectedSku] = useState<string | null>(null);
  const [sheetPrefill, setSheetPrefill] = useState<SheetPrefill | null>(null);

  const handleLoadProduct = (sku: string) => {
    setPreSelectedSku(sku);
    setSheetPrefill(null);
    setCurrentView('order');
  };

  const handleSheetConfirm = (prefill: SheetPrefill) => {
    setSheetPrefill(prefill);
    setPreSelectedSku(null);
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
    return <AuthView onSuccess={handleAuthSuccess} />;
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
          <p className="text-muted-foreground text-sm mb-4">
            Una vez aprobada, podrás acceder al sistema con tu rol asignado.
          </p>
          <p className="text-sm mb-6">
            Favor pasar correo y contraseña creada al{' '}
            <a
              href="https://wa.me/595974278352"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-bold text-[#25D366] hover:underline"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              0974 278 352
            </a>
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
      case 'order': return (
        <CreateOrderView
          initialSku={preSelectedSku}
          onSkuConsumed={() => setPreSelectedSku(null)}
          sheetPrefill={sheetPrefill}
          onPrefillConsumed={() => setSheetPrefill(null)}
        />
      );
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
      case 'shopifyInbox': return <ShopifyInboxView onConfirmOrder={handleSheetConfirm} />;
      case 'shopifyConnection': return <ShopifyConnectionView />;
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
