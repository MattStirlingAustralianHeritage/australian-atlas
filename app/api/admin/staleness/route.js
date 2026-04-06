import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

// ─── URL health check ────────────────────────────────────

async function checkUrl(url) {
  if (!url) return { status: 'error', statusCode: 0 }

  const target = url.startsWith('http') ? url : `https://${url}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(target, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'AustralianAtlas-LinkChecker/1.0',
      },
    })

    clearTimeout(timeout)

    const code = res.status

    if (code >= 200 && code < 300) return { status: 'live', statusCode: code }
    if (code === 301 || code === 302 || code === 307 || code === 308) return { status: 'redirect', statusCode: code }
    if (code === 404 || code === 410) return { status: 'dead', statusCode: code }
    if (code >= 500) return { status: 'error', statusCode: code }

    // Other 4xx — treat as error
    if (code >= 400) return { status: 'error', statusCode: code }

    return { status: 'live', statusCode: code }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { status: 'error', statusCode: 0 }
    }
    return { status: 'error', statusCode: 0 }
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

    // ── Single URL check ──
    if (action === 'check_url') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

      const { data: listing } = await sb
        .from('listings')
        .select('website')
        .eq('id', id)
        .single()

      if (!listing) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }

      const result = await checkUrl(listing.website)
      const checkedAt = new Date().toISOString()

      await sb
        .from('listings')
        .update({
          website_status: result.status,
          website_status_code: result.statusCode,
          website_checked_at: checkedAt,
        })
        .eq('id', id)

      return NextResponse.json({
        status: result.status,
        statusCode: result.statusCode,
        checkedAt,
      })
    }

    // ── Mark verified ──
    if (action === 'mark_verified') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

      const verifiedAt = new Date().toISOString()
      const { error } = await sb
        .from('listings')
        .update({ last_verified_at: verifiedAt })
        .eq('id', id)

      if (error) throw error

      return NextResponse.json({ verified: true, verifiedAt })
    }

    // ── Flag for removal ──
    if (action === 'flag_removal') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

      const { error } = await sb
        .from('listings')
        .update({
          removal_flagged: true,
          removal_flagged_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error

      return NextResponse.json({ flagged: true })
    }

    // ── Batch URL check ──
    if (action === 'batch_check_urls') {
      const { ids } = body
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'Missing or empty ids array' }, { status: 400 })
      }

      // Fetch all websites for the given IDs
      const { data: listings } = await sb
        .from('listings')
        .select('id, website')
        .in('id', ids)

      if (!listings) {
        return NextResponse.json({ error: 'No listings found' }, { status: 404 })
      }

      const results = []
      for (const listing of listings) {
        const result = await checkUrl(listing.website)
        const checkedAt = new Date().toISOString()

        await sb
          .from('listings')
          .update({
            website_status: result.status,
            website_status_code: result.statusCode,
            website_checked_at: checkedAt,
          })
          .eq('id', listing.id)

        results.push({
          id: listing.id,
          status: result.status,
          statusCode: result.statusCode,
        })
      }

      return NextResponse.json({ results })
    }

    // ── Batch verify ──
    if (action === 'batch_verify') {
      const { ids } = body
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'Missing or empty ids array' }, { status: 400 })
      }

      const verifiedAt = new Date().toISOString()
      const { error } = await sb
        .from('listings')
        .update({ last_verified_at: verifiedAt })
        .in('id', ids)

      if (error) throw error

      return NextResponse.json({ count: ids.length, verifiedAt })
    }

    // ── Batch flag ──
    if (action === 'batch_flag') {
      const { ids } = body
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'Missing or empty ids array' }, { status: 400 })
      }

      const { error } = await sb
        .from('listings')
        .update({
          removal_flagged: true,
          removal_flagged_at: new Date().toISOString(),
        })
        .in('id', ids)

      if (error) throw error

      return NextResponse.json({ count: ids.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[admin/staleness] POST error:', err.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
