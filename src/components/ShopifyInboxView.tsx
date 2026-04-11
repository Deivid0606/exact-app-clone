import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const nf = (n: number) => new Intl.NumberFormat('es-PY').format(n);

/* ─── helpers ─── */
const normalizePhone = (p: string) => {
  let phone = String(p || '').replace(/[\s\-().+]/g, '').trim();
  if (phone.startsWith('595')) phone = '0' + phone.slice(3);
  return phone;
};

const parseMoney = (v: string) => {
  const cleaned = String(v || '').replace(/[^\d.,\-]/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  return Math.round(Number(normalized) || 0);
};

/* ─── column detection ─── */
const findStrictCol = (headers: string[], candidates: string[]) => {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h === c.toLowerCase());
    if (idx >= 0) return idx;
  }
  for (const c of candidates) {
    const idx = headers.findIndex(h => h.includes(c.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
};

export default function ShopifyInboxView() {
  const { profile } = useAuth();
  const myEmail = profile?.email || '';
  const role = profile?.role || '';

  /* ─── sheet-based state ─── */
  const [sheetUrl, setSheetUrl] = useState(() => profile?.sheet_url || '');
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  /* ─── tracking (localStorage) ─── */
  const [loadedRowIds, setLoadedRowIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('shopify_loadedRowIds');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [rowStatuses, setRowStatuses] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('shopify_rowStatuses');
    return saved ? JSON.parse(saved) : {};
  });

  /* ─── auto-load ─── */
  const [autoLoad, setAutoLoad] = useState(() => localStorage.getItem('shopify_autoLoad') === 'true');
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── paste import (legacy) ─── */
  const [paste, setPaste] = useState('');
  const [importing, setImporting] = useState(false);

  /* ─── imported orders list ─── */
  const [imported, setImported] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  /* ─── persist localStorage ─── */
  useEffect(() => {
    localStorage.setItem('shopify_loadedRowIds', JSON.stringify([...loadedRowIds]));
  }, [loadedRowIds]);
  useEffect(() => {
    localStorage.setItem('shopify_rowStatuses', JSON.stringify(rowStatuses));
  }, [rowStatuses]);
  useEffect(() => {
    localStorage.setItem('shopify_autoLoad', autoLoad ? 'true' : 'false');
  }, [autoLoad]);

  /* ─── load products & cities ─── */
  useEffect(() => {
    (async () => {
      const { data: prods } = await supabase.from('products').select('*');
      setProducts(prods || []);
      const { data: cp } = await supabase.from('client_prices').select('city');
      setCities((cp || []).map(c => c.city));
    })();
  }, []);

  /* ─── load imported orders ─── */
  const loadImported = async () => {
    const { data } = await supabase.from('orders').select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })
      .limit(500);
    setImported(data || []);
  };
  useEffect(() => { loadImported(); }, []);

  /* ─── row ID generation ─── */
  const getRowId = (row: string[], idx: number): string => {
    const idCol = findStrictCol(sheetHeaders, ['id', 'order_id', 'pedido_id', 'numero']);
    if (idCol >= 0 && row[idCol]?.trim()) return `id:${row[idCol].trim()}`;
    const phone = normalizePhone(row[findStrictCol(sheetHeaders, ['numero', 'tel', 'telefono', 'phone'])] || '');
    const product = (row[findStrictCol(sheetHeaders, ['producto', 'product', 'item', 'titulo'])] || '').trim();
    const amount = parseMoney(row[findStrictCol(sheetHeaders, ['monto', 'total', 'importe', 'amount', 'precio'])] || '0');
    if (phone || product) return `key:${phone}|${product}|${amount}`;
    return `row:${idx}`;
  };

  const getStatusKey = (origIdx: number) => `status:${sheetUrl}:${origIdx}`;

  const getRowStatus = (origIdx: number) => {
    const key = getStatusKey(origIdx);
    if (rowStatuses[key]) return rowStatuses[key];
    const row = sheetRows[origIdx - (sheetHeaders.length ? 1 : 0)];
    if (!row) return 'CARGAR';
    const rowId = getRowId(row, origIdx);
    return loadedRowIds.has(rowId) ? 'CARGADO' : 'CARGAR';
  };

  const setRowStatus = (origIdx: number, status: string) => {
    const key = getStatusKey(origIdx);
    setRowStatuses(prev => ({ ...prev, [key]: status }));
  };

  /* ─── read sheet ─── */
  const fetchSheet = async () => {
    if (!sheetUrl.trim()) { toast.error('Ingresá la URL de la hoja'); return; }
    setLoadingSheet(true);
    try {
      const { data, error } = await supabase.functions.invoke('read-sheet', {
        body: { sheetUrl: sheetUrl.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const rows: string[][] = data?.rows || [];
      if (!rows.length) { toast.info('Hoja vacía'); setLoadingSheet(false); return; }

      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const first = rows[0].map(norm);
      const looksHeader = first.some(c => /tienda|fecha|nombre|numero|ciudad|producto|cantidad|monto|customer|phone|city|product/i.test(c));

      if (looksHeader) {
        setSheetHeaders(first);
        setSheetRows(rows.slice(1));
      } else {
        setSheetHeaders([]);
        setSheetRows(rows);
      }
      toast.success(`✅ ${rows.length - (looksHeader ? 1 : 0)} filas cargadas`);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
    setLoadingSheet(false);
  };

  /* ─── detect product & city ─── */
  const detectProduct = (productTitle: string) => {
    if (!productTitle) return null;
    const q = productTitle.toLowerCase();
    return products.find(p =>
      p.title?.toLowerCase().includes(q) || q.includes(p.title?.toLowerCase() || '___') ||
      (p.sku && q.includes(p.sku.toLowerCase()))
    ) || null;
  };

  const detectCity = (cityName: string) => {
    if (!cityName) return false;
    const q = cityName.toLowerCase();
    return cities.some(c => c.toLowerCase() === q || c.toLowerCase().includes(q) || q.includes(c.toLowerCase()));
  };

  /* ─── build order payload ─── */
  const buildPayload = (row: string[]) => {
    const col = (candidates: string[], fallback: number) => {
      const idx = findStrictCol(sheetHeaders, candidates);
      return idx >= 0 ? idx : fallback;
    };
    const customer = (row[col(['nombre', 'cliente', 'customer', 'customer name'], 2)] || '').trim();
    const phone = normalizePhone(row[col(['numero', 'tel', 'telefono', 'phone'], 3)] || '');
    const street = [(row[col(['calle', 'direccion', 'address', 'street'], 4)] || '').trim(), (row[col(['calle 2', 'calle2', 'direccion 2', 'address2'], 5)] || '').trim()].filter(Boolean).join(' ');
    const city = (row[col(['ciudad', 'city'], 6)] || '').trim();
    const dept = (row[col(['departamento', 'depto', 'department', 'state'], 7)] || '').trim();
    const productTitle = (row[col(['producto', 'product', 'item', 'titulo'], 8)] || '').trim();
    const qty = Number(row[col(['cantidad', 'qty', 'quantity'], 9)] || 1) || 1;
    const amount = parseMoney(row[col(['monto', 'total', 'importe', 'amount', 'precio'], 10)] || '0');
    const email = (row[col(['email', 'correo'], 11)] || '').trim();

    return {
      order_number: `SH${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5)}`,
      created_by: myEmail,
      customer_name: customer,
      phone,
      city,
      street,
      district: dept,
      email: email || undefined,
      items_json: [{ title: productTitle, qty, sale_gs: amount, sku: '' }],
      total_gs: amount * qty,
      status: 'PENDIENTE',
      obs: '',
    };
  };

  /* ─── confirm single row ─── */
  const handleConfirm = async (row: string[], origIdx: number) => {
    const payload = buildPayload(row);
    const { error } = await supabase.from('orders').insert(payload);
    if (error) { toast.error(error.message); return; }
    const rowId = getRowId(row, origIdx);
    setLoadedRowIds(prev => { const n = new Set(prev); n.add(rowId); return n; });
    setRowStatus(origIdx, 'CARGADO');
    toast.success('✅ Pedido cargado');
    loadImported();
  };

  /* ─── bulk load (only rows with CARGAR status) ─── */
  const getLoadableOrders = useCallback(() => {
    return sheetRows.map((row, i) => {
      const origIdx = i + (sheetHeaders.length ? 1 : 0);
      const status = getRowStatus(origIdx);
      if (status !== 'CARGAR') return null;

      const colProduct = findStrictCol(sheetHeaders, ['producto', 'product', 'item', 'titulo']);
      const productTitle = (row[colProduct >= 0 ? colProduct : 8] || '').trim();
      const colCity = findStrictCol(sheetHeaders, ['ciudad', 'city']);
      const cityName = (row[colCity >= 0 ? colCity : 6] || '').trim();

      const prod = detectProduct(productTitle);
      const cityOk = detectCity(cityName);
      if (!prod || !cityOk) return null;

      return { row, origIdx };
    }).filter(Boolean) as { row: string[]; origIdx: number }[];
  }, [sheetRows, sheetHeaders, rowStatuses, loadedRowIds, products, cities]);

  const handleBulkLoad = async () => {
    const loadable = getLoadableOrders();
    if (!loadable.length) { toast.info('No hay pedidos listos para cargar'); return; }

    let count = 0;
    for (const { row, origIdx } of loadable) {
      const payload = buildPayload(row);
      const { error } = await supabase.from('orders').insert(payload);
      if (!error) {
        const rowId = getRowId(row, origIdx);
        setLoadedRowIds(prev => { const n = new Set(prev); n.add(rowId); return n; });
        setRowStatus(origIdx, 'CARGADO');
        count++;
      }
    }
    toast.success(`✅ ${count} pedidos cargados`);
    loadImported();
  };

  /* ─── auto-load cycle ─── */
  const runAutoLoadCycle = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('read-sheet', {
        body: { sheetUrl: sheetUrl.trim() },
      });
      if (error || data?.error) return;
      const rows: string[][] = data?.rows || [];
      if (!rows.length) return;

      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const first = rows[0].map(norm);
      const looksHeader = first.some(c => /tienda|fecha|nombre|numero|ciudad|producto|cantidad|monto|customer|phone|city|product/i.test(c));
      const headers = looksHeader ? first : [];
      const dataRows = looksHeader ? rows.slice(1) : rows;

      let count = 0;
      for (let i = 0; i < dataRows.length; i++) {
        const origIdx = i + (looksHeader ? 1 : 0);
        const statusKey = `status:${sheetUrl}:${origIdx}`;

        // Check current status
        const savedStatuses = JSON.parse(localStorage.getItem('shopify_rowStatuses') || '{}');
        const savedIds = new Set(JSON.parse(localStorage.getItem('shopify_loadedRowIds') || '[]'));
        const rowId = (() => {
          const idCol = findStrictCol(headers, ['id', 'order_id', 'pedido_id', 'numero']);
          if (idCol >= 0 && dataRows[i][idCol]?.trim()) return `id:${dataRows[i][idCol].trim()}`;
          const phoneCol = findStrictCol(headers, ['numero', 'tel', 'telefono', 'phone']);
          const prodCol = findStrictCol(headers, ['producto', 'product', 'item', 'titulo']);
          const amtCol = findStrictCol(headers, ['monto', 'total', 'importe', 'amount', 'precio']);
          const phone = normalizePhone(dataRows[i][phoneCol >= 0 ? phoneCol : 3] || '');
          const product = (dataRows[i][prodCol >= 0 ? prodCol : 8] || '').trim();
          const amount = parseMoney(dataRows[i][amtCol >= 0 ? amtCol : 10] || '0');
          if (phone || product) return `key:${phone}|${product}|${amount}`;
          return `row:${origIdx}`;
        })();

        const currentStatus = savedStatuses[statusKey] || (savedIds.has(rowId) ? 'CARGADO' : 'CARGAR');
        if (currentStatus !== 'CARGAR') continue;

        // Check product & city
        const prodCol = findStrictCol(headers, ['producto', 'product', 'item', 'titulo']);
        const cityCol = findStrictCol(headers, ['ciudad', 'city']);
        const productTitle = (dataRows[i][prodCol >= 0 ? prodCol : 8] || '').trim();
        const cityName = (dataRows[i][cityCol >= 0 ? cityCol : 6] || '').trim();

        const prod = detectProduct(productTitle);
        const cityOk = detectCity(cityName);
        if (!prod || !cityOk) continue;

        // Build & insert
        const col = (candidates: string[], fallback: number) => {
          const idx = findStrictCol(headers, candidates);
          return idx >= 0 ? idx : fallback;
        };
        const customer = (dataRows[i][col(['nombre', 'cliente', 'customer', 'customer name'], 2)] || '').trim();
        const phone = normalizePhone(dataRows[i][col(['numero', 'tel', 'telefono', 'phone'], 3)] || '');
        const street = [(dataRows[i][col(['calle', 'direccion', 'address', 'street'], 4)] || '').trim(), (dataRows[i][col(['calle 2', 'calle2', 'direccion 2', 'address2'], 5)] || '').trim()].filter(Boolean).join(' ');
        const city = (dataRows[i][col(['ciudad', 'city'], 6)] || '').trim();
        const dept = (dataRows[i][col(['departamento', 'depto', 'department', 'state'], 7)] || '').trim();
        const qty = Number(dataRows[i][col(['cantidad', 'qty', 'quantity'], 9)] || 1) || 1;
        const amount = parseMoney(dataRows[i][col(['monto', 'total', 'importe', 'amount', 'precio'], 10)] || '0');

        const payload = {
          order_number: `SH${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5)}`,
          created_by: myEmail,
          customer_name: customer,
          phone,
          city,
          street,
          district: dept,
          items_json: [{ title: productTitle, qty, sale_gs: amount, sku: '' }],
          total_gs: amount * qty,
          status: 'PENDIENTE',
          obs: '',
        };

        const { error: insErr } = await supabase.from('orders').insert(payload);
        if (!insErr) {
          savedIds.add(rowId);
          savedStatuses[statusKey] = 'CARGADO';
          count++;
        }
      }

      if (count > 0) {
        localStorage.setItem('shopify_loadedRowIds', JSON.stringify([...new Set(JSON.parse(localStorage.getItem('shopify_loadedRowIds') || '[]')).add('__refresh__')]));
        localStorage.setItem('shopify_rowStatuses', JSON.stringify(JSON.parse(localStorage.getItem('shopify_rowStatuses') || '{}')));
        // Refresh local state
        setLoadedRowIds(new Set(JSON.parse(localStorage.getItem('shopify_loadedRowIds') || '[]')));
        setRowStatuses(JSON.parse(localStorage.getItem('shopify_rowStatuses') || '{}'));
        toast.success(`⚡ Auto-carga: ${count} pedidos cargados`);
        loadImported();
      }
    } catch { /* silent */ }
  }, [sheetUrl, myEmail, products, cities]);

  /* ─── auto-load timer ─── */
  useEffect(() => {
    if (autoLoad && sheetUrl.trim()) {
      runAutoLoadCycle();
      autoTimerRef.current = setInterval(runAutoLoadCycle, 60000);
    }
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current); };
  }, [autoLoad, runAutoLoadCycle, sheetUrl]);

  /* ─── paste import (legacy) ─── */
  const importPaste = async () => {
    if (!paste.trim()) { toast.error('Pegá datos primero'); return; }
    setImporting(true);

    const lines = paste.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { toast.error('Pegado vacío'); setImporting(false); return; }

    const first = lines[0].split('\t').map(c => c.trim());
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const looksHeader = first.some(c => /tienda|fecha|nombre|numero|ciudad|producto|cantidad|monto|customer|phone|city|product/i.test(c));

    let header: string[] = [];
    let start = 0;
    if (looksHeader) { header = first.map(norm); start = 1; }

    const hidx = (candidates: string[], fallback: number) => {
      for (const c of candidates) { const i = header.indexOf(norm(c)); if (i >= 0) return i; }
      return fallback;
    };

    const col = {
      name: hidx(['nombre', 'cliente', 'customer', 'customer name'], 2),
      phone: hidx(['numero', 'tel', 'telefono', 'phone'], 3),
      street1: hidx(['calle', 'direccion', 'address', 'street'], 4),
      street2: hidx(['calle 2', 'calle2', 'direccion 2', 'address2'], 5),
      city: hidx(['ciudad', 'city'], 6),
      dept: hidx(['departamento', 'depto', 'department', 'state'], 7),
      product: hidx(['producto', 'product', 'item', 'titulo'], 8),
      qty: hidx(['cantidad', 'qty', 'quantity'], 9),
      amount: hidx(['monto', 'total', 'importe', 'amount', 'precio'], 10),
    };

    let importedCount = 0, duplicates = 0, skipped = 0;
    const existingKeys = new Set(
      imported.map(o => {
        const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json || '[]') : (o.items_json || []);
        return `${o.phone}|${items[0]?.title || ''}|${o.total_gs}`;
      })
    );

    const batch: any[] = [];
    for (let i = start; i < lines.length; i++) {
      const cells = lines[i].split('\t');
      if (cells.length < 3) { skipped++; continue; }

      const customer = (cells[col.name] || '').trim();
      const phone = normalizePhone(cells[col.phone] || '');
      const product = (cells[col.product] || '').trim();
      const qty = Number(cells[col.qty] || 1) || 1;
      const amount = parseMoney(cells[col.amount] || '0');
      const city = (cells[col.city] || '').trim();
      const street = [(cells[col.street1] || '').trim(), (cells[col.street2] || '').trim()].filter(Boolean).join(' ');
      const dept = (cells[col.dept] || '').trim();

      if (!customer && !phone && !product) { skipped++; continue; }
      const key = `${phone}|${product}|${amount}`;
      if (existingKeys.has(key)) { duplicates++; continue; }
      existingKeys.add(key);

      batch.push({
        order_number: `SH${Date.now().toString(36).toUpperCase()}${i}`,
        created_by: myEmail,
        customer_name: customer, phone, city, street, district: dept,
        items_json: [{ title: product, qty, sale_gs: amount, sku: '' }],
        total_gs: amount * qty,
        status: 'PENDIENTE',
        obs: '',
      });
      importedCount++;
    }

    if (batch.length) {
      for (let i = 0; i < batch.length; i += 50) {
        const chunk = batch.slice(i, i + 50);
        const { error } = await supabase.from('orders').insert(chunk);
        if (error) { toast.error(`Error en lote: ${error.message}`); break; }
      }
    }

    toast.success(`✅ ${importedCount} importados, ${duplicates} duplicados, ${skipped} omitidos`);
    setPaste('');
    setImporting(false);
    loadImported();
  };

  /* ─── filtered list ─── */
  const statusOpts = ['PENDIENTE', 'EN RUTA', 'ENTREGADO', 'CANCELADO', 'REAGENDADO'];

  const filtered = useMemo(() => {
    return imported.filter(o => {
      if (filterStatus && o.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return (o.customer_name || '').toLowerCase().includes(q) ||
          (o.phone || '').includes(q) ||
          (o.order_number || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [imported, filterStatus, search]);

  const updateStatus = async (orderId: string, status: string) => {
    const { error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Estado → ${status}`);
      setImported(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    }
  };

  /* ─── render ─── */
  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Pedidos de Shopify + WhatsApp</h3>

      {/* ── Sheet URL section ── */}
      <div className="app-card !p-4 mb-4">
        <h4 className="font-bold mb-2">📊 Leer desde Google Sheet</h4>
        <div className="flex gap-2 mb-2 flex-wrap">
          <input
            className="app-input flex-1 min-w-[300px]"
            placeholder="URL de la hoja de Google Sheets..."
            value={sheetUrl}
            onChange={e => setSheetUrl(e.target.value)}
          />
          <button className="nav-btn active" onClick={fetchSheet} disabled={loadingSheet}>
            {loadingSheet ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Leyendo...</span> : '📥 Leer hoja'}
          </button>
          <button
            className={`nav-btn ${autoLoad ? 'active !bg-green-600' : ''}`}
            onClick={() => setAutoLoad(prev => !prev)}
            title={autoLoad ? 'Auto-carga activa (cada 60s)' : 'Activar auto-carga'}
          >
            ⚡ Auto-carga {autoLoad ? 'ON' : 'OFF'}
          </button>
        </div>
        {autoLoad && (
          <div className="text-xs text-green-400 mb-2 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Auto-carga activa — sincronizando cada 60 segundos
          </div>
        )}

        {/* ── Sheet rows table ── */}
        {sheetRows.length > 0 && (
          <div className="mt-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold">{sheetRows.length} filas de la hoja</span>
              <button className="nav-btn active text-xs" onClick={handleBulkLoad}>
                🚀 Cargar todos los listos
              </button>
            </div>
            <div className="overflow-auto max-h-[400px]">
              <table className="app-table min-w-[900px]">
                <thead>
                  <tr>
                    <th>#</th>
                    {sheetHeaders.length > 0
                      ? sheetHeaders.map((h, i) => <th key={i} className="text-xs capitalize">{h}</th>)
                      : sheetRows[0]?.map((_, i) => <th key={i}>Col {i + 1}</th>)}
                    <th>Producto</th><th>Ciudad</th><th>Estado</th><th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetRows.map((row, i) => {
                    const origIdx = i + (sheetHeaders.length ? 1 : 0);
                    const colProduct = findStrictCol(sheetHeaders, ['producto', 'product', 'item', 'titulo']);
                    const colCity = findStrictCol(sheetHeaders, ['ciudad', 'city']);
                    const productTitle = (row[colProduct >= 0 ? colProduct : 8] || '').trim();
                    const cityName = (row[colCity >= 0 ? colCity : 6] || '').trim();
                    const prod = detectProduct(productTitle);
                    const cityOk = detectCity(cityName);
                    const status = getRowStatus(origIdx);
                    const isLoaded = status === 'CARGADO';

                    return (
                      <tr key={i} className={isLoaded ? 'opacity-50' : ''}>
                        <td className="text-xs text-muted-foreground">{origIdx}</td>
                        {row.map((cell, j) => (
                          <td key={j} className="text-xs truncate max-w-[140px]" title={cell}>{cell}</td>
                        ))}
                        <td className="text-xs">
                          {prod ? <span className="text-green-400">✅ {prod.title?.slice(0, 20)}</span> : <span className="text-yellow-400">⚠️ No detectado</span>}
                        </td>
                        <td className="text-xs">
                          {cityOk ? <span className="text-green-400">✅</span> : <span className="text-yellow-400">⚠️</span>}
                        </td>
                        <td>
                          <select
                            className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[100px]"
                            value={status}
                            onChange={e => setRowStatus(origIdx, e.target.value)}
                          >
                            <option value="CARGAR">CARGAR</option>
                            <option value="PENDIENTE">PENDIENTE</option>
                            <option value="CARGADO">CARGADO</option>
                            <option value="OMITIR">OMITIR</option>
                          </select>
                        </td>
                        <td>
                          {!isLoaded && (
                            <button className="nav-btn active text-xs !py-1 !px-2" onClick={() => handleConfirm(row, origIdx)}>
                              Cargar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Paste import (legacy) ── */}
      <div className="app-card !p-4 mb-4">
        <h4 className="font-bold mb-2">📋 Importar desde planilla (pegado)</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Pegá las filas desde tu planilla (Ctrl+C / Ctrl+V). Detecta encabezados automáticamente.
        </p>
        <textarea className="app-input" rows={4} placeholder="Pegá acá las filas de tu planilla..." value={paste} onChange={e => setPaste(e.target.value)} />
        <div className="flex gap-2 mt-2">
          <button className="nav-btn active" onClick={importPaste} disabled={importing}>
            {importing ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Importando...</span> : 'Guardar / Importar'}
          </button>
          <button className="nav-btn" onClick={() => setPaste('')}>Limpiar</button>
        </div>
      </div>

      {/* ── Imported orders list ── */}
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="app-label !mt-0">Desde</label>
        <input type="date" className="app-input !w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className="app-label !mt-0">Hasta</label>
        <input type="date" className="app-input !w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <select className="app-input !w-auto min-w-[160px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="app-input !w-auto min-w-[240px] flex-1" placeholder="🔎 Buscar por cliente, teléfono o ID"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="nav-btn active" onClick={loadImported}>Filtrar</button>
      </div>

      <div className="text-xs text-muted-foreground mb-2">{filtered.length} pedidos importados</div>

      <div className="overflow-auto">
        <table className="app-table min-w-[1000px]">
          <thead>
            <tr>
              <th>Fecha</th><th>ID</th><th>Cliente</th><th>Teléfono</th><th>Ciudad</th>
              <th>Producto</th><th className="text-right">Monto (Gs)</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => {
              const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json || '[]') : (o.items_json || []);
              const productName = items[0]?.title || '—';
              return (
                <tr key={o.id}>
                  <td className="text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('es-PY')}</td>
                  <td className="text-xs font-bold">{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="text-xs">{o.customer_name}</td>
                  <td className="text-xs">{o.phone}</td>
                  <td className="text-xs">{o.city}</td>
                  <td className="text-xs truncate max-w-[200px]">{productName}</td>
                  <td className="text-right text-xs font-bold">{nf(Number(o.total_gs || 0))}</td>
                  <td>
                    <select className="app-input !py-1 !px-2 !text-[11px] !w-auto !min-w-[120px]"
                      value={o.status || 'PENDIENTE'}
                      onChange={e => updateStatus(o.id, e.target.value)}>
                      {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Sin pedidos importados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
