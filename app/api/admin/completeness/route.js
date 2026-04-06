import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const vertical = searchParams.get('vertical') || null
  const maxScore = searchParams.get('max_score') ? parseInt(searchParams.get('max_score'), 10) : null

  try {
    const sb = getSupabaseAdmin()

    // Fetch summary counts
    const { data: allScores, error: scoresErr } = await sb
      .from('listing_scores')
      .select('score, vertical')

    if (scoresErr) throw scoresErr

    // Calculate tier counts (optionally filtered by vertical)
    const filtered = vertical
      ? allScores.filter(s => s.vertical === vertical)
      : allScores

    const summary = {
      total: filtered.length,
      critical: filtered.filter(s => s.score < 40).length,
      incomplete: filtered.filter(s => s.score >= 40 && s.score < 70).length,
      good: filtered.filter(s => s.score >= 70).length,
      averageScore: filtered.length > 0
        ? Math.round(filtered.reduce((sum, s) => sum + s.score, 0) / filtered.length)
        : 0,
      byVertical: {},
    }

    // Per-vertical breakdown
    const verticals = [...new Set(allScores.map(s => s.vertical))]
    for (const v of verticals) {
      const vScores = allScores.filter(s => s.vertical === v)
      summary.byVertical[v] = {
        total: vScores.length,
        critical: vScores.filter(s => s.score < 40).length,
        incomplete: vScores.filter(s => s.score >= 40 && s.score < 70).length,
        good: vScores.filter(s => s.score >= 70).length,
        avg: vScores.length > 0
          ? Math.round(vScores.reduce((sum, s) => sum + s.score, 0) / vScores.length)
          : 0,
      }
    }

    // Fetch listings below threshold (default: below 70) with listing names
    let query = sb
      .from('listing_scores')
      .select('listing_id, vertical, score, missing_fields, improvement_note, calculated_at')
      .order('score', { ascending: true })
      .limit(200)

    if (vertical) {
      query = query.eq('vertical', vertical)
    }

    const threshold = maxScore !== null ? maxScore : 70
    query = query.lt('score', threshold)

    const { data: lowScores, error: lowErr } = await query

    if (lowErr) throw lowErr

    // Fetch listing names for the low-score rows
    let listings = []
    if (lowScores && lowScores.length > 0) {
      const ids = lowScores.map(s => s.listing_id)
      const { data: listingData } = await sb
        .from('listings')
        .select('id, name, slug, state, region')
        .in('id', ids)

      const nameMap = {}
      for (const l of (listingData || [])) {
        nameMap[l.id] = l
      }

      listings = lowScores.map(s => ({
        ...s,
        name: nameMap[s.listing_id]?.name || 'Unknown',
        slug: nameMap[s.listing_id]?.slug || '',
        state: nameMap[s.listing_id]?.state || '',
        region: nameMap[s.listing_id]?.region || '',
      }))
    }

    return NextResponse.json({ summary, listings })
  } catch (err) {
    console.error('[admin/completeness] GET error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
