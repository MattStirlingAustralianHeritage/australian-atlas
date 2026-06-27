'use client'

import { useState } from 'react'
import { useAuth } from '../layout'
import { getVerticalBadge } from '@/lib/verticalUrl'
import OperatorTrailBuilder from './OperatorTrailBuilder'

/**
 * /dashboard/trail — operator authors ONE suggested day-trip trail for a listing
 * they own, scoped to that listing's region, published on the listing page only.
 * The heavy lifting (language-led selection, ordering, gating, save/publish) is
 * in OperatorTrailBuilder; this wrapper resolves which owned listing to author for.
 */
export default function DashboardTrailPage() {
  const { listings, listingsLoading } = useAuth()
  const [activeId, setActiveId] = useState(null)

  if (listingsLoading) {
    return <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>Loading…</p>
  }

  if (!listings || listings.length === 0) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
          Suggested trail
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>
          Once you’ve claimed a listing, you can author a suggested day-trip trail for visitors here.
        </p>
      </div>
    )
  }

  const listing = listings.find(l => l.id === activeId) || listings[0]

  return (
    <div style={{ maxWidth: 760 }}>
      {listings.length > 1 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '0.4rem' }}>
            Author a trail for
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {listings.map(l => {
              const active = l.id === listing.id
              return (
                <button
                  key={l.id}
                  onClick={() => setActiveId(l.id)}
                  style={{
                    fontFamily: 'var(--font-sans)', fontSize: '0.85rem', cursor: 'pointer',
                    padding: '0.45rem 0.8rem', borderRadius: 999,
                    border: `1px solid ${active ? 'var(--color-ink)' : 'var(--color-border)'}`,
                    background: active ? 'var(--color-ink)' : '#fff',
                    color: active ? 'var(--color-cream)' : 'var(--color-ink)',
                  }}
                >
                  {l.name} <span style={{ opacity: 0.6 }}>· {getVerticalBadge(l.vertical)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <OperatorTrailBuilder key={listing.id} listingId={listing.id} listingName={listing.name} />
    </div>
  )
}
