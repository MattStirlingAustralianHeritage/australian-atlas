import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { updateListing } from '@/lib/admin/updateListing'
import { updateInVertical } from '@/lib/sync/pushToVertical'

// Verticals that do NOT require a website URL
const WEBSITE_EXEMPT_VERTICALS = ['field', 'collection']

/**
 * Check if a URL returns a 200 response within 10s.
 * Returns { ok: boolean, statusCode: number, error?: string }
 */
async function checkUrlHealth(url) {
  if (!url) return { ok: false, statusCode: 0, error: 'No URL provided' }

  const target = url.startsWith('http') ? url : `https://${url}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(target, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'AustralianAtlas-LinkChecker/1.0',
      },
    })

    clearTimeout(timeout)

    if (res.status >= 200 && res.status < 400) {
      return { ok: true, statusCode: res.status }
    }

    return { ok: false, statusCode: res.status, error: `URL returned ${res.status}` }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, statusCode: 0, error: 'URL timed out after 10s' }
    }
    return { ok: false, statusCode: 0, error: `Fetch failed: ${err.message}` }
  }
}

// ─── POST handler ────────────────────────────────────────

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action } = body
    const sb = getSupabaseAdmin()

    // ── Hide a listing ──
    if (action === 'hide') {
      const { id, reason } = body
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      if (!reason) return NextResponse.json({ error: 'Missing reason' }, { status: 400 })

      // Use canonical update for status change + vertical sync
      const result = await updateListing(id, { status: 'inactive' }, { action: 'hide' })
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      // Write hidden_reason separately (master-only metadata, not synced to verticals)
      await sb.from('listings').update({ hidden_reason: reason }).eq('id', id)

      return NextResponse.json({ hidden: true, sync: result.verticalSync })
    }

    // ── Reinstate a listing (with URL check) ──
    if (action === 'reinstate') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

      // Get the listing's website
      const { data: listing } = await sb
        .from('listings')
        .select('website, vertical')
        .eq('id', id)
        .single()

      if (!listing) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }

      // Check if the listing has a website
      if (!listing.website || listing.website.trim() === '') {
        return NextResponse.json({
          error: 'Cannot reinstate: listing has no website URL. Add a website first or use force_reinstate.',
        }, { status: 400 })
      }

      // Check the URL health
      const urlCheck = await checkUrlHealth(listing.website)
      if (!urlCheck.ok) {
        return NextResponse.json({
          error: `Cannot reinstate: website check failed. ${urlCheck.error}`,
          url_status: urlCheck.statusCode,
        }, { status: 400 })
      }

      // URL is valid — reinstate with vertical sync
      const result = await updateListing(id, { status: 'active' }, { action: 'reinstate' })
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      // Clear hidden_reason (master-only metadata)
      await sb.from('listings').update({ hidden_reason: null }).eq('id', id)

      return NextResponse.json({ reinstated: true, url_status: urlCheck.statusCode, sync: result.verticalSync })
    }

    // ── Force reinstate (admin override, no URL check) ──
    if (action === 'force_reinstate') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

      // Force reinstate with vertical sync (no URL check)
      const result = await updateListing(id, { status: 'active' }, { action: 'force_reinstate' })
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      // Clear hidden_reason (master-only metadata)
      await sb.from('listings').update({ hidden_reason: null }).eq('id', id)

      return NextResponse.json({ reinstated: true, forced: true, sync: result.verticalSync })
    }

    // ── Audit: count listings per vertical that would be hidden ──
    if (action === 'audit') {
      const counts = {}
      let total = 0

      // Get all active listings with no website, grouped by vertical
      const { data: rows } = await sb
        .from('listings')
        .select('vertical')
        .eq('status', 'active')
        .or('website.is.null,website.eq.')

      if (rows) {
        for (const row of rows) {
          // Skip exempt verticals
          if (WEBSITE_EXEMPT_VERTICALS.includes(row.vertical)) continue
          counts[row.vertical] = (counts[row.vertical] || 0) + 1
          total++
        }
      }

      return NextResponse.json({ counts, total })
    }

    // ── Bulk hide: hide all active listings in a vertical with no website ──
    if (action === 'bulk_hide') {
      const { vertical } = body
      if (!vertical) return NextResponse.json({ error: 'Missing vertical' }, { status: 400 })

      if (WEBSITE_EXEMPT_VERTICALS.includes(vertical)) {
        return NextResponse.json({
          error: `Vertical "${vertical}" is exempt from website requirement`,
        }, { status: 400 })
      }

      // Fetch affected listings BEFORE updating (need vertical/source_id for sync)
      const { data: affectedListings } = await sb
        .from('listings')
        .select('id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url')
        .eq('vertical', vertical)
        .eq('status', 'active')
        .or('website.is.null,website.eq.')

      if (!affectedListings || affectedListings.length === 0) {
        return NextResponse.json({ hidden: 0, message: 'No listings to hide' })
      }

      // Bulk master update
      const { error } = await sb
        .from('listings')
        .update({
          status: 'inactive',
          hidden_reason: 'no_website',
          updated_at: new Date().toISOString(),
        })
        .eq('vertical', vertical)
        .eq('status', 'active')
        .or('website.is.null,website.eq.')

      if (error) throw error

      // Sync each affected listing to its vertical (set hidden/draft status)
      let syncSuccess = 0
      const syncable = affectedListings.filter(l => l.source_id && !String(l.source_id).startsWith('candidate-'))
      await Promise.allSettled(syncable.map(async (l) => {
        try {
          const syncData = {
            name: l.name, slug: l.slug, description: l.description,
            region: l.region, state: l.state, lat: l.lat, lng: l.lng,
            website: l.website, phone: l.phone, address: l.address,
            hero_image_url: l.hero_image_url, suburb: l.region,
            _hidden: true,
          }
          const result = await updateInVertical(l.vertical, l.source_id, syncData)
          if (result.success) syncSuccess++
        } catch (err) {
          console.warn(`[listing-visibility] bulk_hide sync failed for ${l.id}:`, err.message)
        }
      }))

      return NextResponse.json({ hidden: affectedListings.length, synced: syncSuccess })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[admin/listing-visibility] POST error:', err.message)
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 })
  }
}
