const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const sheetUrl = url.searchParams.get('url')

    if (!sheetUrl) {
      return new Response(JSON.stringify({ error: 'Falta el parámetro url' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    if (!match) {
      return new Response(JSON.stringify({ error: 'URL de Google Sheets inválida' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const spreadsheetId = match[1]
    const gidMatch = sheetUrl.match(/gid=(\d+)/)
    const gid = gidMatch ? gidMatch[1] : '0'

    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`

    const response = await fetch(csvUrl)
    if (!response.ok) {
      await response.text()
      return new Response(JSON.stringify({ error: `No se pudo leer el Sheet. ¿Está público? [${response.status}]` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const csvText = await response.text()
    const rows = parseCSV(csvText)
    if (rows.length < 2) {
      return new Response(JSON.stringify({ error: 'El Sheet está vacío o solo tiene encabezados', headers: rows[0] || [], orders: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Handle duplicate header names by appending _2, _3, etc.
    const rawHeaders = rows[0].map((h: string) => h.trim().toLowerCase())
    const headers: string[] = []
    const headerCount: Record<string, number> = {}
    for (const h of rawHeaders) {
      if (!h) {
        headers.push(`_col${headers.length}`)
        continue
      }
      if (headerCount[h]) {
        headerCount[h]++
        headers.push(`${h}_${headerCount[h]}`)
      } else {
        headerCount[h] = 1
        headers.push(h)
      }
    }

    const dataRows = rows.slice(1).filter((r: string[]) => r.some(c => c.trim() !== ''))

    const orders = dataRows.map((row: string[]) => {
      const obj: Record<string, string> = {}
      headers.forEach((h: string, i: number) => {
        obj[h] = (row[i] || '').trim()
      })
      return obj
    })

    return new Response(JSON.stringify({ headers, orders, total: orders.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        current.push(field); field = ''
        rows.push(current); current = []
        if (ch === '\r') i++
      } else if (ch === '\r') {
        current.push(field); field = ''
        rows.push(current); current = []
      } else {
        field += ch
      }
    }
  }
  if (field || current.length) { current.push(field); rows.push(current) }
  return rows
}
