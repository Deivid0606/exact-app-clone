export default async function handler(req, res) {
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

    if (csvText.includes("<html")) {
      return res.status(400).json({
        error: "La hoja no está pública o Google bloqueó el acceso",
      });
    }

    const rows = csvText.split("\n").map(r => r.split(","));

    if (rows.length < 2) {
      return res.json({ headers: rows[0] || [], orders: [], total: 0 });
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());

    const orders = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (row[i] || "").trim();
      });
      return obj;
    });

    return res.json({
      headers,
      orders,
      total: orders.length,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
