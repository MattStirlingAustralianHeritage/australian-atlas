'use client'

import Link from 'next/link'
import { useAuth } from '../layout'
import { getListingRegion } from '@/lib/regions'
import { getVerticalUrl, getVerticalBadge, VERTICAL_ACCENTS } from '@/lib/verticalUrl'

// My Listings reads the SAME canonical source as the Overview and the sidebar:
// the operator's owned listings (listing_claims → /api/dashboard), lifted into
// the dashboard layout and shared via context. The previous version queried each
// vertical's legacy vendor_profiles/claims tables, which the current claim flow
// no longer writes — so a fully-claimed listing showed here as "none". One source
// of truth keeps the whole dashboard talking about the same venue.

function StatusPill({ children, tone }) {
  const tones = {
    live: { bg: '#dcfce7', fg: '#166534' },
    paid: { bg: '#dbeafe', fg: '#1e40af' },
    free: { bg: '#f3f4f6', fg: '#6b7280' },
    featured: { bg: '#fce7f3', fg: '#9d174d' },
  }
  const t = tones[tone] || tones.free
  return (
    <span style={{
      display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px',
      fontSize: '0.7rem', fontFamily: 'var(--font-sans)', fontWeight: 500,
      background: t.bg, color: t.fg,
    }}>
      {children}
    </span>
  )
}

function ListingCard({ listing }) {
  const accent = VERTICAL_ACCENTS[listing.vertical] || 'var(--color-sage)'
  const region = getListingRegion(listing)
  const location = [region?.name, listing.state].filter(Boolean).join(', ')
  const editUrl = `/dashboard/listings/${listing.id}/edit`

  return (
    <div style={{
      background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border)',
      padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      {/* Vertical badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: accent, display: 'inline-block', flexShrink: 0 }} />
        <span style={{
          fontFamily: 'var(--font-sans)', fontSize: '0.72rem', fontWeight: 600,
          color: accent, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {getVerticalBadge(listing.vertical)}
        </span>
      </div>

      {/* Venue name */}
      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>
        {listing.name}
      </h3>

      {/* Region / State */}
      {location && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.825rem', color: 'var(--color-muted)', margin: 0 }}>
          {location}
        </p>
      )}

      {/* Status badges */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <StatusPill tone="live">Claimed &amp; live</StatusPill>
        <StatusPill tone={listing.paid ? 'paid' : 'free'}>{listing.paid ? 'Standard' : 'Free'}</StatusPill>
        {listing.is_featured && <StatusPill tone="featured">Featured</StatusPill>}
      </div>

      {/* Listing-scoped tools — the side-nav actions, pointed at THIS listing */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
        <Link href={editUrl} style={primaryBtn}>Edit listing</Link>
        <Link href="/dashboard/description" style={ghostBtn}>Your description</Link>
        <a href={getVerticalUrl(listing.vertical, listing.slug)} target="_blank" rel="noopener noreferrer" style={ghostBtn}>
          View on site
        </a>
      </div>

      {/* Not-paid nudge — editing is a Standard-plan feature */}
      {!listing.paid && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.25rem 0 0', lineHeight: 1.5 }}>
          Your listing is live. Activate Standard to edit its details, photos and hours.
        </p>
      )}
    </div>
  )
}

export default function DashboardListings() {
  const { listings, listingsLoading } = useAuth()

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
          My Listings
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--color-muted)', margin: 0 }}>
          Venues you have claimed across the Atlas network
        </p>
      </div>

      {listingsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '1.5rem' }}>
              <div style={{ width: '40%', height: '10px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '1rem' }} />
              <div style={{ width: '70%', height: '14px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '0.75rem' }} />
              <div style={{ width: '50%', height: '10px', background: 'var(--color-border)', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '3rem 2rem', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
            No claimed listings yet
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
            Find your venue on any Atlas site and claim it — it will appear here once your claim is approved.
          </p>
          <Link href="/explore" style={primaryBtn}>Find your listing</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {listings.map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  )
}

const primaryBtn = {
  display: 'inline-block', padding: '0.5rem 1rem', borderRadius: '8px',
  border: '1px solid var(--color-ink)', background: 'var(--color-ink)', color: '#fff',
  fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 500,
  textDecoration: 'none', cursor: 'pointer',
}

const ghostBtn = {
  display: 'inline-block', padding: '0.5rem 1rem', borderRadius: '8px',
  border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)',
  fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 500,
  textDecoration: 'none', cursor: 'pointer',
}
