import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getPublicVerticals } from '@/lib/verticalUrl'
import { relationHasVerticals } from '@/lib/listings/verticalFilter'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'
import RegionMap from '@/components/RegionMap'

// Live, embeddable region map for council websites. Reads live (like the public
// site) — no snapshotting, no caching beyond normal. Frame-locking is lifted for
// /embed/* in next.config.mjs so this can be iframed from any origin.
//
// Serves PUBLISHED listing data only (status='active', not needs_review, not a
// test fixture, public venue verticals) for ONE published region. It never reads
// analytics, council-account data, or another region's listings.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const sb = getSupabaseAdmin()
  const { data: region } = await sb
    .from('regions').select('name, state').eq('slug', slug).eq('status', 'live').maybeSingle()
  const name = region?.name || 'Region'
  return {
    title: `Independent operators in ${name} — Australian Atlas`,
    // Widget, not a destination page — keep it out of the index.
    robots: { index: false, follow: false },
  }
}

// Published map points for a region — mirrors the public region page's map
// (app/regions/[slug] getRegionListings): listings_with_region, FK-attributed,
// public venue verticals only (Way is surfaced separately and excluded here too).
async function getPublishedPoints(sb, region) {
  const hasVerticals = await relationHasVerticals(sb, 'listings_with_region')
  const venueVerticals = getPublicVerticals().filter((v) => v !== 'way')
  const select = `name, slug, vertical, lat, lng${hasVerticals ? ', verticals' : ''}`
  let q = excludeNeedsReview(excludeTestListings(
    sb.from('listings_with_region')
      .select(select)
      .eq('status', 'active')
      .eq('region_id', region.id)
      .not('lat', 'is', null)
      .not('lng', 'is', null),
  ))
  q = hasVerticals ? q.overlaps('verticals', venueVerticals) : q.in('vertical', venueVerticals)
  const { data, error } = await q.limit(1000)
  if (error) throw error
  return (data || [])
    .filter((l) => l.lat && l.lng)
    .map((l) => ({ lat: l.lat, lng: l.lng, name: l.name, vertical: l.vertical, slug: l.slug }))
}

export default async function RegionEmbed({ params }) {
  const { slug } = await params
  const sb = getSupabaseAdmin()

  // Only published (status='live') regions are exposable — matches every other
  // public region surface. Draft regions 404.
  const { data: region } = await sb
    .from('regions').select('id, name, slug, state').eq('slug', slug).eq('status', 'live').maybeSingle()
  if (!region) notFound()

  const points = await getPublishedPoints(sb, region)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--color-bg, #fff)' }}>
      {/* Strip site chrome for the bare widget. Injected from the embed page only
          (so it never affects other routes) and present in the SSR HTML, so there
          is no flash of nav/footer before hydration. The site nav/footer are the
          only <nav class="sticky">/<footer> on this page. */}
      <style>{`nav.sticky, footer, a.skip-link { display: none !important; }
        html, body { margin: 0; background: var(--color-bg, #fff); }
        main#main-content { display: flex; flex-direction: column; }`}</style>
      {points.length > 0 ? (
        <RegionMap points={points} regionName={region.name} fill />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', fontSize: '0.9rem', margin: 0 }}>
            No published listings in {region.name} yet.
          </p>
        </div>
      )}

      {/* Minimal attribution — the only chrome. Opens in a new tab so a click
          never navigates the embedded widget itself. */}
      <a
        href={`https://www.australianatlas.com.au/regions/${region.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
          padding: '0.5rem 0.75rem',
          borderTop: '1px solid var(--color-border)',
          background: '#fff',
          textDecoration: 'none',
          fontFamily: 'var(--font-body)',
          fontSize: '0.72rem',
          color: 'var(--color-muted)',
        }}
      >
        Powered by <strong style={{ color: 'var(--color-ink)', fontWeight: 600 }}>Australian&nbsp;Atlas</strong>
      </a>
    </div>
  )
}
