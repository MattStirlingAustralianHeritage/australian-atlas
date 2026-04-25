'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getListingRegion } from '@/lib/regions'

const VERTICAL_COLORS = {
  sba: '#6b3a2a',
  collection: '#5a6b7c',
  craft: '#7c6b5a',
  fine_grounds: '#5F8A7E',
  rest: '#8a5a6b',
  field: '#5a7c5a',
  corner: '#7c5a7c',
  found: '#5a7c6b',
  table: '#7c6b5a',
}

const VERTICAL_NAMES = {
  sba: 'Small Batch',
  collection: 'Culture Atlas',
  craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds',
  rest: 'Boutique Stays',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

export default function ForYouClient({ listings: initialListings, isLoggedIn }) {
  const [listings, setListings] = useState(initialListings)

  async function handleDismiss(listingId) {
    // Optimistically remove from UI
    setListings(prev => prev.filter(l => l.id !== listingId))

    try {
      await fetch('/api/for-you/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId }),
      })
    } catch (err) {
      console.error('Failed to dismiss:', err)
    }
  }

  if (listings.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '4rem 1rem',
        border: '1px dashed var(--color-border)',
        borderRadius: 12,
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          color: 'var(--color-muted)',
          margin: '0 0 0.5rem',
        }}>
          No recommendations yet.
        </p>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Browse some places to get personalised suggestions.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '1.5rem',
    }}>
      {listings.map(listing => (
        <ForYouCard
          key={listing.id}
          listing={listing}
          isLoggedIn={isLoggedIn}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  )
}

function ForYouCard({ listing, isLoggedIn, onDismiss }) {
  const verticalColor = VERTICAL_COLORS[listing.vertical] || '#666'
  const verticalName = VERTICAL_NAMES[listing.vertical] || listing.vertical
  const hasImage = !!listing.hero_image_url

  return (
    <div style={{
      position: 'relative',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid var(--color-border)',
      background: '#fff',
      transition: 'box-shadow 0.2s, transform 0.2s',
    }}>
      {/* Dismiss button */}
      {isLoggedIn && (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDismiss(listing.id)
          }}
          aria-label="Not for me"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            fontSize: '1rem',
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.75)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
        >
          &times;
        </button>
      )}

      <Link
        href={`/place/${listing.slug}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        {/* Hero image or typographic fallback */}
        {hasImage ? (
          <div style={{
            height: 280,
            backgroundImage: `url(${listing.hero_image_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }} />
        ) : (
          <div style={{
            height: 280,
            background: verticalColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#fff',
              textAlign: 'center',
              lineHeight: 1.3,
            }}>
              {listing.name}
            </span>
          </div>
        )}

        {/* Card body */}
        <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
          {/* Vertical badge */}
          <span style={{
            display: 'inline-block',
            padding: '0.2rem 0.6rem',
            borderRadius: 999,
            fontSize: '0.65rem',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            background: verticalColor,
            color: '#fff',
            marginBottom: '0.5rem',
          }}>
            {verticalName}
          </span>

          {/* Name */}
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--color-ink)',
            margin: '0 0 0.35rem',
            lineHeight: 1.3,
          }}>
            {listing.name}
          </h3>

          {/* Region, State */}
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'var(--color-muted)',
            margin: 0,
          }}>
            {[getListingRegion(listing)?.name, listing.state].filter(Boolean).join(', ')}
          </p>
        </div>
      </Link>
    </div>
  )
}
