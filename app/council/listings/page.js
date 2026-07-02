'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'
import { Card, PageHeader, EmptyState, Pill, Button, Skeleton } from '@/components/council/ui'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

export default function CouncilListings() {
  const { council, regions } = useCouncil()
  const [listings, setListings] = useState([])
  const [totalListings, setTotalListings] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedVertical, setSelectedVertical] = useState('')
  const [page, setPage] = useState(1)
  const [nameFilter, setNameFilter] = useState('')

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

  const exportQuery = [
    selectedRegion && `region=${encodeURIComponent(selectedRegion)}`,
    selectedVertical && `vertical=${encodeURIComponent(selectedVertical)}`,
  ].filter(Boolean).join('&')
  const exportHref = `/api/council/export${exportQuery ? `?${exportQuery}` : ''}`

  // Client-side name search over the currently loaded page only — no API changes.
  const query = nameFilter.trim().toLowerCase()
  const visibleListings = query
    ? listings.filter(l => (l.name || '').toLowerCase().includes(query))
    : listings

  const totalPages = Math.ceil(totalListings / 50)

  return (
    <div>
      <PageHeader title="Listings" subtitle="Browse all listings in your managed regions.">
        <Button href={exportHref} variant="secondary" small>Export CSV</Button>
      </PageHeader>

      {/* Region filter */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {regions.map(r => (
          <Pill
            key={r.slug}
            active={selectedRegion === r.slug}
            onClick={() => { setSelectedRegion(r.slug); setPage(1) }}
          >
            {r.name}
          </Pill>
        ))}
      </div>

      {/* Vertical filter */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <Pill active={!selectedVertical} onClick={() => { setSelectedVertical(''); setPage(1) }}>
          All verticals
        </Pill>
        {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
          <Pill
            key={key}
            active={selectedVertical === key}
            onClick={() => { setSelectedVertical(key); setPage(1) }}
          >
            {label}
          </Pill>
        ))}
      </div>

      {/* Name search (this page only) + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <label htmlFor="listing-name-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          Search listings by name
        </label>
        <input
          id="listing-name-search"
          type="search"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder="Search by name…"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--color-ink)',
            padding: '0.6rem 0.75rem',
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            background: 'var(--color-card-bg)',
            outline: 'none',
            width: 240,
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted)', margin: 0 }}>
          {totalListings.toLocaleString('en-AU')} listing{totalListings !== 1 ? 's' : ''} found
          {query && (
            <span style={{ color: 'var(--color-accent)', fontWeight: 550 }}>
              {' '}· {visibleListings.length} of {listings.length} on this page match &ldquo;{nameFilter.trim()}&rdquo;
            </span>
          )}
        </p>
      </div>

      {/* Listings grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          <Skeleton height={220} /><Skeleton height={220} /><Skeleton height={220} />
        </div>
      ) : listings.length === 0 ? (
        <EmptyState title="Nothing here yet">
          No listings match your filters.
        </EmptyState>
      ) : visibleListings.length === 0 ? (
        <EmptyState title="No matches on this page">
          No listings on this page match &ldquo;{nameFilter.trim()}&rdquo;. Try another page or clear the search.
        </EmptyState>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}>
          {visibleListings.map(listing => (
            <Card key={listing.id} hover style={{ padding: 0, overflow: 'hidden' }}>
              {listing.hero_image_url && (
                <div style={{
                  height: 140,
                  background: `url(${listing.hero_image_url}) center/cover`,
                  borderBottom: '1px solid var(--color-border)',
                }} />
              )}
              <div style={{ padding: '1rem 1.25rem' }}>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--color-sage-dark)',
                  margin: '0 0 0.3rem',
                }}>
                  {VERTICAL_LABELS[listing.vertical] || listing.vertical}
                </p>
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.05rem',
                  fontWeight: 450,
                  color: 'var(--color-ink)',
                  margin: '0 0 0.2rem',
                  lineHeight: 1.25,
                }}>
                  {listing.name}
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.78rem',
                  color: 'var(--color-muted)',
                  margin: 0,
                }}>
                  {listing.suburb}{listing.state ? `, ${listing.state}` : ''}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalListings > 50 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem', marginTop: '1.75rem' }}>
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
    </div>
  )
}
