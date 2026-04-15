// /api/read-sheet.ts

export default async function handler(req, res) {
  try {
    const sheetUrl = req.query.url;
    const sheetName = req.query.sheet; // Parámetro para nombre de pestaña

    if (!sheetUrl) {
      return res.status(400).json({ error: "Falta el parámetro url" });
    }

    // Extraer el ID del spreadsheet
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      return res.status(400).json({ error: "URL de Google Sheets inválida" });
    }

    const spreadsheetId = match[1];
    
    // Si se especificó un nombre de pestaña, intentar leer esa pestaña específica
    if (sheetName) {
      console.log(`🔍 Buscando pestaña: "${sheetName}"`);
      
      // Método 1: Intentar leer usando el parámetro sheet en la URL de exportación
      const csvUrlWithSheet = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&sheet=${encodeURIComponent(sheetName)}`;
      
      try {
        const response = await fetch(csvUrlWithSheet);
        const csvText = await response.text();
        
        // Verificar si la respuesta es válida (no es HTML de error)
        if (response.ok && !csvText.includes("<html") && !csvText.includes("<!DOCTYPE")) {
          // Procesar el CSV
          const rows = csvText.split("\n").map(r => {
            // Manejar CSV con comillas
            const regex = /(".*?"|[^,]*)(,|$)/g;
            const row = [];
            let match;
            while ((match = regex.exec(r)) !== null) {
              let value = match[1];
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
              }
              row.push(value);
            }
            return row;
          });
          
          if (rows.length < 2) {
            return res.json({ 
              headers: rows[0] || [], 
              orders: [], 
              total: 0,
              sheetName: sheetName 
            });
          }
          
          // Limpiar headers
          const headers = rows[0].map(h => h.trim());
          
          // Convertir filas a objetos
          const orders = rows.slice(1).map(row => {
            const obj = {};
            headers.forEach((h, i) => {
              let value = (row[i] || "").trim();
              // Limpiar comillas dobles
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
              }
              obj[h] = value;
            });
            return obj;
          });
          
          console.log(`✅ Pestaña "${sheetName}" encontrada y cargada: ${orders.length} filas`);
          
          return res.json({
            headers: headers,
            orders: orders,
            total: orders.length,
            sheetName: sheetName
          });
        }
      } catch (err) {
        console.log(`⚠️ No se pudo leer pestaña "${sheetName}" directamente:`, err.message);
      }
      
      // Método 2: Obtener todas las pestañas y encontrar el gid por nombre
      try {
        // Obtener metadata del spreadsheet usando la API pública
        const metadataUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
        const metadataResponse = await fetch(metadataUrl);
        
        // No podemos obtener el gid fácilmente, así que intentamos con rangos comunes
        // En lugar de eso, listamos las pestañas conocidas o usamos la primera pestaña
        
        console.log(`⚠️ No se pudo acceder a la pestaña "${sheetName}", usando primera pestaña como fallback`);
      } catch (err) {
        console.error("Error obteniendo metadata:", err);
      }
    }
    
    // Fallback: Usar el gid de la URL original o la primera pestaña
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

    if (csvText.includes("<html") || csvText.includes("<!DOCTYPE")) {
      return res.status(400).json({
        error: "La hoja no está pública o Google bloqueó el acceso. Asegurate que el sheet tenga permisos de 'Cualquier persona con el enlace puede ver'",
      });
    }

    // Procesar CSV manualmente respetando comillas
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let inQuotes = false;
    
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Comillas dobles escapadas
          currentField += '"';
          i++;
        } else {
          // Cambiar estado de comillas
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Fin de campo
        currentRow.push(currentField);
        currentField = "";
      } else if (char === '\n' && !inQuotes) {
        // Fin de fila
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
    
    // Agregar último campo si hay
    if (currentField !== "" || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
    }

    if (rows.length < 2) {
      return res.json({ headers: rows[0] || [], orders: [], total: 0 });
    }

    // Limpiar headers
    const headers = rows[0].map(h => h.trim());
    
    // Convertir filas a objetos
    const orders = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let value = (row[i] || "").trim();
        // Limpiar comillas dobles si existen
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        obj[h] = value;
      });
      return obj;
    });

    console.log(`📊 Usando pestaña por defecto (gid=${gid}): ${orders.length} filas`);

    return res.json({
      headers,
      orders,
      total: orders.length,
      gid: gid
    });

  } catch (err) {
    console.error("Error en /api/read-sheet:", err);
    return res.status(500).json({ error: err.message });
  }
}
