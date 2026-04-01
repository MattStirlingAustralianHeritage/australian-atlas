import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ListingCard from '@/components/ListingCard'
import { getVerticalBadge } from '@/lib/verticalUrl'

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
      <nav className="text-sm text-[var(--color-muted)] mb-6">
        <Link href="/regions" className="hover:text-[var(--color-ink)] transition-colors">Regions</Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-ink)]">{region.name}</span>
      </nav>

      {/* Region header */}
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--color-sage)] uppercase tracking-wider">{region.state}</p>
        <h1 className="font-[family-name:var(--font-serif)] text-3xl sm:text-4xl font-bold mt-1">{region.name}</h1>
        {region.description && (
          <p className="mt-3 text-[var(--color-muted)] leading-relaxed">{region.description}</p>
        )}
      </div>

      {/* Vertical breakdown */}
      {Object.keys(verticalCounts).length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {Object.entries(verticalCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([v, count]) => (
              <span key={v} className="text-xs bg-white border border-[var(--color-border)] px-3 py-1.5 rounded-full">
                {getVerticalBadge(v)} <strong>{count}</strong>
              </span>
            ))}
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
