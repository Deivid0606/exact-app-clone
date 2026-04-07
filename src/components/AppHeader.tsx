import { useAuth } from '@/hooks/useAuth';

interface AppHeaderProps {
  onRefresh: () => void;
  lastUpdate: string;
}

export default function AppHeader({ onRefresh, lastUpdate }: AppHeaderProps) {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex justify-between items-center gap-3 mb-4">
      <div className="flex items-center gap-3">
        <img
          src="https://cdn.shopify.com/s/files/1/0885/3012/5095/files/Captura_de_pantalla_2026-01-12_023843.jpg?v=1768196352"
          alt="DCANP GROUP Logo"
          className="w-10 h-10 rounded-[10px] object-cover"
        />
        <span className="text-[22px] font-extrabold tracking-wide">
          EL-ECOMMERCE DCANP GROUP
        </span>
        <span className="chip">Cloud DB</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Última actualización: {lastUpdate}
          </span>
          <button className="nav-btn text-xs px-2.5 py-1.5" onClick={onRefresh} title="Actualizar">
            ↻
          </button>
        </div>
        {profile && (
          <div className="flex items-center gap-2">
            <span className="chip">{profile.email}</span>
            <button className="nav-btn" onClick={signOut}>Salir</button>
          </div>
        )}
      </div>
    </div>
  );
}
