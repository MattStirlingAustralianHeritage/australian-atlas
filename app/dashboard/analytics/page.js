'use client'

import { useAuth } from '../layout'

function PlaceholderStatCard({ label, value, subtitle }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.5rem',
      flex: '1 1 0',
      minWidth: '200px',
    }}>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.8rem',
        color: 'var(--color-muted)',
        margin: '0 0 0.5rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '2rem',
        fontWeight: 600,
        color: 'var(--color-ink)',
        margin: '0 0 0.25rem',
      }}>
        {value}
      </p>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.75rem',
        color: 'var(--color-muted)',
        margin: 0,
      }}>
        {subtitle}
      </p>
    </div>
  )
}

export default function DashboardAnalytics() {
  const { user } = useAuth()

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
          Analytics
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Cross-network analytics coming soon
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <PlaceholderStatCard label="Total Views" value="--" subtitle="Last 30 days" />
        <PlaceholderStatCard label="Website Clicks" value="--" subtitle="Last 30 days" />
        <PlaceholderStatCard label="Search Appearances" value="--" subtitle="Last 30 days" />
      </div>

      <div style={{
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid var(--color-border)',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.9rem',
          color: 'var(--color-muted)',
          margin: 0,
          lineHeight: 1.6,
        }}>
          Analytics tracking is being set up across the network.
          <br />
          You will be able to see page views, click-throughs, and search appearances for all your claimed listings here.
        </p>
      </div>
    </div>
  )
}
