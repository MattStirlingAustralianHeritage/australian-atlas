'use client'

import { useAuth } from './layout'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

const VERTICAL_COLORS = {
  sba: '#C49A3C',
  collection: '#7A6B8A',
  craft: '#C1603A',
  fine_grounds: '#8A7055',
  rest: '#5A8A9A',
  field: '#4A7C59',
  corner: '#5F8A7E',
  found: '#D4956A',
  table: '#C4634F',
}

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas',
  collection: 'Collection Atlas',
  craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas',
  rest: 'Rest Atlas',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

function SkeletonCard() {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.25rem',
    }}>
      <div style={{ width: '60%', height: '12px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '0.75rem' }} />
      <div style={{ width: '40%', height: '10px', background: 'var(--color-border)', borderRadius: '4px' }} />
    </div>
  )
}

function VerticalCard({ vertical, data }) {
  const color = VERTICAL_COLORS[vertical]
  const label = VERTICAL_LABELS[vertical]
  const claimed = data?.claimed

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
        }}>
          {label}
        </span>
      </div>

      {claimed ? (
        <>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.85rem',
            color: 'var(--color-ink)',
            margin: 0,
            fontWeight: 500,
          }}>
            {data.venue?.name || data.masterListing?.name || 'Claimed venue'}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              background: '#dcfce7',
              color: '#166534',
            }}>
              Claimed
            </span>
            <span style={{
              display: 'inline-block',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              background: color + '18',
              color: color,
              textTransform: 'capitalize',
            }}>
              {data.tier}
            </span>
          </div>
        </>
      ) : (
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.8rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Not claimed
        </p>
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '10px',
      border: '1px solid var(--color-border)',
      padding: '1.25rem',
      flex: '1 1 0',
      minWidth: '140px',
    }}>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.8rem',
        color: 'var(--color-muted)',
        margin: '0 0 0.375rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '1.75rem',
        fontWeight: 600,
        color: 'var(--color-ink)',
        margin: 0,
      }}>
        {value}
      </p>
    </div>
  )
}

function QuickAction({ label, href, description }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: '#fff',
        borderRadius: '10px',
        border: '1px solid var(--color-border)',
        padding: '1.25rem',
        textDecoration: 'none',
        flex: '1 1 0',
        minWidth: '180px',
        transition: 'border-color 0.15s',
      }}
      onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-sage)'}
      onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
    >
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.95rem',
        fontWeight: 500,
        color: 'var(--color-ink)',
        margin: '0 0 0.25rem',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.825rem',
        color: 'var(--color-muted)',
        margin: 0,
      }}>
        {description}
      </p>
    </Link>
  )
}

export default function DashboardOverview() {
  const { user } = useAuth()
  const [network, setNetwork] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/network')
      .then((r) => r.json())
      .then((data) => {
        setNetwork(data.network || {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'
  const verticals = Object.keys(VERTICAL_COLORS)
  const claimedCount = network ? verticals.filter((v) => network[v]?.claimed).length : 0

  return (
    <div>
      {/* Welcome */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.75rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: '0 0 0.25rem',
        }}>
          Welcome back, {displayName}
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Manage your presence across the Australian Atlas network
        </p>
      </div>

      {/* Network Presence */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-muted)',
          margin: '0 0 0.75rem',
        }}>
          Network Presence {!loading && `(${claimedCount} / ${verticals.length})`}
        </h2>
        {loading ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '0.75rem',
          }}>
            {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '0.75rem',
          }}>
            {verticals.map((v) => (
              <VerticalCard key={v} vertical={v} data={network?.[v]} />
            ))}
          </div>
        )}
      </div>

      {/* This Month stats */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-muted)',
          margin: '0 0 0.75rem',
        }}>
          This Month
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <StatCard label="Page Views" value="--" />
          <StatCard label="Link Clicks" value="--" />
          <StatCard label="Search Appearances" value="--" />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-muted)',
          margin: '0 0 0.75rem',
        }}>
          Quick Actions
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <QuickAction
            label="Update listing"
            href="/dashboard/listings"
            description="Edit your venue details, photos, and hours"
          />
          <QuickAction
            label="Add producer pick"
            href="/dashboard/picks"
            description="Share a product you love with the network"
          />
          <QuickAction
            label="View analytics"
            href="/dashboard/analytics"
            description="See how your listings are performing"
          />
        </div>
      </div>
    </div>
  )
}
