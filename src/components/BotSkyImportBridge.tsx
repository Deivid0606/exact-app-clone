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
  status: string;
  message?: string;
};

type Detail = {
  id: string;
  status: string;
  reason: string;
};

const channel = "botsky-import-v1";

const normalize = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

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

    const allowedOrigin =
      "https://skybot-ai-sales-130022.vercel.app";

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
      if (!busy) {
        sendReady();
      }
    }, 1200);

    sendReady();

    const onMessage = async (
      event: MessageEvent
    ) => {
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

      setWorking(true);
      setDetails([]);

      clearInterval(timer);

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

        if (
          !email ||
          !allowedRoles.includes(role)
        ) {
          throw new Error(
            "Tu usuario no tiene permisos para importar pedidos."
          );
        }

        if (msg.orders.length > 100) {
          throw new Error(
            "Máximo 100 pedidos por lote."
          );
        }

        const {
          data: products,
          error: productError,
        } = await supabase
          .from("products")
          .select("*");

        if (productError) {
          throw productError;
        }

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

        for (
          const raw of msg.orders as SourceOrder[]
        ) {
          const id = String(
            raw.source_order_id || ""
          );

          try {
            if (!id || seen.has(id)) {
              throw new Error(
                "ID de origen ausente o repetido en el lote."
              );
            }

            seen.add(id);

            // ====================================
            // COMPROBAR SI YA EXISTE
            // ====================================

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
              });

              continue;
            }

            // ====================================
            // VALIDAR SKU
            // ====================================

            const sku = normalize(raw.sku);

            if (!sku) {
              throw new Error("SKU vacío.");
            }

            const matches = (
              products || []
            ).filter(
              (product) =>
                normalize(product.sku) === sku
            );

            if (matches.length !== 1) {
              throw new Error(
                "SKU inexistente o duplicado en E-commerce."
              );
            }

            const product = matches[0];

            // ====================================
            // VALIDAR PERMISOS DEL PRODUCTO
            // ====================================

            const privateProduct = Boolean(
              product.is_private
            );

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
              product.is_private === true ||
              favoriteIds.has(product.id);

            if (!authorized || !listed) {
              throw new Error(
                "Producto no disponible para este usuario."
              );
            }

            // ====================================
            // VALIDAR CANTIDAD Y PRECIO
            // ====================================

            const qty = Number(raw.quantity);
            const total = Number(raw.total);

            if (
              !Number.isSafeInteger(qty) ||
              qty <= 0 ||
              !Number.isFinite(total) ||
              total <= 0
            ) {
              throw new Error(
                "Cantidad o total inválido."
              );
            }

            // ====================================
            // VALIDAR CLIENTE
            // ====================================

            if (
              !raw.customer_name?.trim() ||
              !raw.phone?.trim() ||
              !raw.city?.trim()
            ) {
              throw new Error(
                "Faltan cliente, teléfono o ciudad."
              );
            }

            // ====================================
            // VALIDAR CIUDAD Y DEPARTAMENTO
            // ====================================

            const cityMatches = (
              cities || []
            ).filter(
              (city) =>
                normalize(city.city) ===
                normalize(raw.city)
            );

            if (cityMatches.length !== 1) {
              throw new Error(
                "Ciudad inexistente o ambigua en tarifas."
              );
            }

            const city = cityMatches[0];

            if (
              raw.departamento &&
              city.departamento &&
              normalize(raw.departamento) !==
                normalize(city.departamento)
            ) {
              throw new Error(
                "Ciudad y departamento no coinciden."
              );
            }

            // ====================================
            // CALCULAR IMPORTES
            // ====================================

            const delivery = Number(
              city.price_gs || 0
            );

            const providerPrice = Number(
              product.provider_price_gs || 0
            );

            const commission =
              total -
              (
                providerPrice * qty +
                delivery
              );

            // ====================================
            // GUARDAR PEDIDO
            // ====================================

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
                  raw.customer_name,

                phone: raw.phone,

                city: city.city,

                departamento:
                  city.departamento ||
                  raw.departamento ||
                  "",

                street: raw.street || "",

                district:
                  raw.district || "",

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

            if (insertError) {
              // Solo reconocer como existente
              // cuando coincide el ID de origen.

              if (
                insertError.code === "23505"
              ) {
                const {
                  data: duplicate,
                  error: duplicateError,
                } = await supabase
                  .from("orders")
                  .select("id")
                  .eq(
                    "source_system",
                    "BOT_SKY"
                  )
                  .eq(
                    "source_order_id",
                    id
                  )
                  .maybeSingle();

                if (
                  !duplicateError &&
                  duplicate
                ) {
                  results.push({
                    source_order_id: id,
                    status: "already_exists",
                  });

                  continue;
                }
              }

              throw insertError;
            }

            results.push({
              source_order_id: id,
              status: "created",
            });

          } catch (err: any) {
            results.push({
              source_order_id: id,
              status: "error",
              message:
                err?.message ||
                String(err),
            });
          }
        }

      } catch (err: any) {
        for (
          const raw of msg.orders as SourceOrder[]
        ) {
          results.push({
            source_order_id:
              raw.source_order_id,
            status: "error",
            message:
              err?.message ||
              String(err),
          });
        }
      }

      // ====================================
      // RESULTADO GENERAL
      // ====================================

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

      // ====================================
      // DETALLE POR PEDIDO
      // ====================================

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
                : "Ya estaba importado"
            ),
        }))
      );

      // ====================================
      // RESPONDER A BOT SKY
      // ====================================

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
          {details.map(
            (item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="rounded-lg border p-3 text-sm"
              >
                <div className="font-semibold">
                  {item.status === "created"
                    ? "✅ Cargado"
                    : item.status ===
                        "already_exists"
                      ? "🟢 Ya existente"
                      : "❌ Error"}

                  {" · Pedido "}
                  {item.id}
                </div>

                <p className="mt-1 break-words">
                  {item.reason}
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
