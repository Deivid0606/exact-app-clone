import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  LandingConfig,
  LandingProductSnapshot,
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

export default function PublicLandingPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<PublicLandingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProductId, setActiveProductId] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
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
      const { data, error } = await supabase
        .from("landing_pages")
        .select("id,name,slug,status,config")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

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
  }, [slug]);

  const config = page?.config;
  const products = config?.productSnapshots || [];
  const product =
    products.find((p) => p.id === activeProductId) || products[0] || null;

  useEffect(() => {
    setImageIndex(0);
    setQuantity(1);
  }, [activeProductId]);

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

  const images = product.images || [];
  const discount =
    product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0;

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
        .sky-main-image{width:100%;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:#f2f2f2}
        .sky-main-image img{width:100%;height:100%;object-fit:cover;display:block}
        .sky-thumbs{display:flex;gap:9px;margin-top:9px;overflow:auto;padding:2px}
        .sky-thumb{width:82px;height:82px;border-radius:9px;overflow:hidden;border:1px solid #ddd;padding:0;background:#fff;cursor:pointer;flex:0 0 auto}
        .sky-thumb.active{outline:2px solid #111;outline-offset:1px}
        .sky-thumb img{width:100%;height:100%;object-fit:cover}
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
        .sky-section{max-width:1020px;margin:0 auto;padding:56px 20px}
        .sky-section h2{font-size:38px;line-height:1.15;text-align:center;font-weight:900;margin:0 0 18px}
        .sky-section p{font-size:17px;line-height:1.7;color:#333}
        .sky-benefits-wrap{background:#f6f6f6}
        .sky-benefits{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
        .sky-benefit{background:#fff;border:1px solid #e3e3e3;border-radius:16px;padding:20px;font-size:18px;font-weight:800}
        .sky-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .sky-gallery img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px}
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
        @media(max-width:860px){
          .sky-announcement{font-size:14px;padding:13px 9px}
          .sky-product{grid-template-columns:1fr;margin-top:18px;gap:20px;padding:0 14px}
          .sky-title{font-size:31px}
          .sky-headline{font-size:31px}
          .sky-section{padding:38px 17px}
          .sky-section h2{font-size:29px}
          .sky-benefits,.sky-related{grid-template-columns:1fr}
          .sky-gallery{grid-template-columns:repeat(2,1fr)}
          .sky-checkout{left:7px;right:7px;top:7px;bottom:7px;width:auto;max-width:none}
        }
      `}</style>

      <div className="sky-announcement">{config.announcement}</div>

      <main className="sky-product">
        <div>
          <div className="sky-main-image">
            {images[imageIndex] ? (
              <img src={images[imageIndex]} alt={product.title} />
            ) : (
              <div style={{ height: "100%", display: "grid", placeItems: "center", fontSize: 70 }}>📷</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="sky-thumbs">
              {images.map((img, i) => (
                <button
                  key={img + i}
                  className={`sky-thumb ${i === imageIndex ? "active" : ""}`}
                  onClick={() => setImageIndex(i)}
                >
                  <img src={img} alt={`${product.title} ${i + 1}`} />
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
                <span className="sky-compare">
                  Gs. {nf(product.compareAtPrice)}
                </span>
                <span className="sky-save">🏷 SAVE {discount}%</span>
              </>
            )}
          </div>

          <div className="sky-qty-label">Cantidad</div>
          <div className="sky-qty">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
              −
            </button>
            <span>{quantity}</span>
            <button onClick={() => setQuantity((q) => q + 1)}>＋</button>
          </div>

          <button className="sky-buy" onClick={() => setCheckoutOpen(true)}>
            <div className="sky-buy-main">{config.buttonText}</div>
            <div className="sky-buy-sub">{config.buttonSubtext}</div>
          </button>

          {config.sections.timeline && (
            <div className="sky-timeline">
              <div className="sky-step">
                <div className="sky-circle">🛒</div>
                <b>Hoy</b>
                <span>Ordenado</span>
              </div>
              <div className="sky-step">
                <div className="sky-circle">🚚</div>
                <b>1 - 2 días</b>
                <span>Orden lista</span>
              </div>
              <div className="sky-step">
                <div className="sky-circle">🎁</div>
                <b>2 - 4 días</b>
                <span>Entregado</span>
              </div>
            </div>
          )}

          <div className="sky-headline">{config.heroHeadline}</div>
          <div className="sky-hero-text">{config.heroDescription}</div>
        </div>
      </main>

      {config.sections.description && (
        <section className="sky-section">
          <h2>Conocé por qué este producto puede hacer la diferencia</h2>
          <p style={{ textAlign: "center" }}>
            {product.description || config.heroDescription}
          </p>
        </section>
      )}

      {config.sections.gallery && images.length > 1 && (
        <section className="sky-section">
          <h2>Mirá el producto en detalle</h2>
          <div className="sky-gallery">
            {images.map((img, i) => (
              <img key={img + i} src={img} alt="" />
            ))}
          </div>
        </section>
      )}

      {config.sections.benefits && (
        <div className="sky-benefits-wrap">
          <section className="sky-section">
            <h2>Todo lo que necesitás en una sola compra</h2>
            <div className="sky-benefits">
              {config.benefits.map((benefit, index) => (
                <div className="sky-benefit" key={index}>
                  ✅ {benefit}
                </div>
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
            {products.map((p) => (
              <div className="sky-card" key={p.id}>
                {p.images?.[0] ? <img src={p.images[0]} alt={p.title} /> : <div style={{aspectRatio:"1/1",display:"grid",placeItems:"center",fontSize:50}}>📦</div>}
                <div className="sky-card-body">
                  <div className="sky-card-title">{p.title}</div>
                  <div className="sky-card-price">Gs. {nf(p.price)}</div>
                  <button onClick={() => setActiveProductId(p.id)}>
                    Ver / Comprar
                  </button>
                </div>
              </div>
            ))}
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
          <div
            className="sky-overlay"
            onClick={() => setCheckoutOpen(false)}
          />
          <aside className="sky-checkout">
            <div className="sky-ck-head">
              {config.checkoutTitle}
              <button
                className="sky-close"
                onClick={() => setCheckoutOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="sky-ck-product">
              {images[0] && <img src={images[0]} alt="" />}
              <div>
                <div className="sky-ck-title">{product.title}</div>
                <div style={{ fontSize: 11 }}>Cantidad: {quantity}</div>
              </div>
              <div className="sky-ck-price">Gs. {nf(total)}</div>
            </div>

            <div className="sky-summary">
              <div>
                <span>Subtotal</span>
                <b>Gs. {nf(total)}</b>
              </div>
              <div>
                <span>Envío</span>
                <b>A confirmar</b>
              </div>
              <div style={{ borderTop: "1px solid #ddd", paddingTop: 7 }}>
                <b>Total</b>
                <b>Gs. {nf(total)}</b>
              </div>
            </div>

            <div className="sky-delivery">
              <b>◉ {config.shippingText}</b>
              <br />
              <br />
              ☆ {config.expressText}
            </div>

            <div className="sky-form">
              <h3>Ingrese su dirección de envío</h3>

              <div className="sky-field">
                <label>Nombre y apellido *</label>
                <input
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, full_name: e.target.value }))
                  }
                  placeholder="Nombre y apellido"
                />
              </div>

              <div className="sky-field">
                <label>Celular con WhatsApp *</label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="0981..."
                />
              </div>

              <div className="sky-field">
                <label>Departamento</label>
                <input
                  value={form.department}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, department: e.target.value }))
                  }
                  placeholder="Departamento"
                />
              </div>

              <div className="sky-field">
                <label>Ciudad *</label>
                <input
                  value={form.city}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, city: e.target.value }))
                  }
                  placeholder="Ciudad"
                />
              </div>

              <div className="sky-field">
                <label>Calle principal</label>
                <input
                  value={form.address}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, address: e.target.value }))
                  }
                  placeholder="Calle principal"
                />
              </div>

              <div className="sky-field">
                <label>Referencia</label>
                <input
                  value={form.reference}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, reference: e.target.value }))
                  }
                  placeholder="Alguna referencia o característica"
                />
              </div>

              <button
                className="sky-submit"
                disabled={sending}
                onClick={submitOrder}
              >
                {sending
                  ? "REGISTRANDO PEDIDO..."
                  : "🛒 COMPLETAR PEDIDO Y FINALIZAR ✅"}
              </button>

              <div className="sky-attention">
                <b>🚚 ATENCIÓN</b>
                <br />
                Los tiempos y modalidades de entrega dependen de la ciudad y de
                la cobertura disponible. Tus datos serán usados únicamente para
                gestionar el pedido.
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
