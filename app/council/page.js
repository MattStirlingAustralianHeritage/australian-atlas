'use client'

import { useCouncil } from './layout'
import Link from 'next/link'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const TIER_FEATURES = {
  explorer: {
    name: 'Explorer',
    price: '$249',
    features: ['View listing data for your region', 'Basic region report', 'Map embed'],
    upgrade: 'partner',
  },
  partner: {
    name: 'Partner',
    price: '$3,500',
    features: ['Full analytics dashboard', 'Content co-creation', 'Listing management', 'Priority support'],
    upgrade: 'enterprise',
  },
  enterprise: {
    name: 'Enterprise',
    price: '$8,500',
    features: ['Multiple regions', 'API access', 'White-label reports', 'Dedicated account manager'],
    upgrade: null,
  },
}

export default function CouncilOverview() {
  const { council, regions, stats } = useCouncil()

  if (!council) return null

  const tierInfo = TIER_FEATURES[council.tier] || TIER_FEATURES.explorer

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          margin: '0 0 0.25rem',
        }}>
          Welcome back
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          {council.name} — {tierInfo.name} plan
        </p>
      </div>

      {/* Stats cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <StatCard label="Regions" value={stats.totalRegions || 0} />
        <StatCard label="Total Listings" value={stats.totalListings || 0} />
        <StatCard label="Verticals Active" value={Object.keys(stats.listingsByVertical || {}).length} />
      </div>

      {/* Managed regions */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          margin: '0 0 1rem',
        }}>
          Your regions
        </h2>

        {regions.length === 0 ? (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', margin: 0 }}>
              No regions assigned yet. Contact us to get started.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {regions.map(region => (
              <Link
                key={region.id}
                href={`/council/region?r=${region.slug}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#fff',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)',
                  padding: '1.25rem 1.5rem',
                  textDecoration: 'none',
                  transition: 'border-color 0.15s',
                }}
              >
                <div>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '1rem',
                    fontWeight: 500,
                    color: 'var(--color-ink)',
                    margin: '0 0 0.25rem',
                  }}>
                    {region.name}
                  </p>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                    color: 'var(--color-muted)',
                    margin: 0,
                  }}>
                    {region.state} · {region.listing_count || 0} listings
                  </p>
                </div>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  color: 'var(--color-sage)',
                }}>
                  View →
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Listings by vertical */}
      {Object.keys(stats.listingsByVertical || {}).length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            fontWeight: 400,
            color: 'var(--color-ink)',
            margin: '0 0 1rem',
          }}>
            Listings by vertical
          </h2>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '1.25rem',
          }}>
            {Object.entries(stats.listingsByVertical)
              .sort((a, b) => b[1] - a[1])
              .map(([vertical, count]) => (
                <div key={vertical} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.625rem 0',
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: VERTICAL_COLORS[vertical] || '#999',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      color: 'var(--color-ink)',
                    }}>
                      {VERTICAL_LABELS[vertical] || vertical} Atlas
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--color-ink)',
                  }}>
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Plan info + upgrade */}
      <section>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          margin: '0 0 1rem',
        }}>
          Your plan
        </h2>
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'var(--color-ink)',
            }}>
              {tierInfo.name}
            </span>
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: 'var(--color-muted)',
            }}>
              {tierInfo.price}/year
            </span>
          </div>
          <ul style={{ margin: '0 0 1rem', padding: '0 0 0 1.25rem' }}>
            {tierInfo.features.map((f, i) => (
              <li key={i} style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'var(--color-muted)',
                marginBottom: '0.25rem',
              }}>
                {f}
              </li>
            ))}
          </ul>
          {tierInfo.upgrade && (
            <button
              onClick={() => {
                // TODO: Wire to Stripe checkout
                alert(`Upgrade to ${TIER_FEATURES[tierInfo.upgrade].name} coming soon. Contact councils@australianatlas.com.au`)
              }}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--color-sage)',
                color: '#fff',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Upgrade to {TIER_FEATURES[tierInfo.upgrade].name}
            </button>
          )}
          {council.billing_cycle_end && (
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: 'var(--color-muted)',
              marginTop: '0.75rem',
            }}>
              Current billing period ends {new Date(council.billing_cycle_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.25rem',
    }}>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '2rem',
        fontWeight: 600,
        color: 'var(--color-ink)',
        margin: '0 0 0.25rem',
      }}>
        {value.toLocaleString()}
      </p>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.8rem',
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
