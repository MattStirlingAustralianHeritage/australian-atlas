'use client'

import { useAuth } from '../layout'
import { useState, useEffect } from 'react'
import { getVerticalFeatures, getStandardFeatures } from '@/lib/vertical-features'

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

const FREE_FEATURES = ['Basic listing', 'Map pin', 'Appear in search & trails']

function SubscriptionCard({ vertical, data }) {
  const color = VERTICAL_COLORS[vertical]
  const vf = getVerticalFeatures(vertical)
  const label = vf.label
  const tier = data.tier || 'free'
  const status = data.venue?.subscription_status || 'active'
  const features = tier === 'standard' ? getStandardFeatures(vertical) : FREE_FEATURES

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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        <span style={{
          display: 'inline-block',
          padding: '0.2rem 0.6rem',
          borderRadius: '999px',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          background: status === 'active' ? '#dcfce7' : '#fef3c7',
          color: status === 'active' ? '#166534' : '#92400e',
          textTransform: 'capitalize',
        }}>
          {status}
        </span>
      </div>

      {/* Venue name */}
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.875rem',
        color: 'var(--color-ink)',
        margin: 0,
        fontWeight: 500,
      }}>
        {data.venue?.name || data.masterListing?.name || 'Your venue'}
      </p>

      {/* Tier info */}
      <div style={{
        padding: '0.75rem',
        borderRadius: '8px',
        background: tier === 'standard' ? '#eff6ff' : '#f9fafb',
        border: `1px solid ${tier === 'standard' ? '#bfdbfe' : 'var(--color-border)'}`,
      }}>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: '0 0 0.375rem',
          textTransform: 'capitalize',
        }}>
          {tier} Tier
        </p>
        <ul style={{
          margin: 0,
          padding: '0 0 0 1rem',
          listStyle: 'disc',
        }}>
          {features.map((feature, i) => (
            <li key={i} style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem',
              color: 'var(--color-muted)',
              marginBottom: '0.125rem',
            }}>
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {tier === 'free' && (
        <a
          href="mailto:hello@australianatlas.com.au?subject=Upgrade to Standard"
          style={{
            display: 'inline-block',
            padding: '0.6rem 1rem',
            borderRadius: '8px',
            border: 'none',
            background: color,
            fontFamily: 'var(--font-sans)',
            fontSize: '0.825rem',
            fontWeight: 500,
            color: '#fff',
            textDecoration: 'none',
            transition: 'opacity 0.15s',
            alignSelf: 'flex-start',
          }}
        >
          Upgrade to Standard — $99/yr
        </a>
      )}
    </div>
  )
}

export default function DashboardSubscription() {
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
          Subscription
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Manage your subscription tier across verticals
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{
              background: '#fff',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              padding: '1.5rem',
            }}>
              <div style={{ width: '40%', height: '12px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '1rem' }} />
              <div style={{ width: '60%', height: '10px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '0.75rem' }} />
              <div style={{ width: '100%', height: '60px', background: 'var(--color-border)', borderRadius: '8px' }} />
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
            No active subscriptions
          </p>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.875rem',
            color: 'var(--color-muted)',
            margin: 0,
          }}>
            Claim a venue on any Atlas vertical to see subscription options here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {claimedVerticals.map(([v, data]) => (
            <SubscriptionCard key={v} vertical={v} data={data} />
          ))}

          {/* Manage Billing button */}
          <div style={{ marginTop: '1rem' }}>
            <button
              onClick={() => alert('Billing portal coming soon. Contact hello@australianatlas.com.au for billing enquiries.')}
              style={{
                padding: '0.7rem 1.5rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: '#fff',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.9rem',
                fontWeight: 500,
                color: 'var(--color-ink)',
                cursor: 'pointer',
                transition: 'all 0.15s',
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
              Manage Billing
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
