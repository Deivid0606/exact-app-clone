import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function StorePixelView() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() || "";

  const [pixelId, setPixelId] = useState("");
  const [savedPixelId, setSavedPixelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!email) return;

    (async () => {
      const { data, error } = await supabase
        .from("seller_store_settings")
        .select("meta_pixel_id")
        .eq("owner_email", email)
        .maybeSingle();

      setLoading(false);

      if (error) {
        console.error(error);
        toast.error("No se pudo cargar el Pixel. Ejecutá store_v1.sql.");
        return;
      }

      const value = data?.meta_pixel_id || "";
      setPixelId(value);
      setSavedPixelId(value);
    })();
  }, [email]);

  const save = async () => {
    if (!email) return;

    const clean = pixelId.trim().replace(/\D/g, "");

    if (pixelId.trim() && !clean) {
      toast.error("Ingresá solamente el ID numérico del Pixel.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("seller_store_settings")
      .upsert(
        {
          owner_email: email,
          meta_pixel_id: clean || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_email" },
      );

    setSaving(false);

    if (error) {
      console.error(error);
      toast.error(error.message || "No se pudo guardar el Pixel.");
      return;
    }

    setPixelId(clean);
    setSavedPixelId(clean);

    toast.success(
      clean
        ? "🎯 Pixel guardado. Se aplicará automáticamente a todas tus páginas."
        : "Pixel eliminado.",
    );
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-[24px] border border-border bg-background p-5">
        <div className="flex items-start gap-3">
          <div className="text-3xl">🎯</div>
          <div>
            <h3 className="text-xl font-black">Meta Pixel</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Configuralo una sola vez. Todas las páginas publicadas por tu
              usuario usarán automáticamente este mismo Pixel.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label className="app-label">Pixel ID</label>
          <input
            className="app-input"
            value={pixelId}
            onChange={(event) =>
              setPixelId(event.target.value.replace(/\s/g, ""))
            }
            placeholder="Ej: 123456789012345"
            inputMode="numeric"
            disabled={loading}
          />
          <div className="text-xs text-muted-foreground mt-2">
            Pegá solamente el ID del Pixel, no todo el código JavaScript de Meta.
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="nav-btn active !px-5"
            disabled={saving || loading}
            onClick={save}
          >
            {saving ? "Guardando..." : "Guardar Pixel"}
          </button>

          {savedPixelId ? (
            <span className="text-sm font-bold text-emerald-500">
              ● Configurado: {savedPixelId}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              ○ Todavía no configurado
            </span>
          )}
        </div>
      </div>

      <div className="rounded-[24px] border border-border p-5 bg-secondary/10">
        <div className="font-black">Eventos automáticos</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm">
          <div className="rounded-xl border border-border bg-background p-3">
            ✅ PageView — al visitar la página
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            ✅ ViewContent — al ver el producto
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            ✅ InitiateCheckout — al abrir el checkout
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            ✅ Purchase — solo después de registrar el pedido
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Purchase utiliza un identificador único basado en el pedido para
          reducir duplicaciones del evento en el navegador.
        </p>
      </div>
    </div>
  );
}
