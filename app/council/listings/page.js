'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

export default function CouncilListings() {
  const { council, regions } = useCouncil()
  const [listings, setListings] = useState([])
  const [totalListings, setTotalListings] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedVertical, setSelectedVertical] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (regions.length > 0 && !selectedRegion) {
      setSelectedRegion(regions[0].slug)
    }
  }, [regions])

  useEffect(() => {
    if (!selectedRegion) return
    setLoading(true)

    const params = new URLSearchParams({
      view: 'listings',
      region: selectedRegion,
      page: page.toString(),
    })
    if (selectedVertical) params.set('vertical', selectedVertical)

    fetch(`/api/council/data?${params}`)
      .then(r => r.json())
      .then(d => {
        setListings(d.listings || [])
        setTotalListings(d.totalListings || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedRegion, selectedVertical, page])

  if (!council) return null

  const pillStyle = (active) => ({
    padding: '0.35rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.8rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    background: active ? 'var(--color-ink)' : '#fff',
    color: active ? '#fff' : 'var(--color-muted)',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
  })

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          margin: '0 0 0.25rem',
        }}>
          Listings
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Browse all listings in your managed regions
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {regions.map(r => (
          <button
            key={r.slug}
            onClick={() => { setSelectedRegion(r.slug); setPage(1) }}
            style={pillStyle(selectedRegion === r.slug)}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button onClick={() => { setSelectedVertical(''); setPage(1) }} style={pillStyle(!selectedVertical)}>
          All verticals
        </button>
        {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setSelectedVertical(key); setPage(1) }}
            style={pillStyle(selectedVertical === key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Count */}
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
        color: 'var(--color-muted)',
        marginBottom: '1rem',
      }}>
        {totalListings} listing{totalListings !== 1 ? 's' : ''} found
      </p>

      {/* Listings grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading...</p>
        </div>
      ) : listings.length === 0 ? (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '3rem',
          textAlign: 'center',
        }}>
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>No listings match your filters.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}>
          {listings.map(listing => (
            <div key={listing.id} style={{
              background: '#fff',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
            }}>
              {listing.hero_image_url && (
                <div style={{
                  height: '140px',
                  background: `url(${listing.hero_image_url}) center/cover`,
                }} />
              )}
              <div style={{ padding: '1rem' }}>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-sage)',
                  margin: '0 0 0.25rem',
                }}>
                  {VERTICAL_LABELS[listing.vertical] || listing.vertical}
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  color: 'var(--color-ink)',
                  margin: '0 0 0.25rem',
                }}>
                  {listing.name}
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8rem',
                  color: 'var(--color-muted)',
                  margin: 0,
                }}>
                  {listing.suburb}{listing.state ? `, ${listing.state}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalListings > 50 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          marginTop: '2rem',
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: '#fff',
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: page === 1 ? 'var(--color-border)' : 'var(--color-ink)',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Previous
          </button>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--color-muted)',
            padding: '0.5rem 0.75rem',
          }}>
            Page {page} of {Math.ceil(totalListings / 50)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(totalListings / 50)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: '#fff',
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: page >= Math.ceil(totalListings / 50) ? 'var(--color-border)' : 'var(--color-ink)',
              cursor: page >= Math.ceil(totalListings / 50) ? 'not-allowed' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
