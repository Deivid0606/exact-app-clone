interface PlaceholderViewProps {
  title: string;
  icon?: string;
}

export default function PlaceholderView({ title, icon = '🚧' }: PlaceholderViewProps) {
  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">{title}</h3>
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <span className="text-4xl mb-3">{icon}</span>
        <p className="text-sm">Esta sección se implementará en la siguiente fase.</p>
        <p className="text-xs mt-1">Pedí que la construya y la armo al instante.</p>
      </div>
    </div>
  );
}
