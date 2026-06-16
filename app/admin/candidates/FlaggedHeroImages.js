'use client'

import { useState, useCallback } from 'react'

// Surfaces operator hero uploads the moderation model flagged or held, with
// manual approve (→ display) / reject (→ remove) controls. Backed by
// POST /api/admin/image-moderation/[id]. Mirrors the Candidate Review surface.

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
  const [busyId, setBusyId] = useState(null)
  const [errorId, setErrorId] = useState(null)

  const act = useCallback(async (id, action) => {
    setBusyId(id)
    setErrorId(null)
    try {
      const res = await fetch(`/api/admin/image-moderation/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        setErrorId(id)
        return
      }
      // Approved or rejected → leaves the queue either way.
      setItems(prev => prev.filter(it => it.id !== id))
    } catch {
      setErrorId(id)
    } finally {
      setBusyId(null)
    }
  }, [])

  return (
    <div style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>
          Hero images awaiting review
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
        Operator uploads the AI filter flagged or held. They are hidden from the public site and the vertical sites until approved.
      </p>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.75rem 0', border: '1px dashed var(--color-border, #e5e5e5)', borderRadius: 8 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
            No hero images awaiting review.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {items.map(it => {
            const status = STATUS_STYLE[it.image_moderation_status] || STATUS_STYLE.held
            const busy = busyId === it.id
            const conf = it.image_moderation_confidence
            const confPct = (conf || conf === 0) ? `${Math.round(Number(conf) * 100)}%` : null
            return (
              <div key={it.id} style={{
                display: 'flex', gap: 16, padding: 16, borderRadius: 12,
                border: '1px solid var(--color-border, #e5e5e5)', background: '#fff',
                flexWrap: 'wrap', alignItems: 'flex-start',
              }}>
                {/* The flagged/held image itself */}
                <div style={{
                  width: 132, height: 132, flexShrink: 0, borderRadius: 8, overflow: 'hidden',
                  background: '#f3f1ec', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {it.hero_image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={it.hero_image_url} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>no image</span>
                  )}
                </div>

                {/* Details */}
                <div style={{ flex: '1 1 260px', minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15, color: 'var(--color-ink)' }}>
                      {it.name}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 9, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--color-muted)', border: '1px solid var(--color-border)',
                      padding: '2px 7px', borderRadius: 100, whiteSpace: 'nowrap',
                    }}>
                      {VERT_NAMES[it.vertical] || it.vertical}
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
                    {categoryLabel(it.image_moderation_category) && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)' }}>
                        <strong style={{ fontWeight: 600 }}>Category:</strong> {categoryLabel(it.image_moderation_category)}
                      </span>
                    )}
                    {confPct && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
                        Confidence {confPct}
                      </span>
                    )}
                  </div>

                  {it.image_moderation_reason && (
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
                      {it.image_moderation_reason}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => act(it.id, 'approve')}
                      disabled={busy || !it.hero_image_url}
                      style={{
                        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
                        color: '#fff', background: '#16a34a', border: 'none',
                        padding: '7px 16px', borderRadius: 6,
                        cursor: busy || !it.hero_image_url ? 'default' : 'pointer',
                        opacity: busy || !it.hero_image_url ? 0.55 : 1,
                      }}
                    >
                      {busy ? '…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => act(it.id, 'reject')}
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
                      href={`/admin/listings/${it.id}`}
                      style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                        color: 'var(--color-muted)', textDecoration: 'none', padding: '7px 4px',
                      }}
                    >
                      Open listing →
                    </a>
                    {errorId === it.id && (
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
