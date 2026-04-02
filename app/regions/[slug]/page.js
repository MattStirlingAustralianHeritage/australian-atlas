import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ListingCard from '@/components/ListingCard'
import { getVerticalBadge } from '@/lib/verticalUrl'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'

async function getRegion(slug) {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('regions').select('*').eq('slug', slug).single()
  return data
}

async function getRegionListings(region) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('listings')
    .select('id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, website')
    .eq('status', 'active')
    .eq('region', region)
    .order('is_featured', { ascending: false })
    .order('name')
    .limit(100)
  return data || []
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const region = await getRegion(slug)
  if (!region) return { title: 'Region not found' }
  return {
    title: `${region.name} — Australian Atlas`,
    description: region.description || `Discover independent places in ${region.name}`,
  }
}

export default async function RegionPage({ params }) {
  const { slug } = await params
  const region = await getRegion(slug)
  if (!region) notFound()

  const listings = await getRegionListings(region.name)

  // Count by vertical
  const verticalCounts = {}
  for (const l of listings) {
    verticalCounts[l.vertical] = (verticalCounts[l.vertical] || 0) + 1
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', color: 'var(--color-muted)' }}>
        <Link href="/regions" className="hover:text-[var(--color-ink)] transition-colors">Regions</Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-ink)]">{region.name}</span>
      </nav>

      {/* Region header */}
      <div className="max-w-2xl">
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>{region.state}</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontStyle: 'italic' }} className="text-3xl sm:text-4xl text-[var(--color-ink)] mt-1">{region.name}</h1>
        {region.description && (
          <p className="mt-3 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', color: 'var(--color-muted)' }}>{region.description}</p>
        )}
      </div>

      {/* Vertical breakdown — colored pills */}
      {Object.keys(verticalCounts).length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {Object.entries(verticalCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([v, count]) => {
              const vs = VERTICAL_STYLES[v]
              return (
                <span
                  key={v}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: vs?.bg || '#F1EFE8', color: vs?.text || '#5F5E5A', fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px' }}
                >
                  {vs?.label || getVerticalBadge(v)} <strong style={{ fontWeight: 600 }}>{count}</strong>
                </span>
              )
            })}
        </div>
      )}

      {/* Listings */}
      {listings.length > 0 ? (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {listings.map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="mt-10 text-center py-16">
          <p className="text-[var(--color-muted)]">No listings synced for this region yet.</p>
          <p className="text-sm text-[var(--color-muted)] mt-1">Listings will appear here once the first sync runs.</p>
        </div>
      )}
    </div>
  )
}
