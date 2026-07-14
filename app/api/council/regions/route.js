// app/api/council/regions/route.js
// Public list of live regions for the council join-page autocomplete.
// Returns only public metadata (id, name, state, slug, listing_count) so a
// prospective council can pick the official region they represent instead of
// typing free text. Cached for an hour — the region set changes rarely.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const revalidate = 3600

export async function GET() {
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('regions')
      .select('id, name, state, slug, listing_count')
      .eq('status', 'live')
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json(
      { regions: data || [] },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    )
  } catch (err) {
    console.error('[council/regions] error:', err?.message || err)
    // Non-fatal: the form falls back to free-text entry if this fails.
    return NextResponse.json({ regions: [] }, { status: 200 })
  }
}
