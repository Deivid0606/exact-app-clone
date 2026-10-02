
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type SourceOrder = {
  source_order_id: string;
  order_number?: string;
  customer_name?: string;
  phone?: string;
  city?: string;
  departamento?: string;
  street?: string;
  district?: string;
  email?: string;
  obs?: string;
  sku?: string;
  product_title?: string;
  quantity?: number;
  total?: number;
  payment_method?: string;
  payment_status?: string;
  receipt_url?: string;
};

type ImportResult = {
  source_order_id: string;
  status: "created" | "already_exists" | "error";
  message?: string;
};

type Detail = {
  id: string;
  status: ImportResult["status"];
  reason: string;
};

const channel = "botsky-import-v1";

const allowedOrigin =
  "https://skybot-ai-sales-130022.vercel.app";

// Normalización general para permisos y SKU.
const normalize = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

// Normalización de nombres geográficos.
// Ignora acentos, mayúsculas y espacios repetidos.
// También permite Ñemby = Nemby.
const normalizeLocation = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return String(error.message);
  }

  return String(error);
};

export default function BotSkyImportBridge() {
  const { user, profile } = useAuth();

  const [report, setReport] = useState(
    "Esperando conexión desde BOT SKY…"
  );

  const [working, setWorking] = useState(false);
  const [details, setDetails] = useState<Detail[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    if (params.get("view") !== "import-botsky") {
      return;
    }

    if (!user || !profile?.approved) {
      return;
    }

    if (!window.opener) {
      setReport(
        "No se detectó la pestaña de BOT SKY. " +
          "Abrí la importación desde BOT SKY."
      );
      return;
    }

    let busy = false;

    const sendReady = () => {
      window.opener?.postMessage(
        {
          channel,
          type: "READY",
        },
        allowedOrigin
      );
    };

    const timer = window.setInterval(() => {
      if (!busy) sendReady();
    }, 1200);

    sendReady();

    const onMessage = async (event: MessageEvent) => {
      if (
        event.origin !== allowedOrigin ||
        event.source !== window.opener
      ) {
        return;
      }

      const msg = event.data;

      if (
        busy ||
        msg?.channel !== channel ||
        msg.type !== "ORDERS" ||
        !Array.isArray(msg.orders) ||
        typeof msg.batchId !== "string"
      ) {
        return;
      }

      busy = true;
      clearInterval(timer);

      setWorking(true);
      setDetails([]);
      setReport("Procesando pedidos…");

      const results: ImportResult[] = [];

      const role = normalize(profile.role);
      const email = normalize(profile.email);

      try {
        const allowedRoles = [
          "admin",
          "administrador",
          "seller",
          "vendedor",
          "provider",
          "proveedor",
        ];

        if (!email || !allowedRoles.includes(role)) {
          throw new Error(
            "Tu usuario no tiene permisos para importar pedidos."
          );
        }

        if (msg.orders.length > 100) {
          throw new Error("Máximo 100 pedidos por lote.");
        }

        // =====================================
        // CARGAR CATÁLOGO
        // =====================================

        const {
          data: products,
          error: productError,
        } = await supabase.from("products").select("*");

        if (productError) {
          throw productError;
        }

        // =====================================
        // CARGAR FAVORITOS
        // =====================================

        const {
          data: favorites,
          error: favoritesError,
        } = await supabase
          .from("user_favorites")
          .select("product_id")
          .eq("user_email", profile.email);

        if (favoritesError) {
          throw favoritesError;
        }

        const favoriteIds = new Set(
          (favorites || []).map(
            (favorite) => favorite.product_id
          )
        );

        // =====================================
        // CARGAR TARIFAS DE CIUDADES
        // =====================================

        const {
          data: cities,
          error: cityError,
        } = await supabase
          .from("client_prices")
          .select("*");

        if (cityError) {
          throw cityError;
        }

        const seen = new Set<string>();

        // =====================================
        // PROCESAR CADA PEDIDO
        // =====================================

        for (const raw of msg.orders as SourceOrder[]) {
          const id = String(
            raw.source_order_id || ""
          ).trim();

          try {
            if (!id || seen.has(id)) {
              throw new Error(
                "ID de origen ausente o repetido en el lote."
              );
            }

            seen.add(id);

            // =====================================
            // VERIFICAR SI YA ESTÁ IMPORTADO
            // =====================================

            const {
              data: existing,
              error: existingError,
            } = await supabase
              .from("orders")
              .select("id")
              .eq("source_system", "BOT_SKY")
              .eq("source_order_id", id)
              .maybeSingle();

            if (existingError) {
              throw existingError;
            }

            if (existing) {
              results.push({
                source_order_id: id,
                status: "already_exists",
                message:
                  "Pedido confirmado como existente en E-commerce.",
              });

              continue;
            }

            // =====================================
            // VALIDAR SKU
            // =====================================

            const sku = normalize(raw.sku);

            if (!sku) {
              throw new Error(
                "El pedido no tiene SKU."
              );
            }

            const matches = (products || []).filter(
              (product) =>
                normalize(product.sku) === sku
            );

            if (matches.length === 0) {
              throw new Error(
                `El SKU "${raw.sku}" no existe en E-commerce.`
              );
            }

            if (matches.length > 1) {
              throw new Error(
                `El SKU "${raw.sku}" aparece duplicado en E-commerce.`
              );
            }

            const product = matches[0];

            // =====================================
            // VALIDAR PERMISOS DEL PRODUCTO
            // =====================================

            const privateProduct =
              product.is_private === true;

            const privateEmails = String(
              product.private_to_emails || ""
            )
              .split(",")
              .map(normalize);

            const authorized =
              role === "admin" ||
              role === "administrador" ||
              (
                ["provider", "proveedor"].includes(role) &&
                normalize(product.provider_email) === email
              ) ||
              (
                ["seller", "vendedor"].includes(role) &&
                (
                  !privateProduct ||
                  privateEmails.includes(email)
                )
              );

            const listed =
              privateProduct ||
              favoriteIds.has(product.id);

            if (!authorized || !listed) {
              throw new Error(
                `El SKU "${raw.sku}" no está disponible ` +
                  "para este usuario."
              );
            }

            // =====================================
            // VALIDAR CANTIDAD Y TOTAL
            // =====================================

            const qty = Number(raw.quantity);
            const total = Number(raw.total);

            if (
              !Number.isSafeInteger(qty) ||
              qty <= 0
            ) {
              throw new Error(
                "Cantidad inválida."
              );
            }

            if (
              !Number.isFinite(total) ||
              total <= 0
            ) {
              throw new Error(
                "Precio total inválido."
              );
            }

            // =====================================
            // VALIDAR CLIENTE
            // =====================================

            if (
              !raw.customer_name?.trim() ||
              !raw.phone?.trim() ||
              !raw.city?.trim()
            ) {
              throw new Error(
                "Faltan nombre, teléfono o ciudad del cliente."
              );
            }

            // =====================================
            // BUSCAR CIUDAD SIN DIFERENCIAS
            // DE ACENTOS, MAYÚSCULAS O ESPACIOS
            // =====================================

            const requestedCity = normalizeLocation(
              raw.city
            );

            const requestedDepartment =
              normalizeLocation(raw.departamento);

            const cityNameMatches = (cities || []).filter(
              (entry) =>
                normalizeLocation(entry.city) ===
                requestedCity
            );

            if (cityNameMatches.length === 0) {
              throw new Error(
                `No se encontró la ciudad "${raw.city}" ` +
                  "en las tarifas de E-commerce."
              );
            }

            // Cuando BOT SKY proporciona departamento,
            // también debe coincidir con el registrado.
            const cityMatches = requestedDepartment
              ? cityNameMatches.filter(
                  (entry) =>
                    normalizeLocation(
                      entry.departamento
                    ) === requestedDepartment
                )
              : cityNameMatches;

            if (cityMatches.length === 0) {
              const availableDepartments = [
                ...new Set(
                  cityNameMatches.map((entry) =>
                    String(
                      entry.departamento || ""
                    )
                  )
                ),
              ].join(", ");

              throw new Error(
                `La ciudad "${raw.city}" existe, ` +
                  `pero no coincide con el departamento ` +
                  `"${raw.departamento}". ` +
                  `Departamento registrado: ` +
                  `${availableDepartments || "sin especificar"}.`
              );
            }

            if (cityMatches.length > 1) {
              throw new Error(
                `La ciudad "${raw.city}" tiene ` +
                  `${cityMatches.length} tarifas coincidentes. ` +
                  "Revisá los registros duplicados."
              );
            }

            const city = cityMatches[0];

            // =====================================
            // CALCULAR IMPORTES
            // =====================================

            const delivery = Number(
              city.price_gs || 0
            );

            const providerPrice = Number(
              product.provider_price_gs || 0
            );

            if (
              !Number.isFinite(delivery) ||
              delivery < 0
            ) {
              throw new Error(
                `Tarifa inválida para "${raw.city}".`
              );
            }

            if (
              !Number.isFinite(providerPrice) ||
              providerPrice < 0
            ) {
              throw new Error(
                `Costo de proveedor inválido para SKU "${raw.sku}".`
              );
            }

            const commission =
              total - providerPrice * qty - delivery;

            // =====================================
            // INSERTAR PEDIDO
            // =====================================

            const {
              error: insertError,
            } = await supabase
              .from("orders")
              .insert({
                order_number:
                  `BS${id
                    .replace(/[^a-zA-Z0-9]/g, "")
                    .slice(0, 30)}`,

                source_system: "BOT_SKY",
                source_order_id: id,

                created_by: profile.email,

                customer_name:
                  raw.customer_name.trim(),

                phone: raw.phone.trim(),

                city: city.city,

                departamento:
                  city.departamento ||
                  raw.departamento ||
                  "",

                street: raw.street || "",

                district: raw.district || "",

                email: raw.email || "",

                obs: [
                  raw.obs,
                  `Pedido BOT SKY: ${
                    raw.order_number || id
                  }`,
                  `Pago: ${
                    raw.payment_method || ""
                  } / ${
                    raw.payment_status || ""
                  }`,
                  raw.receipt_url
                    ? `Comprobante: ${raw.receipt_url}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" | "),

                items_json: [
                  {
                    sku: product.sku,
                    title: product.title,
                    sale_gs: total,
                    qty,
                    provider_price_gs:
                      providerPrice,
                    provider_email:
                      product.provider_email || "",
                  },
                ],

                total_gs: total,
                delivery_gs: delivery,
                commission_gs: commission,

                provider_emails_list:
                  product.provider_email || "",
              } as any);

            // =====================================
            // MANEJAR DUPLICADOS DE BASE DE DATOS
            // =====================================

            if (insertError) {
              if (insertError.code === "23505") {
                const {
                  data: duplicate,
                  error: duplicateError,
                } = await supabase
                  .from("orders")
                  .select("id")
                  .eq("source_system", "BOT_SKY")
                  .eq("source_order_id", id)
                  .maybeSingle();

                if (!duplicateError && duplicate) {
                  results.push({
                    source_order_id: id,
                    status: "already_exists",
                    message:
                      "Pedido existente confirmado en E-commerce.",
                  });

                  continue;
                }
              }

              throw insertError;
            }

            results.push({
              source_order_id: id,
              status: "created",
              message:
                "Pedido guardado correctamente en E-commerce.",
            });

          } catch (error: unknown) {
            results.push({
              source_order_id: id,
              status: "error",
              message: errorMessage(error),
            });
          }
        }

      } catch (error: unknown) {
        const processedIds = new Set(
          results.map((result) =>
            result.source_order_id
          )
        );

        for (const raw of msg.orders as SourceOrder[]) {
          const id = String(
            raw.source_order_id || ""
          );

          if (processedIds.has(id)) continue;

          results.push({
            source_order_id: id,
            status: "error",
            message: errorMessage(error),
          });
        }
      }

      // =====================================
      // RESUMEN
      // =====================================

      const created = results.filter(
        (result) =>
          result.status === "created"
      ).length;

      const existing = results.filter(
        (result) =>
          result.status === "already_exists"
      ).length;

      const errors = results.filter(
        (result) =>
          result.status === "error"
      ).length;

      setReport(
        `Resultado: ${created} creados, ` +
          `${existing} existentes, ` +
          `${errors} errores.`
      );

      // =====================================
      // DETALLES POR PEDIDO
      // =====================================

      setDetails(
        results.map((result) => ({
          id:
            result.source_order_id ||
            "(sin identificador)",

          status: result.status,

          reason:
            result.message ||
            (
              result.status === "created"
                ? "Guardado correctamente"
                : result.status === "already_exists"
                ? "Ya estaba importado"
                : "Error desconocido"
            ),
        }))
      );

      // =====================================
      // RESPONDER A BOT SKY
      // =====================================

      window.opener?.postMessage(
        {
          channel,
          type: "RESULT",
          batchId: msg.batchId,
          results,
        },
        allowedOrigin
      );

      setWorking(false);
    };

    window.addEventListener(
      "message",
      onMessage
    );

    return () => {
      clearInterval(timer);

      window.removeEventListener(
        "message",
        onMessage
      );
    };
  }, [user, profile]);

  if (
    new URLSearchParams(
      window.location.search
    ).get("view") !== "import-botsky"
  ) {
    return null;
  }

  return (
    <div
      className="app-card mb-4 space-y-3 p-5"
      role="status"
    >
      <h2 className="font-bold">
        Importación BOT SKY
      </h2>

      <p>
        {!user
          ? "Iniciá sesión para continuar."
          : report}
      </p>

      {working && (
        <p>Guardando pedidos…</p>
      )}

      {details.length > 0 && (
        <div
          className="space-y-2"
          aria-label="Resultado por pedido"
        >
          {details.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className="rounded-lg border p-3 text-sm"
            >
              <div className="font-semibold">
                {item.status === "created"
                  ? "✅ Cargado"
                  : item.status === "already_exists"
                  ? "🟢 Ya existente"
                  : "❌ Error"}

                {" · Pedido "}
                {item.id}
              </div>

              <p className="mt-1 break-words">
                {item.reason}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
