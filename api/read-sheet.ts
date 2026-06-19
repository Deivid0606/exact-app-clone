// pages/api/read-sheet.ts
import { NextApiRequest, NextApiResponse } from 'next';

/**
 * Parser CSV robusto que maneja:
 * - Comas dentro de campos con comillas
 * - Saltos de línea dentro de campos con comillas
 * - Comillas dobles escapadas ("")
 * - Espacios en blanco
 */
function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (insideQuotes) {
      // Dentro de comillas
      if (char === '"' && nextChar === '"') {
        // Doble comilla escapada -> agregar una comilla literal
        currentField += '"';
        i++; // Saltar la siguiente comilla
      } else if (char === '"') {
        // Fin de comillas
        insideQuotes = false;
      } else {
        // Cualquier otro carácter dentro de comillas (incluyendo comas y saltos de línea)
        currentField += char;
      }
    } else {
      // Fuera de comillas
      if (char === '"') {
        // Inicio de comillas
        insideQuotes = true;
      } else if (char === ',') {
        // Separador de campo
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        // Fin de fila
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else if (char === '\r') {
        // Carriage return (Windows), ignorar si va seguido de \n
        if (nextChar !== '\n') {
          currentRow.push(currentField.trim());
          currentField = '';
          if (currentRow.length > 0) {
            rows.push(currentRow);
          }
          currentRow = [];
        }
      } else {
        currentField += char;
      }
    }
  }
  
  // Último campo y última fila
  if (currentField.trim() || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }
  }
  
  return rows;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const sheetUrl = req.query.url as string;

    if (!sheetUrl) {
      return res.status(400).json({ error: "Falta el parámetro url" });
    }

    // Extraer ID del spreadsheet
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      return res.status(400).json({ error: "URL de Google Sheets inválida" });
    }

    const spreadsheetId = match[1];
    const gidMatch = sheetUrl.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";

    // Descargar como CSV
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      return res.status(400).json({
        error: `No se pudo leer el Sheet. ¿Está público? [${response.status}]`,
      });
    }

    const csvText = await response.text();

    // Verificar que no sea HTML (error de autenticación)
    if (csvText.includes("<html") || csvText.includes("<!DOCTYPE")) {
      return res.status(400).json({
        error: "La hoja no está pública o Google bloqueó el acceso",
      });
    }

    // Parsear CSV correctamente
    const parsedRows = parseCSV(csvText);

    if (parsedRows.length < 2) {
      return res.json({ 
        headers: parsedRows[0] || [], 
        orders: [], 
        total: 0 
      });
    }

    // La primera fila es el header (fila 1 en Google Sheets)
    const headers = parsedRows[0].map(h => h.trim().toLowerCase());

    // Los datos empiezan en la fila 2 de Google Sheets
    // El número de fila real es: idx + 2 (porque idx 0 = fila 2)
    const orders = parsedRows.slice(1).map((row, idx) => {
      const obj: Record<string, string> = {};
      
      headers.forEach((h, i) => {
        // Si hay más campos que headers, ignorar los extra
        if (i < row.length) {
          obj[h] = (row[i] || "").trim();
        } else {
          obj[h] = "";
        }
      });

      // 🔥 CLAVE: Agregar el número de fila REAL de Google Sheets (1-based)
      // Esto es ESTABLE y no cambia aunque se inserten/eliminen filas
      obj.__row = String(idx + 2); // fila 2 = primer dato
      
      return obj;
    });

    return res.json({
      headers,
      orders,
      total: orders.length,
      // Opcional: incluir el rango exacto para debugging
      _meta: {
        rowStart: 2,
        rowEnd: orders.length + 1,
        totalRows: orders.length
      }
    });

  } catch (err: any) {
    console.error("❌ Error en /api/read-sheet:", err);
    return res.status(500).json({ 
      error: err.message || "Error interno del servidor" 
    });
  }
}
