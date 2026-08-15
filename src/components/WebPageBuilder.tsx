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
export type LandingMediaType = "image" | "video";

export type LandingMediaItem = {
  id: string;
  type: LandingMediaType;
  url: string;
  alt?: string;
};

export type LandingContentBlock =
  | {
      id: string;
      type: "heading";
      enabled: boolean;
      text: string;
      emoji?: string;
      align: "left" | "center";
      size: "md" | "lg" | "xl";
    }
  | {
      id: string;
      type: "text";
      enabled: boolean;
      text: string;
      align: "left" | "center";
    }
  | {
      id: string;
      type: "image";
      enabled: boolean;
      url: string;
      alt: string;
      width: "normal" | "wide" | "full";
      rounded: boolean;
    }
  | {
      id: string;
      type: "video";
      enabled: boolean;
      url: string;
      poster?: string;
      autoplay: boolean;
      muted: boolean;
      loop: boolean;
      controls: boolean;
      width: "normal" | "wide" | "full";
      rounded: boolean;
    }
  | {
      id: string;
      type: "image_text";
      enabled: boolean;
      imageUrl: string;
      title: string;
      text: string;
      imagePosition: "left" | "right";
    }
  | {
      id: string;
      type: "spacer";
      enabled: boolean;
      height: number;
    };

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
  media: LandingMediaItem[];
  description: string;
  warranty: string;
  warehouseCity: string;
};

export type LandingConfig = {
  version: 2;
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
  contentBlocks: LandingContentBlock[];
};

const MEDIA_BUCKET = "landing-media";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const defaultConfig = (): LandingConfig => ({
  version: 2,
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
  contentBlocks: [],
});

const nf = (n: number) =>
  new Intl.NumberFormat("es-PY").format(Math.round(Number(n || 0)));

const mediaFromProduct = (p: BuilderProduct): LandingMediaItem[] =>
  [p.image_url, p.image_url_2, p.image_url_3]
    .filter(Boolean)
    .map((url) => ({
      id: uid(),
      type: "image" as const,
      url: String(url),
      alt: p.title,
    }));

function snapshotFromProduct(p: BuilderProduct): LandingProductSnapshot {
  const price = Number(p.suggested_price_gs || p.provider_price_gs || 0);
  const media = mediaFromProduct(p);
  return {
    id: p.id,
    title: p.title,
    sku: p.sku || "",
    price,
    compareAtPrice: price > 0 ? Math.round(price * 1.8) : 0,
    images: media.filter((m) => m.type === "image").map((m) => m.url),
    media,
    description: p.description || "",
    warranty: p.warranty_info || "",
    warehouseCity: p.warehouse_city || "",
  };
}

function normalizeConfig(raw?: Partial<LandingConfig> | null): LandingConfig {
  const base = defaultConfig();
  const config: LandingConfig = {
    ...base,
    ...(raw || {}),
    version: 2,
    sections: {
      ...base.sections,
      ...(raw?.sections || {}),
    },
    benefits: raw?.benefits || base.benefits,
    faq: raw?.faq || base.faq,
    contentBlocks: raw?.contentBlocks || [],
    productSnapshots: (raw?.productSnapshots || []).map((p: any) => {
      const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
      const media =
        Array.isArray(p.media) && p.media.length > 0
          ? p.media
          : images.map((url: string) => ({
              id: uid(),
              type: "image" as const,
              url,
              alt: p.title || "",
            }));
      return {
        ...p,
        images,
        media,
      };
    }),
  };
  return config;
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
  const [uploading, setUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);

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
        "No se pudieron cargar las páginas. Ejecutá primero el SQL actualizado.",
      );
      return;
    }

    setPages(
      ((data || []) as LandingRow[]).map((row) => ({
        ...row,
        config: normalizeConfig(row.config),
      })),
    );
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
    setInsertAtIndex(null);
    setDraggedBlockIndex(null);
    setEditorOpen(true);
  };

  const editPage = (page: LandingRow) => {
    setEditingId(page.id);
    setName(page.name);
    setSlug(page.slug);
    setConfig(normalizeConfig(page.config));
    setInsertAtIndex(null);
    setDraggedBlockIndex(null);
    setEditorOpen(true);
  };

  const toggleProduct = (id: string) => {
    setConfig((prev) => {
      const exists = prev.selectedProductIds.includes(id);
      const ids = exists
        ? prev.selectedProductIds.filter((x) => x !== id)
        : [...prev.selectedProductIds, id];

      const previousMap = new Map(prev.productSnapshots.map((p) => [p.id, p]));
      const snapshots = products
        .filter((p) => ids.includes(p.id))
        .map((p) => previousMap.get(p.id) || snapshotFromProduct(p));

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

  const sanitizeFileName = (name: string) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-");

  const getFileMimeType = (file: File) => {
    if (file.type) return file.type;

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const mimeByExtension: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      m4v: "video/mp4",
    };

    return mimeByExtension[ext] || "application/octet-stream";
  };

  const uploadFile = async (
    file: File,
    folder: string,
  ): Promise<LandingMediaItem | null> => {
    try {
      const mimeType = getFileMimeType(file);
      const isImage = mimeType.startsWith("image/");
      const isVideo = mimeType.startsWith("video/");

      if (!isImage && !isVideo) {
        toast.error(`"${file.name}" no es una imagen o video compatible.`);
        return null;
      }

      const maxImageBytes = 15 * 1024 * 1024;
      const maxVideoBytes = 80 * 1024 * 1024;
      const max = isVideo ? maxVideoBytes : maxImageBytes;

      if (file.size > max) {
        const sizeMb = (file.size / 1024 / 1024).toFixed(1);
        toast.error(
          isVideo
            ? `El video pesa ${sizeMb} MB. El máximo configurado es 80 MB.`
            : `La imagen pesa ${sizeMb} MB. El máximo configurado es 15 MB.`,
          { duration: 8000 },
        );
        return null;
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Error obteniendo sesión:", sessionError);
        toast.error(`No se pudo validar tu sesión: ${sessionError.message}`, {
          duration: 8000,
        });
        return null;
      }

      if (!session?.user) {
        toast.error(
          "Tu sesión no está activa. Cerrá sesión, volvé a ingresar e intentá nuevamente.",
          { duration: 8000 },
        );
        return null;
      }

      const owner = session.user.email || userEmail || session.user.id;
      const safeOwner = owner
        .toLowerCase()
        .replace(/[^a-z0-9@._-]/g, "-");

      const safeName =
        sanitizeFileName(file.name) ||
        `${isVideo ? "video" : "imagen"}-${Date.now()}`;

      const path = `${safeOwner}/${folder}/${Date.now()}-${uid()}-${safeName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: mimeType,
        });

      if (uploadError) {
        console.error("❌ ERROR STORAGE COMPLETO:", uploadError);

        const message = String(uploadError.message || "Error desconocido");
        const normalized = message.toLowerCase();

        if (normalized.includes("bucket") && normalized.includes("not found")) {
          toast.error(
            `No existe el bucket "${MEDIA_BUCKET}". Ejecutá el SQL de landing-media.`,
            { duration: 10000 },
          );
        } else if (
          normalized.includes("row-level security") ||
          normalized.includes("policy") ||
          normalized.includes("unauthorized") ||
          normalized.includes("permission")
        ) {
          toast.error(`Supabase bloqueó la subida por permisos (RLS): ${message}`, {
            duration: 10000,
          });
        } else if (
          normalized.includes("maximum") ||
          normalized.includes("too large") ||
          normalized.includes("payload") ||
          normalized.includes("size")
        ) {
          toast.error(`El archivo supera el límite de Supabase Storage: ${message}`, {
            duration: 10000,
          });
        } else {
          toast.error(`No se pudo subir "${file.name}": ${message}`, {
            duration: 10000,
          });
        }

        return null;
      }

      const storedPath = uploadData?.path || path;
      const { data: publicData } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(storedPath);

      if (!publicData?.publicUrl) {
        toast.error("El archivo se subió, pero no se pudo generar su URL pública.");
        return null;
      }

      return {
        id: uid(),
        type: isVideo ? "video" : "image",
        url: publicData.publicUrl,
        alt: file.name,
      };
    } catch (error: any) {
      console.error("❌ Error inesperado subiendo archivo:", error);
      toast.error(
        `Error inesperado al subir "${file.name}": ${
          error?.message || "Error desconocido"
        }`,
        { duration: 10000 },
      );
      return null;
    }
  };

  const uploadProductMedia = async (
    productId: string,
    files: FileList | null,
  ) => {
    if (!files?.length) return;
    setUploading(true);
    const uploaded: LandingMediaItem[] = [];

    for (const file of Array.from(files)) {
      const item = await uploadFile(file, `products/${productId}`);
      if (item) uploaded.push(item);
    }

    setUploading(false);
    if (!uploaded.length) return;

    setConfig((prev) => ({
      ...prev,
      productSnapshots: prev.productSnapshots.map((p) => {
        if (p.id !== productId) return p;
        const media = [...(p.media || []), ...uploaded];
        return {
          ...p,
          media,
          images: media.filter((m) => m.type === "image").map((m) => m.url),
        };
      }),
    }));

    toast.success(`${uploaded.length} archivo(s) agregado(s) a la galería.`);
  };

  const removeProductMedia = (productId: string, mediaId: string) => {
    setConfig((prev) => ({
      ...prev,
      productSnapshots: prev.productSnapshots.map((p) => {
        if (p.id !== productId) return p;
        const media = (p.media || []).filter((m) => m.id !== mediaId);
        return {
          ...p,
          media,
          images: media.filter((m) => m.type === "image").map((m) => m.url),
        };
      }),
    }));
  };

  const moveProductMedia = (
    productId: string,
    mediaIndex: number,
    direction: -1 | 1,
  ) => {
    setConfig((prev) => ({
      ...prev,
      productSnapshots: prev.productSnapshots.map((p) => {
        if (p.id !== productId) return p;
        const media = [...(p.media || [])];
        const target = mediaIndex + direction;
        if (target < 0 || target >= media.length) return p;
        [media[mediaIndex], media[target]] = [media[target], media[mediaIndex]];
        return {
          ...p,
          media,
          images: media.filter((m) => m.type === "image").map((m) => m.url),
        };
      }),
    }));
  };

  const createBlock = (
    type: LandingContentBlock["type"],
  ): LandingContentBlock => {
    if (type === "heading") {
      return {
        id: uid(),
        type,
        enabled: true,
        text: "🚨 Los lugares más difíciles son los que más atención necesitan.",
        align: "left",
        size: "lg",
      };
    }

    if (type === "text") {
      return {
        id: uid(),
        type,
        enabled: true,
        text: "Escribí aquí el contenido que querés mostrar en la página.",
        align: "left",
      };
    }

    if (type === "image") {
      return {
        id: uid(),
        type,
        enabled: true,
        url: "",
        alt: "",
        width: "normal",
        rounded: true,
      };
    }

    if (type === "video") {
      return {
        id: uid(),
        type,
        enabled: true,
        url: "",
        poster: "",
        autoplay: false,
        muted: true,
        loop: false,
        controls: true,
        width: "normal",
        rounded: true,
      };
    }

    if (type === "image_text") {
      return {
        id: uid(),
        type,
        enabled: true,
        imageUrl: "",
        title: "Nuevo bloque",
        text: "Agregá una imagen y escribí una descripción.",
        imagePosition: "left",
      };
    }

    return {
      id: uid(),
      type: "spacer",
      enabled: true,
      height: 30,
    };
  };

  /**
   * Inserta un bloque exactamente donde el usuario quiera.
   * index = 0 -> primero
   * index = contentBlocks.length -> último
   */
  const addBlock = (
    type: LandingContentBlock["type"],
    requestedIndex?: number,
  ) => {
    const block = createBlock(type);

    setConfig((prev) => {
      const next = [...prev.contentBlocks];
      const fallbackIndex =
        insertAtIndex === null ? next.length : insertAtIndex;
      const rawIndex =
        requestedIndex === undefined ? fallbackIndex : requestedIndex;
      const targetIndex = Math.max(0, Math.min(rawIndex, next.length));

      next.splice(targetIndex, 0, block);

      return {
        ...prev,
        contentBlocks: next,
      };
    });

    setInsertAtIndex(null);
  };

  const patchBlock = (
    id: string,
    patch: Record<string, unknown>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      contentBlocks: prev.contentBlocks.map((b) =>
        b.id === id ? ({ ...b, ...patch } as LandingContentBlock) : b,
      ),
    }));
  };

  const deleteBlock = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      contentBlocks: prev.contentBlocks.filter((b) => b.id !== id),
    }));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    setConfig((prev) => {
      const next = [...prev.contentBlocks];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;

      [next[index], next[target]] = [next[target], next[index]];

      return {
        ...prev,
        contentBlocks: next,
      };
    });
  };

  /**
   * Mueve directamente un bloque a una posición exacta.
   * targetPosition es base 1 para que sea natural en el selector.
   */
  const moveBlockToPosition = (
    currentIndex: number,
    targetPosition: number,
  ) => {
    setConfig((prev) => {
      const next = [...prev.contentBlocks];
      if (!next.length) return prev;

      const targetIndex = Math.max(
        0,
        Math.min(targetPosition - 1, next.length - 1),
      );

      if (targetIndex === currentIndex) return prev;

      const [block] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, block);

      return {
        ...prev,
        contentBlocks: next,
      };
    });
  };

  /**
   * Drag & drop manual usando HTML5.
   */
  const handleBlockDragStart = (index: number) => {
    setDraggedBlockIndex(index);
  };

  const handleBlockDrop = (targetIndex: number) => {
    if (draggedBlockIndex === null) return;

    setConfig((prev) => {
      const next = [...prev.contentBlocks];

      if (
        draggedBlockIndex < 0 ||
        draggedBlockIndex >= next.length ||
        targetIndex < 0 ||
        targetIndex >= next.length ||
        draggedBlockIndex === targetIndex
      ) {
        return prev;
      }

      const [block] = next.splice(draggedBlockIndex, 1);
      next.splice(targetIndex, 0, block);

      return {
        ...prev,
        contentBlocks: next,
      };
    });

    setDraggedBlockIndex(null);
  };

  const cancelBlockDrag = () => {
    setDraggedBlockIndex(null);
  };

  const uploadBlockMedia = async (
    block: LandingContentBlock,
    files: FileList | null,
  ) => {
    const file = files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const item = await uploadFile(file, `blocks/${block.id}`);
      if (!item) return;

      if (block.type === "image") {
        if (item.type !== "image") {
          toast.error("Este bloque requiere una imagen.");
          return;
        }
        patchBlock(block.id, { url: item.url, alt: item.alt || "" });
      } else if (block.type === "video") {
        if (item.type !== "video") {
          toast.error("Este bloque requiere un video.");
          return;
        }
        patchBlock(block.id, { url: item.url });
      } else if (block.type === "image_text") {
        if (item.type !== "image") {
          toast.error("Este bloque requiere una imagen.");
          return;
        }
        patchBlock(block.id, { imageUrl: item.url });
      }
    } finally {
      setUploading(false);
    }
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

  const save = async (publish: boolean, options?: { silent?: boolean }) => {
    if (!validate()) return null;
    if (!userEmail) {
      toast.error("No se pudo identificar al usuario");
      return null;
    }

    setSaving(true);
    const finalSlug = slugify(slug || name);
    const freshSnapshots = config.selectedProductIds
      .map((id) => {
        const edited = config.productSnapshots.find((x) => x.id === id);
        const original = products.find((x) => x.id === id);
        return edited || (original ? snapshotFromProduct(original) : null);
      })
      .filter(Boolean);

    const payload = {
      owner_email: userEmail,
      name: name.trim(),
      slug: finalSlug,
      status: publish ? "published" : "draft",
      config: {
        ...config,
        version: 2,
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
      return null;
    }

    const saved = result.data as LandingRow;
    setEditingId(saved.id);
    setSlug(saved.slug);
    setConfig(normalizeConfig(saved.config));
    if (!options?.silent) {
      toast.success(
        publish ? "🚀 Página publicada correctamente" : "💾 Borrador guardado",
      );
    }
    await loadPages();
    return saved;
  };

  const openRealPreview = async () => {
    if (uploading) {
      toast.error("Esperá a que terminen de subir los archivos.");
      return;
    }

    // La vista previa real usa un borrador guardado para que pueda abrirse
    // en una pestaña nueva sin publicar la página.
    const popup = window.open("", "_blank");
    const saved = await save(false, { silent: true });

    if (!saved) {
      popup?.close();
      return;
    }

    const url = `${window.location.origin}/#/preview/${saved.id}`;
    if (popup) {
      popup.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    toast.success("👁 Vista previa abierta. Los pedidos de prueba no se guardarán.");
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
    const url = `${window.location.origin}/#/p/${pageSlug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  const currentPreviewProduct =
    config.productSnapshots[0] ||
    (primaryProduct ? snapshotFromProduct(primaryProduct) : null);

  if (editorOpen) {
    return (
      <div className="space-y-5">
        <style>{`
          .sky-dropzone{border:1.5px dashed hsl(var(--border));border-radius:14px;padding:13px;text-align:center;cursor:pointer;background:hsl(var(--secondary)/.15);transition:.2s}
          .sky-dropzone:hover{background:hsl(var(--secondary)/.35);border-color:hsl(var(--primary)/.55)}
          .sky-media-row{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 6px}
          .sky-media-card{width:92px;flex:0 0 92px;border:1px solid hsl(var(--border));border-radius:12px;overflow:hidden;background:hsl(var(--secondary)/.2)}
          .sky-media-preview{width:100%;height:76px;object-fit:cover;background:#111}
          .sky-media-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:3px}
          .sky-media-actions button{border:0;border-radius:6px;padding:4px 2px;font-size:10px;background:hsl(var(--secondary));cursor:pointer}
          .sky-block-card{border:1px solid hsl(var(--border));border-radius:16px;overflow:hidden;background:hsl(var(--background))}
          .sky-block-head{display:flex;align-items:center;gap:6px;padding:9px 10px;background:hsl(var(--secondary)/.25);border-bottom:1px solid hsl(var(--border))}
          .sky-block-head b{flex:1;font-size:12px}
          .sky-mini-btn{border:1px solid hsl(var(--border));border-radius:8px;padding:5px 7px;font-size:11px;background:hsl(var(--background));cursor:pointer}
          .sky-mini-btn:disabled{opacity:.3;cursor:not-allowed}
          .sky-block-card[draggable="true"]{cursor:default}
          .sky-block-card[draggable="true"]:hover{border-color:hsl(var(--primary)/.45)}
        `}</style>

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
              className="nav-btn !bg-violet-500/15 !text-violet-500"
              disabled={saving || uploading}
              onClick={openRealPreview}
            >
              👁 Vista previa real
            </button>
            <button
              className="nav-btn"
              disabled={saving || uploading}
              onClick={() => save(false)}
            >
              {saving ? "Guardando..." : "💾 Guardar borrador"}
            </button>
            <button
              className="nav-btn active"
              disabled={saving || uploading}
              onClick={() => save(true)}
            >
              🚀 Publicar página
            </button>
          </div>
        </div>

        {uploading && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold">
            ⏳ Subiendo archivo... esperá a que termine antes de publicar.
          </div>
        )}

        <div className="grid grid-cols-1 2xl:grid-cols-[420px_minmax(0,1fr)] gap-5 items-start">
          <aside className="space-y-4 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-30px)] 2xl:overflow-y-auto 2xl:pr-2">
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

            {config.productSnapshots.map((product) => (
              <div
                key={product.id}
                className="rounded-[24px] border border-border/70 bg-background p-4 space-y-3"
              >
                <div className="font-black text-sm">🖼 Galería — {product.title}</div>
                <div className="text-xs text-muted-foreground">
                  Podés agregar todas las imágenes o videos que quieras. Arrastrar no es necesario: usá ← → para ordenar.
                </div>

                <label className="sky-dropzone block">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      uploadProductMedia(product.id, e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <div className="font-black text-sm">＋ Subir imágenes o videos</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    JPG, PNG, WEBP, GIF o video MP4/WebM
                  </div>
                </label>

                <div className="sky-media-row">
                  {(product.media || []).map((media, index) => (
                    <div className="sky-media-card" key={media.id}>
                      {media.type === "image" ? (
                        <img className="sky-media-preview" src={media.url} alt="" />
                      ) : (
                        <video className="sky-media-preview" src={media.url} muted />
                      )}
                      <div className="text-[9px] text-center py-1 font-bold">
                        {media.type === "image" ? "IMAGEN" : "VIDEO"} {index + 1}
                      </div>
                      <div className="sky-media-actions">
                        <button onClick={() => moveProductMedia(product.id, index, -1)}>←</button>
                        <button onClick={() => moveProductMedia(product.id, index, 1)}>→</button>
                        <button onClick={() => removeProductMedia(product.id, media.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>

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
              <div className="font-black">3. Agregar y ordenar bloques</div>

              <div className="text-xs text-muted-foreground">
                Armá la landing manualmente. Podés insertar contenido exactamente
                entre dos bloques, moverlo a una posición específica o arrastrarlo
                desde el símbolo ☰.
              </div>

              {insertAtIndex !== null && (
                <div className="rounded-xl border border-primary/40 bg-primary/10 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <div className="font-black text-sm">
                        📍 Insertar en posición {insertAtIndex + 1}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Elegí qué tipo de bloque querés poner exactamente aquí.
                      </div>
                    </div>
                    <button
                      className="sky-mini-btn"
                      onClick={() => setInsertAtIndex(null)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  className="nav-btn"
                  onClick={() => addBlock("heading")}
                >
                  ＋ Título
                </button>
                <button
                  className="nav-btn"
                  onClick={() => addBlock("text")}
                >
                  ＋ Texto
                </button>
                <button
                  className="nav-btn"
                  onClick={() => addBlock("image")}
                >
                  ＋ Imagen
                </button>
                <button
                  className="nav-btn"
                  onClick={() => addBlock("video")}
                >
                  ＋ Video
                </button>
                <button
                  className="nav-btn"
                  onClick={() => addBlock("image_text")}
                >
                  ＋ Imagen + texto
                </button>
                <button
                  className="nav-btn"
                  onClick={() => addBlock("spacer")}
                >
                  ＋ Espacio
                </button>
              </div>

              <div className="rounded-xl border border-border bg-secondary/10 p-3 text-[11px] text-muted-foreground">
                <b className="text-foreground">Cómo ubicar manualmente:</b>{" "}
                tocá <b>“＋ Agregar aquí”</b> en el lugar exacto y después elegí
                Título, Texto, Imagen, Video, etc. También podés usar el selector
                “Posición” o arrastrar con ☰.
              </div>

              {config.contentBlocks.length === 0 ? (
                <>
                  <button
                    className="w-full rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition px-3 py-4 text-sm font-black text-primary"
                    onClick={() => setInsertAtIndex(0)}
                  >
                    ＋ Agregar el primer bloque aquí
                  </button>

                  <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                    Todavía no agregaste bloques.
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  {/* Punto de inserción ANTES del primer bloque */}
                  <button
                    className={`w-full rounded-lg border border-dashed px-3 py-2 text-xs font-bold transition ${
                      insertAtIndex === 0
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground"
                    }`}
                    onClick={() => setInsertAtIndex(0)}
                  >
                    ＋ Agregar aquí · Posición 1
                  </button>

                  {config.contentBlocks.map((block, index) => (
                    <div key={block.id} className="space-y-2">
                      <div
                        className={`sky-block-card transition ${
                          draggedBlockIndex === index
                            ? "opacity-50 ring-2 ring-primary"
                            : ""
                        }`}
                        draggable
                        onDragStart={() => handleBlockDragStart(index)}
                        onDragEnd={cancelBlockDrag}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleBlockDrop(index);
                        }}
                      >
                        <div className="sky-block-head">
                          <span
                            title="Arrastrá para mover"
                            className="cursor-grab active:cursor-grabbing select-none text-base"
                          >
                            ☰
                          </span>

                          <b>
                            {index + 1}.{" "}
                            {block.type === "heading" && "TÍTULO"}
                            {block.type === "text" && "TEXTO"}
                            {block.type === "image" && "IMAGEN"}
                            {block.type === "video" && "VIDEO"}
                            {block.type === "image_text" && "IMAGEN + TEXTO"}
                            {block.type === "spacer" && "ESPACIO"}
                          </b>

                          <button
                            className="sky-mini-btn"
                            disabled={index === 0}
                            title="Subir una posición"
                            onClick={() => moveBlock(index, -1)}
                          >
                            ↑
                          </button>

                          <button
                            className="sky-mini-btn"
                            disabled={index === config.contentBlocks.length - 1}
                            title="Bajar una posición"
                            onClick={() => moveBlock(index, 1)}
                          >
                            ↓
                          </button>

                          <button
                            className="sky-mini-btn"
                            title={block.enabled ? "Ocultar" : "Mostrar"}
                            onClick={() =>
                              patchBlock(block.id, {
                                enabled: !block.enabled,
                              })
                            }
                          >
                            {block.enabled ? "👁" : "🚫"}
                          </button>

                          <button
                            className="sky-mini-btn"
                            title="Eliminar"
                            onClick={() => deleteBlock(block.id)}
                          >
                            ✕
                          </button>
                        </div>

                        <div className="p-3 space-y-3">
                          {/* Posición exacta */}
                          <div className="rounded-xl border border-border bg-secondary/10 p-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold whitespace-nowrap">
                                Mover a posición:
                              </span>
                              <select
                                className="app-input !py-1.5"
                                value={index + 1}
                                onChange={(e) =>
                                  moveBlockToPosition(
                                    index,
                                    Number(e.target.value),
                                  )
                                }
                              >
                                {config.contentBlocks.map((_, positionIndex) => (
                                  <option
                                    key={positionIndex}
                                    value={positionIndex + 1}
                                  >
                                    {positionIndex + 1}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {block.type === "heading" && (
                            <>
                              <textarea
                                className="app-input min-h-[70px]"
                                value={block.text}
                                onChange={(e) =>
                                  patchBlock(block.id, {
                                    text: e.target.value,
                                  })
                                }
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  className="app-input"
                                  value={block.size}
                                  onChange={(e) =>
                                    patchBlock(block.id, {
                                      size: e.target.value,
                                    })
                                  }
                                >
                                  <option value="md">Mediano</option>
                                  <option value="lg">Grande</option>
                                  <option value="xl">Muy grande</option>
                                </select>

                                <select
                                  className="app-input"
                                  value={block.align}
                                  onChange={(e) =>
                                    patchBlock(block.id, {
                                      align: e.target.value,
                                    })
                                  }
                                >
                                  <option value="left">Izquierda</option>
                                  <option value="center">Centrado</option>
                                </select>
                              </div>
                            </>
                          )}

                          {block.type === "text" && (
                            <>
                              <textarea
                                className="app-input min-h-[100px]"
                                value={block.text}
                                onChange={(e) =>
                                  patchBlock(block.id, {
                                    text: e.target.value,
                                  })
                                }
                              />
                              <select
                                className="app-input"
                                value={block.align}
                                onChange={(e) =>
                                  patchBlock(block.id, {
                                    align: e.target.value,
                                  })
                                }
                              >
                                <option value="left">Izquierda</option>
                                <option value="center">Centrado</option>
                              </select>
                            </>
                          )}

                          {block.type === "image" && (
                            <>
                              {block.url && (
                                <img
                                  src={block.url}
                                  alt=""
                                  className="w-full max-h-44 object-contain rounded-xl bg-black/5"
                                />
                              )}

                              <label className="sky-dropzone block">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    uploadBlockMedia(
                                      block,
                                      e.target.files,
                                    );
                                    e.currentTarget.value = "";
                                  }}
                                />
                                <b>
                                  {block.url
                                    ? "Cambiar imagen"
                                    : "Subir imagen"}
                                </b>
                              </label>

                              <input
                                className="app-input"
                                value={block.alt}
                                onChange={(e) =>
                                  patchBlock(block.id, {
                                    alt: e.target.value,
                                  })
                                }
                                placeholder="Texto alternativo"
                              />

                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  className="app-input"
                                  value={block.width}
                                  onChange={(e) =>
                                    patchBlock(block.id, {
                                      width: e.target.value,
                                    })
                                  }
                                >
                                  <option value="normal">Normal</option>
                                  <option value="wide">Ancha</option>
                                  <option value="full">
                                    Ancho completo
                                  </option>
                                </select>

                                <label className="flex items-center gap-2 rounded-xl border border-border px-3">
                                  <input
                                    type="checkbox"
                                    checked={block.rounded}
                                    onChange={(e) =>
                                      patchBlock(block.id, {
                                        rounded: e.target.checked,
                                      })
                                    }
                                  />
                                  Redondeada
                                </label>
                              </div>
                            </>
                          )}

                          {block.type === "video" && (
                            <>
                              {block.url && (
                                <video
                                  src={block.url}
                                  controls
                                  className="w-full max-h-52 rounded-xl bg-black"
                                />
                              )}

                              <label className="sky-dropzone block">
                                <input
                                  type="file"
                                  accept="video/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    uploadBlockMedia(
                                      block,
                                      e.target.files,
                                    );
                                    e.currentTarget.value = "";
                                  }}
                                />
                                <b>
                                  {block.url
                                    ? "Cambiar video"
                                    : "Subir video"}
                                </b>
                              </label>

                              <div className="grid grid-cols-2 gap-2 text-xs">
                                {[
                                  ["autoplay", "Autoplay"],
                                  ["muted", "Sin sonido"],
                                  ["loop", "Repetir"],
                                  ["controls", "Controles"],
                                  ["rounded", "Redondeado"],
                                ].map(([key, label]) => (
                                  <label
                                    key={key}
                                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(
                                        (block as any)[key],
                                      )}
                                      onChange={(e) =>
                                        patchBlock(block.id, {
                                          [key]: e.target.checked,
                                        })
                                      }
                                    />
                                    {label}
                                  </label>
                                ))}
                              </div>

                              <select
                                className="app-input"
                                value={block.width}
                                onChange={(e) =>
                                  patchBlock(block.id, {
                                    width: e.target.value,
                                  })
                                }
                              >
                                <option value="normal">Normal</option>
                                <option value="wide">Ancho</option>
                                <option value="full">
                                  Ancho completo
                                </option>
                              </select>
                            </>
                          )}

                          {block.type === "image_text" && (
                            <>
                              {block.imageUrl && (
                                <img
                                  src={block.imageUrl}
                                  alt=""
                                  className="w-full max-h-44 object-contain rounded-xl bg-black/5"
                                />
                              )}

                              <label className="sky-dropzone block">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    uploadBlockMedia(
                                      block,
                                      e.target.files,
                                    );
                                    e.currentTarget.value = "";
                                  }}
                                />
                                <b>
                                  {block.imageUrl
                                    ? "Cambiar imagen"
                                    : "Subir imagen"}
                                </b>
                              </label>

                              <input
                                className="app-input"
                                value={block.title}
                                onChange={(e) =>
                                  patchBlock(block.id, {
                                    title: e.target.value,
                                  })
                                }
                                placeholder="Título"
                              />

                              <textarea
                                className="app-input min-h-[90px]"
                                value={block.text}
                                onChange={(e) =>
                                  patchBlock(block.id, {
                                    text: e.target.value,
                                  })
                                }
                              />

                              <select
                                className="app-input"
                                value={block.imagePosition}
                                onChange={(e) =>
                                  patchBlock(block.id, {
                                    imagePosition: e.target.value,
                                  })
                                }
                              >
                                <option value="left">
                                  Imagen izquierda
                                </option>
                                <option value="right">
                                  Imagen derecha
                                </option>
                              </select>
                            </>
                          )}

                          {block.type === "spacer" && (
                            <div>
                              <label className="app-label">
                                Altura: {block.height}px
                              </label>
                              <input
                                type="range"
                                min="10"
                                max="180"
                                step="5"
                                className="w-full"
                                value={block.height}
                                onChange={(e) =>
                                  patchBlock(block.id, {
                                    height: Number(
                                      e.target.value,
                                    ),
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Punto de inserción DESPUÉS de cada bloque */}
                      <button
                        className={`w-full rounded-lg border border-dashed px-3 py-2 text-xs font-bold transition ${
                          insertAtIndex === index + 1
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground"
                        }`}
                        onClick={() =>
                          setInsertAtIndex(index + 1)
                        }
                      >
                        ＋ Agregar aquí · Posición {index + 2}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background p-4 space-y-3">
              <div className="font-black">4. Tema Shrine / Skyline</div>
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

            <div className="rounded-[24px] border border-border/70 bg-background p-4 space-y-3">
              <div className="font-black">5. Secciones automáticas</div>
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
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl bg-background border border-border px-3 py-2">
              <div className="text-xs">
                <b>Vista rápida del editor.</b>{" "}
                <span className="text-muted-foreground">
                  Para probar botones, videos y checkout como un cliente, abrí la Vista previa real.
                </span>
              </div>
              <button
                className="nav-btn !text-xs !py-1.5"
                disabled={saving || uploading}
                onClick={openRealPreview}
              >
                👁 Abrir página completa
              </button>
            </div>
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
            Seleccioná productos, subí imágenes/videos, agregá bloques y publicá tu landing.
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
            const cover =
              first?.media?.find((m) => m.type === "image")?.url ||
              first?.images?.[0];
            return (
              <div
                key={page.id}
                className="rounded-[24px] border border-border bg-background overflow-hidden"
              >
                <div className="h-44 bg-secondary relative overflow-hidden">
                  {cover ? (
                    <img
                      src={cover}
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
                      {window.location.origin}/#/p/{page.slug}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {page.config?.productSnapshots?.length || 0} producto(s) ·{" "}
                    {page.config?.contentBlocks?.length || 0} bloque(s)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="nav-btn" onClick={() => editPage(page)}>
                      ✏️ Editar
                    </button>
                    <button
                      className="nav-btn"
                      onClick={() =>
                        window.open(`/#/p/${page.slug}`, "_blank", "noopener")
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
  const media = product?.media?.length
    ? product.media
    : (product?.images || []).map((url) => ({
        id: url,
        type: "image" as const,
        url,
      }));

  const firstImage = media.find((m) => m.type === "image")?.url;
  const firstMedia = media[0];

  const blockWidth = (width: "normal" | "wide" | "full") => {
    if (width === "full") return "100%";
    if (width === "wide") return mobile ? "100%" : "940px";
    return mobile ? "100%" : "700px";
  };

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
                {firstMedia?.type === "video" ? (
                  <video
                    src={firstMedia.url}
                    controls
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : firstImage ? (
                  <img
                    src={firstImage}
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
              {media.length > 1 && (
                <div style={{ display: "flex", gap: 9, marginTop: 9, overflowX: "auto" }}>
                  {media.slice(0, 7).map((item, i) => (
                    <div
                      key={item.id || i}
                      style={{
                        width: 76,
                        height: 76,
                        borderRadius: 9,
                        overflow: "hidden",
                        border: "1px solid #ddd",
                        flex: "0 0 76px",
                        position: "relative",
                        background: "#111",
                      }}
                    >
                      {item.type === "image" ? (
                        <img
                          src={item.url}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <>
                          <video src={item.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontSize: 25 }}>▶</span>
                        </>
                      )}
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
                <strong style={{ color: config.primaryColor, fontSize: 23 }}>
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
                <span>−</span><span>1</span><span>＋</span>
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
                <div style={{ fontSize: 11, marginTop: 3 }}>{config.buttonSubtext}</div>
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

          {config.contentBlocks.filter((b) => b.enabled).map((block) => {
            if (block.type === "heading") {
              const sizes = { md: mobile ? 24 : 30, lg: mobile ? 29 : 38, xl: mobile ? 34 : 48 };
              return (
                <div key={block.id} style={{ maxWidth: 940, margin: "22px auto", padding: "0 18px" }}>
                  <h2 style={{ margin: 0, fontSize: sizes[block.size], lineHeight: 1.13, fontWeight: 900, textAlign: block.align, whiteSpace: "pre-line" }}>
                    {block.text}
                  </h2>
                </div>
              );
            }
            if (block.type === "text") {
              return (
                <div key={block.id} style={{ maxWidth: 820, margin: "14px auto", padding: "0 18px", textAlign: block.align }}>
                  <p style={{ fontSize: 17, lineHeight: 1.65, whiteSpace: "pre-line" }}>{block.text}</p>
                </div>
              );
            }
            if (block.type === "image") {
              if (!block.url) return null;
              return (
                <div key={block.id} style={{ width: blockWidth(block.width), maxWidth: "100%", margin: "12px auto", padding: block.width === "full" ? 0 : "0 14px" }}>
                  <img src={block.url} alt={block.alt} style={{ display: "block", width: "100%", height: "auto", borderRadius: block.rounded ? 12 : 0 }} />
                </div>
              );
            }
            if (block.type === "video") {
              if (!block.url) return null;
              return (
                <div key={block.id} style={{ width: blockWidth(block.width), maxWidth: "100%", margin: "12px auto", padding: block.width === "full" ? 0 : "0 14px" }}>
                  <video
                    src={block.url}
                    poster={block.poster}
                    autoPlay={block.autoplay}
                    muted={block.muted}
                    loop={block.loop}
                    controls={block.controls}
                    playsInline
                    style={{ display: "block", width: "100%", height: "auto", borderRadius: block.rounded ? 12 : 0, background: "#000" }}
                  />
                </div>
              );
            }
            if (block.type === "image_text") {
              return (
                <div
                  key={block.id}
                  style={{
                    maxWidth: 960,
                    margin: "26px auto",
                    padding: "0 18px",
                    display: "grid",
                    gridTemplateColumns: mobile ? "1fr" : "1fr 1fr",
                    gap: 24,
                    alignItems: "center",
                  }}
                >
                  {block.imagePosition === "left" && block.imageUrl && <img src={block.imageUrl} alt="" style={{ width: "100%", borderRadius: 14 }} />}
                  <div>
                    <h2 style={{ fontSize: mobile ? 28 : 38, lineHeight: 1.15, margin: "0 0 12px", fontWeight: 900 }}>{block.title}</h2>
                    <p style={{ fontSize: 17, lineHeight: 1.65, whiteSpace: "pre-line" }}>{block.text}</p>
                  </div>
                  {block.imagePosition === "right" && block.imageUrl && <img src={block.imageUrl} alt="" style={{ width: "100%", borderRadius: 14 }} />}
                </div>
              );
            }
            return <div key={block.id} style={{ height: block.height }} />;
          })}

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
            <div style={{ background: "#f7f7f7", padding: mobile ? "30px 18px" : "48px 20px" }}>
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
