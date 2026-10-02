import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type SourceOrder = {
  source_order_id: string; order_number?: string; customer_name?: string;
  phone?: string; city?: string; departamento?: string; street?: string;
  district?: string; email?: string; obs?: string; sku?: string;
  product_title?: string; quantity?: number; total?: number;
  payment_method?: string; payment_status?: string; receipt_url?: string;
};
const channel = "botsky-import-v1";
const normalize = (s: unknown) => String(s ?? "").trim().toLowerCase();

export default function BotSkyImportBridge() {
  const { user, profile } = useAuth();
  const [report, setReport] = useState("Esperando conexión desde BOT SKY…");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("view") !== "import-botsky") return;
    if (!user || !profile?.approved || !window.opener) return;
    // Configurar en E-commerce: VITE_BOTSKY_ORIGIN=https://tu-dominio-real-de-bot-sky
    const allowedOrigin = "https://skybot-ai-sales-130022.vercel.app";
    if (!allowedOrigin || !/^https:\/\//.test(allowedOrigin)) {
      setReport("Origen de BOT SKY inválido."); return;
    }
    let busy = false;
    const sendReady = () => window.opener?.postMessage({ channel, type: "READY" }, allowedOrigin);
    const timer = window.setInterval(() => { if (!busy) sendReady(); }, 1200);
    sendReady();
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== allowedOrigin || event.source !== window.opener) return;
      const msg = event.data;
      if (busy || msg?.channel !== channel || msg.type !== "ORDERS" || !Array.isArray(msg.orders)
          || typeof msg.batchId !== "string") return;
      busy = true; setWorking(true); clearInterval(timer);
      const results: { source_order_id: string; status: string; message?: string }[] = [];
      const role = normalize(profile.role);
      const email = normalize(profile.email);
      try {
        if (!email || !["admin", "administrador", "seller", "vendedor", "provider", "proveedor"].includes(role))
          throw new Error("Tu usuario no tiene permisos para importar pedidos.");
        if (msg.orders.length > 100) throw new Error("Máximo 100 pedidos por lote.");
        const { data: products, error: productError } = await supabase.from("products").select("*");
        if (productError) throw productError;
        const { data: favorites, error: favoritesError } = await supabase.from("user_favorites")
          .select("product_id").eq("user_email", profile.email);
        if (favoritesError) throw favoritesError;
        const favoriteIds = new Set((favorites || []).map(f => f.product_id));
        const { data: cities, error: cityError } = await supabase.from("client_prices").select("*");
        if (cityError) throw cityError;
        const seen = new Set<string>();
        for (const raw of msg.orders as SourceOrder[]) {
          const id = String(raw.source_order_id || "");
          try {
            if (!id || seen.has(id)) throw new Error("ID de origen ausente o repetido en el lote");
            seen.add(id);
            const sku = normalize(raw.sku);
            if (!sku) throw new Error("SKU vacío");
            const matches = (products || []).filter(p => normalize(p.sku) === sku);
            if (matches.length !== 1) throw new Error("SKU inexistente o duplicado en E-commerce");
            const product = matches[0];
            const privateProduct = Boolean(product.is_private);
            const privateEmails = String(product.private_to_emails || "").split(",").map(normalize);
            const authorized = role === "admin" || role === "administrador"
              || (["provider", "proveedor"].includes(role) && normalize(product.provider_email) === email)
              || (["seller", "vendedor"].includes(role) && (!privateProduct || privateEmails.includes(email)));
            const listed = product.is_private === true || favoriteIds.has(product.id);
            if (!authorized || !listed) throw new Error("Producto no disponible para este usuario");
            const qty = Number(raw.quantity), total = Number(raw.total);
            if (!Number.isSafeInteger(qty) || qty <= 0 || !Number.isFinite(total) || total <= 0)
              throw new Error("Cantidad o total inválido");
            if (!raw.customer_name?.trim() || !raw.phone?.trim() || !raw.city?.trim())
              throw new Error("Faltan cliente, teléfono o ciudad");
            const cityMatches = (cities || []).filter(c => normalize(c.city) === normalize(raw.city));
            if (cityMatches.length !== 1) throw new Error("Ciudad inexistente o ambigua en tarifas");
            const city = cityMatches[0];
            if (raw.departamento && city.departamento && normalize(raw.departamento) !== normalize(city.departamento))
              throw new Error("Ciudad y departamento no coinciden");
            const { data: existing, error: existingError } = await supabase.from("orders")
              .select("id").eq("source_system", "BOT_SKY").eq("source_order_id", id).maybeSingle();
            if (existingError) throw existingError;
            if (existing) { results.push({ source_order_id: id, status: "already_exists" }); continue; }
            const delivery = Number(city.price_gs || 0);
            const providerPrice = Number(product.provider_price_gs || 0);
            const { error: insertError } = await supabase.from("orders").insert({
              order_number: `BS${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 30)}`,
              source_system: "BOT_SKY", source_order_id: id,
              created_by: profile.email, customer_name: raw.customer_name,
              phone: raw.phone, city: city.city, departamento: city.departamento || raw.departamento || "",
              street: raw.street || "", district: raw.district || "", email: raw.email || "",
              obs: [raw.obs, `Pedido BOT SKY: ${raw.order_number || id}`,
                `Pago: ${raw.payment_method || ""} / ${raw.payment_status || ""}`,
                raw.receipt_url ? `Comprobante: ${raw.receipt_url}` : ""].filter(Boolean).join(" | "),
              items_json: [{ sku: product.sku, title: product.title, sale_gs: total, qty,
                provider_price_gs: providerPrice, provider_email: product.provider_email || "" }],
              total_gs: total, delivery_gs: delivery,
              commission_gs: total - (providerPrice * qty + delivery),
              provider_emails_list: product.provider_email || "",
            } as any);
            if (insertError) {
              // Only a unique violation on the source ID may be classified as already imported.
              if (insertError.code === "23505") {
                const { data: dupe } = await supabase.from("orders").select("id")
                  .eq("source_system", "BOT_SKY").eq("source_order_id", id).maybeSingle();
                if (dupe) { results.push({ source_order_id: id, status: "already_exists" }); continue; }
              }
              throw insertError;
            }
            results.push({ source_order_id: id, status: "created" });
          } catch (err: any) {
            results.push({ source_order_id: id, status: "error", message: err?.message || String(err) });
          }
        }
      } catch (err: any) {
        for (const raw of msg.orders as SourceOrder[]) results.push({ source_order_id: raw.source_order_id, status: "error", message: err?.message || String(err) });
      }
      setReport(`Resultado: ${results.filter(r => r.status === "created").length} creados, ${results.filter(r => r.status === "already_exists").length} existentes, ${results.filter(r => r.status === "error").length} errores.`);
      window.opener?.postMessage({ channel, type: "RESULT", batchId: msg.batchId, results }, allowedOrigin);
      setWorking(false);
    };
    window.addEventListener("message", onMessage);
    return () => { clearInterval(timer); window.removeEventListener("message", onMessage); };
  }, [user, profile]);
  if (new URLSearchParams(location.search).get("view") !== "import-botsky") return null;
  return <div className="app-card mb-4 p-5" role="status"><h2 className="font-bold">Importación BOT SKY</h2><p>{!user ? "Iniciá sesión para continuar." : report}</p>{working && <p>Guardando pedidos…</p>}</div>;
}
