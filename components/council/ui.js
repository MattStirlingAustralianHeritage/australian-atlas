'use client'

import Link from 'next/link'
import { Sparkline, DeltaBadge } from './charts'

// Shared council-dashboard primitives. One place defines the card language so
// every page reads as the same product: white cards on the warm stone ground,
// Fraunces numerals for the figures, DM Sans small-caps for labels.

// Region map imagery for dashboard cards. Built at render time from the
// region's stored coordinates + the CURRENT public Mapbox token — the
// hero_image_url column embeds a token snapshot that has already rotted once
// (401s), so stored URLs are only a last-resort fallback.
export function regionMapImage(region, { width = 900, height = 300 } = {}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (region?.center_lat != null && region?.center_lng != null && token) {
    const zoom = region.map_zoom || 8
    return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${region.center_lng},${region.center_lat},${zoom},0/${width}x${height}@2x?access_token=${token}`
  }
  return region?.hero_image_url || null
}

export function Card({ children, style, className = '', hover = false }) {
  return (
    <div
      className={`${hover ? 'council-card-hover ' : ''}${className}`}
      style={{
        background: 'var(--color-card-bg)',
        borderRadius: 14,
        border: '1px solid var(--color-border)',
        padding: '1.5rem',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 420, letterSpacing: '-0.01em', color: 'var(--color-ink)', margin: '0 0 0.3rem', lineHeight: 1.1 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.92rem', color: 'var(--color-muted)', margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
      </div>
      {children ? <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>{children}</div> : null}
    </div>
  )
}

export function SectionTitle({ children, note, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', margin: '0 0 0.9rem' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 420, color: 'var(--color-ink)', margin: 0 }}>
          {children}
        </h2>
        {note && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.2rem 0 0' }}>{note}</p>
        )}
      </div>
      {action || null}
    </div>
  )
}

/** Headline figure card: Fraunces numeral, small-caps label, optional delta + sparkline. */
export function StatCard({ label, value, delta, spark, sub, accent }) {
  return (
    <Card style={{ padding: '1.15rem 1.3rem', display: 'flex', flexDirection: 'column', gap: '0.15rem', position: 'relative', overflow: 'hidden' }}>
      {accent && <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }} />}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '2.1rem', fontWeight: 430, color: 'var(--color-ink)', margin: 0, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
          {typeof value === 'number' ? value.toLocaleString('en-AU') : (value ?? '—')}
        </p>
        {delta}
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)', margin: '0.3rem 0 0' }}>
        {label}
      </p>
      {sub && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-muted)', margin: '0.15rem 0 0' }}>{sub}</p>}
      {spark && <div style={{ marginTop: '0.5rem' }}>{spark}</div>}
    </Card>
  )
}

export { Sparkline, DeltaBadge }

export function EmptyState({ title, children, action }) {
  return (
    <Card style={{ padding: '2.25rem 1.75rem', textAlign: 'center' }}>
      {title && (
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-ink)', margin: '0 0 0.4rem' }}>{title}</p>
      )}
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--color-muted)', margin: 0, lineHeight: 1.55 }}>
        {children}
      </p>
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </Card>
  )
}

export function Pill({ active, children, onClick, href }) {
  const style = {
    padding: '0.38rem 0.85rem',
    borderRadius: 999,
    fontSize: '0.8rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    background: active ? 'var(--color-ink)' : 'var(--color-card-bg)',
    color: active ? 'var(--color-cream)' : 'var(--color-muted)',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
    transition: 'all 0.15s ease',
  }
  if (href) return <Link href={href} style={style}>{children}</Link>
  return <button type="button" onClick={onClick} style={style}>{children}</button>
}

export function Button({ children, onClick, href, variant = 'primary', type = 'button', disabled, small, download, target }) {
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    fontFamily: 'var(--font-body)',
    fontSize: small ? '0.8rem' : '0.875rem',
    fontWeight: 550,
    padding: small ? '0.42rem 0.9rem' : '0.55rem 1.15rem',
    borderRadius: 10,
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
    opacity: disabled ? 0.55 : 1,
    transition: 'all 0.15s ease',
    ...(variant === 'primary' && { background: 'var(--color-ink)', color: 'var(--color-cream)' }),
    ...(variant === 'sage' && { background: 'var(--color-sage)', color: '#fff' }),
    ...(variant === 'secondary' && { background: 'var(--color-card-bg)', color: 'var(--color-ink)', borderColor: 'var(--color-border)' }),
    ...(variant === 'ghost' && { background: 'transparent', color: 'var(--color-sage-dark)' }),
  }
  if (href) {
    return <a href={href} style={style} download={download} target={target} rel={target === '_blank' ? 'noopener noreferrer' : undefined}>{children}</a>
  }
  return <button type={type} onClick={onClick} disabled={disabled} style={style}>{children}</button>
}

/** Range selector shared by the analytics-style pages. */
export function RangePicker({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 2, gap: 2 }}>
      {[['30d', '30 days'], ['90d', '90 days'], ['1y', '12 months']].map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          style={{
            fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 550,
            padding: '0.35rem 0.75rem', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: value === key ? 'var(--color-ink)' : 'transparent',
            color: value === key ? 'var(--color-cream)' : 'var(--color-muted)',
            transition: 'all 0.15s ease',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Loading shimmer blocks (styles in globals.css .council-skel). */
export function Skeleton({ height = 120, style }) {
  return <div className="council-skel" style={{ height, borderRadius: 14, ...style }} aria-hidden="true" />
}

export function SkeletonPage() {
  return (
    <div>
      <Skeleton height={40} style={{ width: 280, marginBottom: '0.6rem' }} />
      <Skeleton height={18} style={{ width: 420, marginBottom: '1.75rem' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Skeleton height={110} /><Skeleton height={110} /><Skeleton height={110} /><Skeleton height={110} />
      </div>
      <Skeleton height={280} />
    </div>
  )
}
