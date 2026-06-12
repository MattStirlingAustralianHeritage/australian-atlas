'use client'

import { useAuth } from '../layout'
import { useState, useEffect } from 'react'
import { getVerticalFeatures, getStandardFeatures } from '@/lib/vertical-features'
import { getDashboardToken } from '@/lib/dashboard-token'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

const VERTICAL_COLORS = VERTICAL_ACCENTS

const FREE_FEATURES = ['Basic listing', 'Map pin', 'Appear in search & trails']

function SubscriptionCard({ vertical, data }) {
  const color = VERTICAL_COLORS[vertical]
  const vf = getVerticalFeatures(vertical)
  const label = vf.label
  const tier = data.tier || 'free'
  const status = data.venue?.subscription_status || 'active'
  const features = tier === 'standard' ? getStandardFeatures(vertical) : FREE_FEATURES
  const listingId = data.masterListing?.id || null

  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState(null)

  async function handleUpgrade() {
    if (!listingId) {
      setUpgradeError('We couldn’t find this listing. Please refresh and try again.')
      return
    }
    setUpgrading(true)
    setUpgradeError(null)
    try {
      const token = await getDashboardToken()
      if (!token) {
        setUpgradeError('Please sign in again to upgrade.')
        setUpgrading(false)
        return
      }
      const res = await fetch('/api/stripe/upgrade-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listing_id: listingId }),
      })
      let d = {}
      try { d = await res.json() } catch { /* non-JSON error body */ }
      if (res.ok && d.url) {
        window.location.href = d.url
        return
      }
      setUpgradeError(d.error || 'We couldn’t start payment. Please try again, or email listings@australianatlas.com.au.')
    } catch {
      setUpgradeError('We couldn’t start payment. Please check your connection and try again.')
    } finally {
      setUpgrading(false)
    }
  }

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
        <div style={{ alignSelf: 'flex-start' }}>
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={upgrading}
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
              cursor: upgrading ? 'wait' : 'pointer',
              opacity: upgrading ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {upgrading ? 'Starting checkout…' : 'Upgrade to Standard — $295/yr'}
          </button>
          {upgradeError && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: '#b91c1c', margin: '0.5rem 0 0', maxWidth: 320, lineHeight: 1.4 }}>
              {upgradeError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function DashboardSubscription() {
  const { user } = useAuth()
  const [network, setNetwork] = useState(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalMessage, setPortalMessage] = useState(null)

  async function openBillingPortal() {
    setPortalLoading(true)
    setPortalMessage(null)
    try {
      const res = await fetch('/api/dashboard/billing-portal', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.url) {
        window.location.href = d.url
        return
      }
      if (res.status === 404) {
        setPortalMessage('The billing portal becomes available once you have a paid Standard listing. Free listings have nothing to bill.')
      } else {
        setPortalMessage('We couldn’t open the billing portal. Please try again, or email listings@australianatlas.com.au.')
      }
    } catch {
      setPortalMessage('We couldn’t open the billing portal. Please check your connection and try again.')
    } finally {
      setPortalLoading(false)
    }
  }

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

          {/* Manage Billing — opens the Stripe customer portal */}
          <div style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openBillingPortal}
              disabled={portalLoading}
            >
              {portalLoading ? 'Opening billing portal…' : 'Manage billing'}
            </button>
            {portalMessage && (
              <p style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.8rem',
                color: 'var(--color-muted)',
                margin: '0.6rem 0 0',
                maxWidth: 420,
                lineHeight: 1.5,
              }}>
                {portalMessage}
              </p>
            )}
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem',
              color: 'var(--color-muted)',
              margin: '0.6rem 0 0',
              maxWidth: 420,
              lineHeight: 1.5,
            }}>
              Standard renews annually at A$295/yr. Update your payment method, download
              invoices, or cancel any time in the billing portal.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
