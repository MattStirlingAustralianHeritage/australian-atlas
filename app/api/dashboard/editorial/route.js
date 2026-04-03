import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function GET() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // First get the network data to find user's venues
  const networkRes = await fetch(new URL('/api/dashboard/network', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'), {
    headers: { cookie: '' },
  }).catch(() => null)

  // Instead, query directly for user's claimed listings
  const { data: userListings } = await admin
    .from('listings')
    .select('id, name, slug, vertical, source_id, region, state')
    .eq('is_claimed', true)

  // For now, we filter by checking articles that mention these venues
  const venueNames = userListings?.map((l) => l.name).filter(Boolean) || []
  const venueIds = userListings?.map((l) => String(l.id)).filter(Boolean) || []

  let articles = []
  let regions = []

  if (venueNames.length > 0) {
    // Search articles for mentions of venue names
    // Use text search on body column
    for (const name of venueNames.slice(0, 10)) {
      const { data: found } = await admin
        .from('articles')
        .select('id, title, slug, vertical, excerpt, published_at, hero_image_url, region')
        .ilike('body', `%${name}%`)
        .limit(5)

      if (found?.length) {
        articles.push(...found.map((a) => ({ ...a, matchedVenue: name })))
      }
    }

    // Also check listing_tags array for venue IDs
    for (const vid of venueIds.slice(0, 10)) {
      const { data: tagged } = await admin
        .from('articles')
        .select('id, title, slug, vertical, excerpt, published_at, hero_image_url, region')
        .contains('listing_tags', [vid])
        .limit(5)

      if (tagged?.length) {
        articles.push(...tagged.map((a) => ({ ...a, matchedVenue: 'tagged' })))
      }
    }

    // Deduplicate articles by id
    const seen = new Set()
    articles = articles.filter((a) => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })

    // Get unique regions where user has venues
    const regionNames = [...new Set(userListings.map((l) => l.region).filter(Boolean))]
    if (regionNames.length > 0) {
      const { data: regionData } = await admin
        .from('regions')
        .select('id, name, slug, vertical, state')
        .in('name', regionNames)
        .limit(20)
      regions = regionData || []
    }
  }

  return NextResponse.json({ articles, regions, venueCount: venueNames.length })
}
