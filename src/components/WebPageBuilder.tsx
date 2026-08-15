import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BuilderProduct = {
  id: string;
  title: string;
  sku: string | null;
  suggested_price_gs: number | null;
  provider_price_gs: number | null;
  image_url: string | null;
  image_url_2: string | null;
  image_url_3: string | null;
  description: string | null;
  warranty_info: string | null;
  warehouse_city: string | null;
};

type PageStatus = "draft" | "published";

type LandingRow = {
  id: string;
  owner_email: string;
  name: string;
  slug: string;
  status: PageStatus;
  config: LandingConfig;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type LandingProductSnapshot = {
  id: string;
  title: string;
  sku: string;
  price: number;
  compareAtPrice: number;
  images: string[];
  description: string;
  warranty: string;
  warehouseCity: string;
};

export type LandingConfig = {
  version: 1;
  selectedProductIds: string[];
  productSnapshots: LandingProductSnapshot[];
  announcement: string;
  primaryColor: string;
  accentColor: string;
  buttonColor: string;
  buttonText: string;
  buttonSubtext: string;
  reviewsText: string;
  rating: number;
  heroHeadline: string;
  heroDescription: string;
  checkoutTitle: string;
  shippingText: string;
  expressText: string;
  sections: {
    timeline: boolean;
    description: boolean;
    benefits: boolean;
    gallery: boolean;
    warranty: boolean;
    relatedProducts: boolean;
    faq: boolean;
  };
  benefits: string[];
  faq: { question: string; answer: string }[];
};

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const defaultConfig = (): LandingConfig => ({
  version: 1,
  selectedProductIds: [],
  productSnapshots: [],
  announcement: "🛍 ENVIOS GRATIS Y PAGAS AL RECIBIR",
  primaryColor: "#743c98",
  accentColor: "#111111",
  buttonColor: "#ff1717",
  buttonText: "👉 CLICK AQUI Y PAGA EN CASA 👈",
  buttonSubtext: "PAGAS EN TU CASA AL RECIBIR !!!",
  reviewsText: "(xxxx Reviews)",
  rating: 4.8,
  heroHeadline: "⚡ Una sola herramienta para hacer tu día más fácil.",
  heroDescription:
    "Una solución práctica, rápida y pensada para quienes buscan resultados sin complicaciones.",
  checkoutTitle: "PAGAS EN TU CASA AL RECIBIR ✅",
  shippingText: "Envío gratis · Periodo de entrega de 2 a 4 días 🚚",
  expressText: "Entrega express 24 horas ⚡ válido según cobertura",
  sections: {
    timeline: true,
    description: true,
    benefits: true,
    gallery: true,
    warranty: true,
    relatedProducts: true,
    faq: true,
  },
  benefits: [
    "Fácil de usar",
    "Entrega a todo Paraguay",
    "Pagás al recibir",
    "Compra rápida y segura",
  ],
  faq: [
    {
      question: "¿Cómo realizo mi pedido?",
      answer:
        "Presioná el botón de comprar, completá tus datos y confirmá el pedido.",
    },
    {
      question: "¿Cómo se realiza el pago?",
      answer:
        "En zonas habilitadas podés pagar al recibir. La modalidad final se informa al confirmar el pedido.",
    },
  ],
});

const nf = (n: number) =>
  new Intl.NumberFormat("es-PY").format(Math.round(Number(n || 0)));

function snapshotFromProduct(p: BuilderProduct): LandingProductSnapshot {
  const price = Number(p.suggested_price_gs || p.provider_price_gs || 0);
  return {
    id: p.id,
    title: p.title,
    sku: p.sku || "",
    price,
    compareAtPrice: price > 0 ? Math.round(price * 1.8) : 0,
    images: [p.image_url, p.image_url_2, p.image_url_3].filter(Boolean) as string[],
    description: p.description || "",
    warranty: p.warranty_info || "",
    warehouseCity: p.warehouse_city || "",
  };
}

export default function WebPageBuilder({
  products,
  userEmail,
}: {
  products: BuilderProduct[];
  userEmail: string;
}) {
  const [pages, setPages] = useState<LandingRow[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [config, setConfig] = useState<LandingConfig>(defaultConfig());
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  const selectedProducts = useMemo(
    () => products.filter((p) => config.selectedProductIds.includes(p.id)),
    [products, config.selectedProductIds],
  );

  const primaryProduct = selectedProducts[0];

  const loadPages = useCallback(async () => {
    if (!userEmail) return;
    setLoadingPages(true);
    const { data, error } = await supabase
      .from("landing_pages")
      .select("*")
      .eq("owner_email", userEmail)
      .order("updated_at", { ascending: false });

    setLoadingPages(false);
    if (error) {
      console.error(error);
      toast.error(
        "No se pudieron cargar las páginas. Ejecutá primero el SQL incluido.",
      );
      return;
    }

    setPages((data || []) as LandingRow[]);
  }, [userEmail]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const resetEditor = () => {
    setEditingId(null);
    setName("");
    setSlug("");
    setConfig(defaultConfig());
    setPreviewMode("desktop");
    setEditorOpen(true);
  };

  const editPage = (page: LandingRow) => {
    setEditingId(page.id);
    setName(page.name);
    setSlug(page.slug);
    setConfig({
      ...defaultConfig(),
      ...(page.config || {}),
      sections: {
        ...defaultConfig().sections,
        ...(page.config?.sections || {}),
      },
    });
    setEditorOpen(true);
  };

  const toggleProduct = (id: string) => {
    setConfig((prev) => {
      const exists = prev.selectedProductIds.includes(id);
      const ids = exists
        ? prev.selectedProductIds.filter((x) => x !== id)
        : [...prev.selectedProductIds, id];

      const snapshots = products
        .filter((p) => ids.includes(p.id))
        .map(snapshotFromProduct);

      const first = products.find((p) => p.id === ids[0]);

      return {
        ...prev,
        selectedProductIds: ids,
        productSnapshots: snapshots,
        heroHeadline:
          prev.selectedProductIds.length === 0 && first
            ? `⚡ ${first.title}: la solución práctica que estabas buscando.`
            : prev.heroHeadline,
      };
    });
  };

  const updateSnapshot = (
    productId: string,
    patch: Partial<LandingProductSnapshot>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      productSnapshots: prev.productSnapshots.map((p) =>
        p.id === productId ? { ...p, ...patch } : p,
      ),
    }));
  };

  const addBenefit = () =>
    setConfig((prev) => ({
      ...prev,
      benefits: [...prev.benefits, "Nuevo beneficio"],
    }));

  const addFaq = () =>
    setConfig((prev) => ({
      ...prev,
      faq: [
        ...prev.faq,
        { question: "Nueva pregunta", answer: "Escribí aquí la respuesta." },
      ],
    }));

  const validate = () => {
    if (!name.trim()) {
      toast.error("Ingresá un nombre para la página");
      return false;
    }
    if (!slugify(slug || name)) {
      toast.error("Ingresá una URL válida");
      return false;
    }
    if (config.selectedProductIds.length === 0) {
      toast.error("Seleccioná por lo menos un producto");
      return false;
    }
    return true;
  };

  const save = async (publish: boolean) => {
    if (!validate()) return;
    if (!userEmail) {
      toast.error("No se pudo identificar al usuario");
      return;
    }

    setSaving(true);
    const finalSlug = slugify(slug || name);
    const freshSnapshots = config.selectedProductIds.map((id) => {
      const edited = config.productSnapshots.find((x) => x.id === id);
      const original = products.find((x) => x.id === id);
      return edited || (original ? snapshotFromProduct(original) : null);
    }).filter(Boolean);

    const payload = {
      owner_email: userEmail,
      name: name.trim(),
      slug: finalSlug,
      status: publish ? "published" : "draft",
      config: {
        ...config,
        productSnapshots: freshSnapshots,
      },
      published_at: publish ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (editingId) {
      result = await supabase
        .from("landing_pages")
        .update(payload)
        .eq("id", editingId)
        .eq("owner_email", userEmail)
        .select("*")
        .single();
    } else {
      result = await supabase
        .from("landing_pages")
        .insert(payload)
        .select("*")
        .single();
    }

    setSaving(false);

    if (result.error) {
      console.error(result.error);
      if (
        String(result.error.message || "")
          .toLowerCase()
          .includes("duplicate")
      ) {
        toast.error("Ese enlace ya está siendo usado. Elegí otro slug.");
      } else {
        toast.error(result.error.message || "No se pudo guardar la página");
      }
      return;
    }

    const saved = result.data as LandingRow;
    setEditingId(saved.id);
    setSlug(saved.slug);
    setConfig(saved.config);
    toast.success(
      publish ? "🚀 Página publicada correctamente" : "💾 Borrador guardado",
    );
    await loadPages();
  };

  const deletePage = async (page: LandingRow) => {
    if (!confirm(`¿Eliminar la página "${page.name}"?`)) return;
    const { error } = await supabase
      .from("landing_pages")
      .delete()
      .eq("id", page.id)
      .eq("owner_email", userEmail);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Página eliminada");
    await loadPages();
  };

  const copyLink = async (pageSlug: string) => {
    const url = `${window.location.origin}/p/${pageSlug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  const currentPreviewProduct =
    config.productSnapshots[0] ||
    (primaryProduct ? snapshotFromProduct(primaryProduct) : null);

  if (editorOpen) {
    return (
      <div className="space-y-5">
        <div className="rounded-[28px] border border-border/70 bg-background p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button className="nav-btn" onClick={() => setEditorOpen(false)}>
              ← Mis páginas
            </button>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-primary font-black">
                Editor de página
              </div>
              <div className="font-black text-xl truncate">
                {name || "Nueva página"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`nav-btn ${previewMode === "desktop" ? "active" : ""}`}
              onClick={() => setPreviewMode("desktop")}
            >
              🖥 Escritorio
            </button>
            <button
              className={`nav-btn ${previewMode === "mobile" ? "active" : ""}`}
              onClick={() => setPreviewMode("mobile")}
            >
              📱 Móvil
            </button>
            <button
              className="nav-btn"
              disabled={saving}
              onClick={() => save(false)}
            >
              {saving ? "Guardando..." : "💾 Guardar borrador"}
            </button>
            <button
              className="nav-btn active"
              disabled={saving}
              onClick={() => save(true)}
            >
              🚀 Publicar página
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-[390px_minmax(0,1fr)] gap-5 items-start">
          <aside className="space-y-4 2xl:sticky 2xl:top-4">
            <div className="rounded-[24px] border border-border/70 bg-background p-4 space-y-3">
              <div className="font-black">1. Datos de la página</div>
              <div>
                <label className="app-label">Nombre interno</label>
                <input
                  className="app-input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!editingId && !slug) setSlug(slugify(e.target.value));
                  }}
                  placeholder="Ej: Cepillo 9 en 1"
                />
              </div>
              <div>
                <label className="app-label">Enlace público</label>
                <div className="flex items-center rounded-xl border border-border overflow-hidden bg-secondary/20">
                  <span className="px-3 text-xs text-muted-foreground">/p/</span>
                  <input
                    className="flex-1 bg-transparent px-2 py-2.5 outline-none text-sm"
                    value={slug}
                    onChange={(e) => setSlug(slugify(e.target.value))}
                    placeholder="cepillo-9-en-1"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background p-4 space-y-3">
              <div className="font-black">2. Seleccionar productos</div>
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                {products.map((p) => {
                  const active = config.selectedProductIds.includes(p.id);
                  const image = p.image_url;
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProduct(p.id)}
                      className={`w-full text-left rounded-xl border p-2 flex items-center gap-3 transition ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-secondary/20 hover:bg-secondary/40"
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden shrink-0">
                        {image ? (
                          <img
                            src={image}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full grid place-items-center">
                            📦
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm truncate">{p.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {nf(Number(p.suggested_price_gs || p.provider_price_gs || 0))} Gs
                        </div>
                      </div>
                      <div className="text-lg">{active ? "✅" : "○"}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background p-4 space-y-3">
              <div className="font-black">3. Tema Shrine / Skyline</div>
              <div>
                <label className="app-label">Barra superior</label>
                <input
                  className="app-input"
                  value={config.announcement}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, announcement: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="app-label text-[10px]">Principal</label>
                  <input
                    type="color"
                    className="w-full h-10 rounded-lg"
                    value={config.primaryColor}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, primaryColor: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="app-label text-[10px]">Texto</label>
                  <input
                    type="color"
                    className="w-full h-10 rounded-lg"
                    value={config.accentColor}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, accentColor: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="app-label text-[10px]">Comprar</label>
                  <input
                    type="color"
                    className="w-full h-10 rounded-lg"
                    value={config.buttonColor}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, buttonColor: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="app-label">Texto botón</label>
                <input
                  className="app-input"
                  value={config.buttonText}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, buttonText: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="app-label">Subtexto botón</label>
                <input
                  className="app-input"
                  value={config.buttonSubtext}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, buttonSubtext: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="app-label">Texto reviews</label>
                <input
                  className="app-input"
                  value={config.reviewsText}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, reviewsText: e.target.value }))
                  }
                />
              </div>
            </div>

            {config.productSnapshots.map((product) => (
              <div
                key={product.id}
                className="rounded-[24px] border border-border/70 bg-background p-4 space-y-3"
              >
                <div className="font-black text-sm">✏️ {product.title}</div>
                <div>
                  <label className="app-label">Título en la landing</label>
                  <input
                    className="app-input"
                    value={product.title}
                    onChange={(e) =>
                      updateSnapshot(product.id, { title: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="app-label">Precio</label>
                    <input
                      type="number"
                      className="app-input"
                      value={product.price}
                      onChange={(e) =>
                        updateSnapshot(product.id, {
                          price: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="app-label">Antes</label>
                    <input
                      type="number"
                      className="app-input"
                      value={product.compareAtPrice}
                      onChange={(e) =>
                        updateSnapshot(product.id, {
                          compareAtPrice: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="app-label">Descripción</label>
                  <textarea
                    className="app-input min-h-[90px]"
                    value={product.description}
                    onChange={(e) =>
                      updateSnapshot(product.id, { description: e.target.value })
                    }
                  />
                </div>
              </div>
            ))}

            <div className="rounded-[24px] border border-border/70 bg-background p-4 space-y-3">
              <div className="font-black">4. Contenido</div>
              <div>
                <label className="app-label">Titular grande</label>
                <textarea
                  className="app-input min-h-[70px]"
                  value={config.heroHeadline}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, heroHeadline: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="app-label">Texto</label>
                <textarea
                  className="app-input min-h-[90px]"
                  value={config.heroDescription}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, heroDescription: e.target.value }))
                  }
                />
              </div>

              <div className="font-bold text-sm pt-2">Secciones visibles</div>
              {Object.entries(config.sections).map(([key, value]) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border p-2.5 cursor-pointer"
                >
                  <span className="text-sm capitalize">{key}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        sections: {
                          ...p.sections,
                          [key]: e.target.checked,
                        },
                      }))
                    }
                  />
                </label>
              ))}

              <div className="font-bold text-sm pt-2">Beneficios</div>
              {config.benefits.map((benefit, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className="app-input"
                    value={benefit}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        benefits: p.benefits.map((x, i) =>
                          i === index ? e.target.value : x,
                        ),
                      }))
                    }
                  />
                  <button
                    className="nav-btn !px-3"
                    onClick={() =>
                      setConfig((p) => ({
                        ...p,
                        benefits: p.benefits.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button className="nav-btn w-full" onClick={addBenefit}>
                + Agregar beneficio
              </button>

              <div className="font-bold text-sm pt-2">Preguntas frecuentes</div>
              {config.faq.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-border p-3 space-y-2"
                >
                  <input
                    className="app-input"
                    value={item.question}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        faq: p.faq.map((x, i) =>
                          i === index ? { ...x, question: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <textarea
                    className="app-input min-h-[70px]"
                    value={item.answer}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        faq: p.faq.map((x, i) =>
                          i === index ? { ...x, answer: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <button
                    className="nav-btn !text-xs"
                    onClick={() =>
                      setConfig((p) => ({
                        ...p,
                        faq: p.faq.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    Eliminar pregunta
                  </button>
                </div>
              ))}
              <button className="nav-btn w-full" onClick={addFaq}>
                + Agregar pregunta
              </button>
            </div>
          </aside>

          <section className="rounded-[28px] border border-border/70 bg-[#e9e9e9] p-3 sm:p-5 overflow-auto min-h-[800px]">
            <div
              className={`mx-auto bg-white shadow-2xl overflow-hidden transition-all ${
                previewMode === "mobile"
                  ? "w-[390px] max-w-full rounded-[28px]"
                  : "w-full rounded-xl"
              }`}
            >
              <ShrinePreview
                config={config}
                product={currentPreviewProduct}
                mobile={previewMode === "mobile"}
              />
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-border/70 bg-gradient-to-br from-background via-secondary/20 to-background p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-primary font-black">
            Generador de páginas
          </div>
          <h3 className="text-3xl font-black tracking-tight mt-1">
            🌐 Páginas Web
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Seleccioná uno o varios productos, personalizá la landing y publicala
            con tu propio link.
          </p>
        </div>
        <button className="nav-btn active !px-5 !py-3" onClick={resetEditor}>
          ＋ Crear nueva página
        </button>
      </div>

      {loadingPages ? (
        <div className="rounded-2xl border border-border p-10 text-center">
          Cargando páginas...
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-border p-12 text-center bg-secondary/10">
          <div className="text-5xl">🌐</div>
          <div className="font-black text-xl mt-3">Todavía no creaste páginas</div>
          <div className="text-sm text-muted-foreground mt-1">
            Creá la primera landing seleccionando un producto del catálogo.
          </div>
          <button className="nav-btn active mt-5" onClick={resetEditor}>
            Crear página
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
          {pages.map((page) => {
            const first = page.config?.productSnapshots?.[0];
            return (
              <div
                key={page.id}
                className="rounded-[24px] border border-border bg-background overflow-hidden"
              >
                <div className="h-44 bg-secondary relative overflow-hidden">
                  {first?.images?.[0] ? (
                    <img
                      src={first.images[0]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-5xl">
                      🌐
                    </div>
                  )}
                  <div
                    className={`absolute top-3 left-3 text-xs font-black px-2.5 py-1 rounded-full ${
                      page.status === "published"
                        ? "bg-emerald-500 text-white"
                        : "bg-amber-400 text-black"
                    }`}
                  >
                    {page.status === "published" ? "● PUBLICADA" : "● BORRADOR"}
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <div className="font-black text-lg">{page.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 break-all">
                      {window.location.origin}/p/{page.slug}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {page.config?.productSnapshots?.length || 0} producto(s)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="nav-btn" onClick={() => editPage(page)}>
                      ✏️ Editar
                    </button>
                    <button
                      className="nav-btn"
                      onClick={() =>
                        window.open(`/p/${page.slug}`, "_blank", "noopener")
                      }
                    >
                      👁 Ver
                    </button>
                    <button className="nav-btn" onClick={() => copyLink(page.slug)}>
                      🔗 Copiar link
                    </button>
                    <button
                      className="nav-btn !bg-red-500/10 !text-red-500"
                      onClick={() => deletePage(page)}
                    >
                      🗑 Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShrinePreview({
  config,
  product,
  mobile,
}: {
  config: LandingConfig;
  product: LandingProductSnapshot | null;
  mobile: boolean;
}) {
  const images = product?.images || [];
  return (
    <div
      style={
        {
          "--primary": config.primaryColor,
          "--accent": config.accentColor,
          "--buy": config.buttonColor,
          color: config.accentColor,
          fontFamily: "Arial, Helvetica, sans-serif",
          background: "#fff",
        } as React.CSSProperties
      }
    >
      <div
        style={{
          background: config.primaryColor,
          color: "white",
          textAlign: "center",
          padding: mobile ? "12px 8px" : "16px 10px",
          fontWeight: 800,
          fontSize: mobile ? 13 : 18,
          letterSpacing: ".3px",
        }}
      >
        {config.announcement}
      </div>

      {!product ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 55 }}>📦</div>
          <b>Seleccioná un producto para ver la vista previa</b>
        </div>
      ) : (
        <>
          <div
            style={{
              maxWidth: 1180,
              margin: mobile ? "18px auto" : "36px auto",
              padding: mobile ? "0 14px" : "0 20px",
              display: "grid",
              gridTemplateColumns: mobile ? "1fr" : "1.08fr .82fr",
              gap: mobile ? 20 : 48,
              alignItems: "start",
            }}
          >
            <div>
              <div
                style={{
                  aspectRatio: "1/1",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#f3f3f3",
                }}
              >
                {images[0] ? (
                  <img
                    src={images[0]}
                    alt={product.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 60,
                    }}
                  >
                    📷
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <div style={{ display: "flex", gap: 9, marginTop: 9 }}>
                  {images.slice(0, 4).map((img, i) => (
                    <div
                      key={i}
                      style={{
                        width: 76,
                        height: 76,
                        borderRadius: 9,
                        overflow: "hidden",
                        border: "1px solid #ddd",
                      }}
                    >
                      <img
                        src={img}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h1
                style={{
                  fontSize: mobile ? 30 : 40,
                  lineHeight: 1.05,
                  margin: "4px 0 8px",
                  fontWeight: 900,
                }}
              >
                {product.title.toUpperCase()}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ color: "#ffbf00", fontSize: 22 }}>★★★★★</span>
                <span style={{ fontSize: 17 }}>{config.reviewsText}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  alignItems: "center",
                  flexWrap: "wrap",
                  margin: "15px 0 19px",
                }}
              >
                <strong
                  style={{ color: config.primaryColor, fontSize: 23 }}
                >
                  Gs. {nf(product.price)}
                </strong>
                {product.compareAtPrice > product.price && (
                  <>
                    <b style={{ textDecoration: "line-through", fontSize: 16 }}>
                      Gs. {nf(product.compareAtPrice)}
                    </b>
                    <span
                      style={{
                        background: config.primaryColor,
                        color: "#fff",
                        borderRadius: 4,
                        padding: "4px 7px",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      SAVE{" "}
                      {Math.max(
                        0,
                        Math.round(
                          (1 - product.price / product.compareAtPrice) * 100,
                        ),
                      )}
                      %
                    </span>
                  </>
                )}
              </div>

              <b style={{ fontSize: 13 }}>Cantidad</b>
              <div
                style={{
                  marginTop: 5,
                  width: 142,
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  height: 48,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  placeItems: "center",
                  background: "#faf8fb",
                }}
              >
                <span>−</span>
                <span>1</span>
                <span>＋</span>
              </div>

              <button
                style={{
                  width: "100%",
                  marginTop: 16,
                  minHeight: 66,
                  borderRadius: 38,
                  border: "5px solid #000",
                  background: config.buttonColor,
                  color: "#fff",
                  fontWeight: 900,
                  boxShadow: "0 4px 10px rgba(0,0,0,.22)",
                  padding: "8px 18px",
                }}
              >
                <div>{config.buttonText}</div>
                <div style={{ fontSize: 11, marginTop: 3 }}>
                  {config.buttonSubtext}
                </div>
              </button>

              {config.sections.timeline && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 6,
                    textAlign: "center",
                    marginTop: 28,
                  }}
                >
                  {[
                    ["🛒", "Hoy", "Ordenado"],
                    ["🚚", "1 - 2 días", "Orden lista"],
                    ["🎁", "2 - 4 días", "Entregado"],
                  ].map(([icon, date, label]) => (
                    <div key={label}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          background: "#151515",
                          color: "#fff",
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          margin: "auto",
                          fontSize: 21,
                        }}
                      >
                        {icon}
                      </div>
                      <b style={{ display: "block", marginTop: 7 }}>{date}</b>
                      <span style={{ fontSize: 14 }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}

              <h2
                style={{
                  fontWeight: 900,
                  fontSize: mobile ? 31 : 39,
                  lineHeight: 1.18,
                  marginTop: 30,
                  whiteSpace: "pre-line",
                }}
              >
                {config.heroHeadline}
              </h2>
              <p style={{ fontSize: 17, lineHeight: 1.6 }}>
                {config.heroDescription}
              </p>
            </div>
          </div>

          {config.sections.description && (
            <div
              style={{
                maxWidth: 930,
                margin: "30px auto",
                padding: mobile ? "0 18px" : "0 20px",
                textAlign: "center",
              }}
            >
              <h2 style={{ fontSize: mobile ? 27 : 38, fontWeight: 900 }}>
                Conocé todo lo que puede hacer por vos
              </h2>
              <p style={{ fontSize: 17, lineHeight: 1.7 }}>
                {product.description || config.heroDescription}
              </p>
            </div>
          )}

          {config.sections.benefits && (
            <div
              style={{
                background: "#f7f7f7",
                padding: mobile ? "30px 18px" : "48px 20px",
              }}
            >
              <div
                style={{
                  maxWidth: 980,
                  margin: "auto",
                  display: "grid",
                  gridTemplateColumns: mobile ? "1fr" : "repeat(2,1fr)",
                  gap: 14,
                }}
              >
                {config.benefits.map((b, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid #e1e1e1",
                      borderRadius: 15,
                      background: "#fff",
                      padding: 20,
                      fontWeight: 800,
                      fontSize: 18,
                    }}
                  >
                    ✅ {b}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
