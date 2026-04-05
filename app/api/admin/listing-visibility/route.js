import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Verticals that do NOT require a website URL
const WEBSITE_EXEMPT_VERTICALS = ['field', 'collection']

function checkAdmin(cookieStore) {
  const token = cookieStore.get('atlas_admin')?.value
    || cookieStore.get('admin_auth')?.value
  if (!token) return false
  return token === 'admin_authenticated' || token === process.env.ADMIN_PASSWORD
}

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
  if (!checkAdmin(cookieStore)) {
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

      const { error } = await sb
        .from('listings')
        .update({
          status: 'inactive',
          hidden_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error

      return NextResponse.json({ hidden: true })
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

      // URL is valid — reinstate
      const { error } = await sb
        .from('listings')
        .update({
          status: 'active',
          hidden_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error

      return NextResponse.json({ reinstated: true, url_status: urlCheck.statusCode })
    }

    // ── Force reinstate (admin override, no URL check) ──
    if (action === 'force_reinstate') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

      const { error } = await sb
        .from('listings')
        .update({
          status: 'active',
          hidden_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error

      return NextResponse.json({ reinstated: true, forced: true })
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

      // Count first
      const { count } = await sb
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('vertical', vertical)
        .eq('status', 'active')
        .or('website.is.null,website.eq.')

      if (!count || count === 0) {
        return NextResponse.json({ hidden: 0, message: 'No listings to hide' })
      }

      // Hide them
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

      return NextResponse.json({ hidden: count })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[admin/listing-visibility] POST error:', err.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
