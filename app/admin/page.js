'use client'

import { useState, useEffect } from 'react'
import EditorialPitches from '@/components/admin/EditorialPitches'

const VERTICAL_NAMES = {
  sba: 'Small Batch',
  collection: 'Culture',
  craft: 'Craft',
  fine_grounds: 'Fine Grounds',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

const VERTICAL_ORDER = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

// Dot-grid SVG for texture overlay
const DOT_GRID_BG = `url("data:image/svg+xml,%3Csvg width='16' height='16' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.6' fill='rgba(255,255,255,0.06)'/%3E%3C/svg%3E")`

export default function AdminPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/dashboard-stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-cream, #FAF8F5)',
      paddingBottom: '4rem',
    }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{
        padding: '2rem 1.5rem 0',
        maxWidth: 1120,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontSize: '1.75rem',
            fontWeight: 600,
            color: 'var(--color-ink, #2D2A26)',
            margin: '0 0 0.25rem',
          }}>
            Admin
          </h1>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.85rem',
            color: 'var(--color-muted, #6B6760)',
            margin: 0,
          }}>
            Australian Atlas Network
          </p>
        </div>
        <a
          href="/admin/logout"
          onClick={e => { e.preventDefault(); window.location.href = '/admin/logout' }}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid var(--color-border, #e5e5e5)',
            background: '#fff',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.8rem',
            color: 'var(--color-muted, #6B6760)',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          Sign out
        </a>
      </div>

      {/* ── Network Health Bar ──────────────────────────────── */}
      <div style={{ padding: '1.5rem 1.5rem 0', maxWidth: 1120, margin: '0 auto' }}>
        <HealthBar stats={stats} loading={loading} />
      </div>

      {/* ── Quick Actions ───────────────────────────────────── */}
      <div style={{ padding: '1.25rem 1.5rem 0', maxWidth: 1120, margin: '0 auto' }}>
        <QuickActions stats={stats} />
      </div>

      {/* ── Zones Grid ──────────────────────────────────────── */}
      <div style={{
        padding: '1.25rem 1.5rem 0',
        maxWidth: 1120,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(480px, 100%), 1fr))',
        gap: '1.25rem',
      }}>
        <ListingsZone stats={stats} loading={loading} />
        <ContentZone stats={stats} loading={loading} />
        <DataQualityZone />
        <OperationsZone />
      </div>

      {/* ── Editorial Pitches ───────────────────────────────── */}
      <EditorialPitches />
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HEALTH BAR
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function HealthBar({ stats, loading }) {
  const metrics = [
    {
      label: 'Total Listings',
      value: stats?.total ?? null,
      color: '#5f8a7e',
      href: '/admin/listings',
    },
    {
      label: 'Active',
      value: stats?.active ?? null,
      color: '#5f8a7e',
      href: '/admin/listings',
    },
    {
      label: 'Hidden',
      value: stats?.hidden ?? null,
      color: stats?.hidden > 0 ? '#d4a039' : '#5f8a7e',
      href: '/admin/listings',
    },
    {
      label: 'Needs Review',
      value: stats?.needs_review ?? null,
      color: stats?.needs_review > 10 ? '#c4603a' : stats?.needs_review > 0 ? '#d4a039' : '#5f8a7e',
      href: '/admin/listings-review',
    },
    {
      label: 'Pending Claims',
      value: stats?.pending_claims ?? null,
      color: stats?.pending_claims > 0 ? '#d4a039' : '#5f8a7e',
      href: '/admin/claims',
    },
    {
      label: 'Pending Candidates',
      value: stats?.pending_candidates ?? null,
      color: stats?.pending_candidates > 20 ? '#c4603a' : stats?.pending_candidates > 0 ? '#d4a039' : '#5f8a7e',
      href: '/admin/candidates',
    },
    {
      label: 'Reviewed',
      value: stats?.humanised ?? null,
      color: '#5f8a7e',
      href: '/admin/listings-review',
    },
  ]

  return (
    <div style={{
      background: '#1C1A17',
      borderRadius: '14px',
      border: '1px solid rgba(255,255,255,0.08)',
      padding: '1.25rem 1.5rem',
      backgroundImage: DOT_GRID_BG,
      backgroundSize: '16px 16px',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1rem',
      }}>
        <span style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: loading ? '#d4a039' : '#5f8a7e',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.5)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          Network Health
        </span>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.625rem',
      }}>
        {metrics.map(m => (
          <HealthPill key={m.label} {...m} loading={loading} />
        ))}
      </div>
    </div>
  )
}

function HealthPill({ label, value, color, href, loading }) {
  const navigate = (e) => {
    e.preventDefault()
    window.location.href = href
  }

  return (
    <a
      href={href}
      onClick={navigate}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        padding: '0.75rem 1rem',
        textDecoration: 'none',
        cursor: 'pointer',
        minWidth: '110px',
        flex: '1 1 110px',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
    >
      <span style={{
        fontFamily: 'var(--font-display, Georgia)',
        fontSize: '1.5rem',
        fontWeight: 600,
        color: loading ? 'rgba(255,255,255,0.3)' : '#fff',
        lineHeight: 1.1,
        marginBottom: '0.25rem',
      }}>
        {loading ? '--' : (value?.toLocaleString() ?? '0')}
      </span>
      <span style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: '0.675rem',
        color: 'rgba(255,255,255,0.45)',
        fontWeight: 500,
        lineHeight: 1.2,
      }}>
        <span style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: loading ? 'rgba(255,255,255,0.2)' : color,
          flexShrink: 0,
        }} />
        {label}
      </span>
    </a>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   QUICK ACTIONS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function QuickActions({ stats }) {
  const actions = [
    {
      label: 'Review Listings',
      href: '/admin/listings-review',
      accent: false,
      badge: null,
    },
    {
      label: 'Review Candidates',
      href: '/admin/candidates',
      accent: stats?.pending_candidates > 0,
      badge: stats?.pending_candidates > 0 ? stats.pending_candidates : null,
    },
    {
      label: 'Review Claims',
      href: '/admin/claims',
      accent: stats?.pending_claims > 0,
      badge: stats?.pending_claims > 0 ? stats.pending_claims : null,
    },
    {
      label: 'Editorial',
      href: '/admin/editorial',
      accent: false,
      badge: null,
    },
    {
      label: 'View Analytics',
      href: '/admin/analytics',
      accent: false,
      badge: null,
    },
  ]

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.5rem',
    }}>
      {actions.map(a => (
        <QuickActionButton key={a.label} {...a} />
      ))}
    </div>
  )
}

function QuickActionButton({ label, href, accent, badge }) {
  const navigate = (e) => {
    e.preventDefault()
    window.location.href = href
  }

  return (
    <a
      href={href}
      onClick={navigate}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        border: accent
          ? '1px solid var(--color-accent, #C4603A)'
          : '1px solid var(--color-border, rgba(28,26,23,0.12))',
        background: accent ? 'rgba(196,96,58,0.06)' : '#fff',
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: '0.8rem',
        fontWeight: 500,
        color: accent ? 'var(--color-accent, #C4603A)' : 'var(--color-ink, #2D2A26)',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = accent
          ? 'var(--color-accent, #C4603A)'
          : 'rgba(28,26,23,0.28)'
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = accent
          ? 'var(--color-accent, #C4603A)'
          : 'rgba(28,26,23,0.12)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {label}
      {badge !== null && (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-accent, #C4603A)',
          color: '#fff',
          fontSize: '0.65rem',
          fontWeight: 700,
          borderRadius: '9px',
          minWidth: '18px',
          height: '18px',
          padding: '0 5px',
          lineHeight: 1,
        }}>
          {badge}
        </span>
      )}
    </a>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ZONE CARD WRAPPER
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function ZoneCard({ title, children }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '14px',
      border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '1rem 1.25rem 0.75rem',
        borderBottom: '1px solid var(--color-border, rgba(28,26,23,0.12))',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'var(--color-muted, #6B6760)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          margin: 0,
        }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
        {children}
      </div>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LISTINGS ZONE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function ListingsZone({ stats, loading }) {
  const links = [
    { label: 'Listings Review', description: 'Review every listing with a human eye', href: '/admin/listings-review' },
    { label: 'Candidates', description: 'Listing acquisition pipeline', href: '/admin/candidates' },
    { label: 'Claims', description: 'Vendor claim requests', href: '/admin/claims' },
    { label: 'Listings Editor', description: 'Browse and edit all listings', href: '/admin/listings' },
    { label: 'Regions', description: 'View and manage regions', href: '/regions' },
  ]

  const verticals = VERTICAL_ORDER.map(v => ({
    key: v,
    name: VERTICAL_NAMES[v],
    count: stats?.vertical_counts?.[v] ?? null,
  }))

  return (
    <ZoneCard title="Listings">
      {/* Links */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '0.5rem',
        marginBottom: '1rem',
      }}>
        {links.map(l => (
          <ZoneLink key={l.href} {...l} />
        ))}
      </div>

      {/* Vertical Counts Grid */}
      <div style={{
        borderTop: '1px solid var(--color-border, rgba(28,26,23,0.12))',
        paddingTop: '0.875rem',
      }}>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: '0.675rem',
          fontWeight: 600,
          color: 'var(--color-muted, #6B6760)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          margin: '0 0 0.625rem',
        }}>
          Active by vertical
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
          gap: '0.375rem',
        }}>
          {verticals.map(v => (
            <div key={v.key} style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.35rem',
              padding: '0.35rem 0.5rem',
              background: 'var(--color-cream, #FAF8F5)',
              borderRadius: '6px',
              border: '1px solid var(--color-border, rgba(28,26,23,0.08))',
            }}>
              <span style={{
                fontFamily: 'var(--font-display, Georgia)',
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--color-ink, #2D2A26)',
                lineHeight: 1,
              }}>
                {loading ? '--' : (v.count?.toLocaleString() ?? '0')}
              </span>
              <span style={{
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: '0.6rem',
                color: 'var(--color-muted, #6B6760)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}>
                {v.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ZoneCard>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONTENT ZONE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function ContentZone({ stats, loading }) {
  const contentLinks = [
    { label: 'Articles', description: 'Create and publish journal articles', href: '/admin/articles' },
    { label: 'Editorial Queue', description: 'Story ideas and interview pipeline', href: '/admin/editorial' },
    { label: 'Trails', description: 'Editorial trails linking venues', href: '/admin/trails' },
    { label: 'Events', description: 'Manage community events', href: '/admin/events' },
  ]

  return (
    <ZoneCard title="Content">
      {/* Quick stats */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1rem',
      }}>
        <ContentStat
          label="Published Articles"
          value={loading ? '--' : (stats?.published_articles ?? 0)}
        />
        <ContentStat
          label="Published Trails"
          value={loading ? '--' : (stats?.published_trails ?? 0)}
        />
      </div>

      {/* Links */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '0.5rem',
      }}>
        {contentLinks.map(l => (
          <ZoneLink key={l.href} {...l} />
        ))}
      </div>
    </ZoneCard>
  )
}

function ContentStat({ label, value }) {
  return (
    <div style={{
      padding: '0.625rem 0.875rem',
      background: 'var(--color-cream, #FAF8F5)',
      borderRadius: '8px',
      border: '1px solid var(--color-border, rgba(28,26,23,0.08))',
      flex: '1 1 0',
    }}>
      <span style={{
        fontFamily: 'var(--font-display, Georgia)',
        fontSize: '1.25rem',
        fontWeight: 600,
        color: 'var(--color-ink, #2D2A26)',
        display: 'block',
        lineHeight: 1.1,
        marginBottom: '0.2rem',
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      <span style={{
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: '0.65rem',
        color: 'var(--color-muted, #6B6760)',
        fontWeight: 500,
      }}>
        {label}
      </span>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DATA QUALITY ZONE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function DataQualityZone() {
  const links = [
    { label: 'Completeness', description: 'Listing quality scores, missing fields', href: '/admin/completeness' },
    { label: 'Staleness', description: 'Listing freshness, dead URLs', href: '/admin/staleness' },
    { label: 'Duplicates', description: 'Semantic deduplication review', href: '/admin/duplicates' },
    { label: 'Data Audit', description: 'Flagged listings from integrity audits', href: '/admin/audit-review' },
    { label: 'Pipeline Health', description: 'Sync integrity, orphan fixer', href: '/admin/health' },
  ]

  return (
    <ZoneCard title="Data Quality">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '0.5rem',
      }}>
        {links.map(l => (
          <ZoneLink key={l.href} {...l} />
        ))}
      </div>
    </ZoneCard>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   OPERATIONS ZONE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function OperationsZone() {
  const links = [
    { label: 'Analytics', description: 'Traffic, geography, per-vertical breakdown', href: '/admin/analytics' },
    { label: 'Search Insights', description: 'Top queries, trail prompts, zero-result searches', href: '/admin/insights' },
    { label: 'Listings Review', description: 'Review listings with a human eye', href: '/admin/listings-review' },
    { label: 'Notes', description: 'Bug reports, cosmetic issues, suggestions', href: '/admin/notes' },
  ]

  return (
    <ZoneCard title="Operations">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '0.5rem',
      }}>
        {links.map(l => (
          <ZoneLink key={l.href} {...l} />
        ))}
      </div>
    </ZoneCard>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SHARED — ZONE LINK
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function ZoneLink({ label, description, href }) {
  const navigate = (e) => {
    e.preventDefault()
    window.location.href = href
  }

  return (
    <a
      href={href}
      onClick={navigate}
      style={{
        display: 'block',
        padding: '0.625rem 0.75rem',
        borderRadius: '8px',
        border: '1px solid var(--color-border, rgba(28,26,23,0.08))',
        background: 'var(--color-cream, #FAF8F5)',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(28,26,23,0.24)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(28,26,23,0.08)'}
    >
      <span style={{
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: '0.825rem',
        fontWeight: 500,
        color: 'var(--color-ink, #2D2A26)',
        display: 'block',
        marginBottom: '0.125rem',
        lineHeight: 1.3,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: '0.7rem',
        color: 'var(--color-muted, #6B6760)',
        lineHeight: 1.3,
      }}>
        {description}
      </span>
    </a>
  )
}
