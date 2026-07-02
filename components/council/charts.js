'use client'

import { useState, useRef, useId } from 'react'

// Lightweight SVG charts for the council dashboard + white-label report.
// No chart library: the shapes we need (sparkline, weekly trend, bar rows)
// are simple enough that hand-rolled SVG keeps the bundle lean and the
// typography/palette exactly on the Atlas system.

const SAGE = '#5f8a7e'
const TERRACOTTA = '#C4603A'
const INK = '#1C1A17'
const MUTED = '#6B6760'
const BORDER = 'rgba(28,26,23,0.12)'

function buildPath(values, w, h, pad, max) {
  if (!values.length) return { line: '', area: '' }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const step = values.length > 1 ? innerW / (values.length - 1) : 0
  const x = (i) => pad.l + i * step
  const y = (v) => pad.t + innerH - (max > 0 ? (v / max) * innerH : 0)
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const line = `M${pts.join('L')}`
  const area = `${line}L${x(values.length - 1).toFixed(1)},${(pad.t + innerH).toFixed(1)}L${pad.l},${(pad.t + innerH).toFixed(1)}Z`
  return { line, area }
}

/** Tiny inline area chart for stat cards. */
export function Sparkline({ data = [], width = 120, height = 34, color = SAGE }) {
  const gid = useId()
  const values = data.map((v) => (typeof v === 'number' ? v : 0))
  if (values.length < 2 || values.every((v) => v === 0)) return null
  const max = Math.max(...values)
  const pad = { t: 3, b: 2, l: 1, r: 3 }
  const { line, area } = buildPath(values, width, height, pad, max)
  const lastX = pad.l + (width - pad.l - pad.r)
  const lastY = pad.t + (height - pad.t - pad.b) - (max > 0 ? (values[values.length - 1] / max) * (height - pad.t - pad.b) : 0)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`sp-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp-${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.4" fill={color} />
    </svg>
  )
}

const NICE_DATE = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

/**
 * Weekly trend chart — two series (views sage area, clicks terracotta line)
 * over shared weekly buckets. `series`: [{ weekStart, views, clicks }].
 * Hover shows a guide with both values; renders fine statically for print.
 */
export function TrendChart({ series = [], height = 230, viewsLabel = 'Page views', clicksLabel = 'Listing clicks' }) {
  const gid = useId()
  const wrapRef = useRef(null)
  const [hover, setHover] = useState(null)

  const W = 720
  const H = height
  const pad = { t: 14, b: 26, l: 40, r: 10 }
  const views = series.map((s) => s.views || 0)
  const clicks = series.map((s) => s.clicks || 0)
  const max = Math.max(1, ...views, ...clicks)
  // Round the axis top up to a friendly number so gridlines land on integers.
  const niceMax = (() => {
    const raw = max
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const norm = raw / mag
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
    return nice * mag
  })()

  const vp = buildPath(views, W, H, pad, niceMax)
  const cp = buildPath(clicks, W, H, pad, niceMax)
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const step = series.length > 1 ? innerW / (series.length - 1) : 0
  const xAt = (i) => pad.l + i * step
  const yAt = (v) => pad.t + innerH - (niceMax > 0 ? (v / niceMax) * innerH : 0)

  if (series.length < 2) {
    return (
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted)', margin: 0 }}>
        Not enough weekly data to chart yet — this fills in as traffic accrues.
      </p>
    )
  }

  const gridLines = [0.25, 0.5, 0.75, 1]
  // Label roughly every 4th bucket, always including first and last.
  const labelEvery = Math.max(1, Math.round(series.length / 5))

  function onMove(e) {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round((px - pad.l) / (step || 1))
    if (i >= 0 && i < series.length) setHover(i)
  }

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      style={{ position: 'relative' }}
    >
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginBottom: '0.35rem' }}>
        <LegendDot color={SAGE} label={viewsLabel} />
        <LegendDot color={TERRACOTTA} label={clicksLabel} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${viewsLabel} and ${clicksLabel} by week`}>
        <defs>
          <linearGradient id={`tc-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SAGE} stopOpacity="0.22" />
            <stop offset="100%" stopColor={SAGE} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid + y labels */}
        {gridLines.map((f) => {
          const y = pad.t + innerH - f * innerH
          const val = Math.round(niceMax * f)
          return (
            <g key={f}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke={BORDER} strokeWidth="1" />
              <text x={pad.l - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-body)">
                {val.toLocaleString()}
              </text>
            </g>
          )
        })}
        <line x1={pad.l} y1={pad.t + innerH} x2={W - pad.r} y2={pad.t + innerH} stroke={BORDER} strokeWidth="1" />

        {/* Series */}
        <path d={vp.area} fill={`url(#tc-${gid})`} />
        <path d={vp.line} fill="none" stroke={SAGE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={cp.line} fill="none" stroke={TERRACOTTA} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="none" />

        {/* X labels */}
        {series.map((s, i) => {
          if (i % labelEvery !== 0 && i !== series.length - 1) return null
          return (
            <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="var(--font-body)">
              {NICE_DATE(s.weekStart)}
            </text>
          )
        })}

        {/* Hover guide */}
        {hover != null && (
          <g>
            <line x1={xAt(hover)} y1={pad.t} x2={xAt(hover)} y2={pad.t + innerH} stroke={INK} strokeOpacity="0.25" strokeWidth="1" />
            <circle cx={xAt(hover)} cy={yAt(views[hover])} r="3.5" fill={SAGE} stroke="#fff" strokeWidth="1.5" />
            <circle cx={xAt(hover)} cy={yAt(clicks[hover])} r="3.5" fill={TERRACOTTA} stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {/* Hover tooltip */}
      {hover != null && (
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: `${((xAt(hover) / W) * 100).toFixed(2)}%`,
            transform: xAt(hover) > W * 0.72 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            boxShadow: '0 4px 14px rgba(28,26,23,0.12)',
            padding: '0.5rem 0.7rem',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            zIndex: 5,
          }}
        >
          <p style={{ margin: '0 0 0.25rem', color: MUTED, fontWeight: 600 }}>Week of {NICE_DATE(series[hover].weekStart)}</p>
          <p style={{ margin: 0, color: INK }}>
            <span style={{ color: SAGE, fontWeight: 700 }}>●</span> {(views[hover] || 0).toLocaleString()} {viewsLabel.toLowerCase()}
          </p>
          <p style={{ margin: 0, color: INK }}>
            <span style={{ color: TERRACOTTA, fontWeight: 700 }}>●</span> {(clicks[hover] || 0).toLocaleString()} {clicksLabel.toLowerCase()}
          </p>
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-muted)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

/** Horizontal bar rows — categories, origins, searches. */
export function BarRows({ rows = [], color = SAGE, valueLabel = '' }) {
  const max = Math.max(1, ...rows.map((r) => r.value || 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.2rem', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--color-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.label}
              {r.sub ? <span style={{ color: 'var(--color-muted)' }}>{` · ${r.sub}`}</span> : null}
            </span>
            <span style={{ color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {(r.value || 0).toLocaleString()}{valueLabel}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: 'rgba(28,26,23,0.07)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(2, ((r.value || 0) / max) * 100)}%`,
                borderRadius: 999,
                background: r.color || color,
                transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Signed percentage delta vs a previous period. */
export function DeltaBadge({ current, previous, invert = false }) {
  if (typeof current !== 'number' || typeof previous !== 'number' || previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (!isFinite(pct)) return null
  const up = pct > 0
  const flat = pct === 0
  const good = invert ? !up : up
  const color = flat ? 'var(--color-muted)' : good ? 'var(--color-sage-dark)' : 'var(--color-accent)'
  const bg = flat ? 'rgba(28,26,23,0.06)' : good ? 'rgba(95,138,126,0.14)' : 'rgba(196,96,58,0.12)'
  return (
    <span
      title="vs the previous period"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.15rem',
        fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600,
        color, background: bg, borderRadius: 999, padding: '0.1rem 0.5rem',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {flat ? '→' : up ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}
