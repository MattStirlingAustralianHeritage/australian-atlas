import { NextResponse } from 'next/server'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import QRCode from 'qrcode'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'

/**
 * GET /api/dashboard/share-kit/qr?listing_id=<uuid>[&token=<jwt>]
 *
 * Print-ready A5 card for the authed operator's listing: venue name, "Find us
 * on the Australian Atlas", and a server-generated QR SVG pointing at the
 * listing's public place page. Returned as a standalone HTML page the
 * operator prints (or saves to PDF) from the browser.
 *
 * Auth matches the dashboard pattern (shared JWT, vendor/admin role, active
 * claim ownership; admins bypass). Because this is opened as a navigation
 * (window.open from the subscription page) rather than an XHR, the token may
 * arrive as a `token` query param instead of an Authorization header — same
 * verification either way.
 */

const SITE_URL = 'https://www.australianatlas.com.au'

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)

  // Verify JWT — Authorization header, or ?token= for direct navigation.
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '') || searchParams.get('token') || ''
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  if (user.role !== 'vendor' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Vendor or admin role required' }, { status: 403 })
  }

  const listingId = searchParams.get('listing_id')
  if (!listingId) {
    return NextResponse.json({ error: 'listing_id query parameter is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  try {
    const { data: listing, error: listingErr } = await sb
      .from('listings')
      .select('id, name, slug, suburb, state')
      .eq('id', listingId)
      .single()

    if (listingErr || !listing || !listing.slug) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Private to the owner: require an active claim (admins bypass).
    if (user.role !== 'admin') {
      const { data: claim } = await sb
        .from('listing_claims')
        .select('id')
        .eq('listing_id', listingId)
        .eq('claimed_by', user.id)
        .in('status', LIVE_CLAIM_STATUSES)
        .limit(1)
        .maybeSingle()
      if (!claim) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }
    }

    const placeUrl = `${SITE_URL}/place/${listing.slug}`

    // Server-side QR as inline SVG — no client JS, crisp at any print size.
    const qrSvg = await QRCode.toString(placeUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      color: { dark: '#1C1A17', light: '#ffffff00' },
    })

    const locality = [listing.suburb, listing.state].filter(Boolean).join(', ')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(listing.name)} · Australian Atlas print card</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    /* A5 portrait: 148mm x 210mm */
    @page { size: A5 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: #e8e4da;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .card {
      width: 148mm;
      height: 210mm;
      margin: 24px auto;
      background: #faf8f5;
      border: 1px solid #e7e3db;
      padding: 18mm 14mm 14mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .masthead {
      font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
      font-size: 17pt;
      font-weight: 400;
      color: #1C1A17;
      letter-spacing: 0.01em;
    }
    .rule { width: 34px; height: 1px; background: #d8d4cd; margin: 6mm auto 0; }
    .venue {
      margin: 12mm 0 0;
      font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
      font-size: 26pt;
      font-weight: 400;
      font-style: italic;
      color: #1C1A17;
      line-height: 1.15;
      letter-spacing: -0.01em;
    }
    .locality {
      margin: 3mm 0 0;
      font-size: 9.5pt;
      font-weight: 300;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #9a958c;
    }
    .tagline {
      margin: 10mm 0 0;
      font-size: 12pt;
      font-weight: 300;
      color: #6B6760;
      line-height: 1.6;
    }
    .tagline em { font-style: italic; color: #5f8a7e; }
    .qr-wrap {
      margin: 9mm auto 0;
      width: 62mm;
      height: 62mm;
      padding: 5mm;
      background: #ffffff;
      border: 1px solid #e7e3db;
      border-radius: 10px;
    }
    .qr-wrap svg { display: block; width: 100%; height: 100%; }
    .url {
      margin: 6mm 0 0;
      font-size: 9pt;
      font-weight: 400;
      color: #5f8a7e;
      word-break: break-all;
    }
    .footer {
      margin-top: auto;
      padding-top: 8mm;
      font-size: 8pt;
      font-weight: 300;
      color: #9a958c;
      letter-spacing: 0.04em;
    }
    .footer .dot { color: #d4a843; padding: 0 4px; }
    .toolbar {
      max-width: 148mm;
      margin: 20px auto 0;
      text-align: center;
    }
    .toolbar button {
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: #ffffff;
      background: #1C1A17;
      border: none;
      border-radius: 999px;
      padding: 12px 32px;
      cursor: pointer;
    }
    .toolbar p { font-size: 12px; color: #6B6760; font-weight: 300; margin: 10px 0 0; }
    @media print {
      body { background: #faf8f5; }
      .toolbar { display: none; }
      .card { margin: 0; border: none; width: 100%; height: 100vh; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Print card</button>
    <p>A5 · choose “Save as PDF” in the print dialog to keep a copy.</p>
  </div>
  <div class="card">
    <div class="masthead">Australian Atlas</div>
    <div class="rule"></div>
    <h1 class="venue">${esc(listing.name)}</h1>
    ${locality ? `<p class="locality">${esc(locality)}</p>` : ''}
    <p class="tagline">Find us on the <em>Australian Atlas</em> &mdash; an independent guide to independent Australia.</p>
    <div class="qr-wrap">${qrSvg}</div>
    <p class="url">${esc(placeUrl)}</p>
    <p class="footer">australianatlas.com.au<span class="dot">&middot;</span>scan to read our story</p>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[dashboard/share-kit/qr] Error:', err.message)
    return NextResponse.json({ error: 'Failed to build print card' }, { status: 500 })
  }
}
