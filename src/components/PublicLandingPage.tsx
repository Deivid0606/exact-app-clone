import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  LandingConfig,
  LandingContentBlock,
  LandingMediaItem,
} from "@/components/WebPageBuilder";

const nf = (n: number) =>
  new Intl.NumberFormat("es-PY").format(Math.round(Number(n || 0)));

type PublicLandingRow = {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "published";
  config: LandingConfig;
};

const legacyMedia = (product: any): LandingMediaItem[] =>
  Array.isArray(product?.media) && product.media.length
    ? product.media
    : (product?.images || []).map((url: string, i: number) => ({
        id: `legacy-${i}-${url}`,
        type: "image" as const,
        url,
        alt: product?.title || "",
      }));

export default function PublicLandingPage({
  slug,
  pageId,
  preview = false,
}: {
  slug?: string;
  pageId?: string;
  preview?: boolean;
}) {
  const [page, setPage] = useState<PublicLandingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProductId, setActiveProductId] = useState("");
  const [mediaIndex, setMediaIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    department: "",
    city: "",
    address: "",
    reference: "",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      let query = supabase
        .from("landing_pages")
        .select("id,name,slug,status,config");

      if (preview && pageId) {
        // Vista previa: el usuario autenticado puede leer su propio borrador
        // gracias a la política owner_select.
        query = query.eq("id", pageId);
      } else if (slug) {
        // Página pública normal: solo publicadas.
        query = query.eq("slug", slug).eq("status", "published");
      } else {
        setLoading(false);
        setPage(null);
        return;
      }

      const { data, error } = await query.maybeSingle();

      if (!mounted) return;
      setLoading(false);
      if (error) {
        console.error(error);
        setPage(null);
        return;
      }

      const row = data as PublicLandingRow | null;
      setPage(row);
      const firstId = row?.config?.productSnapshots?.[0]?.id || "";
      setActiveProductId(firstId);
    })();

    return () => {
      mounted = false;
    };
  }, [slug, pageId, preview]);

  const config = page?.config;
  const products = config?.productSnapshots || [];
  const product =
    products.find((p) => p.id === activeProductId) || products[0] || null;
  const media = legacyMedia(product);
  const activeMedia = media[mediaIndex] || media[0];
  const firstImage = media.find((m) => m.type === "image")?.url || "";

  useEffect(() => {
    setMediaIndex(0);
    setQuantity(1);
  }, [activeProductId]);

  useEffect(() => {
    if (!checkoutOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCheckoutOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [checkoutOpen]);

  const total = useMemo(
    () => Number(product?.price || 0) * quantity,
    [product?.price, quantity],
  );

  const submitOrder = async () => {
    if (!page || !product) return;
    if (!form.full_name.trim() || !form.phone.trim() || !form.city.trim()) {
      alert("Completá nombre, teléfono y ciudad.");
      return;
    }

    if (preview) {
      alert(
        "✅ PRUEBA CORRECTA\n\nEl checkout funciona. Como estás en VISTA PREVIA, este pedido NO fue guardado.",
      );
      return;
    }

    setSending(true);
    const { error } = await supabase.from("landing_page_orders").insert({
      landing_page_id: page.id,
      product_id: product.id,
      product_title: product.title,
      quantity,
      unit_price_gs: product.price,
      total_gs: total,
      customer_name: form.full_name.trim(),
      phone: form.phone.trim(),
      department: form.department.trim(),
      city: form.city.trim(),
      address: form.address.trim(),
      reference: form.reference.trim(),
      source: "landing_page",
      status: "nuevo",
      raw_payload: {
        slug: page.slug,
        sku: product.sku,
      },
    });
    setSending(false);

    if (error) {
      console.error(error);
      alert("No se pudo registrar el pedido. Revisá la configuración de Supabase.");
      return;
    }

    setCheckoutOpen(false);
    alert("✅ Pedido recibido correctamente. Nos comunicaremos contigo.");
    setForm({
      full_name: "",
      phone: "",
      department: "",
      city: "",
      address: "",
      reference: "",
    });
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        Cargando...
      </div>
    );
  }

  if (!page || !config || !product) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "Arial, sans-serif",
          textAlign: "center",
          padding: 30,
        }}
      >
        <div>
          <div style={{ fontSize: 55 }}>🌐</div>
          <h1>Página no disponible</h1>
          <p>El enlace no existe o la página todavía no fue publicada.</p>
        </div>
      </div>
    );
  }

  const discount =
    product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0;

  const blocks = (config.contentBlocks || []).filter((b) => b.enabled);

  const blockMaxWidth = (width: "normal" | "wide" | "full") => {
    if (width === "full") return "100%";
    if (width === "wide") return "1040px";
    return "760px";
  };

  const renderBlock = (block: LandingContentBlock) => {
    if (block.type === "heading") {
      const sizes = { md: "32px", lg: "42px", xl: "52px" };
      return (
        <section
          key={block.id}
          className="sky-free-block"
          style={{ maxWidth: 980, textAlign: block.align }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: sizes[block.size],
              lineHeight: 1.1,
              fontWeight: 900,
              whiteSpace: "pre-line",
            }}
          >
            {block.text}
          </h2>
        </section>
      );
    }

    if (block.type === "text") {
      return (
        <section
          key={block.id}
          className="sky-free-block"
          style={{ maxWidth: 820, textAlign: block.align }}
        >
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.7, whiteSpace: "pre-line" }}>
            {block.text}
          </p>
        </section>
      );
    }

    if (block.type === "image") {
      if (!block.url) return null;
      return (
        <section
          key={block.id}
          className={`sky-media-block ${block.width === "full" ? "full" : ""}`}
          style={{ maxWidth: blockMaxWidth(block.width) }}
        >
          <img
            src={block.url}
            alt={block.alt}
            style={{
              width: "100%",
              display: "block",
              height: "auto",
              borderRadius: block.rounded ? 12 : 0,
            }}
          />
        </section>
      );
    }

    if (block.type === "video") {
      if (!block.url) return null;
      return (
        <section
          key={block.id}
          className={`sky-media-block ${block.width === "full" ? "full" : ""}`}
          style={{ maxWidth: blockMaxWidth(block.width) }}
        >
          <video
            src={block.url}
            poster={block.poster}
            autoPlay={block.autoplay}
            muted={block.muted}
            loop={block.loop}
            controls={block.controls}
            playsInline
            style={{
              width: "100%",
              display: "block",
              height: "auto",
              borderRadius: block.rounded ? 12 : 0,
              background: "#000",
            }}
          />
        </section>
      );
    }

    if (block.type === "media_gallery") {
      if (!block.items.length) return null;

      const galleryWidth = blockMaxWidth(block.width);

      return (
        <section
          key={block.id}
          className="sky-custom-gallery"
          style={
            {
              maxWidth: galleryWidth,
              width: block.width === "full" ? "100%" : "calc(100% - 28px)",
              padding: block.width === "full" ? 0 : undefined,
              "--gallery-cols": block.columns,
              "--gallery-mobile-cols": block.mobileColumns,
              "--gallery-gap": `${block.gap}px`,
            } as React.CSSProperties
          }
        >
          {block.items.map((item) => (
            <div
              key={item.id}
              className={`sky-custom-gallery-item ${
                block.aspect === "portrait"
                  ? "portrait"
                  : block.aspect === "square"
                    ? "square"
                    : ""
              }`}
              style={{
                borderRadius: block.rounded ? 12 : 0,
              }}
            >
              {item.type === "image" ? (
                <img
                  src={item.url}
                  alt={item.alt || ""}
                  loading="lazy"
                />
              ) : (
                <video
                  src={item.url}
                  controls={block.controls}
                  autoPlay={block.autoplay}
                  muted={block.muted}
                  loop={block.loop}
                  playsInline
                  preload="metadata"
                />
              )}
            </div>
          ))}
        </section>
      );
    }

    if (block.type === "buy_button") {
      const maxWidth =
        block.width === "full"
          ? "100%"
          : block.width === "wide"
            ? "820px"
            : "560px";

      const margin =
        block.align === "center"
          ? "24px auto"
          : block.align === "right"
            ? "24px 14px 24px auto"
            : "24px auto 24px 14px";

      return (
        <section
          key={block.id}
          className="sky-block-buy-wrap"
          style={{
            maxWidth,
            margin,
            padding: block.width === "full" ? 0 : undefined,
          }}
        >
          <button
            type="button"
            className="sky-block-buy"
            onClick={() => setCheckoutOpen(true)}
          >
            <div className="sky-buy-main">
              {block.text || config.buttonText}
            </div>
            {(block.subtext || config.buttonSubtext) && (
              <div className="sky-buy-sub">
                {block.subtext || config.buttonSubtext}
              </div>
            )}
          </button>
        </section>
      );
    }

    if (block.type === "image_text") {
      return (
        <section key={block.id} className="sky-image-text">
          {block.imagePosition === "left" && block.imageUrl && (
            <img src={block.imageUrl} alt="" />
          )}
          <div>
            <h2>{block.title}</h2>
            <p>{block.text}</p>
          </div>
          {block.imagePosition === "right" && block.imageUrl && (
            <img src={block.imageUrl} alt="" />
          )}
        </section>
      );
    }

    if (block.type === "spacer") {
      return <div key={block.id} style={{ height: block.height }} />;
    }

    return null;
  };

  return (
    <div
      style={
        {
          "--primary": config.primaryColor,
          "--buy": config.buttonColor,
          "--text": config.accentColor,
        } as React.CSSProperties
      }
      className="sky-landing"
    >
      <style>{`
        *{box-sizing:border-box}
        html,body,#root{margin:0;min-height:100%;font-family:Arial,Helvetica,sans-serif;color:var(--text,#111);background:#fff}
        button,input,select,textarea{font:inherit}
        .sky-announcement{background:var(--primary);color:#fff;text-align:center;padding:17px 12px;font-size:19px;font-weight:800;letter-spacing:.35px}
        .sky-product{max-width:1170px;margin:36px auto 0;padding:0 18px;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(380px,.82fr);gap:48px;align-items:start}
        .sky-main-image{width:100%;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:#f2f2f2;position:relative}
        .sky-main-image img,.sky-main-image video{width:100%;height:100%;object-fit:cover;display:block}
        .sky-thumbs{display:flex;gap:9px;margin-top:9px;overflow:auto;padding:2px}
        .sky-thumb{width:82px;height:82px;border-radius:9px;overflow:hidden;border:1px solid #ddd;padding:0;background:#111;cursor:pointer;flex:0 0 auto;position:relative}
        .sky-thumb.active{outline:2px solid #111;outline-offset:1px}
        .sky-thumb img,.sky-thumb video{width:100%;height:100%;object-fit:cover}
        .sky-play{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:25px;text-shadow:0 2px 8px #000}
        .sky-title{font-size:40px;line-height:1.05;margin:4px 0 8px;font-weight:900;letter-spacing:-.8px}
        .sky-rating{display:flex;align-items:center;gap:10px;font-size:18px}
        .sky-stars{color:#ffbc00;font-size:23px;letter-spacing:-2px}
        .sky-price-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:16px 0 19px}
        .sky-price{font-size:22px;font-weight:900;color:var(--primary)}
        .sky-compare{font-weight:800;text-decoration:line-through;color:#333}
        .sky-save{background:var(--primary);color:#fff;font-weight:900;font-size:12px;border-radius:4px;padding:4px 7px}
        .sky-qty-label{font-size:14px;font-weight:800;margin-bottom:5px}
        .sky-qty{display:grid;grid-template-columns:47px 47px 47px;height:47px;border:1px solid #ddd;border-radius:10px;overflow:hidden;background:#faf8fb;width:max-content}
        .sky-qty button,.sky-qty span{border:0;background:transparent;display:grid;place-items:center;cursor:pointer}
        .sky-buy{margin-top:16px;width:100%;min-height:68px;border-radius:40px;border:5px solid #000;background:var(--buy);color:#fff;box-shadow:0 3px 8px rgba(0,0,0,.28);font-weight:900;cursor:pointer;padding:8px 20px}
        .sky-buy-main{font-size:14px;letter-spacing:.45px}
        .sky-buy-sub{font-size:11px;margin-top:4px}
        .sky-timeline{margin:26px 5px 25px;display:grid;grid-template-columns:1fr 1fr 1fr;position:relative;text-align:center}
        .sky-timeline:before{content:"";position:absolute;left:15%;right:15%;top:24px;height:4px;background:#171717}
        .sky-step{position:relative;z-index:1}
        .sky-circle{width:49px;height:49px;border-radius:50%;background:#151515;color:#fff;display:grid;place-items:center;margin:auto;font-size:22px}
        .sky-step b{display:block;margin-top:8px;font-size:15px}
        .sky-step span{display:block;margin-top:2px;color:#444;font-size:14px}
        .sky-headline{font-size:39px;line-height:1.18;font-weight:900;letter-spacing:-1px;margin:28px 0 14px;white-space:pre-line}
        .sky-hero-text{font-size:17px;line-height:1.65;color:#333}
        .sky-free-block{margin:26px auto;padding:0 18px}
        .sky-media-block{margin:16px auto;padding:0 14px}
        .sky-media-block.full{padding:0}
        .sky-image-text{max-width:1040px;margin:36px auto;padding:0 18px;display:grid;grid-template-columns:1fr 1fr;gap:30px;align-items:center}
        .sky-image-text img{width:100%;height:auto;border-radius:14px}
        .sky-image-text h2{font-size:40px;line-height:1.12;margin:0 0 14px;font-weight:900}
        .sky-image-text p{font-size:18px;line-height:1.7;white-space:pre-line}
        .sky-custom-gallery{display:grid;grid-template-columns:repeat(var(--gallery-cols,3),minmax(0,1fr));gap:var(--gallery-gap,14px);margin:22px auto}
        .sky-custom-gallery-item{overflow:hidden;background:#000}
        .sky-custom-gallery-item img,.sky-custom-gallery-item video{width:100%;display:block;background:#000}
        .sky-custom-gallery-item.portrait{aspect-ratio:9/16}
        .sky-custom-gallery-item.square{aspect-ratio:1/1}
        .sky-custom-gallery-item.portrait img,.sky-custom-gallery-item.portrait video,.sky-custom-gallery-item.square img,.sky-custom-gallery-item.square video{height:100%;object-fit:cover}
        .sky-block-buy-wrap{margin:24px auto;padding:0 14px}
        .sky-block-buy{width:100%;min-height:66px;border-radius:999px;border:5px solid #000;background:var(--buy);color:#fff;font-weight:900;cursor:pointer;padding:9px 18px;box-shadow:0 4px 11px rgba(0,0,0,.25)}
        .sky-block-buy:hover,.sky-buy:hover{filter:brightness(.97);transform:translateY(-1px)}
        .sky-section{max-width:1020px;margin:0 auto;padding:56px 20px}
        .sky-section h2{font-size:38px;line-height:1.15;text-align:center;font-weight:900;margin:0 0 18px}
        .sky-section p{font-size:17px;line-height:1.7;color:#333}
        .sky-benefits-wrap{background:#f6f6f6}
        .sky-benefits{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
        .sky-benefit{background:#fff;border:1px solid #e3e3e3;border-radius:16px;padding:20px;font-size:18px;font-weight:800}
        .sky-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .sky-gallery > *{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;background:#000}
        .sky-related{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .sky-card{border:1px solid #e4e4e4;border-radius:14px;overflow:hidden;background:#fff}
        .sky-card img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#f3f3f3}
        .sky-card-body{padding:14px}
        .sky-card-title{font-weight:900;font-size:16px}
        .sky-card-price{font-weight:900;color:var(--primary);margin-top:6px}
        .sky-card button{width:100%;margin-top:10px;background:#111;color:#fff;border:0;border-radius:9px;padding:11px;font-weight:800;cursor:pointer}
        .sky-faq{max-width:850px;margin:auto}
        .sky-faq details{border-bottom:1px solid #ddd;padding:16px 0}
        .sky-faq summary{font-weight:900;font-size:18px;cursor:pointer}
        .sky-faq p{text-align:left;margin:10px 0 0}
        .sky-footer{background:#111;color:#fff;text-align:center;padding:30px 20px;font-size:13px}
        .sky-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998}
        .sky-checkout{position:fixed;left:14px;top:10px;bottom:10px;width:390px;max-width:calc(100vw - 28px);z-index:9999;background:#fff;border:2px solid #111;border-radius:8px;box-shadow:0 7px 30px rgba(0,0,0,.35);overflow:auto}
        .sky-ck-head{display:flex;justify-content:space-between;align-items:center;padding:14px 15px;border-bottom:1px solid #ddd;font-size:13px;font-weight:900}
        .sky-close{background:transparent;border:0;font-size:25px;cursor:pointer}
        .sky-ck-product{display:flex;gap:10px;align-items:center;padding:13px;border-bottom:1px solid #ddd}
        .sky-ck-product img{width:54px;height:54px;object-fit:cover;border-radius:7px}
        .sky-ck-title{font-weight:900;font-size:13px}
        .sky-ck-price{margin-left:auto;font-weight:900;font-size:12px;white-space:nowrap}
        .sky-summary{padding:12px 15px;border-bottom:1px solid #ddd;font-size:13px}
        .sky-summary div{display:flex;justify-content:space-between;margin:5px 0}
        .sky-delivery{margin:12px;border:1px solid #aaa;border-radius:6px;padding:11px;font-size:12px;line-height:1.5}
        .sky-form{padding:4px 14px 18px}
        .sky-form h3{text-align:center;font-size:14px}
        .sky-field{margin:10px 0}
        .sky-field label{display:block;font-size:11px;font-weight:900;margin-bottom:4px;text-transform:uppercase}
        .sky-field input,.sky-field select{width:100%;height:40px;border:1px solid #aaa;border-radius:6px;padding:0 9px}
        .sky-submit{width:100%;border:3px solid #111;border-radius:24px;background:#21ed32;padding:12px 10px;font-weight:900;cursor:pointer}
        .sky-attention{margin:16px 0 0;border-radius:9px;background:#fff4dc;border:1px solid #f0d59a;padding:13px;font-size:12px;line-height:1.55}
        .sky-preview-toolbar{position:sticky;top:0;z-index:10050;min-height:48px;background:#111;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:15px;padding:8px 16px;font-size:13px;box-shadow:0 2px 12px rgba(0,0,0,.2)}
        .sky-preview-toolbar span{opacity:.75}
        .sky-preview-toolbar button{border:1px solid #555;background:#242424;color:#fff;border-radius:9px;padding:7px 11px;cursor:pointer;font-weight:800}
        @media(max-width:860px){
          .sky-preview-toolbar{font-size:11px;padding:7px 10px}
          .sky-preview-toolbar span{display:none}
          .sky-preview-toolbar button{padding:6px 8px;font-size:10px}
          .sky-announcement{font-size:14px;padding:13px 9px}
          .sky-product{grid-template-columns:1fr;margin-top:18px;gap:20px;padding:0 14px}
          .sky-title{font-size:31px}
          .sky-headline{font-size:31px}
          .sky-free-block h2{font-size:30px!important}
          .sky-image-text{grid-template-columns:1fr;margin:26px auto}
          .sky-image-text h2{font-size:30px}
          .sky-custom-gallery{grid-template-columns:repeat(var(--gallery-mobile-cols,1),minmax(0,1fr))!important}
          .sky-block-buy-wrap{padding:0 14px!important}
          .sky-section{padding:38px 17px}
          .sky-section h2{font-size:29px}
          .sky-benefits,.sky-related{grid-template-columns:1fr}
          .sky-gallery{grid-template-columns:repeat(2,1fr)}
          .sky-checkout{left:7px;right:7px;top:7px;bottom:7px;width:auto;max-width:none}
        }
      `}</style>

      {preview && (
        <div className="sky-preview-toolbar">
          <div>
            <b>👁 VISTA PREVIA</b>
            <span> — No está publicada y los pedidos no se guardan.</span>
          </div>
          <button onClick={() => window.close()}>✕ Cerrar vista previa</button>
        </div>
      )}

      <div className="sky-announcement">{config.announcement}</div>

      <main className="sky-product">
        <div>
          <div className="sky-main-image">
            {activeMedia?.type === "video" ? (
              <video
                key={activeMedia.url}
                src={activeMedia.url}
                controls
                playsInline
                poster={firstImage}
              />
            ) : activeMedia?.url ? (
              <img src={activeMedia.url} alt={product.title} />
            ) : (
              <div style={{ height: "100%", display: "grid", placeItems: "center", fontSize: 70 }}>📷</div>
            )}
          </div>
          {media.length > 1 && (
            <div className="sky-thumbs">
              {media.map((item, i) => (
                <button
                  key={item.id || i}
                  className={`sky-thumb ${i === mediaIndex ? "active" : ""}`}
                  onClick={() => setMediaIndex(i)}
                >
                  {item.type === "image" ? (
                    <img src={item.url} alt={`${product.title} ${i + 1}`} />
                  ) : (
                    <>
                      <video src={item.url} muted playsInline />
                      <span className="sky-play">▶</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="sky-title">{product.title.toUpperCase()}</h1>
          <div className="sky-rating">
            <span className="sky-stars">★★★★★</span>
            <span>{config.reviewsText}</span>
          </div>

          <div className="sky-price-row">
            <span className="sky-price">Gs. {nf(product.price)}</span>
            {product.compareAtPrice > product.price && (
              <>
                <span className="sky-compare">Gs. {nf(product.compareAtPrice)}</span>
                <span className="sky-save">🏷 SAVE {discount}%</span>
              </>
            )}
          </div>

          <div className="sky-qty-label">Cantidad</div>
          <div className="sky-qty">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
            <span>{quantity}</span>
            <button onClick={() => setQuantity((q) => q + 1)}>＋</button>
          </div>

          <button type="button" className="sky-buy" onClick={() => setCheckoutOpen(true)}>
            <div className="sky-buy-main">{config.buttonText}</div>
            <div className="sky-buy-sub">{config.buttonSubtext}</div>
          </button>

          {config.sections.timeline && (
            <div className="sky-timeline">
              <div className="sky-step"><div className="sky-circle">🛒</div><b>Hoy</b><span>Ordenado</span></div>
              <div className="sky-step"><div className="sky-circle">🚚</div><b>1 - 2 días</b><span>Orden lista</span></div>
              <div className="sky-step"><div className="sky-circle">🎁</div><b>2 - 4 días</b><span>Entregado</span></div>
            </div>
          )}

          <div className="sky-headline">{config.heroHeadline}</div>
          <div className="sky-hero-text">{config.heroDescription}</div>
        </div>
      </main>

      {blocks.map(renderBlock)}

      {config.sections.description && (
        <section className="sky-section">
          <h2>Conocé por qué este producto puede hacer la diferencia</h2>
          <p style={{ textAlign: "center" }}>
            {product.description || config.heroDescription}
          </p>
        </section>
      )}

      {config.sections.gallery && media.length > 1 && (
        <section className="sky-section">
          <h2>Mirá el producto en detalle</h2>
          <div className="sky-gallery">
            {media.map((item, i) =>
              item.type === "image" ? (
                <img key={item.id || i} src={item.url} alt="" />
              ) : (
                <video key={item.id || i} src={item.url} controls playsInline />
              ),
            )}
          </div>
        </section>
      )}

      {config.sections.benefits && (
        <div className="sky-benefits-wrap">
          <section className="sky-section">
            <h2>Todo lo que necesitás en una sola compra</h2>
            <div className="sky-benefits">
              {config.benefits.map((benefit, index) => (
                <div className="sky-benefit" key={index}>✅ {benefit}</div>
              ))}
            </div>
          </section>
        </div>
      )}

      {config.sections.warranty && product.warranty && (
        <section className="sky-section">
          <h2>Compra con tranquilidad</h2>
          <p style={{ textAlign: "center" }}>{product.warranty}</p>
        </section>
      )}

      {config.sections.relatedProducts && products.length > 1 && (
        <section className="sky-section">
          <h2>También te puede interesar</h2>
          <div className="sky-related">
            {products.map((p) => {
              const cover = legacyMedia(p).find((m) => m.type === "image")?.url;
              return (
                <div className="sky-card" key={p.id}>
                  {cover ? <img src={cover} alt={p.title} /> : <div style={{aspectRatio:"1/1",display:"grid",placeItems:"center",fontSize:50}}>📦</div>}
                  <div className="sky-card-body">
                    <div className="sky-card-title">{p.title}</div>
                    <div className="sky-card-price">Gs. {nf(p.price)}</div>
                    <button onClick={() => setActiveProductId(p.id)}>Ver / Comprar</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {config.sections.faq && config.faq.length > 0 && (
        <section className="sky-section">
          <h2>Preguntas frecuentes</h2>
          <div className="sky-faq">
            {config.faq.map((item, index) => (
              <details key={index}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <footer className="sky-footer">
        Compra segura · Atención al cliente · Envíos según cobertura
      </footer>

      {checkoutOpen && (
        <>
          <div className="sky-overlay" onClick={() => setCheckoutOpen(false)} />
          <aside className="sky-checkout" role="dialog" aria-modal="true" aria-label="Finalizar compra">
            <div className="sky-ck-head">
              {config.checkoutTitle}
              <button className="sky-close" onClick={() => setCheckoutOpen(false)}>×</button>
            </div>

            <div className="sky-ck-product">
              {firstImage && <img src={firstImage} alt="" />}
              <div>
                <div className="sky-ck-title">{product.title}</div>
                <div style={{ fontSize: 11 }}>Cantidad: {quantity}</div>
              </div>
              <div className="sky-ck-price">Gs. {nf(total)}</div>
            </div>

            <div className="sky-summary">
              <div><span>Subtotal</span><b>Gs. {nf(total)}</b></div>
              <div><span>Envío</span><b>A confirmar</b></div>
              <div style={{ borderTop: "1px solid #ddd", paddingTop: 7 }}><b>Total</b><b>Gs. {nf(total)}</b></div>
            </div>

            <div className="sky-delivery">
              <b>◉ {config.shippingText}</b><br /><br />☆ {config.expressText}
            </div>

            <div className="sky-form">
              <h3>Ingrese su dirección de envío</h3>

              <div className="sky-field">
                <label>Nombre y apellido *</label>
                <input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} placeholder="Nombre y apellido" />
              </div>
              <div className="sky-field">
                <label>Celular con WhatsApp *</label>
                <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="0981..." />
              </div>
              <div className="sky-field">
                <label>Departamento</label>
                <input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} placeholder="Departamento" />
              </div>
              <div className="sky-field">
                <label>Ciudad *</label>
                <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} placeholder="Ciudad" />
              </div>
              <div className="sky-field">
                <label>Calle principal</label>
                <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Calle principal" />
              </div>
              <div className="sky-field">
                <label>Referencia</label>
                <input value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} placeholder="Alguna referencia o característica" />
              </div>

              <button className="sky-submit" disabled={sending} onClick={submitOrder}>
                {sending ? "REGISTRANDO PEDIDO..." : "🛒 COMPLETAR PEDIDO Y FINALIZAR ✅"}
              </button>

              <div className="sky-attention">
                <b>🚚 ATENCIÓN</b><br />
                Los tiempos y modalidades de entrega dependen de la ciudad y de la cobertura disponible.
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
