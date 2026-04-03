'use client'

import { useAuth } from '../layout'
import { useState, useEffect } from 'react'

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

function ListingCard({ vertical, data }) {
  const color = VERTICAL_COLORS[vertical]
  const label = VERTICAL_LABELS[vertical]
  const venue = data.venue
  const master = data.masterListing
  const tier = data.tier || 'free'

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      {/* Vertical badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: color,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {label}
        </span>
      </div>

      {/* Venue name */}
      <h3 style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '1.15rem',
        fontWeight: 600,
        color: 'var(--color-ink)',
        margin: 0,
      }}>
        {venue?.name || master?.name || 'Unnamed venue'}
      </h3>

      {/* Region / State */}
      {(master?.region || master?.state) && (
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.825rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          {[master.region, master.state].filter(Boolean).join(', ')}
        </p>
      )}

      {/* Badges */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.2rem 0.6rem',
          borderRadius: '999px',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          background: data.claimed ? '#dcfce7' : '#f3f4f6',
          color: data.claimed ? '#166534' : '#6b7280',
        }}>
          {data.claimed ? 'Claimed' : 'Unclaimed'}
        </span>
        <span style={{
          display: 'inline-block',
          padding: '0.2rem 0.6rem',
          borderRadius: '999px',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          background: tier === 'premium' ? '#fef3c7' : tier === 'standard' ? '#dbeafe' : '#f3f4f6',
          color: tier === 'premium' ? '#92400e' : tier === 'standard' ? '#1e40af' : '#6b7280',
          textTransform: 'capitalize',
        }}>
          {tier}
        </span>
        {master?.is_featured && (
          <span style={{
            display: 'inline-block',
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            fontSize: '0.7rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            background: '#fce7f3',
            color: '#9d174d',
          }}>
            Featured
          </span>
        )}
      </div>

      {/* Edit button */}
      <button
        onClick={() => alert('Listing editor coming soon. Contact listings@australianatlas.com.au to update your listing.')}
        style={{
          marginTop: '0.25rem',
          padding: '0.5rem 1rem',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          background: '#fff',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.825rem',
          fontWeight: 500,
          color: 'var(--color-ink)',
          cursor: 'pointer',
          transition: 'all 0.15s',
          alignSelf: 'flex-start',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'var(--color-ink)'
          e.currentTarget.style.color = '#fff'
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = '#fff'
          e.currentTarget.style.color = 'var(--color-ink)'
        }}
      >
        Edit listing
      </button>
    </div>
  )
}

export default function DashboardListings() {
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

  const claimedVerticals = network
    ? Object.entries(network).filter(([, d]) => d.claimed)
    : []

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.75rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: '0 0 0.25rem',
        }}>
          My Listings
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Venues you have claimed across the Atlas network
        </p>
      </div>

      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1rem',
        }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{
              background: '#fff',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              padding: '1.5rem',
            }}>
              <div style={{ width: '40%', height: '10px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '1rem' }} />
              <div style={{ width: '70%', height: '14px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '0.75rem' }} />
              <div style={{ width: '50%', height: '10px', background: 'var(--color-border)', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      ) : claimedVerticals.length === 0 ? (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '3rem 2rem',
          textAlign: 'center',
        }}>
          <p style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.1rem',
            color: 'var(--color-ink)',
            margin: '0 0 0.5rem',
          }}>
            No claimed listings yet
          </p>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.875rem',
            color: 'var(--color-muted)',
            margin: 0,
          }}>
            Visit a vertical site to claim your venue and manage it from here.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1rem',
        }}>
          {claimedVerticals.map(([v, data]) => (
            <ListingCard key={v} vertical={v} data={data} />
          ))}
        </div>
      )}
    </div>
  )
}
