import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type StoreOrderPrefill = {
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
};

type StoreOrder = {
  id: string;
  landing_page_id: string;
  product_id: string | null;
  product_title: string;
  quantity: number;
  unit_price_gs: number;
  total_gs: number;
  customer_name: string;
  phone: string;
  department: string | null;
  city: string;
  address: string | null;
  reference: string | null;
  status: string;
  seller_email: string | null;
  page_name: string | null;
  page_slug: string | null;
  system_status: string | null;
  sent_to_system_at: string | null;
  created_at: string;
};

const nf = (value: number) =>
  new Intl.NumberFormat("es-PY").format(Math.round(Number(value || 0)));

const pyDate = (date: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));

const pyTime = (date: string) =>
  new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

export default function StoreOrdersView({
  onLoadOrder,
}: {
  onLoadOrder: (prefill: StoreOrderPrefill) => void;
}) {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() || "";

  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const today = pyDate(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [showAllDates, setShowAllDates] = useState(false);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!email) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("landing_page_orders")
      .select(
        "id,landing_page_id,product_id,product_title,quantity,unit_price_gs,total_gs,customer_name,phone,department,city,address,reference,status,seller_email,page_name,page_slug,system_status,sent_to_system_at,created_at",
      )
      .eq("seller_email", email)
      .order("created_at", { ascending: false })
      .limit(500);

    setLoading(false);

    if (error) {
      console.error(error);
      toast.error(
        "No se pudieron cargar los pedidos de Mi Tienda. Ejecutá el SQL store_v1.sql.",
      );
      return;
    }

    setOrders((data || []) as StoreOrder[]);
  }, [email]);

  useEffect(() => {
    loadOrders();

    if (!email) return;

    const channel = supabase
      .channel(`store-orders-${email}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "landing_page_orders",
        },
        () => loadOrders(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [email, loadOrders]);

  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((order) => {
      if (!showAllDates && pyDate(order.created_at) !== selectedDate) {
        return false;
      }

      if (!q) return true;

      return [
        order.customer_name,
        order.phone,
        order.city,
        order.department,
        order.product_title,
        order.page_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [orders, showAllDates, selectedDate, search]);

  const filteredTotal = visibleOrders.reduce(
    (sum, order) => sum + Number(order.total_gs || 0),
    0,
  );

  const filteredOpened = visibleOrders.filter(
    (order) => order.system_status === "opened",
  ).length;

  const selectedDateLabel = showAllDates
    ? "Todos"
    : selectedDate === today
      ? "Hoy"
      : new Intl.DateTimeFormat("es-PY", {
          timeZone: "America/Asuncion",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(`${selectedDate}T12:00:00-03:00`));

  const sendToSystem = async (order: StoreOrder) => {
    const { error } = await supabase
      .from("landing_page_orders")
      .update({
        system_status: "opened",
        sent_to_system_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("seller_email", email);

    if (error) {
      console.error(error);
      toast.error("No se pudo preparar el pedido para cargar.");
      return;
    }

    onLoadOrder({
      customer: order.customer_name || "",
      phone: order.phone || "",
      city: order.city || "",
      street: order.address || "",
      district: order.department || "",
      productTitle: order.product_title || "",
      totalGs: Number(order.total_gs || 0),
      qty: Number(order.quantity || 1),
      obs: [
        `PEDIDO MI TIENDA: ${order.id}`,
        order.page_name ? `Página: ${order.page_name}` : "",
        order.page_slug ? `Slug: ${order.page_slug}` : "",
        order.reference ? `Referencia: ${order.reference}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    });
  };


  const deleteOrder = async (order: StoreOrder) => {
    const confirmed = window.confirm(
      `¿Eliminar este pedido?\n\nCliente: ${order.customer_name}\nProducto: ${order.product_title}\nTotal: Gs. ${nf(Number(order.total_gs || 0))}\n\nEsta acción no se puede deshacer.`,
    );

    if (!confirmed) return;

    setDeletingId(order.id);

    const { error } = await supabase
      .from("landing_page_orders")
      .delete()
      .eq("id", order.id)
      .eq("seller_email", email);

    setDeletingId(null);

    if (error) {
      console.error(error);
      toast.error(
        error.message ||
          "No se pudo eliminar el pedido. Ejecutá el SQL de permiso DELETE.",
      );
      return;
    }

    setOrders((prev) => prev.filter((item) => item.id !== order.id));
    toast.success("🗑️ Pedido eliminado correctamente");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border p-4">
          <div className="text-xs text-muted-foreground">
            Pedidos · {selectedDateLabel}
          </div>
          <div className="text-2xl font-black mt-1">{visibleOrders.length}</div>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <div className="text-xs text-muted-foreground">
            Ventas · {selectedDateLabel}
          </div>
          <div className="text-2xl font-black mt-1">
            Gs. {nf(filteredTotal)}
          </div>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <div className="text-xs text-muted-foreground">
            Enviados al formulario
          </div>
          <div className="text-2xl font-black mt-1">
            {filteredOpened}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border p-3">
        <div className="flex flex-col xl:flex-row gap-3 xl:items-end xl:justify-between">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div>
              <label className="app-label">📅 Filtrar por fecha</label>
              <input
                type="date"
                className="app-input"
                value={selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value || today);
                  setShowAllDates(false);
                }}
              />
            </div>

            <div className="flex gap-2">
              <button
                className={`nav-btn ${
                  !showAllDates && selectedDate === today ? "active" : ""
                }`}
                onClick={() => {
                  setSelectedDate(today);
                  setShowAllDates(false);
                }}
              >
                Hoy
              </button>

              <button
                className={`nav-btn ${showAllDates ? "active" : ""}`}
                onClick={() => setShowAllDates(true)}
              >
                Todos
              </button>
            </div>
          </div>

          <input
            className="app-input xl:max-w-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente, teléfono, ciudad, producto..."
          />
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          Vista actual: <b>{selectedDateLabel}</b>. Al entrar siempre inicia en la fecha de hoy.
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border p-10 text-center">
          Cargando pedidos...
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <div className="text-4xl">📦</div>
          <div className="font-black mt-3">No hay pedidos en esta vista</div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((order) => (
            <div
              key={order.id}
              className="rounded-2xl border border-border bg-background p-4"
            >
              <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-lg">
                      {order.product_title}
                    </span>
                    <span className="chip">
                      {pyDate(order.created_at)} · {pyTime(order.created_at)}
                    </span>
                    <span className="chip">
                      {order.status || "nuevo"}
                    </span>
                    {order.system_status === "opened" && (
                      <span className="chip">
                        ✅ Enviado a cargar
                      </span>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Cliente:</span>{" "}
                      <b>{order.customer_name}</b>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Teléfono:</span>{" "}
                      <b>{order.phone}</b>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Ubicación:</span>{" "}
                      <b>
                        {[order.city, order.department]
                          .filter(Boolean)
                          .join(" · ")}
                      </b>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cantidad:</span>{" "}
                      <b>{order.quantity}</b>
                    </div>
                  </div>

                  <div className="mt-2 text-sm">
                    <span className="text-muted-foreground">Página:</span>{" "}
                    <b>{order.page_name || "Landing"}</b>
                    <span className="mx-2">·</span>
                    <b>Gs. {nf(Number(order.total_gs || 0))}</b>
                  </div>

                  {(order.address || order.reference) && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {[order.address, order.reference]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex flex-col sm:flex-row xl:flex-col gap-2">
                  <button
                    className="nav-btn active !px-5 !py-3"
                    onClick={() => sendToSystem(order)}
                  >
                    📦 Cargar pedido al sistema
                  </button>

                  <button
                    className="nav-btn !px-5 !py-3 !border-red-500 !text-red-500"
                    disabled={deletingId === order.id}
                    onClick={() => deleteOrder(order)}
                  >
                    {deletingId === order.id
                      ? "Eliminando..."
                      : "🗑️ Eliminar pedido"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
