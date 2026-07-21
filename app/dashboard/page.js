'use client'

import Link from 'next/link'
import { getListingRegion } from '@/lib/regions'
import { getVerticalUrl, getVerticalBadge } from '@/lib/verticalUrl'
import { useAuth } from './layout'
import DualListingPopup from './DualListingPopup'
import UpgradeBanner from './UpgradeBanner'

function getPublicUrl(vertical, slug) {
  return getVerticalUrl(vertical, slug)
}

function getEditUrl(listingId) {
  return `/dashboard/listings/${listingId}/edit`
}

// "+40% vs prior 30 days" chip next to the views stat. Hidden until there is
// something to compare (no prior-period traffic yet).
function TrendChip({ current, previous }) {
  if (!previous && !current) return null
  if (!previous) {
    return (
      <span style={{
        fontFamily: 'var(--font-body, system-ui)', fontSize: 9, fontWeight: 600,
        color: 'var(--color-sage, #5f8a7e)',
      }}>
        New
      </span>
    )
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return null
  const up = pct > 0
  return (
    <span style={{
      fontFamily: 'var(--font-body, system-ui)', fontSize: 9, fontWeight: 600,
      color: up ? 'var(--color-sage, #5f8a7e)' : '#A33A2A',
    }}>
      {up ? '↑' : '↓'}{Math.abs(pct)}%
    </span>
  )
}

function CompletenessChecklist({ listing }) {
  const editUrl = getEditUrl(listing.id)

  const checks = [
    {
      field: 'description',
      label: 'Description',
      complete: !!listing.description,
      hint: 'Listings with descriptions get 3x more engagement',
    },
    {
      field: 'hours',
      label: 'Opening hours',
      complete: !!listing.hours,
      hint: 'Listings with hours get seen 40% more',
    },
    {
      field: 'hero_image_url',
      label: 'Hero image',
      complete: !!listing.hero_image_url,
      hint: 'Add a photo to stand out',
    },
    {
      field: 'website',
      label: 'Website',
      complete: !!listing.website,
      hint: 'Help visitors find your site',
    },
    {
      field: 'phone',
      label: 'Phone number',
      complete: !!listing.phone,
      hint: 'Help people find you',
    },
  ]

  const completeCount = checks.filter(c => c.complete).length
  const allComplete = completeCount === checks.length

  if (allComplete) return null

  return (
    <div style={{
      marginBottom: 16,
      padding: '12px 14px',
      borderRadius: 8,
      background: '#FFFDF7',
      border: '1px solid #F0EBDF',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <span style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-muted, #888)',
        }}>
          Listing completeness
        </span>
        <span style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 11,
          fontWeight: 500,
          color: completeCount >= 4 ? 'var(--color-sage, #5f8a7e)' : 'var(--color-gold, #C4973B)',
        }}>
          {completeCount}/{checks.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {checks.map(check => (
          <div key={check.field} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: check.complete ? '0' : '4px 6px',
            borderRadius: 4,
            background: check.complete ? 'transparent' : '#FFF8EE',
          }}>
            <span style={{
              fontSize: 13,
              lineHeight: '18px',
              flexShrink: 0,
              color: check.complete ? '#16a34a' : '#dc2626',
            }}>
              {check.complete ? '✓' : '✗'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {check.complete ? (
                <span style={{
                  fontFamily: 'var(--font-body, system-ui)',
                  fontSize: 12,
                  color: '#16a34a',
                  fontWeight: 500,
                }}>
                  {check.label} added
                </span>
              ) : (
                <Link
                  href={editUrl}
                  style={{
                    fontFamily: 'var(--font-body, system-ui)',
                    fontSize: 12,
                    color: '#dc2626',
                    fontWeight: 500,
                    textDecoration: 'none',
                    display: 'block',
                    lineHeight: '18px',
                  }}
                >
                  {check.label} missing
                  <span style={{
                    fontWeight: 400,
                    color: 'var(--color-muted, #888)',
                    fontSize: 11,
                    marginLeft: 6,
                  }}>
                    &mdash; {check.hint}
                  </span>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ListingCard({ listing, liveStats, isAdmin }) {
  const stats = listing.stats
  const live = liveStats || null
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

  // Editing is a Standard-plan feature. A free-tier claim keeps the listing live
  // but locks the editor behind a payment challenge (admins bypass).
  const locked = !listing.paid && !isAdmin

  const staticMapUrl = listing.lat && listing.lng && mapboxToken
    ? `https://api.mapbox.com/styles/v1/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k/static/pin-s+5f8a7e(${listing.lng},${listing.lat})/${listing.lng},${listing.lat},12,0/320x180@2x?access_token=${mapboxToken}`
    : null

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid var(--color-border, #e5e5e5)',
      overflow: 'hidden',
    }}>
      {/* Mini map */}
      {staticMapUrl && (
        <div style={{ width: '100%', height: 140, overflow: 'hidden', background: '#f5f5f0' }}>
          <img
            src={staticMapUrl}
            alt={`Map showing ${listing.name}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      <div style={{ padding: '1.25rem' }}>
        {/* Header: name + vertical badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <h3 style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontSize: '1.1rem',
            fontWeight: 500,
            color: 'var(--color-ink, #2D2A26)',
            margin: 0,
            lineHeight: 1.3,
          }}>
            {listing.name}
          </h3>
          <span style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: 100,
            background: 'var(--color-cream, #FAF8F5)',
            color: 'var(--color-sage, #5f8a7e)',
            border: '1px solid var(--color-border, #e5e5e5)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {getVerticalBadge(listing.vertical)}
          </span>
        </div>

        {/* Region */}
        <p style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 13,
          color: 'var(--color-muted, #888)',
          margin: '0 0 16px',
        }}>
          {[getListingRegion(listing)?.name, listing.state].filter(Boolean).join(', ')}
        </p>

        {/* Stats row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          padding: '12px 0',
          borderTop: '1px solid var(--color-border, #e5e5e5)',
          borderBottom: '1px solid var(--color-border, #e5e5e5)',
          marginBottom: 16,
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--font-display, Georgia)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--color-ink, #2D2A26)',
              margin: 0,
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              gap: 4,
            }}>
              {live ? live.views_30d : '--'}
              {live && <TrendChip current={live.views_30d} previous={live.views_prev_30d} />}
            </p>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted, #888)',
              margin: '2px 0 0',
            }}>
              Views (30d)
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--font-display, Georgia)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--color-ink, #2D2A26)',
              margin: 0,
            }}>
              {live ? live.search_count : stats.search_appearances}
            </p>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted, #888)',
              margin: '2px 0 0',
            }}>
              {live ? 'Searches (30d)' : 'Searches'}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--font-display, Georgia)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--color-ink, #2D2A26)',
              margin: 0,
            }}>
              {live ? live.trail_count : stats.trail_inclusions}
            </p>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted, #888)',
              margin: '2px 0 0',
            }}>
              Trails
            </p>
          </div>
          <div
            style={{ textAlign: 'center' }}
            title="Saves from users who used Discover or saved from australianatlas.com.au directly. Vertical-level favourites are tracked separately."
          >
            <p style={{
              fontFamily: 'var(--font-display, Georgia)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--color-ink, #2D2A26)',
              margin: 0,
            }}>
              {live ? live.save_count : '--'}
            </p>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted, #888)',
              margin: '2px 0 0',
            }}>
              Atlas Passport saves
            </p>
          </div>
        </div>

        {/* Completeness checklist — or, when editing is locked, a payment prompt */}
        {locked ? (
          <Link href={getEditUrl(listing.id)} style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              marginBottom: 16,
              padding: '12px 14px',
              borderRadius: 8,
              background: '#FFFDF7',
              border: '1px solid #F0EBDF',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}>
              <span style={{ color: 'var(--color-sage, #5f8a7e)', flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
              </span>
              <div>
                <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: 0 }}>
                  Editing locked
                </p>
                <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: 'var(--color-muted, #888)', margin: '3px 0 0', lineHeight: 1.45 }}>
                  Your listing is claimed and live. Complete your $295/yr payment to manage its details, photos and hours.
                </p>
              </div>
            </div>
          </Link>
        ) : (
          <CompletenessChecklist listing={listing} />
        )}

        {/* Quick links */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href={getEditUrl(listing.id)}
            style={{
              flex: 1,
              display: 'block',
              textAlign: 'center',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--color-ink, #2D2A26)',
              color: '#fff',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            {locked ? 'Unlock editing — $295/yr' : 'Edit listing'}
          </Link>
          <a
            href={getPublicUrl(listing.vertical, listing.slug)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              display: 'block',
              textAlign: 'center',
              padding: '10px 12px',
              borderRadius: 8,
              background: '#fff',
              color: 'var(--color-ink, #2D2A26)',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
              border: '1px solid var(--color-border, #e5e5e5)',
            }}
          >
            View on site
          </a>
        </div>

      </div>
    </div>
  )
}

export default function DashboardPage() {
  // All data comes from the dashboard layout: it fetches the owned listings and
  // their stats once per session and shares them, so landing here costs no
  // extra API round-trips.
  const { dashUser: user, listings, listingsLoading, listingsError, stats } = useAuth()
  const loading = listingsLoading

  // Whether to surface the fast free→Standard upgrade banner: a non-admin operator
  // with at least one unpaid listing. The banner itself self-gates too.
  const hasUnpaidListing = user?.role !== 'admin' && (listings || []).some(l => l && !l.paid)

  // Not authenticated
  if (!loading && !user) {
    return (
      <div style={{ background: 'var(--color-bg, #FDFCFA)', minHeight: '100vh' }}>
        <section style={{ padding: '6rem 1.5rem 2rem', maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: 10,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--color-sage, #5f8a7e)', marginBottom: 12,
          }}>
            Operator Dashboard
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: '2rem',
            color: 'var(--color-ink, #2D2A26)', lineHeight: 1.15, marginBottom: '1rem',
          }}>
            Manage your listing
          </h1>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontWeight: 300, fontSize: 15,
            color: 'var(--color-muted, #888)', lineHeight: 1.5, marginBottom: '2rem',
          }}>
            Sign in to view your claimed listings, track search performance, and keep your profile up to date.
          </p>
          <Link
            href="/login"
            style={{
              display: 'inline-block', padding: '14px 32px', borderRadius: 8,
              background: 'var(--color-ink, #2D2A26)', color: '#fff',
              fontFamily: 'var(--font-body, system-ui)', fontWeight: 500, fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Sign in
          </Link>
        </section>
      </div>
    )
  }

  // Authenticated but not vendor role
  if (!loading && user && user.role !== 'vendor' && user.role !== 'admin') {
    return (
      <div style={{ background: 'var(--color-bg, #FDFCFA)', minHeight: '100vh' }}>
        <section style={{ padding: '6rem 1.5rem 2rem', maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: 10,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--color-sage, #5f8a7e)', marginBottom: 12,
          }}>
            Operator Dashboard
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: '2rem',
            color: 'var(--color-ink, #2D2A26)', lineHeight: 1.15, marginBottom: '1rem',
          }}>
            Claim your listing
          </h1>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontWeight: 300, fontSize: 15,
            color: 'var(--color-muted, #888)', lineHeight: 1.5, marginBottom: '1.5rem',
          }}>
            If you operate a venue listed on the Atlas Network, claim it to update your details, track performance, and connect with visitors.
          </p>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
            color: 'var(--color-muted, #888)', marginBottom: '2rem',
          }}>
            Signed in as {user.name || user.email}
          </p>
          <Link
            href="/explore"
            style={{
              display: 'inline-block', padding: '14px 32px', borderRadius: 8,
              background: 'var(--color-ink, #2D2A26)', color: '#fff',
              fontFamily: 'var(--font-body, system-ui)', fontWeight: 500, fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Find your listing
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--color-bg, #FDFCFA)', minHeight: '100vh' }}>
      {/* First-visit welcome: your listing lives on both the portal and its
          vertical site — self-gates on a once-per-operator flag. */}
      {!loading && !listingsError && listings.length > 0 && (
        <DualListingPopup listings={listings} userId={user?.id} />
      )}

      {/* Header */}
      <section style={{ padding: '5rem 1.5rem 1.5rem', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: 10,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--color-sage, #5f8a7e)', margin: '0 0 6px',
            }}>
              Operator Dashboard
            </p>
            <h1 style={{
              fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: '1.75rem',
              color: 'var(--color-ink, #2D2A26)', margin: 0, lineHeight: 1.2,
            }}>
              Your Listings
            </h1>
          </div>
          {!loading && (
            <span style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 13,
              color: 'var(--color-muted, #888)',
            }}>
              {listings.length} {listings.length === 1 ? 'listing' : 'listings'}
            </span>
          )}
        </div>

        {user && (
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
            color: 'var(--color-muted, #888)', margin: '8px 0 0',
          }}>
            {user.name || user.email}
          </p>
        )}
      </section>

      {/* Fast free→Standard upgrade — one click to secure checkout, benefits up
          front. Shows only when a non-admin operator has an unpaid listing. */}
      {!loading && !listingsError && hasUnpaidListing && (
        <section style={{ padding: '0 1.5rem 1.75rem', maxWidth: 720, margin: '0 auto' }}>
          <UpgradeBanner listings={listings} isAdmin={user?.role === 'admin'} />
        </section>
      )}

      {/* Loading state — skeleton cards mirroring the real layout, so the page
          doesn't jump when data lands */}
      {loading && (
        <section style={{ padding: '0 1.5rem 2rem', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: 12,
                border: '1px solid var(--color-border, #e5e5e5)', overflow: 'hidden',
              }}>
                <div className="aa-skeleton" style={{ width: '100%', height: 140, borderRadius: 0 }} />
                <div style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                    <div className="aa-skeleton" style={{ width: '45%', height: 18 }} />
                    <div className="aa-skeleton" style={{ width: 70, height: 18, borderRadius: 100 }} />
                  </div>
                  <div className="aa-skeleton" style={{ width: '30%', height: 12, marginBottom: 20 }} />
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
                    padding: '12px 0', borderTop: '1px solid var(--color-border, #e5e5e5)',
                    borderBottom: '1px solid var(--color-border, #e5e5e5)', marginBottom: 16,
                  }}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div className="aa-skeleton" style={{ width: 28, height: 18 }} />
                        <div className="aa-skeleton" style={{ width: '80%', height: 8 }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div className="aa-skeleton" style={{ flex: 1, height: 38, borderRadius: 8 }} />
                    <div className="aa-skeleton" style={{ flex: 1, height: 38, borderRadius: 8 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Error state */}
      {listingsError && !loading && (
        <section style={{ padding: '0 1.5rem 2rem', maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            padding: '16px 20px',
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
          }}>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
              color: '#991b1b', margin: 0,
            }}>
              {listingsError}
            </p>
          </div>
        </section>
      )}

      {/* Listings */}
      {!loading && listings.length > 0 && (
        <section style={{ padding: '0 1.5rem 2rem', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {listings.map(listing => (
              <ListingCard key={listing.id} listing={listing} liveStats={stats[listing.id]} isAdmin={user?.role === 'admin'} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state for vendors with no listings */}
      {!loading && !listingsError && listings.length === 0 && user && (user.role === 'vendor' || user.role === 'admin') && (
        <section style={{ textAlign: 'center', padding: '2rem 1.5rem 4rem', maxWidth: 520, margin: '0 auto' }}>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 15,
            color: 'var(--color-muted, #888)', marginBottom: 8, lineHeight: 1.5,
          }}>
            No claimed listings found yet.
          </p>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
            color: 'var(--color-muted, #888)', marginBottom: 24, lineHeight: 1.5,
          }}>
            Your listings will appear here once a claim is approved. If you have recently claimed a listing, it may still be under review.
          </p>
          <Link
            href="/explore"
            style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 8,
              background: 'var(--color-ink, #2D2A26)', color: '#fff',
              fontFamily: 'var(--font-body, system-ui)', fontWeight: 500, fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Find your listing
          </Link>
        </section>
      )}

      {/* Footer note */}
      <section style={{ padding: '2rem 1.5rem 5rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontWeight: 300, fontSize: 12,
          color: 'var(--color-muted, #888)', opacity: 0.6,
        }}>
          Views count real visitors to your public pages (bots excluded). Views and search stats reflect the last 30 days.
        </p>
      </section>
    </div>
  )
}
