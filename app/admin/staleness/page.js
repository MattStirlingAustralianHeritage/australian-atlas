import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

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

function getVerticalLabel(key) {
  return VERTICALS.find(v => v.key === key)?.label || key
}

function formatDate(dateStr) {
  if (!dateStr) return '\u2014'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getStalenessLabel(lastVerifiedAt) {
  if (!lastVerifiedAt) return 'Unverified'
  const months = (Date.now() - new Date(lastVerifiedAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
  if (months < 6) return 'Fresh'
  if (months < 12) return 'Ageing'
  return 'Stale'
}

function getStatusBadge(status) {
  const colors = {
    live: { bg: '#f0fff4', color: '#276749', border: '#c6e9c6' },
    dead: { bg: '#fef2f2', color: '#c53030', border: '#f5c6c6' },
    redirect: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
    timeout: { bg: '#fefce8', color: '#854d0e', border: '#fef08a' },
    unchecked: { bg: '#f7f7f7', color: '#888', border: '#e5e5e5' },
  }
  const c = colors[status] || colors.unchecked
  return { ...c, label: status || 'unchecked' }
}

export default async function StalenessPage({ searchParams }) {
  // Auth handled by middleware — no page-level check needed
  const params = await searchParams
  const filterVertical = params?.vertical || null
  const filterRegion = params?.region || null
  const filterStatus = params?.status || null

  const sb = getSupabaseAdmin()

  let allListings = []
  let listings = []
  const tiers = { fresh: 0, ageing: 0, stale: 0, dead: 0 }

  const now = Date.now()
  const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000
  const twelveMonths = 12 * 30 * 24 * 60 * 60 * 1000

  try {
    // Fetch all active listings for summary computation
    const { data: summaryData } = await sb
      .from('listings')
      .select('id, last_verified_at, website_status')
      .eq('status', 'active')

    allListings = summaryData || []

    // Compute tier counts
    for (const l of allListings) {
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

    // Build filtered query for the table
    let query = sb
      .from('listings')
      .select('id, name, vertical, region, last_verified_at, website_status, website, website_checked_at')
      .eq('status', 'active')
      .order('last_verified_at', { ascending: true, nullsFirst: true })
      .limit(200)

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
    }

    const { data: filteredData } = await query
    listings = filteredData || []
  } catch (err) {
    console.error('[admin/staleness] Query error:', err.message)
    // Continue with empty state rather than crashing
  }

  const total = allListings.length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream, #F5F1EB)', fontFamily: 'var(--font-sans, system-ui)' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--color-border, #E5E0D8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Link href="/admin" style={{ textDecoration: 'none', color: 'var(--color-muted, #8B8578)', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Admin
          </Link>
          <h1 style={{ fontFamily: 'var(--font-serif, Georgia)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: '0.25rem 0 0' }}>
            Listing Staleness
          </h1>
        </div>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-muted, #8B8578)' }}>
          {total} active listings
        </span>
      </div>

      <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
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
                <option value="fresh">Fresh (&lt; 6mo)</option>
                <option value="ageing">Ageing (6-12mo)</option>
                <option value="stale">Stale (&gt; 12mo)</option>
                <option value="dead">Dead URL</option>
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

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border, #E5E0D8)' }}>
                  <Th>Name</Th>
                  <Th>Vertical</Th>
                  <Th>Region</Th>
                  <Th>Last Verified</Th>
                  <Th>URL Status</Th>
                  <Th>Website</Th>
                </tr>
              </thead>
              <tbody>
                {(listings || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted, #8B8578)' }}>
                      No listings match the current filters.
                    </td>
                  </tr>
                ) : (
                  (listings || []).map(listing => {
                    const staleness = getStalenessLabel(listing.last_verified_at)
                    const badge = getStatusBadge(listing.website_status)
                    const stalenessColors = {
                      Fresh: { bg: '#f0fff4', color: '#276749' },
                      Ageing: { bg: '#fffbeb', color: '#92400e' },
                      Stale: { bg: '#fef2f2', color: '#9B1C1C' },
                      Unverified: { bg: '#f7f7f7', color: '#888' },
                    }
                    const sc = stalenessColors[staleness] || stalenessColors.Unverified

                    return (
                      <tr key={listing.id} style={{ borderBottom: '1px solid var(--color-border, #E5E0D8)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--color-ink, #2D2A26)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {listing.name}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-muted, #8B8578)' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {getVerticalLabel(listing.vertical)}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-muted, #8B8578)' }}>
                          {listing.region || '\u2014'}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            background: sc.bg,
                            color: sc.color,
                          }}>
                            {staleness}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-muted, #8B8578)', marginTop: '0.15rem' }}>
                            {formatDate(listing.last_verified_at)}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          {listing.website ? (
                            <span style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '999px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                            }}>
                              {badge.label}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted, #8B8578)' }}>
                              No URL
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {listing.website ? (
                            <a
                              href={listing.website.startsWith('http') ? listing.website : `https://${listing.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--color-muted, #8B8578)', fontSize: '0.8rem', textDecoration: 'underline' }}
                            >
                              {listing.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--color-muted, #8B8578)' }}>{'\u2014'}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Th({ children }) {
  return (
    <th style={{
      padding: '0.75rem 1rem',
      textAlign: 'left',
      fontWeight: 600,
      color: 'var(--color-muted, #8B8578)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontSize: '0.7rem',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
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
      <p style={{ fontSize: '2rem', fontWeight: 600, color, margin: '0 0 0.25rem', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-serif, Georgia)' }}>
        {count}
      </p>
      <p style={{ fontSize: '0.7rem', color: 'var(--color-muted, #8B8578)', margin: 0 }}>
        {sublabel}
      </p>
    </Link>
  )
}
