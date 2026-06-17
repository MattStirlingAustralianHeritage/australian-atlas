import { getSupabaseAdmin } from '@/lib/supabase/clients'
import InfringementReportsQueue from './InfringementReportsQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Infringement Reports — Admin' }

export default async function InfringementReportsPage() {
  // Auth handled by middleware.
  const sb = getSupabaseAdmin()

  let reports = []
  let assetsBySlug = {}

  try {
    // Always select('*') so a not-yet-applied migration degrades gracefully.
    const { data, error } = await sb
      .from('infringement_reports')
      .select('*')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      console.error('[admin/infringement-reports] reports query failed:', error.message)
    } else {
      reports = data || []
    }

    // Map the reported listing slugs → their provenance assets, so the admin can
    // take an asset down straight from the report.
    const slugs = [...new Set(reports.map((r) => r.listing_slug).filter(Boolean))]
    if (slugs.length) {
      const { data: listings } = await sb
        .from('listings')
        .select('id, slug, name')
        .in('slug', slugs)
      const idToSlug = {}
      const slugName = {}
      for (const l of listings || []) { idToSlug[l.id] = l.slug; slugName[l.slug] = l.name }
      const listingIds = Object.keys(idToSlug)
      if (listingIds.length) {
        const { data: assets } = await sb
          .from('asset_provenance')
          .select('id, listing_id, asset_kind, public_url, takedown_status, source_declaration, created_at')
          .in('listing_id', listingIds)
          .order('created_at', { ascending: false })
        for (const a of assets || []) {
          const slug = idToSlug[a.listing_id]
          if (!slug) continue
          ;(assetsBySlug[slug] ||= { name: slugName[slug] || slug, assets: [] }).assets.push(a)
        }
      }
    }
  } catch (err) {
    console.error('[admin/infringement-reports] load error:', err.message)
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontFamily: 'var(--font-display, serif)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink, #1a1614)', margin: '0 0 6px' }}>
        Infringement reports
      </h1>
      <p style={{ fontFamily: 'var(--font-body, sans-serif)', fontSize: 14, color: 'var(--color-muted, #6b6560)', margin: '0 0 28px' }}>
        Notice-and-takedown queue. {reports.length} active report{reports.length === 1 ? '' : 's'}.
      </p>
      <InfringementReportsQueue initialReports={reports} assetsBySlug={assetsBySlug} />
    </div>
  )
}
