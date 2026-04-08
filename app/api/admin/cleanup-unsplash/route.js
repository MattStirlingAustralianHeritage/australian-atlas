import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * POST /api/admin/cleanup-unsplash
 * Finds and nulls all Unsplash URLs across the master DB and all vertical DBs.
 * Only nulls hero_image_url fields containing 'unsplash.com'.
 * Preserves venue-uploaded images.
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dry_run') === 'true'

  const results = { master: null, verticals: {}, articles: null, trails: null, trail_stops: null }

  try {
    const sb = getSupabaseAdmin()

    // ── 1. Master listings table ──
    const { data: masterRows } = await sb
      .from('listings')
      .select('id, name, hero_image_url')
      .like('hero_image_url', '%unsplash.com%')

    results.master = { found: masterRows?.length || 0, cleaned: 0 }

    if (masterRows?.length > 0 && !dryRun) {
      const ids = masterRows.map(r => r.id)
      // Batch in groups of 100
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100)
        await sb
          .from('listings')
          .update({ hero_image_url: null })
          .in('id', batch)
      }
      results.master.cleaned = masterRows.length
    }

    // ── 2. Articles table ──
    try {
      const { data: articleRows } = await sb
        .from('articles')
        .select('id, title, hero_image_url')
        .like('hero_image_url', '%unsplash.com%')

      results.articles = { found: articleRows?.length || 0, cleaned: 0 }

      if (articleRows?.length > 0 && !dryRun) {
        const ids = articleRows.map(r => r.id)
        for (let i = 0; i < ids.length; i += 100) {
          await sb.from('articles').update({ hero_image_url: null }).in('id', ids.slice(i, i + 100))
        }
        results.articles.cleaned = articleRows.length
      }
    } catch {
      results.articles = { found: 0, cleaned: 0, error: 'table not found' }
    }

    // ── 3. Trails table ──
    try {
      const { data: trailRows } = await sb
        .from('trails')
        .select('id, title, cover_image_url')
        .like('cover_image_url', '%unsplash.com%')

      results.trails = { found: trailRows?.length || 0, cleaned: 0 }

      if (trailRows?.length > 0 && !dryRun) {
        const ids = trailRows.map(r => r.id)
        for (let i = 0; i < ids.length; i += 100) {
          await sb.from('trails').update({ cover_image_url: null }).in('id', ids.slice(i, i + 100))
        }
        results.trails.cleaned = trailRows.length
      }
    } catch {
      results.trails = { found: 0, cleaned: 0, error: 'table not found' }
    }

    // ── 4. Trail stops ──
    try {
      const { data: stopRows } = await sb
        .from('trail_stops')
        .select('id, venue_name, venue_image_url')
        .like('venue_image_url', '%unsplash.com%')

      results.trail_stops = { found: stopRows?.length || 0, cleaned: 0 }

      if (stopRows?.length > 0 && !dryRun) {
        const ids = stopRows.map(r => r.id)
        for (let i = 0; i < ids.length; i += 100) {
          await sb.from('trail_stops').update({ venue_image_url: null }).in('id', ids.slice(i, i + 100))
        }
        results.trail_stops.cleaned = stopRows.length
      }
    } catch {
      results.trail_stops = { found: 0, cleaned: 0, error: 'table not found' }
    }

    // ── 5. Vertical DBs ──
    const verticalKeys = Object.keys(VERTICAL_CONFIG)
    for (const vKey of verticalKeys) {
      try {
        const client = getVerticalClient(vKey)
        const config = VERTICAL_CONFIG[vKey]
        const tables = vKey === 'fine_grounds' ? ['roasters', 'cafes'] : [config.table || 'venues']

        let totalFound = 0
        let totalCleaned = 0

        for (const table of tables) {
          const { data: rows } = await client
            .from(table)
            .select('id, name, hero_image_url')
            .like('hero_image_url', '%unsplash.com%')

          totalFound += rows?.length || 0

          if (rows?.length > 0 && !dryRun) {
            const ids = rows.map(r => r.id)
            for (let i = 0; i < ids.length; i += 100) {
              await client.from(table).update({ hero_image_url: null }).in('id', ids.slice(i, i + 100))
            }
            totalCleaned += rows.length
          }
        }

        results.verticals[vKey] = { found: totalFound, cleaned: totalCleaned }
      } catch (err) {
        results.verticals[vKey] = { found: 0, cleaned: 0, error: err.message }
      }
    }

    const totalFound = results.master.found +
      (results.articles?.found || 0) +
      (results.trails?.found || 0) +
      (results.trail_stops?.found || 0) +
      Object.values(results.verticals).reduce((sum, v) => sum + v.found, 0)

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      total_unsplash_urls_found: totalFound,
      results,
    })
  } catch (err) {
    console.error('[cleanup-unsplash] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
