import { getSupabaseAdmin } from '@/lib/supabase/clients'
import AuditActions from './AuditActions'
import AuditFilters from './AuditFilters'

export const metadata = { title: 'Data Audit Review — Admin' }
export const dynamic = 'force-dynamic'

const VERT_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

const VERT_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

// Severity order: red > amber > grey
const SEVERITY = { red: 3, amber: 2, grey: 1 }

/**
 * Build an array of { text, severity, category } reasons for a listing
 * based on all available flag data.
 */
function buildReasons(listing, duplicateMap) {
  const reasons = []
  const flags = listing.staleness_flags || {}

  // ── Website issues (red) ─────────────────────────────────
  if (flags.url_dead) {
    const status = flags.url_status ? ` (${flags.url_status})` : ''
    reasons.push({ text: `Website returning ${flags.url_status || '404'}${status ? '' : ' — unreachable'}`, severity: 'red', category: 'website' })
  } else if (listing.hidden_reason === 'dead_url') {
    reasons.push({ text: 'Website confirmed dead', severity: 'red', category: 'website' })
  } else if (listing.hidden_reason === 'no_website') {
    reasons.push({ text: 'No website URL available', severity: 'amber', category: 'website' })
  }

  if (flags.hero_image_status === 'dead') {
    reasons.push({ text: 'Hero image URL is broken', severity: 'amber', category: 'data_quality' })
  }

  // ── Independence / editorial concerns (amber) ────────────
  if (flags.editorial_removed) {
    const detail = flags.editorial_removed_reason || 'editorial concern'
    reasons.push({ text: `Editorially removed — ${detail}`, severity: 'amber', category: 'independence' })
  }

  if (flags.chain_affiliation || flags.independence_flag) {
    reasons.push({ text: 'Flagged in independence audit — possible chain venue', severity: 'amber', category: 'independence' })
  }

  if (flags.hotel_restaurant) {
    reasons.push({ text: 'Hotel chain affiliation detected', severity: 'amber', category: 'independence' })
  }

  if (listing.hidden_reason === 'chain' || listing.hidden_reason === 'hotel_restaurant') {
    reasons.push({ text: 'Hotel/chain affiliation — not independent', severity: 'amber', category: 'independence' })
  }

  // ── Duplicates (amber) ───────────────────────────────────
  const dupes = duplicateMap[listing.id] || []
  for (const dupe of dupes) {
    reasons.push({
      text: `Possible duplicate of ${dupe.otherName}`,
      severity: 'amber',
      category: 'duplicates',
    })
  }

  // ── Geocoding issues (red) ───────────────────────────────
  if (flags.geocoding_mismatch) {
    const dist = flags.geocoding_distance_km ? `${Math.round(flags.geocoding_distance_km)}km` : 'far'
    reasons.push({ text: `Coordinates placed ${dist} from stated suburb`, severity: 'red', category: 'geocoding' })
  }

  if (!listing.lat || !listing.lng) {
    reasons.push({ text: 'Missing coordinates', severity: 'amber', category: 'geocoding' })
  }

  // ── Data quality (grey) ──────────────────────────────────
  const missing = []
  if (!listing.description) missing.push('no description')
  if (!listing.hero_image_url) missing.push('no image')
  if (!listing.phone) missing.push('no phone')
  if (missing.length >= 2) {
    reasons.push({ text: missing.join(', '), severity: 'grey', category: 'data_quality' })
  }

  if (listing.quality_score !== null && listing.quality_score < 25) {
    reasons.push({ text: `Very low quality score (${listing.quality_score}/100)`, severity: 'grey', category: 'data_quality' })
  }

  // ── Community reports ────────────────────────────────────
  if (listing.community_reports > 0) {
    reasons.push({ text: `${listing.community_reports} community report${listing.community_reports > 1 ? 's' : ''}`, severity: 'amber', category: 'website' })
  }

  // ── Fallback: hidden with no specific reason ─────────────
  if (reasons.length === 0 && listing.hidden_reason) {
    reasons.push({ text: `Hidden: ${listing.hidden_reason}`, severity: 'grey', category: 'data_quality' })
  }

  if (reasons.length === 0) {
    reasons.push({ text: 'Status: hidden (reason not recorded)', severity: 'grey', category: 'data_quality' })
  }

  // Sort by severity (most severe first)
  reasons.sort((a, b) => (SEVERITY[b.severity] || 0) - (SEVERITY[a.severity] || 0))

  return reasons
}

const SEVERITY_STYLES = {
  red: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  amber: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  grey: { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
}

export default async function AuditReviewPage() {
  const sb = getSupabaseAdmin()

  // Fetch hidden listings with all flag data
  const { data: listings } = await sb
    .from('listings')
    .select('id, source_id, name, slug, website, state, region, address, lat, lng, status, vertical, sub_type, description, hero_image_url, phone, quality_score, staleness_flags, hidden_reason, community_reports, created_at')
    .eq('status', 'hidden')
    .order('vertical')
    .order('name')

  const items = listings || []

  // Fetch pending duplicate pairs for these listings
  const listingIds = items.map(l => l.id)
  let duplicateMap = {} // listing_id -> [{ otherName, otherSlug }]

  if (listingIds.length > 0) {
    const { data: dupesA } = await sb
      .from('duplicate_pairs')
      .select('listing_a_id, listing_b_id')
      .eq('status', 'pending')
      .in('listing_a_id', listingIds)

    const { data: dupesB } = await sb
      .from('duplicate_pairs')
      .select('listing_a_id, listing_b_id')
      .eq('status', 'pending')
      .in('listing_b_id', listingIds)

    const allDupes = [...(dupesA || []), ...(dupesB || [])]

    // Build lookup of other-side listing names
    const otherIds = new Set()
    for (const d of allDupes) {
      otherIds.add(d.listing_a_id)
      otherIds.add(d.listing_b_id)
    }

    let nameMap = {}
    if (otherIds.size > 0) {
      const { data: nameData } = await sb
        .from('listings')
        .select('id, name, slug')
        .in('id', [...otherIds])

      for (const n of (nameData || [])) {
        nameMap[n.id] = n
      }
    }

    for (const d of allDupes) {
      // For listing_a_id
      if (listingIds.includes(d.listing_a_id)) {
        if (!duplicateMap[d.listing_a_id]) duplicateMap[d.listing_a_id] = []
        const other = nameMap[d.listing_b_id]
        if (other) duplicateMap[d.listing_a_id].push({ otherName: other.name, otherSlug: other.slug })
      }
      // For listing_b_id
      if (listingIds.includes(d.listing_b_id)) {
        if (!duplicateMap[d.listing_b_id]) duplicateMap[d.listing_b_id] = []
        const other = nameMap[d.listing_a_id]
        if (other) duplicateMap[d.listing_b_id].push({ otherName: other.name, otherSlug: other.slug })
      }
    }
  }

  // Build reasons for each listing
  const itemsWithReasons = items.map(listing => ({
    ...listing,
    reasons: buildReasons(listing, duplicateMap),
    primaryCategory: buildReasons(listing, duplicateMap)[0]?.category || 'data_quality',
  }))

  // Count by category
  const categoryCounts = { all: itemsWithReasons.length, website: 0, independence: 0, duplicates: 0, data_quality: 0, geocoding: 0 }
  for (const item of itemsWithReasons) {
    for (const r of item.reasons) {
      if (categoryCounts[r.category] !== undefined) categoryCounts[r.category]++
    }
  }
  // Dedupe per category per listing
  const categoryListingCounts = { website: new Set(), independence: new Set(), duplicates: new Set(), data_quality: new Set(), geocoding: new Set() }
  for (const item of itemsWithReasons) {
    for (const r of item.reasons) {
      if (categoryListingCounts[r.category]) categoryListingCounts[r.category].add(item.id)
    }
  }
  const filterCounts = {
    all: itemsWithReasons.length,
    website: categoryListingCounts.website.size,
    independence: categoryListingCounts.independence.size,
    duplicates: categoryListingCounts.duplicates.size,
    data_quality: categoryListingCounts.data_quality.size,
    geocoding: categoryListingCounts.geocoding.size,
  }

  // Vertical summary
  const byVertical = {}
  for (const l of itemsWithReasons) {
    if (!byVertical[l.vertical]) byVertical[l.vertical] = []
    byVertical[l.vertical].push(l)
  }

  // Serialize for client component
  const serializedItems = itemsWithReasons.map(l => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    vertical: l.vertical,
    sub_type: l.sub_type,
    region: l.region,
    state: l.state,
    website: l.website,
    address: l.address,
    reasons: l.reasons,
  }))

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 28,
          color: 'var(--color-ink)',
          marginBottom: 4,
        }}>
          Data Audit Review
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          Listings flagged during data integrity audits. Each card shows why it was flagged.
        </p>
      </div>

      {/* Summary badges */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 24,
        flexWrap: 'wrap',
      }}>
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: '#FCE4B8',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
            {itemsWithReasons.length}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Awaiting Review
          </p>
        </div>
        {Object.entries(byVertical).map(([vert, arr]) => (
          <div key={vert} style={{
            padding: '14px 20px',
            borderRadius: 8,
            background: (VERT_COLORS[vert] || '#888') + '18',
            border: `1px solid ${VERT_COLORS[vert] || '#888'}30`,
            textAlign: 'center',
            minWidth: 100,
          }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: VERT_COLORS[vert] || '#888', margin: 0 }}>
              {arr.length}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
              {VERT_NAMES[vert] || vert}
            </p>
          </div>
        ))}
      </div>

      {/* Client-side filterable list */}
      <AuditFilters
        items={serializedItems}
        filterCounts={filterCounts}
        vertNames={VERT_NAMES}
        vertColors={VERT_COLORS}
      />
    </div>
  )
}
