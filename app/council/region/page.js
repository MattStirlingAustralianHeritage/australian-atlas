'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

export default function CouncilRegion() {
  const { council, regions } = useCouncil()
  const searchParams = useSearchParams()
  const regionSlug = searchParams.get('r')
  const [regionData, setRegionData] = useState(null)
  const [loading, setLoading] = useState(true)

  const region = regions.find(r => r.slug === regionSlug) || regions[0]

  useEffect(() => {
    if (!region) { setLoading(false); return }

    fetch(`/api/council/data?view=listings&region=${region.slug}`)
      .then(r => r.json())
      .then(d => { setRegionData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [region?.slug])

  if (!council) return null

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          margin: '0 0 0.25rem',
        }}>
          {region?.name || 'Region'}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          {region?.state} · {region?.description?.slice(0, 120)}...
        </p>
      </div>

      {/* Region selector if multiple */}
      {regions.length > 1 && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}>
          {regions.map(r => (
            <a
              key={r.slug}
              href={`/council/region?r=${r.slug}`}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                textDecoration: 'none',
                background: r.slug === region?.slug ? 'var(--color-ink)' : '#fff',
                color: r.slug === region?.slug ? '#fff' : 'var(--color-ink)',
                border: '1px solid var(--color-border)',
              }}
            >
              {r.name}
            </a>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '0.75rem',
        marginBottom: '2rem',
      }}>
        <StatMini label="Listings" value={regionData?.totalListings || region?.listing_count || 0} />
        <StatMini label="Articles" value={region?.article_count || 0} />
      </div>

      {/* Listings table */}
      <section>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.15rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          margin: '0 0 1rem',
        }}>
          Listings in {region?.name}
        </h2>

        {loading ? (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading listings...</p>
          </div>
        ) : !regionData?.listings?.length ? (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>No listings found in this region.</p>
          </div>
        ) : (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: 'var(--color-muted)', fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: 'var(--color-muted)', fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vertical</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: 'var(--color-muted)', fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: 'var(--color-muted)', fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Website</th>
                  </tr>
                </thead>
                <tbody>
                  {regionData.listings.map(listing => (
                    <tr key={listing.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.625rem 1rem', color: 'var(--color-ink)', fontWeight: 500 }}>
                        {listing.name}
                      </td>
                      <td style={{ padding: '0.625rem 1rem', color: 'var(--color-muted)' }}>
                        {VERTICAL_LABELS[listing.vertical] || listing.vertical}
                      </td>
                      <td style={{ padding: '0.625rem 1rem', color: 'var(--color-muted)' }}>
                        {listing.suburb}{listing.state ? `, ${listing.state}` : ''}
                      </td>
                      <td style={{ padding: '0.625rem 1rem' }}>
                        {listing.website ? (
                          <a href={listing.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-sage)', fontSize: '0.8rem' }}>
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
                padding: '0.75rem 1rem',
                borderTop: '1px solid var(--color-border)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                color: 'var(--color-muted)',
                textAlign: 'center',
              }}>
                Showing {regionData.listings.length} of {regionData.totalListings} listings
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function StatMini({ label, value }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '10px',
      border: '1px solid var(--color-border)',
      padding: '1rem',
    }}>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '1.5rem',
        fontWeight: 600,
        color: 'var(--color-ink)',
        margin: '0 0 0.125rem',
      }}>
        {value.toLocaleString()}
      </p>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.7rem',
        color: 'var(--color-muted)',
        margin: 0,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </p>
    </div>
  )
}
