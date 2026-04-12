import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] })
  }

  const sb = getSupabaseAdmin()
  const prefix = q.trim()

  try {
    // Parallel queries: name matches, suburb matches, region matches
    const [nameRes, suburbRes, regionRes] = await Promise.all([
      sb.from('listings')
        .select('id, name, slug, vertical, region, state, suburb')
        .eq('status', 'active')
        .or(`name.ilike.${prefix}%,name.ilike.% ${prefix}%`)
        .order('quality_score', { ascending: false, nullsFirst: false })
        .order('is_claimed', { ascending: false })
        .limit(6),

      sb.from('listings')
        .select('suburb, state, region')
        .eq('status', 'active')
        .not('suburb', 'is', null)
        .ilike('suburb', `${prefix}%`)
        .limit(20),

      sb.from('regions')
        .select('name, state, slug')
        .ilike('name', `${prefix}%`)
        .limit(5),
    ])

    // Deduplicate suburbs
    const seenSuburbs = new Set()
    const suburbs = (suburbRes.data || [])
      .filter(s => {
        const key = `${s.suburb}|${s.state}`
        if (seenSuburbs.has(key)) return false
        seenSuburbs.add(key)
        return true
      })
      .slice(0, 3)
      .map(s => ({
        type: 'suburb',
        label: s.suburb,
        state: s.state,
        region: s.region,
      }))

    const places = (nameRes.data || []).map(l => ({
      type: 'place',
      id: l.id,
      label: l.name,
      slug: l.slug,
      vertical: l.vertical,
      region: l.region,
      state: l.state,
      suburb: l.suburb,
    }))

    const regions = (regionRes.data || []).map(r => ({
      type: 'region',
      label: r.name,
      slug: r.slug,
      state: r.state,
    }))

    return NextResponse.json({
      results: [...places, ...suburbs, ...regions],
    })
  } catch (err) {
    console.error('[autocomplete] Error:', err)
    return NextResponse.json({ results: [] })
  }
}
