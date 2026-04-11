/**
 * Cross-vertical duplicate check API
 *
 * Given a candidate name and target vertical, checks whether a listing
 * with a similar name already exists in other related verticals.
 *
 * Primary use case: Table Atlas cafe candidates → check Fine Grounds Atlas
 *
 * GET /api/admin/candidates/cross-check?name=...&vertical=...
 */

import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Define which verticals to cross-check for each vertical
const CROSS_CHECK_MAP = {
  table: ['fine_grounds'],       // Cafes may overlap with Fine Grounds
  fine_grounds: ['table'],       // Coffee spots may overlap with Table Atlas
  sba: ['table'],                // Artisan producers may overlap with Table Atlas
  collection: ['craft'],         // Galleries may overlap with Craft Atlas
  craft: ['collection'],         // Art studios may overlap with Culture Atlas
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')
  const vertical = searchParams.get('vertical')

  if (!name || !vertical) {
    return Response.json({ matches: [] })
  }

  const checkVerticals = CROSS_CHECK_MAP[vertical]
  if (!checkVerticals || checkVerticals.length === 0) {
    return Response.json({ matches: [] })
  }

  try {
    const sb = getSupabaseAdmin()

    // Search for similar names in the cross-check verticals
    // Use ilike for case-insensitive partial match
    const cleanName = name.trim().replace(/[%_]/g, '')
    if (!cleanName) return Response.json({ matches: [] })

    const { data, error } = await sb
      .from('listings')
      .select('id, name, vertical, region, state, website, slug')
      .in('vertical', checkVerticals)
      .ilike('name', `%${cleanName}%`)
      .limit(5)

    if (error) {
      console.error('[cross-check] DB error:', error.message)
      return Response.json({ matches: [] })
    }

    const VERTICAL_DISPLAY = {
      sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
      fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
      corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
    }

    const matches = (data || []).map(listing => ({
      id: listing.id,
      name: listing.name,
      vertical: listing.vertical,
      verticalName: VERTICAL_DISPLAY[listing.vertical] || listing.vertical,
      region: listing.region,
      state: listing.state,
    }))

    return Response.json({ matches })
  } catch (err) {
    console.error('[cross-check] Error:', err.message)
    return Response.json({ matches: [] })
  }
}
