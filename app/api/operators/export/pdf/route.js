import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildCollectionHtml(collection, listings, operator, logoUrl) {
  const venueCards = listings.map(l => `
    <div style="border: 1px solid #E8E5DE; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; page-break-inside: avoid;">
      ${l.hero_image_url ? `<img src="${escapeHtml(l.hero_image_url)}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 4px; margin-bottom: 0.5rem;" />` : ''}
      <h3 style="margin: 0 0 0.25rem; font-size: 1rem; color: #1C1A17;">${escapeHtml(l.name)}</h3>
      ${l.address ? `<p style="margin: 0 0 0.25rem; font-size: 0.8rem; color: #6B6760;">${escapeHtml(l.address)}</p>` : ''}
      ${l.region ? `<p style="margin: 0 0 0.25rem; font-size: 0.75rem; color: #9B9690;">${escapeHtml(l.region)} &middot; ${escapeHtml(l.vertical || '')}</p>` : ''}
      ${l.description ? `<p style="margin: 0.5rem 0 0; font-size: 0.8rem; color: #6B6760; line-height: 1.4;">${escapeHtml(l.description).substring(0, 200)}${l.description.length > 200 ? '...' : ''}</p>` : ''}
      ${l.website ? `<p style="margin: 0.25rem 0 0; font-size: 0.75rem;"><a href="${escapeHtml(l.website)}" style="color: #8B7355;">${escapeHtml(l.website)}</a></p>` : ''}
    </div>
  `).join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(collection.name)}</title>
      <style>
        body { font-family: 'DM Sans', -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #1C1A17; }
        @media print { body { padding: 1rem; } }
      </style>
    </head>
    <body>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; border-bottom: 2px solid #E8E5DE; padding-bottom: 1rem;">
        <div>
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" style="height: 48px; margin-bottom: 0.5rem;" />` : ''}
          <p style="margin: 0; font-size: 0.85rem; color: #6B6760;">${escapeHtml(operator.business_name)}</p>
        </div>
        <p style="margin: 0; font-size: 0.75rem; color: #9B9690;">australianatlas.com.au</p>
      </div>
      <h1 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; font-size: 1.75rem; margin-bottom: 0.25rem;">${escapeHtml(collection.name)}</h1>
      ${collection.description ? `<p style="color: #6B6760; margin-bottom: 1rem;">${escapeHtml(collection.description)}</p>` : ''}
      ${collection.region ? `<p style="font-size: 0.85rem; color: #9B9690; margin-bottom: 1.5rem;">${escapeHtml(collection.region)} &middot; ${listings.length} venue${listings.length !== 1 ? 's' : ''}</p>` : ''}
      ${venueCards}
    </body>
    </html>
  `
}

function buildTrailHtml(trail, operator, logoUrl) {
  const stops = trail.trail_data?.stops || []
  const stopCards = stops.map((stop, i) => `
    <div style="border: 1px solid #E8E5DE; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; page-break-inside: avoid;">
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
        <span style="background: #1C1A17; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0;">${i + 1}</span>
        <h3 style="margin: 0; font-size: 1rem; color: #1C1A17;">${escapeHtml(stop.name || `Stop ${i + 1}`)}</h3>
      </div>
      ${stop.description ? `<p style="margin: 0; font-size: 0.8rem; color: #6B6760; line-height: 1.4;">${escapeHtml(stop.description)}</p>` : ''}
      ${stop.address ? `<p style="margin: 0.25rem 0 0; font-size: 0.75rem; color: #9B9690;">${escapeHtml(stop.address)}</p>` : ''}
    </div>
  `).join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(trail.name)}</title>
      <style>
        body { font-family: 'DM Sans', -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #1C1A17; }
        @media print { body { padding: 1rem; } }
      </style>
    </head>
    <body>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; border-bottom: 2px solid #E8E5DE; padding-bottom: 1rem;">
        <div>
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" style="height: 48px; margin-bottom: 0.5rem;" />` : ''}
          <p style="margin: 0; font-size: 0.85rem; color: #6B6760;">${escapeHtml(operator.business_name)}</p>
        </div>
        <p style="margin: 0; font-size: 0.75rem; color: #9B9690;">australianatlas.com.au</p>
      </div>
      <h1 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; font-size: 1.75rem; margin-bottom: 0.25rem;">${escapeHtml(trail.name)}</h1>
      ${trail.description ? `<p style="color: #6B6760; margin-bottom: 0.5rem;">${escapeHtml(trail.description)}</p>` : ''}
      <p style="font-size: 0.85rem; color: #9B9690; margin-bottom: 1.5rem;">
        ${trail.days ? `${trail.days} day${trail.days !== 1 ? 's' : ''}` : ''}
        ${trail.region ? ` &middot; ${escapeHtml(trail.region)}` : ''}
        ${stops.length ? ` &middot; ${stops.length} stop${stops.length !== 1 ? 's' : ''}` : ''}
      </p>
      ${stopCards}
    </body>
    </html>
  `
}

export async function POST(request) {
  try {
    // ── Authenticate via Supabase session ─────────────────────
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()

    const { data: operator, error: opError } = await sb
      .from('operator_accounts')
      .select('id, business_name, logo_url')
      .eq('user_id', user.id)
      .single()

    if (opError || !operator) {
      return NextResponse.json({ error: 'Operator account not found' }, { status: 401 })
    }

    const { type, id, logo_url } = await request.json()

    if (!type || !id) {
      return NextResponse.json({ error: 'type and id are required' }, { status: 400 })
    }

    const logoToUse = logo_url || operator.logo_url || null

    // ── Collection export ────────────────────────────────────
    if (type === 'collection') {
      const { data: collection, error: colError } = await sb
        .from('operator_collections')
        .select('name, description, region, listing_ids')
        .eq('id', id)
        .eq('operator_id', operator.id)
        .single()

      if (colError || !collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }

      // Fetch listing details
      let listings = []
      if (collection.listing_ids && collection.listing_ids.length > 0) {
        const { data: listingData } = await sb
          .from('listings')
          .select('id, name, description, region, vertical, lat, lng, website, hero_image_url, address')
          .in('id', collection.listing_ids)

        const listingMap = new Map((listingData || []).map(l => [l.id, l]))
        listings = collection.listing_ids
          .map(lid => listingMap.get(lid))
          .filter(Boolean)
      }

      const html = buildCollectionHtml(collection, listings, operator, logoToUse)
      const filename = `${collection.name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.html`

      // Log activity
      await sb.from('operator_activity').insert({
        operator_id: operator.id,
        action: 'pdf_exported',
        metadata: { type: 'collection', collection_id: id, name: collection.name },
      })

      return NextResponse.json({ html, filename })
    }

    // ── Trail export ─────────────────────────────────────────
    if (type === 'trail') {
      const { data: trail, error: trailError } = await sb
        .from('operator_trails')
        .select('name, description, trail_data, days, region')
        .eq('id', id)
        .eq('operator_id', operator.id)
        .single()

      if (trailError || !trail) {
        return NextResponse.json({ error: 'Trail not found' }, { status: 404 })
      }

      const html = buildTrailHtml(trail, operator, logoToUse)
      const filename = `${trail.name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.html`

      // Log activity
      await sb.from('operator_activity').insert({
        operator_id: operator.id,
        action: 'pdf_exported',
        metadata: { type: 'trail', trail_id: id, name: trail.name },
      })

      return NextResponse.json({ html, filename })
    }

    return NextResponse.json({ error: 'type must be collection or trail' }, { status: 400 })
  } catch (err) {
    console.error('[operators/export/pdf] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
