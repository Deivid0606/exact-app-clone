const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const SHOPIFY_ADMIN_TOKEN = Deno.env.get('SHOPIFY_ADMIN_TOKEN')
  const SHOPIFY_STORE_DOMAIN = Deno.env.get('SHOPIFY_STORE_DOMAIN')

  if (!SHOPIFY_ADMIN_TOKEN || !SHOPIFY_STORE_DOMAIN) {
    return new Response(JSON.stringify({ error: 'Shopify credentials not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'any'
    const limit = url.searchParams.get('limit') || '50'

    // Clean domain - remove protocol and trailing slashes
    const cleanDomain = SHOPIFY_STORE_DOMAIN.replace(/^https?:\/\//, '').replace(/\/+$/, '')
    
    const shopifyUrl = `https://${cleanDomain}/admin/api/2025-04/orders.json?status=${status}&limit=${limit}`
    
    const response = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(JSON.stringify({ error: `Shopify API error [${response.status}]: ${errorText}` }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()
    
    // Map Shopify orders to a simpler format
    const orders = (data.orders || []).map((o: any) => ({
      shopify_id: o.id,
      order_number: o.name || `#${o.order_number}`,
      created_at: o.created_at,
      customer_name: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : (o.billing_address?.name || 'Sin nombre'),
      phone: o.customer?.phone || o.billing_address?.phone || o.shipping_address?.phone || '',
      email: o.email || '',
      city: o.shipping_address?.city || o.billing_address?.city || '',
      street: o.shipping_address?.address1 || o.billing_address?.address1 || '',
      district: o.shipping_address?.province || o.billing_address?.province || '',
      total: Number(o.total_price || 0),
      currency: o.currency || 'PYG',
      financial_status: o.financial_status || '',
      fulfillment_status: o.fulfillment_status || null,
      items: (o.line_items || []).map((li: any) => ({
        title: li.title,
        qty: li.quantity,
        price: Number(li.price || 0),
        sku: li.sku || '',
      })),
      note: o.note || '',
    }))

    return new Response(JSON.stringify({ orders }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
