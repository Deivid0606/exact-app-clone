import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type StoreEvent = {
  id: string;
  landing_page_id: string;
  session_id: string;
  event_type: string;
  product_id: string | null;
  value_gs: number | null;
  department: string | null;
  city: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type StoreOrder = {
  id: string;
  landing_page_id: string;
  total_gs: number;
  department: string | null;
  city: string | null;
  created_at: string;
};

type PageInfo = {
  id: string;
  name: string;
};

const nf = (value: number) =>
  new Intl.NumberFormat("es-PY").format(Math.round(Number(value || 0)));

const pyDate = (value: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

export default function StoreRealtimeView() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() || "";

  const [events, setEvents] = useState<StoreEvent[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!email) return;

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const [eventsResult, ordersResult, pagesResult] = await Promise.all([
      supabase
        .from("landing_page_events")
        .select(
          "id,landing_page_id,session_id,event_type,product_id,value_gs,department,city,metadata,created_at",
        )
        .eq("seller_email", email)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("landing_page_orders")
        .select("id,landing_page_id,total_gs,department,city,created_at")
        .eq("seller_email", email)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("landing_pages")
        .select("id,name")
        .eq("owner_email", email),
    ]);

    setLoading(false);

    if (!eventsResult.error) {
      setEvents((eventsResult.data || []) as StoreEvent[]);
    }
    if (!ordersResult.error) {
      setOrders((ordersResult.data || []) as StoreOrder[]);
    }
    if (!pagesResult.error) {
      setPages((pagesResult.data || []) as PageInfo[]);
    }
  }, [email]);

  useEffect(() => {
    load();

    if (!email) return;

    const channel = supabase
      .channel(`store-realtime-${email}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "landing_page_events",
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "landing_page_orders",
        },
        () => load(),
      )
      .subscribe();

    const timer = window.setInterval(load, 30000);

    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [email, load]);

  const stats = useMemo(() => {
    const now = Date.now();
    const today = pyDate(new Date());

    const todayEvents = events.filter(
      (event) => pyDate(event.created_at) === today,
    );
    const todayOrders = orders.filter(
      (order) => pyDate(order.created_at) === today,
    );

    const activeEvents = events.filter(
      (event) =>
        now - new Date(event.created_at).getTime() <= 5 * 60 * 1000,
    );

    const activeVisitors = new Set(
      activeEvents.map((event) => event.session_id).filter(Boolean),
    ).size;

    const sessions = new Set(
      todayEvents.map((event) => event.session_id).filter(Boolean),
    ).size;

    const checkouts = todayEvents.filter(
      (event) => event.event_type === "checkout_open",
    );

    const purchases = todayEvents.filter(
      (event) => event.event_type === "purchase",
    );

    const pageViews = todayEvents.filter(
      (event) => event.event_type === "page_view",
    );

    const pageCounter = new Map<string, number>();
    pageViews.forEach((event) => {
      pageCounter.set(
        event.landing_page_id,
        (pageCounter.get(event.landing_page_id) || 0) + 1,
      );
    });

    const pageNameMap = new Map(pages.map((page) => [page.id, page.name]));

    const topPages = [...pageCounter.entries()]
      .map(([pageId, count]) => ({
        pageId,
        name: pageNameMap.get(pageId) || "Página",
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const locationCounter = new Map<string, number>();
    todayOrders.forEach((order) => {
      const key = [order.department, order.city]
        .filter(Boolean)
        .join(" · ");
      if (!key) return;
      locationCounter.set(key, (locationCounter.get(key) || 0) + 1);
    });

    const topLocations = [...locationCounter.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      activeVisitors,
      sessions,
      checkouts: checkouts.length,
      purchases: purchases.length,
      orders: todayOrders.length,
      sales: todayOrders.reduce(
        (sum, order) => sum + Number(order.total_gs || 0),
        0,
      ),
      topPages,
      topLocations,
    };
  }, [events, orders, pages]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border p-10 text-center">
        Cargando métricas...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-2xl font-black">🌐 Vista en tiempo real</div>
        <span className="text-xs text-muted-foreground">
          🔵 Actualización automática
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Metric
          label="Visitantes ahora mismo"
          value={String(stats.activeVisitors)}
        />
        <Metric
          label="Ventas de hoy"
          value={`Gs. ${nf(stats.sales)}`}
        />
        <Metric label="Sesiones de hoy" value={String(stats.sessions)} />
        <Metric label="Pedidos de hoy" value={String(stats.orders)} />
      </div>

      <div className="rounded-2xl border border-border p-4">
        <div className="font-black">Comportamiento de clientes</div>
        <div className="grid grid-cols-1 md:grid-cols-3 mt-3">
          <Behavior label="Checkouts iniciados" value={stats.checkouts} />
          <Behavior label="Compras realizadas" value={stats.purchases} />
          <Behavior label="Pedidos registrados" value={stats.orders} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border p-4">
          <div className="font-black mb-3">Páginas más visitadas hoy</div>
          {stats.topPages.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-3">
              {stats.topPages.map((item) => (
                <Bar
                  key={item.pageId}
                  label={item.name}
                  value={item.count}
                  max={stats.topPages[0]?.count || 1}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border p-4">
          <div className="font-black mb-3">Pedidos por ubicación hoy</div>
          {stats.topLocations.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-3">
              {stats.topLocations.map((item) => (
                <Bar
                  key={item.name}
                  label={item.name}
                  value={item.count}
                  max={stats.topLocations[0]?.count || 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border p-4 bg-background">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
    </div>
  );
}

function Behavior({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 border-b md:border-b-0 md:border-r last:border-r-0 border-border">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = Math.max(4, Math.round((value / Math.max(max, 1)) * 100));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm mb-1">
        <span className="truncate">{label}</span>
        <b>{value}</b>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-primary rounded-full"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      Todavía no hay datos para mostrar.
    </div>
  );
}
