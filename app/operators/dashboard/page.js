'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useOperator } from '../layout'

export default function OperatorDashboardPage() {
  const { operator, stats } = useOperator()
  const searchParams = useSearchParams()
  const [activity, setActivity] = useState([])
  const [banner, setBanner] = useState(null)

  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setBanner({ type: 'success', text: 'Welcome! Your operator account has been created.' })
    } else if (searchParams.get('subscribed') === '1') {
      setBanner({ type: 'success', text: 'Subscription activated. You now have full access.' })
    } else if (searchParams.get('cancelled') === '1') {
      setBanner({ type: 'info', text: 'Your subscription has been cancelled. You will retain access until the end of your billing period.' })
    }
  }, [searchParams])

  useEffect(() => {
    fetch('/api/operators/data?view=activity')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.activity) setActivity(d.activity) })
      .catch(() => {})
  }, [])

  const statCards = [
    { label: 'Collections saved', value: stats.collections_count ?? 0, href: '/operators/collections' },
    { label: 'Trails built', value: stats.trails_count ?? 0, href: '/operators/trails' },
    { label: 'PDFs exported', value: stats.exports_count ?? 0, href: null },
  ]

  const quickActions = [
    { label: 'New Collection', href: '/operators/collections', icon: 'folder' },
    { label: 'New Trail', href: '/operators/trails', icon: 'map' },
    { label: 'Browse Venues', href: '/explore', icon: 'search' },
  ]

  const tier = operator?.tier || 'trial'
  const isUpgradeEligible = tier === 'trial' || tier === 'starter'

  return (
    <div>
      {/* Banners */}
      {banner && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 8,
          marginBottom: 24,
          fontFamily: 'var(--font-body)',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          ...(banner.type === 'success'
            ? { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }
            : { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }
          ),
        }}>
          <span>{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, lineHeight: 1, color: 'inherit', opacity: 0.5,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
          color: 'var(--color-ink)', marginBottom: 4,
        }}>
          Dashboard
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
          color: 'var(--color-muted)',
        }}>
          Welcome back, {operator?.contact_name || operator?.business_name || 'Operator'}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16,
        marginBottom: 32,
      }}>
        {statCards.map(card => {
          const inner = (
            <div style={{
              background: '#fff', borderRadius: 12, padding: '20px 24px',
              border: '1px solid var(--color-border)',
              transition: card.href ? 'border-color 0.15s' : undefined,
            }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                color: 'var(--color-muted)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 6,
              }}>
                {card.label}
              </p>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 32, fontWeight: 600,
                color: 'var(--color-ink)', margin: 0,
              }}>
                {card.value}
              </p>
            </div>
          )
          return card.href ? (
            <Link key={card.label} href={card.href} style={{ textDecoration: 'none' }}>
              {inner}
            </Link>
          ) : (
            <div key={card.label}>{inner}</div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
          color: 'var(--color-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 12,
        }}>
          Quick actions
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {quickActions.map(action => (
            <Link
              key={action.label}
              href={action.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 8,
                background: '#fff', border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                color: 'var(--color-ink)', textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}
            >
              <svg width="16" height="16" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Upgrade prompt */}
      {isUpgradeEligible && (
        <div style={{
          background: '#fff', borderRadius: 12, padding: '24px',
          border: '2px solid var(--color-sage)', marginBottom: 32,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h3 style={{
                fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                color: 'var(--color-ink)', marginBottom: 4,
              }}>
                {tier === 'trial' ? 'Activate your subscription' : 'Upgrade to Pro'}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                color: 'var(--color-muted)', margin: 0,
              }}>
                {tier === 'trial'
                  ? 'Choose a plan to unlock full access to collections, trails, and exports.'
                  : 'Get team members, priority support, and API access with the Pro plan.'
                }
              </p>
            </div>
            <Link
              href="/operators"
              style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                color: '#fff', background: 'var(--color-sage)',
                padding: '10px 24px', borderRadius: 8, textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              View plans
            </Link>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div>
        <h2 style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
          color: 'var(--color-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 12,
        }}>
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <div style={{
            background: '#fff', borderRadius: 12, padding: '40px 24px',
            border: '1px solid var(--color-border)', textAlign: 'center',
          }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
              color: 'var(--color-muted)',
            }}>
              No activity yet. Start by creating a collection or building a trail.
            </p>
          </div>
        ) : (
          <div style={{
            background: '#fff', borderRadius: 12,
            border: '1px solid var(--color-border)', overflow: 'hidden',
          }}>
            {activity.slice(0, 10).map((item, i) => (
              <div key={item.id || i} style={{
                padding: '12px 20px',
                borderBottom: i < Math.min(activity.length, 10) - 1 ? '1px solid var(--color-border)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 400,
                    color: 'var(--color-ink)', margin: '0 0 2px',
                  }}>
                    {item.description}
                  </p>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
                    color: 'var(--color-muted)', margin: 0,
                  }}>
                    {item.type}
                  </p>
                </div>
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 12,
                  color: 'var(--color-muted)', flexShrink: 0,
                }}>
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
