import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type MetaConfigStatus = {
  pixel_id?: string | null;
  has_access_token?: boolean;
  updated_at?: string | null;
};

export default function StorePixelView() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() || "";

  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [savedPixelId, setSavedPixelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const db = supabase as any;

  const loadStatus = async () => {
    if (!email) return;

    setLoading(true);

    const { data, error } = await db.rpc("get_my_meta_config_status");

    setLoading(false);

    if (error) {
      console.error("get_my_meta_config_status:", error);
      toast.error(
        error.message ||
          "No se pudo cargar la configuración de Meta. Ejecutá META_CAPI_SETUP.sql.",
      );
      return;
    }

    const status = (data || {}) as MetaConfigStatus;
    const value = String(status.pixel_id || "");

    setPixelId(value);
    setSavedPixelId(value);
    setHasAccessToken(Boolean(status.has_access_token));
  };

  useEffect(() => {
    loadStatus();
  }, [email]);

  const save = async () => {
    if (!email) return;

    const cleanPixel = pixelId.trim().replace(/\D/g, "");
    const cleanToken = accessToken.trim();

    if (!cleanPixel) {
      toast.error("Ingresá el Pixel ID.");
      return;
    }

    if (!/^\d{5,30}$/.test(cleanPixel)) {
      toast.error("El Pixel ID debe contener únicamente números.");
      return;
    }

    if (!hasAccessToken && !cleanToken) {
      toast.error(
        "Es la primera configuración: también tenés que ingresar el Access Token de Conversions API.",
      );
      return;
    }

    setSaving(true);

    const { data, error } = await db.rpc("save_my_meta_credentials", {
      p_pixel_id: cleanPixel,
      p_access_token: cleanToken || null,
    });

    setSaving(false);

    if (error) {
      console.error("save_my_meta_credentials:", error);
      toast.error(error.message || "No se pudo guardar Meta Pixel + CAPI.");
      return;
    }

    const result = (data || {}) as MetaConfigStatus;

    setPixelId(cleanPixel);
    setSavedPixelId(cleanPixel);
    setHasAccessToken(Boolean(result.has_access_token));
    setAccessToken("");

    toast.success(
      "✅ Meta Pixel + Conversions API configurados para todas tus páginas.",
    );
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-[24px] border border-border bg-background p-5">
        <div className="flex items-start gap-3">
          <div className="text-3xl">🎯</div>

          <div>
            <h3 className="text-xl font-black">
              Meta Pixel + Conversions API
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              Configuralo una sola vez. Todas las páginas publicadas por tu
              usuario usarán automáticamente esta configuración.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
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

            <div className="mt-2 text-xs text-muted-foreground">
              Pegá solamente el ID numérico del Pixel / Dataset.
            </div>
          </div>

          <div>
            <label className="app-label">
              Access Token de Meta Conversions API
            </label>

            <input
              type="password"
              autoComplete="off"
              className="app-input"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder={
                hasAccessToken
                  ? "Token ya guardado — dejá vacío para conservarlo"
                  : "Pegá aquí el Access Token de Conversions API"
              }
              disabled={loading}
            />

            <div className="mt-2 text-xs text-muted-foreground">
              El token no se vuelve a mostrar después de guardarlo y no se
              envía a las páginas públicas.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="nav-btn active !px-5"
            disabled={saving || loading}
            onClick={save}
          >
            {saving ? "Guardando..." : "Guardar Meta Pixel + CAPI"}
          </button>

          {savedPixelId && hasAccessToken ? (
            <span className="text-sm font-bold text-emerald-500">
              ● Pixel + CAPI configurados
            </span>
          ) : savedPixelId ? (
            <span className="text-sm font-bold text-amber-500">
              ● Pixel configurado · falta Access Token
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              ○ Todavía no configurado
            </span>
          )}
        </div>

        {savedPixelId && (
          <div className="mt-3 rounded-xl border border-border bg-secondary/20 p-3 text-xs">
            <div>
              <b>Pixel ID:</b> {savedPixelId}
            </div>

            <div className="mt-1">
              <b>Conversions API:</b>{" "}
              {hasAccessToken ? "✅ Token guardado" : "❌ Sin token"}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-border bg-secondary/10 p-5">
        <div className="font-black">Eventos automáticos</div>

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-3">
            ✅ PageView — Pixel navegador
          </div>

          <div className="rounded-xl border border-border bg-background p-3">
            ✅ ViewContent — Pixel navegador
          </div>

          <div className="rounded-xl border border-border bg-background p-3">
            ✅ InitiateCheckout — Pixel navegador
          </div>

          <div className="rounded-xl border border-border bg-background p-3">
            ✅ Purchase — Pixel + servidor CAPI
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Purchase usa el mismo event_id en navegador y servidor para que Meta
          pueda tratar ambos envíos como la misma compra.
        </p>
      </div>
    </div>
  );
}
