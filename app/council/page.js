'use client'

import { useCouncil } from './layout'
import Link from 'next/link'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'
import CouncilRegionTools from '@/components/council/CouncilRegionTools'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const VERTICAL_COLORS = VERTICAL_ACCENTS

// Single founding-partner tier — full access, no pricing. Everything the
// council product offers (formerly split across Explorer/Partner/Enterprise).
const FOUNDING_FEATURES = [
  'Verified listing data for your region, with performance (views & clicks)',
  'Live region dashboard across all of your regions',
  'Analytics & reporting — views, clicks, visitor origin, search interest',
  'Content co-creation — trails, editorials, picks and seasonal guides',
  'Embeddable region map for your own website',
  'White-label regional report (your branding) to share or print',
  'Export your region’s full listing data (CSV)',
  'A direct line to the team for support and feedback',
]

export default function CouncilOverview() {
  const { council, regions, stats } = useCouncil()

  if (!council) return null

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
          {council.name} — Founding partner
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

      {/* Embed + reports — region-scoped to the account */}
      <CouncilRegionTools regions={regions} />

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

      {/* Founding partner access */}
      <section>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          margin: '0 0 1rem',
        }}>
          Founding partner access
        </h2>
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '1.5rem',
        }}>
          <span style={{
            display: 'inline-block',
            fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: '#fff', background: 'var(--color-sage)',
            padding: '0.2rem 0.6rem', borderRadius: '999px', marginBottom: '0.75rem',
          }}>
            Free during beta
          </span>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--color-muted)',
            lineHeight: 1.6, margin: '0 0 1rem',
          }}>
            You have full access to the council toolkit as a founding partner — everything below, at no cost while we&apos;re in beta.
          </p>
          <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
            {FOUNDING_FEATURES.map((f, i) => (
              <li key={i} style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'var(--color-ink)',
                marginBottom: '0.35rem',
                lineHeight: 1.5,
              }}>
                {f}
              </li>
            ))}
          </ul>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)',
            margin: '1rem 0 0',
          }}>
            Something missing or an idea to share?{' '}
            <Link href="/council/feedback" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Send us feedback
            </Link>.
          </p>
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
