'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'

export default function CouncilAnalytics() {
  const { council, regions } = useCouncil()
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [upgradeRequired, setUpgradeRequired] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState(null)

  useEffect(() => {
    fetch('/api/council/data?view=analytics')
      .then(r => r.json())
      .then(d => {
        if (d.upgrade_required) {
          setUpgradeRequired(true)
        } else {
          setAnalytics(d.analytics || null)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (!council) return null

  const statCard = (label, value) => (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.5rem',
      textAlign: 'center',
    }}>
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: '2rem',
        fontWeight: 400,
        color: 'var(--color-ink)',
        margin: '0 0 0.25rem',
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.8rem',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-muted)',
        margin: 0,
      }}>
        {label}
      </p>
    </div>
  )

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
          Analytics
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Listing performance across your managed regions
        </p>
      </div>

      {upgradeRequired ? (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '3rem 2rem',
          textAlign: 'center',
        }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.1rem',
            color: 'var(--color-ink)',
            margin: '0 0 0.5rem',
          }}>
            Analytics is available on Partner and Enterprise plans
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--color-muted)',
            margin: '0 0 1.5rem',
          }}>
            Upgrade to see listing views, clicks, and search appearances for your regions.
          </p>
          {upgradeError && (
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: '#b91c1c',
              margin: '0 0 1rem',
            }}>
              {upgradeError}
            </p>
          )}
          <button
            disabled={upgrading}
            onClick={async () => {
              setUpgrading(true)
              setUpgradeError(null)
              try {
                const res = await fetch('/api/council/checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tier: 'partner' }),
                })
                const data = await res.json()
                if (data.url) {
                  window.location.href = data.url
                } else {
                  setUpgradeError(data.error || 'Failed to start checkout. Contact councils@australianatlas.com.au')
                  setUpgrading(false)
                }
              } catch {
                setUpgradeError('Something went wrong. Please try again or contact councils@australianatlas.com.au')
                setUpgrading(false)
              }
            }}
            style={{
              padding: '0.7rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: upgrading ? 'var(--color-muted)' : 'var(--color-sage)',
              color: '#fff',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: upgrading ? 'wait' : 'pointer',
              opacity: upgrading ? 0.7 : 1,
            }}
          >
            {upgrading ? 'Redirecting...' : 'Upgrade to Partner'}
          </button>
        </div>
      ) : loading ? (
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading...</p>
      ) : analytics ? (
        <>
          {/* Period badge */}
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'var(--color-muted)',
            margin: '0 0 1rem',
          }}>
            Last 30 days &middot; {regions.length} region{regions.length !== 1 ? 's' : ''}
          </p>

          {/* Stat cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}>
            {statCard('Listing Views', analytics.views)}
            {statCard('Clicks', analytics.clicks)}
            {statCard('Search Appearances', analytics.searches)}
          </div>

          {/* Regions breakdown */}
          {regions.length > 0 && (
            <div style={{
              background: '#fff',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              padding: '1.5rem',
            }}>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-muted)',
                margin: '0 0 1rem',
              }}>
                Managed Regions
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {regions.map(region => (
                  <div key={region.slug || region.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.9rem',
                      color: 'var(--color-ink)',
                    }}>
                      {region.name || region.slug}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.8rem',
                      color: 'var(--color-muted)',
                      textTransform: 'capitalize',
                    }}>
                      {region.role || 'manager'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
            No analytics data available yet. Data will appear here once your listings receive traffic.
          </p>
        </div>
      )}
    </div>
  )
}
