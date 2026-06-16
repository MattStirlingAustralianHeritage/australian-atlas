'use client'

import { useState, useCallback } from 'react'

// Surfaces operator-uploaded listing images (hero AND gallery) the moderation
// model flagged or held, one row per image, with manual approve (→ display) /
// reject (→ remove) controls. Backed by POST /api/admin/image-moderation/[id]
// ({ action, target: 'hero'|'gallery', url? }). Sits in the Candidate Review page.

const VERT_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const STATUS_STYLE = {
  flagged: { label: 'Flagged', bg: '#FEE2E2', fg: '#dc2626' },
  held: { label: 'Held', bg: '#FEF3C7', fg: '#b45309' },
}

const CATEGORY_LABELS = {
  explicit: 'Explicit', offensive: 'Offensive', watermarked_stock: 'Watermarked / stock',
  low_quality: 'Low quality', clean: 'Clean', unverified_source: 'Unverified source',
  unsupported_format: 'Unsupported format', api_error: 'Moderation error',
  request_error: 'Moderation error', parse_error: 'Unreadable response',
  low_confidence: 'Low confidence', unavailable: 'Moderation unavailable',
  too_large: 'Too large', fetch_error: 'Could not retrieve', empty: 'No image',
}

function categoryLabel(c) {
  if (!c) return null
  return CATEGORY_LABELS[c] || c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())
}

export default function FlaggedHeroImages({ initial = [] }) {
  const [items, setItems] = useState(initial)
  const [busyKey, setBusyKey] = useState(null)
  const [errorKey, setErrorKey] = useState(null)

  const act = useCallback(async (item, action) => {
    setBusyKey(item.key)
    setErrorKey(null)
    try {
      const res = await fetch(`/api/admin/image-moderation/${item.listingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          target: item.kind,
          ...(item.kind === 'gallery' ? { url: item.url } : {}),
        }),
      })
      if (!res.ok) {
        setErrorKey(item.key)
        return
      }
      // Approved or rejected → leaves the queue either way.
      setItems(prev => prev.filter(it => it.key !== item.key))
    } catch {
      setErrorKey(item.key)
    } finally {
      setBusyKey(null)
    }
  }, [])

  return (
    <div style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>
          Images awaiting review
        </h2>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
          color: items.length ? '#dc2626' : 'var(--color-muted)',
          background: items.length ? '#FEE2E2' : 'transparent',
          padding: items.length ? '2px 9px' : 0, borderRadius: 100,
        }}>
          {items.length}
        </span>
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', margin: '0 0 16px' }}>
        Operator-uploaded cover photos and gallery images the AI filter flagged or held. They are hidden from the public site and the vertical sites until approved.
      </p>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.75rem 0', border: '1px dashed var(--color-border, #e5e5e5)', borderRadius: 8 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
            No images awaiting review.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {items.map(it => {
            const status = STATUS_STYLE[it.status] || STATUS_STYLE.held
            const busy = busyKey === it.key
            const conf = it.confidence
            const confPct = (conf || conf === 0) ? `${Math.round(Number(conf) * 100)}%` : null
            const kindLabel = it.kind === 'gallery' ? 'Gallery photo' : 'Cover photo'
            return (
              <div key={it.key} style={{
                display: 'flex', gap: 16, padding: 16, borderRadius: 12,
                border: '1px solid var(--color-border, #e5e5e5)', background: '#fff',
                flexWrap: 'wrap', alignItems: 'flex-start',
              }}>
                {/* The flagged/held image itself */}
                <div style={{
                  width: 132, height: 132, flexShrink: 0, borderRadius: 8, overflow: 'hidden',
                  background: '#f3f1ec', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {it.url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={it.url} alt={it.listingName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>no image</span>
                  )}
                </div>

                {/* Details */}
                <div style={{ flex: '1 1 260px', minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15, color: 'var(--color-ink)' }}>
                      {it.listingName}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 9, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--color-muted)', border: '1px solid var(--color-border)',
                      padding: '2px 7px', borderRadius: 100, whiteSpace: 'nowrap',
                    }}>
                      {VERT_NAMES[it.vertical] || it.vertical}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 9, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: '#6b5d3f', background: '#f3eede',
                      padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap',
                    }}>
                      {kindLabel}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em',
                      textTransform: 'uppercase', color: status.fg, background: status.bg,
                      padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap',
                    }}>
                      {status.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                    {categoryLabel(it.category) && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)' }}>
                        <strong style={{ fontWeight: 600 }}>Category:</strong> {categoryLabel(it.category)}
                      </span>
                    )}
                    {confPct && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
                        Confidence {confPct}
                      </span>
                    )}
                  </div>

                  {it.reason && (
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
                      {it.reason}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => act(it, 'approve')}
                      disabled={busy || !it.url}
                      style={{
                        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
                        color: '#fff', background: '#16a34a', border: 'none',
                        padding: '7px 16px', borderRadius: 6,
                        cursor: busy || !it.url ? 'default' : 'pointer',
                        opacity: busy || !it.url ? 0.55 : 1,
                      }}
                    >
                      {busy ? '…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => act(it, 'reject')}
                      disabled={busy}
                      style={{
                        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
                        color: '#dc2626', background: '#fff', border: '1px solid #dc2626',
                        padding: '7px 16px', borderRadius: 6,
                        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.55 : 1,
                      }}
                    >
                      {busy ? '…' : 'Reject'}
                    </button>
                    <a
                      href={`/admin/listings/${it.listingId}`}
                      style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                        color: 'var(--color-muted)', textDecoration: 'none', padding: '7px 4px',
                      }}
                    >
                      Open listing →
                    </a>
                    {errorKey === it.key && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#dc2626' }}>
                        Action failed — try again.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
