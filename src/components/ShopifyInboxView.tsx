import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const nf = (n: number) => new Intl.NumberFormat("es-PY").format(n);

export default function ShopifyInboxView() {
  const { profile } = useAuth();
  const myEmail = profile?.email || "";
  const role = profile?.role || "";

  const [paste, setPaste] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const loadImported = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .ilike("obs", "%Shopify%")
      .gte("created_at", dateFrom + "T00:00:00")
      .lte("created_at", dateTo + "T23:59:59")
      .order("created_at", { ascending: false })
      .limit(500);
    setImported(data || []);
  };

  useEffect(() => {
    loadImported();
  }, []);

  const normalizePhone = (p: string) => {
    let phone = String(p || "")
      .replace(/[\s\-().+]/g, "")
      .trim();
    if (phone.startsWith("595")) phone = "0" + phone.slice(3);
    return phone;
  };

  const parseMoney = (v: string) => {
    const cleaned = String(v || "").replace(/[^\d.,\-]/g, "");
    if (!cleaned) return 0;
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    return Math.round(Number(normalized) || 0);
  };

  const importPaste = async () => {
    if (!paste.trim()) {
      toast.error("Pegá datos primero");
      return;
    }
    setImporting(true);

    const lines = paste
      .trim()
      .split(/\r?\n/)
      .filter((l) => l.trim());
    if (!lines.length) {
      toast.error("Pegado vacío");
      setImporting(false);
      return;
    }

    const first = lines[0].split("\t").map((c) => c.trim());
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    const looksHeader = first.some((c) =>
      /tienda|fecha|nombre|numero|ciudad|producto|cantidad|monto|customer|phone|city|product/i.test(c),
    );

    let header: string[] = [];
    let start = 0;
    if (looksHeader) {
      header = first.map(norm);
      start = 1;
    }

    const hidx = (candidates: string[], fallback: number) => {
      for (const c of candidates) {
        const i = header.indexOf(norm(c));
        if (i >= 0) return i;
      }
      return fallback;
    };

    const col = {
      store: hidx(["tienda", "store"], 0),
      date: hidx(["fecha", "date"], 1),
      name: hidx(["nombre", "cliente", "customer", "customer name"], 2),
      phone: hidx(["numero", "tel", "telefono", "phone"], 3),
      street1: hidx(["calle", "direccion", "address", "street"], 4),
      street2: hidx(["calle 2", "calle2", "direccion 2", "address2"], 5),
      city: hidx(["ciudad", "city"], 6),
      dept: hidx(["departamento", "depto", "department", "state"], 7),
      product: hidx(["producto", "product", "item", "titulo"], 8),
      qty: hidx(["cantidad", "qty", "quantity"], 9),
      amount: hidx(["monto", "total", "importe", "amount", "precio"], 10),
      email: hidx(["email", "correo"], 11),
    };

    let importedCount = 0;
    let duplicates = 0;
    let skipped = 0;

    // Simple dedup: key = phone + product + amount
    const existingKeys = new Set(
      imported.map((o) => {
        const items = typeof o.items_json === "string" ? JSON.parse(o.items_json || "[]") : o.items_json || [];
        return `${o.phone}|${items[0]?.title || ""}|${o.total_gs}`;
      }),
    );

    const batch: any[] = [];
    for (let i = start; i < lines.length; i++) {
      const cells = lines[i].split("\t");
      if (cells.length < 3) {
        skipped++;
        continue;
      }

      const customer = (cells[col.name] || "").trim();
      const phone = normalizePhone(cells[col.phone] || "");
      const product = (cells[col.product] || "").trim();
      const qty = Number(cells[col.qty] || 1) || 1;
      const amount = parseMoney(cells[col.amount] || "0");
      const city = (cells[col.city] || "").trim();
      const street = [(cells[col.street1] || "").trim(), (cells[col.street2] || "").trim()].filter(Boolean).join(" ");
      const dept = (cells[col.dept] || "").trim();

      if (!customer && !phone && !product) {
        skipped++;
        continue;
      }

      const key = `${phone}|${product}|${amount}`;
      if (existingKeys.has(key)) {
        duplicates++;
        continue;
      }
      existingKeys.add(key);

      batch.push({
        order_number: `SH${Date.now().toString(36).toUpperCase()}${i}`,
        created_by: myEmail,
        customer_name: customer,
        phone,
        city,
        street,
        district: dept,
        items_json: [{ title: product, qty, sale_gs: amount, sku: "" }],
        total_gs: amount * qty,
        status: "PENDIENTE",
        obs: "Importado desde Shopify/WhatsApp",
      });
      importedCount++;
    }

    if (batch.length) {
      // Insert in chunks of 50
      for (let i = 0; i < batch.length; i += 50) {
        const chunk = batch.slice(i, i + 50);
        const { error } = await supabase.from("orders").insert(chunk);
        if (error) {
          toast.error(`Error en lote: ${error.message}`);
          break;
        }
      }
    }

    toast.success(`✅ ${importedCount} importados, ${duplicates} duplicados, ${skipped} omitidos`);
    setPaste("");
    setImporting(false);
    loadImported();
  };

  const filtered = useMemo(() => {
    return imported.filter((o) => {
      if (filterStatus && o.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (o.customer_name || "").toLowerCase().includes(q) ||
          (o.phone || "").includes(q) ||
          (o.order_number || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [imported, filterStatus, search]);

  const updateStatus = async (orderId: string, status: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Estado → ${status}`);
      setImported((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    }
  };

  const statusOpts = ["PENDIENTE", "EN RUTA", "ENTREGADO", "CANCELADO", "REAGENDADO"];

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos de Shopify + WhatsApp</h3>

      {/* Import section */}
      <div className="app-card !p-4 mb-4">
        <h4 className="font-bold mb-2">📋 Importar desde planilla</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Pegá las filas desde tu Google Sheet de Shopify (Ctrl+C / Ctrl+V). Detecta encabezados automáticamente.
          Columnas soportadas: tienda, fecha, nombre, número, calle, ciudad, departamento, producto, cantidad, monto,
          email.
        </p>
        <textarea
          className="app-input"
          rows={6}
          placeholder="Pegá acá las filas de tu planilla..."
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="flex gap-2 mt-2">
          <button className="nav-btn active" onClick={importPaste} disabled={importing}>
            {importing ? (
              <span className="flex items-center gap-2">
                <span className="btn-spinner" /> Importando...
              </span>
            ) : (
              "Guardar / Importar"
            )}
          </button>
          <button className="nav-btn" onClick={() => setPaste("")}>
            Limpiar
          </button>
        </div>
      </div>

      {/* Imported orders list */}
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input
          type="date"
          className="app-input !w-auto"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <select
          className="app-input !w-auto min-w-[160px]"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {statusOpts.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          className="app-input !w-auto min-w-[240px] flex-1"
          placeholder="🔎 Buscar por cliente, teléfono o ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="nav-btn active" onClick={loadImported}>
          Filtrar
        </button>
      </div>

      <div className="text-xs text-muted-foreground mb-2">{filtered.length} pedidos Shopify importados</div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1000px]">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>ID</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Ciudad</th>
              <th>Producto</th>
              <th className="text-right">Monto (Gs)</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const items = typeof o.items_json === "string" ? JSON.parse(o.items_json || "[]") : o.items_json || [];
              const productName = items[0]?.title || "—";
              return (
                <tr key={o.id}>
                  <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString("es-PY")}</td>
                  <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-xs">{o.phone}</td>
                  <td className="text-xs">{o.city}</td>
                  <td className="text-xs truncate max-w-[200px]">{productName}</td>
                  <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                  <td>
                    <select
                      className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[120px]"
                      value={o.status || "PENDIENTE"}
                      onChange={(e) => updateStatus(o.id, e.target.value)}
                    >
                      {statusOpts.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-8">
                  Sin pedidos importados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
