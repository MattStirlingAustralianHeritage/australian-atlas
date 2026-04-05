import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import StalenessTable from './StalenessTable'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Listing Staleness | Admin | Australian Atlas',
}

const VERTICALS = [
  { key: 'sba', label: 'Small Batch' },
  { key: 'collection', label: 'Collection' },
  { key: 'craft', label: 'Craft' },
  { key: 'fine_grounds', label: 'Fine Grounds' },
  { key: 'rest', label: 'Rest' },
  { key: 'field', label: 'Field' },
  { key: 'corner', label: 'Corner' },
  { key: 'found', label: 'Found' },
  { key: 'table', label: 'Table' },
]

export default async function StalenessPage({ searchParams }) {
  const params = await searchParams
  const filterVertical = params?.vertical || null
  const filterRegion = params?.region || null
  const filterStatus = params?.status || null

  const sb = getSupabaseAdmin()

  let allListings = []
  let listings = []
  const tiers = { claimedStale: 0, fresh: 0, ageing: 0, stale: 0, dead: 0, hidden: 0 }

  const now = Date.now()
  const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000
  const twelveMonths = 12 * 30 * 24 * 60 * 60 * 1000

  try {
    // Fetch all active listings for summary computation
    const { data: summaryData } = await sb
      .from('listings')
      .select('id, last_verified_at, website_status, is_claimed')
      .eq('status', 'active')

    allListings = summaryData || []

    // Compute tier counts
    for (const l of allListings) {
      // Check if this is a claimed listing that is stale or unverified
      const isStaleOrUnverified = !l.last_verified_at ||
        (now - new Date(l.last_verified_at).getTime()) >= twelveMonths

      if (l.is_claimed && isStaleOrUnverified) {
        tiers.claimedStale++
      }

      if (l.website_status === 'dead') {
        tiers.dead++
        continue
      }
      if (!l.last_verified_at) {
        tiers.stale++
        continue
      }
      const age = now - new Date(l.last_verified_at).getTime()
      if (age < sixMonths) tiers.fresh++
      else if (age < twelveMonths) tiers.ageing++
      else tiers.stale++
    }

    // Count hidden listings
    const { count: hiddenCount } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('hidden_reason', 'no_website')
      .eq('status', 'inactive')

    tiers.hidden = hiddenCount || 0

    // Build filtered query for the table
    // Sort: claimed first, then featured, then least-recently-verified first
    let query = sb
      .from('listings')
      .select('id, name, vertical, region, last_verified_at, website_status, website, website_checked_at, is_claimed, is_featured, website_status_code, removal_flagged, removal_flagged_at, hidden_reason')
      .order('is_claimed', { ascending: false })
      .order('is_featured', { ascending: false })
      .order('last_verified_at', { ascending: true, nullsFirst: true })
      .limit(200)

    // Only filter to active listings when NOT viewing hidden
    if (filterStatus === 'hidden') {
      query = query.eq('hidden_reason', 'no_website').eq('status', 'inactive')
    } else {
      query = query.eq('status', 'active')
    }

    if (filterVertical) {
      query = query.eq('vertical', filterVertical)
    }
    if (filterRegion) {
      query = query.ilike('region', `%${filterRegion}%`)
    }
    if (filterStatus === 'dead') {
      query = query.eq('website_status', 'dead')
    } else if (filterStatus === 'fresh') {
      query = query.gte('last_verified_at', new Date(now - sixMonths).toISOString())
    } else if (filterStatus === 'ageing') {
      query = query.lt('last_verified_at', new Date(now - sixMonths).toISOString())
      query = query.gte('last_verified_at', new Date(now - twelveMonths).toISOString())
    } else if (filterStatus === 'stale') {
      query = query.or('last_verified_at.is.null,last_verified_at.lt.' + new Date(now - twelveMonths).toISOString())
    } else if (filterStatus === 'claimed_stale') {
      query = query.eq('is_claimed', true)
      query = query.or('last_verified_at.is.null,last_verified_at.lt.' + new Date(now - twelveMonths).toISOString())
    }

    const { data: filteredData } = await query
    listings = filteredData || []
  } catch (err) {
    console.error('[admin/staleness] Query error:', err.message)
  }

  const total = allListings.length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream, #F5F1EB)', fontFamily: 'var(--font-body, system-ui)' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--color-border, #E5E0D8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Link href="/admin" style={{ textDecoration: 'none', color: 'var(--color-muted, #8B8578)', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Admin
          </Link>
          <h1 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: '0.25rem 0 0' }}>
            Listing Staleness
          </h1>
        </div>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-muted, #8B8578)' }}>
          {total} active listings
        </span>
      </div>

      <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <TierCard
            label="Claimed/Stale"
            sublabel="Claimed but stale or unverified"
            count={tiers.claimedStale}
            color="#c53030"
            bg="#fef2f2"
            border="#f5c6c6"
            href="/admin/staleness?status=claimed_stale"
            active={filterStatus === 'claimed_stale'}
          />
          <TierCard
            label="Fresh"
            sublabel="Verified < 6 months"
            count={tiers.fresh}
            color="#276749"
            bg="#f0fff4"
            border="#c6e9c6"
            href="/admin/staleness?status=fresh"
            active={filterStatus === 'fresh'}
          />
          <TierCard
            label="Ageing"
            sublabel="Verified 6-12 months"
            count={tiers.ageing}
            color="#92400e"
            bg="#fffbeb"
            border="#fde68a"
            href="/admin/staleness?status=ageing"
            active={filterStatus === 'ageing'}
          />
          <TierCard
            label="Stale"
            sublabel="Unverified or > 12 months"
            count={tiers.stale}
            color="#9B1C1C"
            bg="#fef2f2"
            border="#f5c6c6"
            href="/admin/staleness?status=stale"
            active={filterStatus === 'stale'}
          />
          <TierCard
            label="Dead URL"
            sublabel="Website returned 4xx/5xx"
            count={tiers.dead}
            color="#c53030"
            bg="#fef2f2"
            border="#fca5a5"
            href="/admin/staleness?status=dead"
            active={filterStatus === 'dead'}
          />
          <TierCard
            label="Hidden"
            sublabel="No website URL"
            count={tiers.hidden}
            color="#666"
            bg="#f7f7f7"
            border="#e5e5e5"
            href="/admin/staleness?status=hidden"
            active={filterStatus === 'hidden'}
          />
        </div>

        {/* Filters */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #E5E0D8)', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <form method="GET" action="/admin/staleness" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted, #8B8578)', marginBottom: '0.3rem' }}>
                Vertical
              </label>
              <select
                name="vertical"
                defaultValue={filterVertical || ''}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #E5E0D8)',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  color: 'var(--color-ink, #2D2A26)',
                  background: '#fff',
                  minWidth: '140px',
                }}
              >
                <option value="">All verticals</option>
                {VERTICALS.map(v => (
                  <option key={v.key} value={v.key}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted, #8B8578)', marginBottom: '0.3rem' }}>
                Region
              </label>
              <input
                name="region"
                defaultValue={filterRegion || ''}
                placeholder="e.g. Melbourne"
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #E5E0D8)',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  color: 'var(--color-ink, #2D2A26)',
                  minWidth: '160px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted, #8B8578)', marginBottom: '0.3rem' }}>
                Status
              </label>
              <select
                name="status"
                defaultValue={filterStatus || ''}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #E5E0D8)',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  color: 'var(--color-ink, #2D2A26)',
                  background: '#fff',
                  minWidth: '140px',
                }}
              >
                <option value="">All statuses</option>
                <option value="claimed_stale">Claimed/Stale</option>
                <option value="fresh">Fresh (&lt; 6mo)</option>
                <option value="ageing">Ageing (6-12mo)</option>
                <option value="stale">Stale (&gt; 12mo)</option>
                <option value="dead">Dead URL</option>
                <option value="hidden">Hidden (no website)</option>
              </select>
            </div>
            <button
              type="submit"
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--color-ink, #2D2A26)',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Filter
            </button>
            {(filterVertical || filterRegion || filterStatus) && (
              <Link
                href="/admin/staleness"
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #E5E0D8)',
                  background: '#fff',
                  fontSize: '0.85rem',
                  color: 'var(--color-muted, #8B8578)',
                  textDecoration: 'none',
                  fontFamily: 'inherit',
                }}
              >
                Clear
              </Link>
            )}
          </form>
        </div>

        {/* Listings Table */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #E5E0D8)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border, #E5E0D8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--color-ink, #2D2A26)' }}>
              Listings
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted, #8B8578)' }}>
              Showing {(listings || []).length} results
            </span>
          </div>

          <div style={{ padding: '0 0.5rem 0.5rem' }}>
            <StalenessTable initialListings={listings} />
          </div>
        </div>
      </div>
    </div>
  )
}

function TierCard({ label, sublabel, count, color, bg, border, href, active }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: active ? bg : '#fff',
        borderRadius: '12px',
        border: `1px solid ${active ? border : 'var(--color-border, #E5E0D8)'}`,
        padding: '1.25rem',
        textDecoration: 'none',
        transition: 'border-color 0.15s',
      }}
    >
      <p style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted, #8B8578)', margin: '0 0 0.375rem' }}>
        {label}
      </p>
      <p style={{ fontSize: '2rem', fontWeight: 600, color, margin: '0 0 0.25rem', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display, Georgia)' }}>
        {count}
      </p>
      <p style={{ fontSize: '0.7rem', color: 'var(--color-muted, #8B8578)', margin: 0 }}>
        {sublabel}
      </p>
    </Link>
  )
}
