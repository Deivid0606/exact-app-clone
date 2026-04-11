export default async function handler(req: any, res: any) {
  try {
    const sheetUrl = req.query.url;

    if (!sheetUrl) {
      return res.status(400).json({ error: "Falta el parámetro url" });
    }

    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      return res.status(400).json({ error: "URL de Google Sheets inválida" });
    }

    const spreadsheetId = match[1];
    const gidMatch = sheetUrl.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";

    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;

    const response = await fetch(csvUrl);
    const csvText = await response.text();

    if (!response.ok) {
      return res.status(400).json({
        error: `No se pudo leer el Sheet. ¿Está público? [${response.status}]`,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    const looksLikeHtml =
      contentType.includes("text/html") ||
      csvText.trim().toLowerCase().startsWith("<!doctype html") ||
      csvText.trim().toLowerCase().startsWith("<html");

    if (looksLikeHtml) {
      return res.status(400).json({
        error: "Google devolvió HTML en vez de CSV. La hoja probablemente no está pública o el enlace no es accesible.",
      });
    }

    const rows = parseCSV(csvText);

    if (!rows.length) {
      return res.status(200).json({
        headers: [],
        orders: [],
        total: 0,
      });
    }

    if (rows.length < 2) {
      return res.status(200).json({
        error: "El Sheet está vacío o solo tiene encabezados",
        headers: rows[0] || [],
        orders: [],
        total: 0,
      });
    }

    const rawHeaders = rows[0].map((h: string) => h.trim().toLowerCase());
    const headers: string[] = [];
    const headerCount: Record<string, number> = {};

    for (const h of rawHeaders) {
      const cleanHeader = h || `_col${headers.length}`;

      if (headerCount[cleanHeader]) {
        headerCount[cleanHeader]++;
        headers.push(`${cleanHeader}_${headerCount[cleanHeader]}`);
      } else {
        headerCount[cleanHeader] = 1;
        headers.push(cleanHeader);
      }
    }

    const dataRows = rows.slice(1).filter((r: string[]) =>
      r.some((c) => c.trim() !== "")
    );

    const orders = dataRows.map((row: string[]) => {
      const obj: Record<string, string> = {};
      headers.forEach((h: string, i: number) => {
        obj[h] = (row[i] || "").trim();
      });
      return obj;
    });

    return res.status(200).json({
      headers,
      orders,
      total: orders.length,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || String(err),
    });
  }
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\n") {
        current.push(field);
        rows.push(current);
        current = [];
        field = "";
      } else if (ch === "\r") {
        if (text[i + 1] === "\n") i++;
        current.push(field);
        rows.push(current);
        current = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
}
