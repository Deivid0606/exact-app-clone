export default function MapView() {
  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Mapa en tiempo real</h3>
      <div className="kpi-card min-h-[500px] flex flex-col items-center justify-center">
        <span className="text-4xl mb-3">🗺️</span>
        <p className="text-muted-foreground text-sm">El mapa en tiempo real requiere la Geolocation API y un proveedor de mapas.</p>
        <p className="text-xs text-muted-foreground mt-1">Se activará cuando los delivery compartan su ubicación.</p>
        <div className="flex gap-2 mt-4">
          <span className="chip text-[10px]">Leaflet integrado</span>
          <span className="chip text-[10px]">Actualización cada 15s</span>
        </div>
      </div>
    </div>
  );
}
