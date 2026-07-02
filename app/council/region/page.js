'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, PageHeader, SectionTitle, StatCard, EmptyState, Pill, Button, Skeleton, regionMapImage } from '@/components/council/ui'
import CouncilRegionTools from '@/components/council/CouncilRegionTools'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const TH_STYLE = {
  textAlign: 'left',
  padding: '0.75rem 1.25rem',
  color: 'var(--color-muted)',
  fontWeight: 600,
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
}

export default function CouncilRegion() {
  const { council, regions } = useCouncil()
  const searchParams = useSearchParams()
  const regionSlug = searchParams.get('r')
  const [regionData, setRegionData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const region = regions.find(r => r.slug === regionSlug) || regions[0]

  // Reset page when region changes
  useEffect(() => { setPage(1) }, [region?.slug])

  useEffect(() => {
    if (!region) { setLoading(false); return }
    setLoading(true)

    fetch(`/api/council/data?view=listings&region=${region.slug}&page=${page}`)
      .then(r => r.json())
      .then(d => { setRegionData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [region?.slug, page])

  if (!council) return null

  const perPage = regionData?.perPage || 50
  const totalPages = Math.ceil((regionData?.totalListings || 0) / perPage)

  return (
    <div>
      <PageHeader
        title={region?.name || 'Region'}
        subtitle={region
          ? `${region.state}${region.description ? ` · ${region.description.slice(0, 120)}…` : ''}`
          : undefined}
      />

      {/* Region hero */}
      {region && regionMapImage(region) && (
        <Card style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', height: 180, background: `url(${regionMapImage(region, { width: 1000, height: 200 })}) center/cover` }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(28,26,23,0) 45%, rgba(28,26,23,0.62) 100%)' }} />
            <p style={{
              position: 'absolute', left: '1.35rem', bottom: '1rem', margin: 0,
              fontFamily: 'var(--font-display)', fontSize: '1.55rem', fontWeight: 440,
              color: '#fff', letterSpacing: '-0.01em', textShadow: '0 1px 10px rgba(28,26,23,0.4)',
            }}>
              {region.name}
            </p>
          </div>
        </Card>
      )}

      {/* Region selector if multiple */}
      {regions.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {regions.map(r => (
            <Pill key={r.slug} href={`/council/region?r=${r.slug}`} active={r.slug === region?.slug}>
              {r.name}
            </Pill>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.75rem',
      }}>
        <StatCard label="Listings" value={regionData?.totalListings || region?.listing_count || 0} />
        <StatCard label="Articles" value={region?.article_count || 0} />
      </div>

      {/* Listings table */}
      <section style={{ marginBottom: '2rem' }}>
        <SectionTitle>Listings in {region?.name}</SectionTitle>

        {loading ? (
          <Skeleton height={280} />
        ) : !regionData?.listings?.length ? (
          <EmptyState title="No listings yet">
            No listings found in this region.
          </EmptyState>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={TH_STYLE}>Name</th>
                    <th style={TH_STYLE}>Vertical</th>
                    <th style={TH_STYLE}>Location</th>
                    <th style={TH_STYLE}>Website</th>
                  </tr>
                </thead>
                <tbody>
                  {regionData.listings.map(listing => (
                    <tr key={listing.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.65rem 1.25rem', color: 'var(--color-ink)', fontWeight: 500 }}>
                        {listing.name}
                      </td>
                      <td style={{ padding: '0.65rem 1.25rem', color: 'var(--color-muted)' }}>
                        {VERTICAL_LABELS[listing.vertical] || listing.vertical}
                      </td>
                      <td style={{ padding: '0.65rem 1.25rem', color: 'var(--color-muted)' }}>
                        {listing.suburb}{listing.state ? `, ${listing.state}` : ''}
                      </td>
                      <td style={{ padding: '0.65rem 1.25rem' }}>
                        {listing.website ? (
                          <a href={listing.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-sage-dark)', fontSize: '0.8rem', fontWeight: 550, textDecoration: 'none' }}>
                            Visit →
                          </a>
                        ) : (
                          <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {regionData.totalListings > regionData.perPage && (
              <div style={{
                padding: '0.75rem 1.25rem',
                borderTop: '1px solid var(--color-border)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.78rem',
                color: 'var(--color-muted)',
                textAlign: 'center',
              }}>
                Showing {regionData.listings.length} of {regionData.totalListings.toLocaleString('en-AU')} listings
              </div>
            )}
          </Card>
        )}

        {/* Pagination */}
        {regionData?.totalListings > perPage && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem', marginTop: '1.5rem' }}>
            <Button
              variant="secondary"
              small
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Previous
            </Button>
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.82rem',
              color: 'var(--color-muted)',
              padding: '0 0.35rem',
              fontVariantNumeric: 'tabular-nums',
            }}>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              small
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
            >
              Next →
            </Button>
          </div>
        )}
      </section>

      {/* Embed + report tools for the selected region */}
      {region && <CouncilRegionTools regions={[region]} />}
    </div>
  )
}
