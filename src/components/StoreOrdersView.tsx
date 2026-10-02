
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

export type StoreOrder = {
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
  tags?: string[] | null;
};

export type CoverageResult =
  | "covered"
  | "uncovered"
  | "unknown";

export type ProductMatch =
  | "matched"
  | "review"
  | "missing";

export type CatalogProduct = {
  id: string;
  title: string;
  sku?: string | null;
  aliases?: string[];
};

export type StoreOrdersViewProps = {
  onLoadOrder: (prefill: StoreOrderPrefill) => void;
  checkCoverage?: (
    city: string,
    department: string | null
  ) => CoverageResult;
  catalogProducts?: CatalogProduct[];
  onOrderCreated?: (
    sourceOrderId: string,
    createdOrderId: string
  ) => Promise<void> | void;
};

const SELECT =
  "id,landing_page_id,product_id,product_title,quantity,unit_price_gs,total_gs,customer_name,phone,department,city,address,reference,status,seller_email,page_name,page_slug,system_status,sent_to_system_at,created_at,tags";

const nf = (n: number) =>
  new Intl.NumberFormat("es-PY").format(
    Math.round(Number(n || 0))
  );

const pyDate = (value: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

const pyTime = (value: string) =>
  new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const normalize = (
  value: string | null | undefined
) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const TAGS = [
  "Ecommerce",
  "Drop",
  "Pago anticipado",
  "Pendiente de pago",
];

const sourceStatus = (order: StoreOrder) =>
  (order.system_status || "pending").toLowerCase();

const isSaved = (order: StoreOrder) =>
  ["loaded", "created", "saved", "imported"].includes(
    sourceStatus(order)
  );

export function makeStoreOrderPrefill(
  order: StoreOrder
): StoreOrderPrefill {
  return {
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
      order.page_name
        ? `Página: ${order.page_name}`
        : "",
      order.page_slug
        ? `Slug: ${order.page_slug}`
        : "",
      order.reference
        ? `Referencia: ${order.reference}`
        : "",
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

function orderUrl(ids: string[]) {
  const url = new URL(window.location.href);

  url.searchParams.set("view", "create-order");
  url.searchParams.set(
    "store_order_ids",
    ids.join(",")
  );
  url.searchParams.delete("store_order_id");

  return url.toString();
}

function classifyProduct(
  order: StoreOrder,
  products?: CatalogProduct[]
): ProductMatch {
  if (!products) return "review";

  const name = normalize(order.product_title);

  const exact = products.filter(
    (p) =>
      normalize(p.title) === name ||
      (p.aliases || []).some(
        (a) => normalize(a) === name
      )
  );

  return exact.length === 1
    ? "matched"
    : exact.length > 1
      ? "review"
      : "missing";
}

// ============================================
// DROPI: SIN BLOQUEO POR COBERTURA INTERNA
// ============================================

async function prepareDropi(
  order: StoreOrder,
  product: CatalogProduct | undefined
) {
  // El producto puede no coincidir con el catálogo
  // interno. Dropi utiliza su propio ID o SKU.

  const productKey = `bot-sky-dropi-product:${
    product?.id ||
    order.product_id ||
    normalize(order.product_title) ||
    order.id
  }`;

  let saved = "";

  try {
    saved = localStorage.getItem(productKey) || "";
  } catch {
    // El almacenamiento puede estar deshabilitado.
  }

  // Solicitar siempre el ID o SKU antes de continuar.
  const reference = window.prompt(
    `ID o SKU de Dropi para ${order.product_title}\n(Si ya está vinculado, podés conservar el valor):`,
    saved
  );

  if (reference === null) return;

  const dropiReference = reference.trim();

  if (!dropiReference) {
    toast.error(
      "Ingresá el ID o SKU del producto de Dropi."
    );
    return;
  }

  // No verificar la cobertura interna.
  // Dropi determinará si acepta la ubicación.
  // Sí se comprueban los datos básicos del pedido.

  if (
    !order.customer_name?.trim() ||
    !order.phone?.trim() ||
    !order.address?.trim() ||
    !(Number(order.quantity) > 0) ||
    !(Number(order.total_gs) > 0)
  ) {
    toast.error(
      "Faltan datos del pedido: verificá cliente, teléfono, dirección, cantidad y precio de venta."
    );
    return;
  }

  try {
    localStorage.setItem(
      productKey,
      dropiReference
    );
  } catch {
    // Continuar sin guardar la referencia.
  }

  const quantity = Number(order.quantity);
  const totalGs = Number(order.total_gs);

  const unitPriceGs =
    Number(order.unit_price_gs || 0) ||
    totalGs / quantity;

  const payload = {
    sourceOrderId: order.id,

    productId:
      product?.id || order.product_id || "",

    productTitle: order.product_title,
    dropiReference,

    customer: order.customer_name,
    phone: order.phone,

    city: order.city || "",
    department: order.department || "",
    address: order.address || "",
    reference: order.reference || "",

    quantity,
    totalGs,
    salePriceGs: totalGs,
    unitPriceGs,

    sellerEmail: order.seller_email || "",
  };

  // Comunicación con la extensión de Chrome.
  // No se expone la información del cliente
  // dentro de los parámetros de una URL externa.

  const requestId = crypto.randomUUID();

  let resolved = false;

  const onMessage = (event: MessageEvent) => {
    if (
      event.source !== window ||
      event.origin !== location.origin
    ) {
      return;
    }

    if (
      event.data?.type !== "BOT_SKY_DROPI_ACK" ||
      event.data?.requestId !== requestId
    ) {
      return;
    }

    resolved = true;

    window.removeEventListener(
      "message",
      onMessage
    );

    if (event.data.ok) {
      toast.success(
        "🚀 Pedido entregado a la extensión. Revisá el formulario de Dropi."
      );
    } else {
      toast.error(
        event.data.error ||
          "La extensión no pudo preparar Dropi."
      );
    }
  };

  window.addEventListener(
    "message",
    onMessage
  );

  window.postMessage(
    {
      type: "BOT_SKY_PREPARE_DROPI",
      requestId,
      payload,
    },
    location.origin
  );

  window.setTimeout(() => {
    window.removeEventListener(
      "message",
      onMessage
    );

    if (!resolved) {
      toast.error(
        "La extensión de Dropi no respondió. Verificá que esté instalada, habilitada y actualizada."
      );
    }
  }, 8000);
}

// ============================================
// VISTA PRINCIPAL DE PEDIDOS
// ============================================

export default function StoreOrdersView({
  onLoadOrder,
  checkCoverage,
  catalogProducts,
}: StoreOrdersViewProps) {
  const { user } = useAuth();

  const email =
    user?.email?.toLowerCase() || "";

  const [orders, setOrders] =
    useState<StoreOrder[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [savingIds, setSavingIds] =
    useState<string[]>([]);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const today = pyDate(new Date());

  const [selectedDate, setSelectedDate] =
    useState(today);

  const [showAllDates, setShowAllDates] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [product, setProduct] =
    useState("all");

  const [coverage, setCoverage] =
    useState("all");

  const [systemStatus, setSystemStatus] =
    useState("all");

  const [tag, setTag] =
    useState("all");

  const [chosen, setChosen] =
    useState<string[]>([]);

  const [tagEdit, setTagEdit] =
    useState<string | null>(null);

  const [importing, setImporting] =
    useState(false);

  const [importReport, setImportReport] =
    useState<
      Array<{
        id: string;
        status: string;
        order_id?: string;
        message?: string;
      }>
    >([]);

  // ==========================================
  // CARGAR PEDIDOS
  // ==========================================

  const loadOrders = useCallback(
    async (showSpinner = false) => {
      if (!email) {
        setOrders([]);
        setLoading(false);
        return;
      }

      if (showSpinner) {
        setLoading(true);
      }

      const collected: StoreOrder[] = [];

      for (
        let start = 0;
        ;
        start += 500
      ) {
        const { data, error } =
          await supabase
            .from("landing_page_orders")
            .select(SELECT)
            .eq("seller_email", email)
            .order("created_at", {
              ascending: false,
            })
            .range(
              start,
              start + 499
            );

        if (error) {
          console.error(error);

          toast.error(
            "No se pudieron cargar los pedidos. Ejecutá store_orders_pro.sql."
          );

          setLoading(false);
          return;
        }

        const batch =
          (data || []) as StoreOrder[];

        collected.push(...batch);

        if (batch.length < 500) {
          break;
        }
      }

      setOrders(collected);
      setLoading(false);
    },
    [email]
  );

  useEffect(() => {
    void loadOrders(true);

    if (!email) return;

    const channel = supabase
      .channel(
        `store-orders-pro-${email}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "landing_page_orders",
        },
        () => {
          void loadOrders();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [email, loadOrders]);

  const products = useMemo(
    () =>
      [
        ...new Set(
          orders
            .map(
              (o) => o.product_title
            )
            .filter(Boolean)
        ),
      ].sort(
        (a, b) =>
          a.localeCompare(b)
      ),
    [orders]
  );

  const getCoverage = useCallback(
    (order: StoreOrder): CoverageResult => {
      if (
        !checkCoverage ||
        !order.city?.trim() ||
        !order.department?.trim()
      ) {
        return "unknown";
      }

      try {
        return checkCoverage(
          order.city,
          order.department
        );
      } catch {
        return "unknown";
      }
    },
    [checkCoverage]
  );

  // ==========================================
  // FILTROS
  // ==========================================

  const visibleOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (
          !showAllDates &&
          pyDate(order.created_at) !==
            selectedDate
        ) {
          return false;
        }

        if (
          product !== "all" &&
          order.product_title !==
            product
        ) {
          return false;
        }

        if (
          coverage !== "all" &&
          getCoverage(order) !==
            coverage
        ) {
          return false;
        }

        if (
          systemStatus !== "all" &&
          (
            systemStatus === "loaded"
              ? !isSaved(order)
              : systemStatus === "pending"
                ? sourceStatus(order) !==
                    "pending" &&
                  sourceStatus(order) !==
                    "new" &&
                  sourceStatus(order) !==
                    "nuevo"
                : sourceStatus(order) !==
                  systemStatus
          )
        ) {
          return false;
        }

        if (
          tag !== "all" &&
          !(order.tags || []).includes(
            tag
          )
        ) {
          return false;
        }

        const q = normalize(search);

        return (
          !q ||
          [
            order.customer_name,
            order.phone,
            order.city,
            order.department,
            order.product_title,
            order.page_name,
            order.id,
          ].some(
            (s) =>
              normalize(s).includes(q)
          )
        );
      }),
    [
      orders,
      showAllDates,
      selectedDate,
      product,
      coverage,
      getCoverage,
      systemStatus,
      tag,
      search,
    ]
  );

  const selected =
    visibleOrders.filter(
      (o) => chosen.includes(o.id)
    );

  const ready = selected.filter(
    (o) =>
      !isSaved(o) &&
      getCoverage(o) === "covered" &&
      classifyProduct(
        o,
        catalogProducts
      ) === "matched" &&
      Boolean(
        o.customer_name?.trim()
      ) &&
      Boolean(o.phone?.trim()) &&
      Number(o.quantity) > 0 &&
      Number(o.total_gs) > 0
  );

  const selectedDateLabel =
    showAllDates
      ? "Todos"
      : selectedDate === today
        ? "Hoy"
        : selectedDate;

  const total = visibleOrders.reduce(
    (sum, o) =>
      sum +
      Number(o.total_gs || 0),
    0
  );

  const covered =
    visibleOrders.filter(
      (o) =>
        getCoverage(o) === "covered"
    ).length;

  const uncovered =
    visibleOrders.filter(
      (o) =>
        getCoverage(o) === "uncovered"
    ).length;

  const unknown =
    visibleOrders.length -
    covered -
    uncovered;

  const busy =
    savingIds.length > 0 ||
    importing;

  // Esta validación es únicamente para
  // la importación INTERNA.
  // No se utiliza para Cargar a Dropi.

  const canImport = (
    o: StoreOrder
  ) =>
    !isSaved(o) &&
    getCoverage(o) === "covered" &&
    classifyProduct(
      o,
      catalogProducts
    ) === "matched" &&
    Boolean(
      o.customer_name?.trim()
    ) &&
    Boolean(o.phone?.trim()) &&
    Number(o.quantity) > 0 &&
    Number(o.total_gs) > 0;

  // ==========================================
  // FORMULARIO INTERNO
  // ==========================================

  async function markOpened(
    ids: string[]
  ) {
    setSavingIds(ids);

    const { error } =
      await supabase
        .from("landing_page_orders")
        .update({
          system_status: "opened",
          sent_to_system_at:
            new Date().toISOString(),
        })
        .in("id", ids)
        .eq(
          "seller_email",
          email
        );

    setSavingIds([]);

    if (error) {
      console.error(error);

      toast.error(
        "No se pudo preparar la carga."
      );

      return false;
    }

    setOrders((old) =>
      old.map((o) =>
        ids.includes(o.id) &&
        !isSaved(o)
          ? {
              ...o,
              system_status:
                "opened",
            }
          : o
      )
    );

    return true;
  }

  async function openOne(
    order: StoreOrder
  ) {
    const tab = window.open(
      "about:blank",
      "_blank"
    );

    if (!tab) {
      toast.error(
        "Permití ventanas emergentes para abrir el formulario."
      );

      return;
    }

    if (
      !(await markOpened([
        order.id,
      ]))
    ) {
      tab.close();
      return;
    }

    tab.location.replace(
      orderUrl([order.id])
    );

    void onLoadOrder;
  }

  async function openBulk() {
    if (!selected.length) {
      return;
    }

    if (!ready.length) {
      toast.error(
        "No hay pedidos con producto confirmado para abrir."
      );

      return;
    }

    const excluded =
      selected.length -
      ready.length;

    if (
      !window.confirm(
        `Se abrirán ${ready.length} pedido(s) en una sola pestaña, uno por vez.${
          excluded
            ? `\n${excluded} pedido(s) excluido(s) por revisión o ya cargados.`
            : ""
        }\n\nLa creación de cada venta se confirma en el formulario.`
      )
    ) {
      return;
    }

    const tab = window.open(
      "about:blank",
      "_blank"
    );

    if (!tab) {
      toast.error(
        "Permití ventanas emergentes para la carga masiva."
      );

      return;
    }

    const ids = ready.map(
      (o) => o.id
    );

    if (
      !(await markOpened(ids))
    ) {
      tab.close();
      return;
    }

    tab.location.replace(
      orderUrl(ids)
    );

    setChosen([]);
  }

  // ==========================================
  // CARGA DIRECTA INTERNA
  // ==========================================

  async function importDirect(
    ids: string[]
  ) {
    if (
      busy ||
      !ids.length
    ) {
      return;
    }

    const eligible =
      orders.filter(
        (o) =>
          ids.includes(o.id) &&
          canImport(o)
      );

    if (
      eligible.length !==
      ids.length
    ) {
      toast.error(
        "Sólo se importan pedidos con cobertura y producto confirmados, sin datos faltantes y no cargados."
      );

      return;
    }

    if (
      !window.confirm(
        `¿Guardar directamente ${ids.length} pedido(s) en el sistema, sin abrir el formulario?\n\nSe conservarán precio total y cantidad de Mi Tienda. Cada pedido se validará nuevamente en Supabase.`
      )
    ) {
      return;
    }

    setImporting(true);
    setImportReport([]);

    try {
      const result: Array<{
        id: string;
        status: string;
        order_id?: string;
        message?: string;
      }> = [];

      for (
        let i = 0;
        i < ids.length;
        i += 25
      ) {
        const batch =
          ids.slice(
            i,
            i + 25
          );

        const {
          data,
          error,
        } = await supabase.rpc(
          "import_store_orders",
          {
            p_ids: batch,
          }
        );

        if (error) {
          result.push(
            ...batch.map(
              (id) => ({
                id,
                status:
                  "error",
                message:
                  error.message,
              })
            )
          );
        } else if (
          Array.isArray(data)
        ) {
          result.push(
            ...(data as typeof result)
          );
        } else {
          result.push(
            ...batch.map(
              (id) => ({
                id,
                status:
                  "error",
                message:
                  "Respuesta inesperada del servidor",
              })
            )
          );
        }
      }

      setImportReport(result);

      const success =
        result.filter(
          (x) =>
            x.status ===
            "loaded"
        ).length;

      const existing =
        result.filter(
          (x) =>
            x.status ===
            "already_loaded"
        ).length;

      const failed =
        result.filter(
          (x) =>
            x.status ===
            "error"
        ).length;

      if (success) {
        toast.success(
          `✅ ${success} pedido(s) cargados correctamente`
        );
      }

      if (existing) {
        toast.info(
          `${existing} pedido(s) ya estaban cargados`
        );
      }

      if (failed) {
        toast.error(
          `${failed} pedido(s) requieren revisión. Mirá el detalle debajo.`
        );
      }

      setChosen([]);
      await loadOrders();
    } finally {
      setImporting(false);
    }
  }

  // ==========================================
  // ETIQUETAS
  // ==========================================

  async function saveTags(
    order: StoreOrder,
    next: string[]
  ) {
    setTagEdit(order.id);

    const { error } =
      await supabase
        .from("landing_page_orders")
        .update({
          tags: next,
        })
        .eq(
          "id",
          order.id
        )
        .eq(
          "seller_email",
          email
        );

    setTagEdit(null);

    if (error) {
      console.error(error);

      toast.error(
        "No se pudieron guardar las etiquetas."
      );

      return;
    }

    setOrders((old) =>
      old.map((o) =>
        o.id === order.id
          ? {
              ...o,
              tags: next,
            }
          : o
      )
    );
  }

  // ==========================================
  // ELIMINAR PEDIDO
  // ==========================================

  async function deleteOrder(
    order: StoreOrder
  ) {
    if (
      isSaved(order)
    ) {
      toast.error(
        "Un pedido ya importado no se puede eliminar desde Mi Tienda."
      );

      return;
    }

    if (
      !window.confirm(
        `¿Eliminar este pedido?\n\nCliente: ${order.customer_name}\nProducto: ${order.product_title}\nTotal: Gs. ${nf(order.total_gs)}\n\nEsta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setDeletingId(
      order.id
    );

    const { error } =
      await supabase
        .from("landing_page_orders")
        .delete()
        .eq(
          "id",
          order.id
        )
        .eq(
          "seller_email",
          email
        );

    setDeletingId(null);

    if (error) {
      console.error(error);

      toast.error(
        error.message ||
          "No se pudo eliminar el pedido."
      );

      return;
    }

    setOrders((old) =>
      old.filter(
        (o) =>
          o.id !== order.id
      )
    );

    setChosen((old) =>
      old.filter(
        (id) =>
          id !== order.id
      )
    );

    toast.success(
      "🗑️ Pedido eliminado correctamente"
    );
  }

  const selectClass =
    "app-input w-full";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        {[
          [
            "Pedidos · " +
              selectedDateLabel,
            String(
              visibleOrders.length
            ),
          ],
          [
            "Ventas",
            `Gs. ${nf(total)}`,
          ],
          [
            "En cobertura",
            String(covered),
          ],
          [
            "Sin cobertura",
            String(uncovered),
          ],
          [
            "Por verificar",
            String(unknown),
          ],
          [
            "Cargados",
            String(
              visibleOrders.filter(
                isSaved
              ).length
            ),
          ],
        ].map(
          ([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-border p-4 min-w-0"
            >
              <div className="text-xs text-muted-foreground">
                {label}
              </div>

              <div className="text-xl lg:text-2xl font-black mt-1 break-words">
                {value}
              </div>
            </div>
          )
        )}
      </div>

      <div className="rounded-2xl border border-border p-4 space-y-3">
        <div className="font-black">
          🔎 Filtros avanzados
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <label className="block">
            <span className="app-label">
              📅 Fecha
            </span>

            <input
              className={
                selectClass
              }
              type="date"
              value={
                selectedDate
              }
              onChange={(
                e
              ) => {
                setSelectedDate(
                  e.target.value ||
                    today
                );
                setShowAllDates(
                  false
                );
                setChosen([]);
              }}
            />
          </label>

          <label className="block">
            <span className="app-label">
              📦 Producto
            </span>

            <select
              className={
                selectClass
              }
              value={product}
              onChange={(
                e
              ) => {
                setProduct(
                  e.target.value
                );
                setChosen([]);
              }}
            >
              <option value="all">
                Todos los productos
              </option>

              {products.map(
                (p) => (
                  <option
                    key={p}
                    value={p}
                  >
                    {p}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="block">
            <span className="app-label">
              📍 Cobertura
            </span>

            <select
              className={
                selectClass
              }
              value={
                coverage
              }
              onChange={(
                e
              ) => {
                setCoverage(
                  e.target.value
                );
                setChosen([]);
              }}
            >
              <option value="all">
                Todas las zonas
              </option>

              <option value="covered">
                ✅ En cobertura
              </option>

              <option value="uncovered">
                ❌ Sin cobertura
              </option>

              <option value="unknown">
                ⚠️ Por verificar
              </option>
            </select>
          </label>

          <label className="block">
            <span className="app-label">
              📋 Estado de carga
            </span>

            <select
              className={
                selectClass
              }
              value={
                systemStatus
              }
              onChange={(
                e
              ) => {
                setSystemStatus(
                  e.target.value
                );
                setChosen([]);
              }}
            >
              <option value="all">
                Todos
              </option>

              <option value="pending">
                Pendientes
              </option>

              <option value="opened">
                Formulario abierto
              </option>

              <option value="loaded">
                Cargados
              </option>

              <option value="error">
                Error
              </option>
            </select>
          </label>

          <label className="block">
            <span className="app-label">
              🏷️ Etiqueta
            </span>

            <select
              className={
                selectClass
              }
              value={tag}
              onChange={(
                e
              ) => {
                setTag(
                  e.target.value
                );
                setChosen([]);
              }}
            >
              <option value="all">
                Todas las etiquetas
              </option>

              {TAGS.map(
                (t) => (
                  <option
                    key={t}
                    value={t}
                  >
                    {t}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="block">
            <span className="app-label">
              🔍 Buscar
            </span>

            <input
              className={
                selectClass
              }
              value={
                search
              }
              onChange={(
                e
              ) => {
                setSearch(
                  e.target.value
                );
                setChosen([]);
              }}
              placeholder="Cliente, teléfono, ciudad, producto..."
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={`nav-btn ${
              !showAllDates &&
              selectedDate ===
                today
                ? "active"
                : ""
            }`}
            onClick={() => {
              setSelectedDate(
                today
              );
              setShowAllDates(
                false
              );
              setChosen([]);
            }}
          >
            Hoy
          </button>

          <button
            className={`nav-btn ${
              showAllDates
                ? "active"
                : ""
            }`}
            onClick={() => {
              setShowAllDates(
                true
              );
              setChosen([]);
            }}
          >
            Todos
          </button>

          <button
            className="nav-btn"
            onClick={() => {
              setProduct("all");
              setCoverage("all");
              setSystemStatus(
                "all"
              );
              setTag("all");
              setSearch("");
              setChosen([]);
            }}
          >
            Limpiar filtros
          </button>

          <button
            className="nav-btn"
            onClick={() =>
              void loadOrders(
                true
              )
            }
          >
            ↻ Actualizar
          </button>
        </div>

        {!checkCoverage && (
          <p className="text-xs text-amber-600">
            Conectá checkCoverage a la
            función oficial de la plataforma;
            por seguridad ninguna ciudad
            se considera cubierta sin
            validación.
          </p>
        )}

        {!catalogProducts && (
          <p className="text-xs text-amber-600">
            Conectá catalogProducts al
            catálogo real para habilitar la
            verificación y selección masiva
            de productos.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border p-3 flex flex-wrap items-center gap-3 justify-between">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={
              visibleOrders.length >
                0 &&
              visibleOrders.every(
                (o) =>
                  chosen.includes(
                    o.id
                  )
              )
            }
            onChange={(e) =>
              setChosen(
                e.target.checked
                  ? visibleOrders.map(
                      (o) =>
                        o.id
                    )
                  : []
              )
            }
          />

          Seleccionar los{" "}
          {
            visibleOrders.length
          }{" "}
          filtrados
        </label>

        <div className="text-sm">
          Seleccionados:{" "}
          <b>
            {selected.length}
          </b>
          {" · "}
          Aptos:{" "}
          <b>
            {ready.length}
          </b>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="nav-btn active !px-5 !py-3"
            onClick={() =>
              void importDirect(
                ready.map(
                  (o) => o.id
                )
              )
            }
            disabled={
              busy ||
              ready.length === 0
            }
          >
            {importing
              ? "Guardando..."
              : `⚡ Cargar directo (${ready.length})`}
          </button>

          <button
            className="nav-btn !px-5 !py-3"
            onClick={() =>
              void openBulk()
            }
            disabled={
              busy ||
              ready.length === 0
            }
          >
            📦 Abrir formularios ↗
          </button>
        </div>
      </div>

      {importReport.length >
        0 && (
        <div className="rounded-2xl border border-border p-4 space-y-2">
          <div className="font-bold">
            Resultado de carga directa
          </div>

          {importReport.map(
            (r, i) => (
              <div
                key={`${r.id}-${i}`}
                className="text-sm break-words"
              >
                {r.status ===
                "loaded"
                  ? "✅"
                  : r.status ===
                      "already_loaded"
                    ? "ℹ️"
                    : "❌"}{" "}
                {r.id}:{" "}
                {r.status ===
                "loaded"
                  ? `Cargado (orden ${r.order_id || "creada"})`
                  : r.status ===
                      "already_loaded"
                    ? "Ya estaba cargado"
                    : r.message ||
                      "Error desconocido"}
              </div>
            )
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border p-10 text-center">
          Cargando pedidos...
        </div>
      ) : !visibleOrders.length ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <div className="text-4xl">
            📦
          </div>

          <div className="font-black mt-3">
            No hay pedidos en esta vista
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map(
            (order) => {
              const cov =
                getCoverage(
                  order
                );

              const match =
                classifyProduct(
                  order,
                  catalogProducts
                );

              const saved =
                isSaved(order);

              const matches = (
                catalogProducts ||
                []
              ).filter(
                (p) =>
                  normalize(
                    p.title
                  ) ===
                    normalize(
                      order.product_title
                    ) ||
                  (
                    p.aliases ||
                    []
                  ).some(
                    (a) =>
                      normalize(
                        a
                      ) ===
                      normalize(
                        order.product_title
                      )
                  )
              );

              const dropiProduct =
                matches.length ===
                1
                  ? matches[0]
                  : undefined;

              return (
                <div
                  key={
                    order.id
                  }
                  className="rounded-2xl border border-border bg-background p-4"
                >
                  <div className="flex gap-3 items-start">
                    <input
                      type="checkbox"
                      className="mt-2"
                      checked={chosen.includes(
                        order.id
                      )}
                      onChange={(
                        e
                      ) =>
                        setChosen(
                          (
                            old
                          ) =>
                            e
                              .target
                              .checked
                              ? [
                                  ...old,
                                  order.id,
                                ]
                              : old.filter(
                                  (
                                    id
                                  ) =>
                                    id !==
                                    order.id
                                )
                        )
                      }
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-lg">
                          {
                            order.product_title
                          }
                        </span>

                        <span className="chip">
                          {pyDate(
                            order.created_at
                          )}
                          {" · "}
                          {pyTime(
                            order.created_at
                          )}
                        </span>

                        <span className="chip">
                          {order.status ||
                            "nuevo"}
                        </span>

                        <span className="chip">
                          {saved
                            ? "✅ Cargado"
                            : sourceStatus(
                                  order
                                ) ===
                                "opened"
                              ? "↗ Formulario abierto"
                              : "⏳ Pendiente"}
                        </span>

                        <span className="chip">
                          {cov ===
                          "covered"
                            ? "✅ En cobertura"
                            : cov ===
                                "uncovered"
                              ? "❌ Sin cobertura"
                              : "⚠️ Cobertura por verificar"}
                        </span>

                        <span className="chip">
                          {match ===
                          "matched"
                            ? "✅ Producto detectado"
                            : match ===
                                "review"
                              ? "⚠️ Revisar producto"
                              : "❌ Producto no encontrado"}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Cliente:{" "}
                          </span>

                          <b>
                            {
                              order.customer_name
                            }
                          </b>
                        </div>

                        <div>
                          <span className="text-muted-foreground">
                            Teléfono:{" "}
                          </span>

                          <b>
                            {
                              order.phone
                            }
                          </b>
                        </div>

                        <div>
                          <span className="text-muted-foreground">
                            Ubicación:{" "}
                          </span>

                          <b>
                            {[
                              order.city,
                              order.department,
                            ]
                              .filter(
                                Boolean
                              )
                              .join(
                                " · "
                              )}
                          </b>
                        </div>

                        <div>
                          <span className="text-muted-foreground">
                            Cantidad:{" "}
                          </span>

                          <b>
                            {
                              order.quantity
                            }
                          </b>
                        </div>
                      </div>

                      <div className="mt-2 text-sm">
                        <span className="text-muted-foreground">
                          Página:{" "}
                        </span>

                        <b>
                          {order.page_name ||
                            "Landing"}
                        </b>

                        <span className="mx-2">
                          ·
                        </span>

                        <b>
                          Gs.{" "}
                          {nf(
                            order.total_gs
                          )}
                        </b>
                      </div>

                      {(order.address ||
                        order.reference) && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {[
                            order.address,
                            order.reference,
                          ]
                            .filter(
                              Boolean
                            )
                            .join(
                              " · "
                            )}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Etiquetas:
                        </span>

                        {TAGS.map(
                          (t) => (
                            <label
                              key={
                                t
                              }
                              className="text-xs inline-flex items-center gap-1 rounded-full border border-border px-2 py-1"
                            >
                              <input
                                type="checkbox"
                                disabled={
                                  tagEdit ===
                                  order.id
                                }
                                checked={(
                                  order.tags ||
                                  []
                                ).includes(
                                  t
                                )}
                                onChange={(
                                  e
                                ) =>
                                  void saveTags(
                                    order,
                                    e
                                      .target
                                      .checked
                                      ? [
                                          ...(
                                            order.tags ||
                                            []
                                          ),
                                          t,
                                        ]
                                      : (
                                          order.tags ||
                                          []
                                        ).filter(
                                          (
                                            x
                                          ) =>
                                            x !==
                                            t
                                        )
                                  )
                                }
                              />

                              {t}
                            </label>
                          )
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col gap-2">
                      {/* DROPI SIN VALIDACIÓN DE COBERTURA INTERNA */}
                      <button
                        className="nav-btn !px-5 !py-3 !border-orange-500 !text-orange-600"
                        disabled={
                          busy
                        }
                        onClick={() =>
                          void prepareDropi(
                            order,
                            dropiProduct
                          )
                        }
                      >
                        🚀 Cargar a Dropi ↗
                      </button>

                      <button
                        className="nav-btn active !px-5 !py-3"
                        disabled={
                          busy ||
                          !canImport(
                            order
                          )
                        }
                        onClick={() =>
                          void importDirect(
                            [
                              order.id,
                            ]
                          )
                        }
                      >
                        ⚡ Cargar directo
                      </button>

                      <button
                        className="nav-btn !px-5 !py-3"
                        disabled={
                          busy ||
                          saved
                        }
                        onClick={() =>
                          void openOne(
                            order
                          )
                        }
                      >
                        📦{" "}
                        {saved
                          ? "Ya cargado"
                          : "Abrir formulario ↗"}
                      </button>

                      <button
                        className="nav-btn !px-5 !py-3 !border-red-500 !text-red-500"
                        disabled={
                          busy ||
                          saved ||
                          deletingId ===
                            order.id
                        }
                        onClick={() =>
                          void deleteOrder(
                            order
                          )
                        }
                      >
                        {deletingId ===
                        order.id
                          ? "Eliminando..."
                          : "🗑️ Eliminar pedido"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// PUENTE HACIA EL FORMULARIO INTERNO
// ============================================

export function StoreOrderTabBridge({
  onLoadOrder,
}: {
  onLoadOrder: (
    prefill: StoreOrderPrefill
  ) => void;
}) {
  const { user } = useAuth();

  const email =
    user?.email?.toLowerCase() ||
    "";

  const [ids, setIds] =
    useState<string[]>([]);

  const [index, setIndex] =
    useState(0);

  const [problem, setProblem] =
    useState("");

  useEffect(() => {
    const params = new URL(
      window.location.href
    ).searchParams;

    const raw =
      params.get(
        "store_order_ids"
      ) ||
      params.get(
        "store_order_id"
      );

    setIds(
      raw
        ? raw
            .split(",")
            .filter(
              (id) =>
                /^[0-9a-f-]{36}$/i.test(
                  id
                )
            )
            .slice(
              0,
              500
            )
        : []
    );

    setIndex(0);
  }, []);

  useEffect(() => {
    if (
      !email ||
      !ids[index]
    ) {
      return;
    }

    let active = true;

    (async () => {
      setProblem("");

      const {
        data,
        error,
      } = await supabase
        .from(
          "landing_page_orders"
        )
        .select(
          SELECT
        )
        .eq(
          "id",
          ids[index]
        )
        .eq(
          "seller_email",
          email
        )
        .maybeSingle();

      if (!active) {
        return;
      }

      if (
        error ||
        !data
      ) {
        setProblem(
          "No se pudo recuperar el pedido o no tenés acceso."
        );
        return;
      }

      onLoadOrder(
        makeStoreOrderPrefill(
          data as StoreOrder
        )
      );
    })();

    return () => {
      active = false;
    };
  }, [
    email,
    ids,
    index,
    onLoadOrder,
  ]);

  if (
    !ids.length
  ) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-border bg-background shadow-xl p-4 space-y-2">
      <b>
        📦 Mi Tienda ·{" "}
        {index + 1} de{" "}
        {ids.length}
      </b>

      {problem && (
        <p className="text-sm text-red-500">
          {problem}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Guardá el pedido en el
        formulario habitual antes de
        avanzar. Abrirlo no significa
        que haya sido creado.
      </p>

      <div className="flex gap-2">
        <button
          className="nav-btn"
          disabled={
            index === 0
          }
          onClick={() =>
            setIndex(
              (i) =>
                i - 1
            )
          }
        >
          Anterior
        </button>

        <button
          className="nav-btn active"
          disabled={
            index >=
            ids.length - 1
          }
          onClick={() =>
            setIndex(
              (i) =>
                i + 1
            )
          }
        >
          Siguiente ↗
        </button>
      </div>
    </div>
  );
}
