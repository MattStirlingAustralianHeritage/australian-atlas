import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ItineraryEngine from './ItineraryEngine'

export const metadata = {
  title: 'Plan a trip · Australian Atlas',
  description:
    'Build a bespoke itinerary of independent Australian places — choose where you’re going and what you’re into, and let the map help you shape the trip, day by day.',
  alternates: { canonical: 'https://australianatlas.com.au/itinerary' },
}

export const dynamic = 'force-dynamic'

async function getRegions() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('regions')
      .select('slug, name, state, center_lat, center_lng, map_zoom, listing_count')
      .not('center_lat', 'is', null)
      .gt('listing_count', 0)
      .order('listing_count', { ascending: false })
    return data || []
  } catch {
    return []
  }
}

export default async function ItineraryPage({ searchParams }) {
  const [regions, sp] = await Promise.all([getRegions(), Promise.resolve(searchParams || {})])
  const initial = {
    q: typeof sp.q === 'string' ? sp.q : '',
    region: typeof sp.region === 'string' ? sp.region : '',
    days: typeof sp.days === 'string' ? sp.days : '',
  }

  return <ItineraryEngine regions={regions} initial={initial} />
}
