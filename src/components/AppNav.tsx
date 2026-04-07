import { useAuth } from '@/hooks/useAuth';

export type ViewName =
  | 'auth' | 'dashboard' | 'news' | 'chat' | 'products' | 'earnings'
  | 'order' | 'orders' | 'rates' | 'commissions' | 'commissionRequests'
  | 'counter' | 'closures' | 'rendicionesPagadas' | 'profile' | 'users'
  | 'assignOrders' | 'rankingDelivery' | 'withGuides' | 'shopifyInbox' | 'mapa';

interface NavItem {
  id: ViewName;
  label: string;
  roles?: string[];
  excludeRoles?: string[];
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', excludeRoles: ['DESPACHANTE', 'DELIVERY'] },
  { id: 'news', label: 'Novedades' },
  { id: 'chat', label: 'Chat' },
  { id: 'withGuides', label: 'Pedidos con guías', roles: ['ADMIN', 'DESPACHANTE', 'PROVEEDOR'] },
  { id: 'rankingDelivery', label: '🏆 Ranking Delivery', roles: ['ADMIN', 'DESPACHANTE', 'PROVEEDOR', 'DELIVERY'] },
  { id: 'products', label: 'Productos', excludeRoles: ['DELIVERY'] },
  { id: 'earnings', label: 'Ganancias', roles: ['ADMIN', 'PROVEEDOR'] },
  { id: 'order', label: 'Cargar pedido', roles: ['VENDEDOR'] },
  { id: 'orders', label: 'Pedidos' },
  { id: 'shopifyInbox', label: 'Pedidos Shopify + WhatsApp', roles: ['ADMIN'] },
  { id: 'assignOrders', label: 'Asignar Pedidos', roles: ['ADMIN', 'PROVEEDOR', 'DELIVERY'] },
  { id: 'mapa', label: 'Mapa', roles: ['ADMIN', 'DELIVERY'] },
  { id: 'rates', label: 'Costos delivery', excludeRoles: ['DESPACHANTE', 'DELIVERY'] },
  { id: 'commissions', label: 'Pago de comisiones', roles: ['ADMIN', 'PROVEEDOR', 'VENDEDOR'] },
  { id: 'commissionRequests', label: 'Solicitud de comisiones', roles: ['ADMIN', 'PROVEEDOR', 'VENDEDOR'] },
  { id: 'counter', label: 'Actualizar contador', roles: ['ADMIN'] },
  { id: 'closures', label: 'Cierres', roles: ['ADMIN', 'PROVEEDOR', 'DELIVERY'] },
  { id: 'rendicionesPagadas', label: 'Rendiciones pagadas', roles: ['ADMIN', 'PROVEEDOR'] },
  { id: 'profile', label: 'Perfil', excludeRoles: ['DESPACHANTE'] },
  { id: 'users', label: '👥 Usuarios', roles: ['ADMIN'] },
];

interface AppNavProps {
  currentView: ViewName;
  onNavigate: (view: ViewName) => void;
}

export default function AppNav({ currentView, onNavigate }: AppNavProps) {
  const { profile } = useAuth();
  const role = profile?.role || '';

  const visibleItems = navItems.filter(item => {
    if (item.roles && !item.roles.includes(role)) return false;
    if (item.excludeRoles && item.excludeRoles.includes(role)) return false;
    return true;
  });

  return (
    <nav className="flex flex-wrap items-center gap-2 mb-3">
      {visibleItems.map(item => (
        <button
          key={item.id}
          className={`nav-btn ${currentView === item.id ? 'active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          {item.label}
        </button>
      ))}
      {role && <span className="chip">{role}</span>}
    </nav>
  );
}
