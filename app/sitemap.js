import { getSupabaseAdmin } from '@/lib/supabase/clients'

const SITE_URL = 'https://australianatlas.com.au'

export default async function sitemap() {
  const supabase = getSupabaseAdmin()

  // Static pages
  const staticPages = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/map`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/search`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/explore`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/trails`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/regions`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/events`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/events/submit`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/for-councils`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  ]

  // Region pages
  const { data: regions } = await supabase
    .from('regions')
    .select('slug, updated_at')

  const regionPages = (regions || []).map(r => ({
    url: `${SITE_URL}/regions/${r.slug}`,
    lastModified: r.updated_at ? new Date(r.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // Trail pages
  const { data: trails } = await supabase
    .from('trails')
    .select('slug, updated_at')
    .eq('published', true)

  const trailPages = (trails || []).map(t => ({
    url: `${SITE_URL}/trails/${t.slug}`,
    lastModified: t.updated_at ? new Date(t.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // Event pages
  const { data: events } = await supabase
    .from('events')
    .select('slug, updated_at')
    .gte('event_date', new Date().toISOString())

  const eventPages = (events || []).map(e => ({
    url: `${SITE_URL}/events/${e.slug}`,
    lastModified: e.updated_at ? new Date(e.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // Listing pages (native /place/[slug] pages)
  const { data: listings } = await supabase
    .from('listings')
    .select('slug, updated_at')
    .eq('status', 'active')

  const listingPages = (listings || []).map(l => ({
    url: `${SITE_URL}/place/${l.slug}`,
    lastModified: l.updated_at ? new Date(l.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticPages, ...regionPages, ...trailPages, ...eventPages, ...listingPages]
}
