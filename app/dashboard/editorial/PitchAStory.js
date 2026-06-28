'use client'

import { useState, useEffect } from 'react'

/* The dashboard Editorial page's headline action: let an operator apply to
   have a story written about a listing they own. A short pitch (the "angle")
   flows to the admin Listing Pitches queue (/admin/listing-pitches). */

// Operator-facing labels for a pitch's workflow status (friendlier than the
// raw admin states).
const PITCH_STATUS = {
  new:       { label: 'Submitted',     bg: '#fbf3e3', fg: '#8a6d1f' },
  reviewing: { label: 'In review',     bg: '#eaf1f6', fg: '#2f5a73' },
  accepted:  { label: 'Accepted',      bg: '#eef6f0', fg: '#2f7a5e' },
  declined:  { label: 'Not this time', bg: '#f3f1ef', fg: '#7a736b' },
  published: { label: 'Published',     bg: '#eef6f0', fg: '#2f7a5e' },
}

const INPUT_STYLE = {
  fontFamily: 'var(--font-sans)',
  fontSize: '0.9rem',
  padding: '0.6rem 0.75rem',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  background: '#fff',
  color: 'var(--color-ink)',
}

const LABEL_STYLE = {
  display: 'block',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.72rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-muted)',
  marginBottom: '0.4rem',
}

const SECTION_HEADING = {
  fontFamily: 'var(--font-sans)',
  fontSize: '0.8rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-muted)',
  margin: '0 0 0.75rem',
}

function StatusPill({ status }) {
  const meta = PITCH_STATUS[status] || PITCH_STATUS.new
  return (
    <span style={{
      display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 999,
      fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600,
      background: meta.bg, color: meta.fg, whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  )
}

export default function PitchAStory({ listings }) {
  const ownable = (listings || []).filter(Boolean)
  const [listingId, setListingId] = useState('')
  const [angle, setAngle] = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const [pitches, setPitches] = useState([])
  const [pitchesLoaded, setPitchesLoaded] = useState(false)

  // default the listing selector once context arrives
  useEffect(() => {
    if (!listingId && ownable[0]?.id) setListingId(String(ownable[0].id))
  }, [ownable, listingId])

  function loadPitches() {
    fetch('/api/dashboard/editorial/pitch')
      .then(r => r.ok ? r.json() : { pitches: [] })
      .then(d => { setPitches(d.pitches || []); setPitchesLoaded(true) })
      .catch(() => setPitchesLoaded(true))
  }
  useEffect(() => { loadPitches() }, [])

  const canSubmit = angle.trim().length >= 20 && (ownable.length <= 1 || listingId) && !submitting

  async function submit(e) {
    e?.preventDefault()
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      const r = await fetch('/api/dashboard/editorial/pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, angle, contact_email: contact }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
      } else {
        setResult(data)
        setAngle('')
        loadPitches()
      }
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // No live listing on the account yet — nothing to pitch for.
  if (ownable.length === 0) {
    return (
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={SECTION_HEADING}>Pitch a story</h2>
        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)',
          padding: '1.75rem', textAlign: 'center',
        }}>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', color: 'var(--color-ink)', margin: '0 0 0.375rem' }}>
            Pitch a story once your listing is live
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.825rem', color: 'var(--color-muted)', margin: 0 }}>
            When a claimed listing is on your account, you’ll be able to apply here to have a story written about it for the Atlas Journal.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={SECTION_HEADING}>Pitch a story</h2>

      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)',
        padding: '1.75rem',
      }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', color: 'var(--color-ink)', margin: '0 0 0.35rem' }}>
          Have a story worth telling?
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
          A new season, a collaboration, a milestone, a maker behind the counter — pitch it for the Atlas Journal. Our editors read every one, and we do the writing.
        </p>

        {result ? (
          <div style={{
            background: result.status === 'queued' ? '#f0f7f2' : '#fbf8f0',
            border: `1px solid ${result.status === 'queued' ? '#bcdcc7' : '#e6dcc0'}`,
            borderRadius: 12, padding: '1.5rem', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>
              {result.status === 'queued' ? '✍️' : '👀'}
            </div>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.02rem', color: 'var(--color-ink)', margin: '0 0 0.9rem' }}>
              {result.message}
            </p>
            <button
              onClick={() => { setResult(null) }}
              style={{
                fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600,
                padding: '0.5rem 1.2rem', borderRadius: 8, border: '1px solid var(--color-border)',
                background: '#fff', color: 'var(--color-ink)', cursor: 'pointer',
              }}
            >
              Pitch another story
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#c62828', borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1.25rem', fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            {ownable.length > 1 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={LABEL_STYLE}>Which listing is this story about?</label>
                <select value={listingId} onChange={e => setListingId(e.target.value)} style={{ ...INPUT_STYLE, appearance: 'auto' }}>
                  {ownable.map(l => (
                    <option key={l.id} value={String(l.id)}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={LABEL_STYLE}>What’s the story?</label>
              <textarea
                value={angle}
                onChange={e => setAngle(e.target.value)}
                rows={5}
                maxLength={1500}
                placeholder="e.g. We’ve just revived an 1890s cordial recipe as a winter spiced filter, roasted on a wood flame in our heritage goldfields building. There’s a lovely story in the family who ran the works a century ago…"
                style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.5 }}
              />
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.35rem 0 0' }}>
                A clear hook and a fresh angle go a long way. {angle.trim().length > 0 && angle.trim().length < 20 ? `${20 - angle.trim().length} more characters…` : 'A sentence or two is plenty.'}
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={LABEL_STYLE}>Best contact email <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
              <input
                value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder="We’ll use your account email if you leave this blank"
                style={INPUT_STYLE}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600,
                  padding: '0.6rem 1.4rem', borderRadius: 8, border: 'none',
                  background: !canSubmit ? '#cbd5cb' : 'var(--color-sage, #4A7C59)',
                  color: '#fff', cursor: !canSubmit ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Sending…' : 'Send pitch to the Journal'}
              </button>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                Goes straight to our editors.
              </span>
            </div>
          </form>
        )}
      </div>

      {/* Their pitch history */}
      {pitchesLoaded && pitches.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <p style={{ ...SECTION_HEADING, margin: '0 0 0.6rem' }}>Your pitches</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pitches.map(p => (
              <div key={p.id} style={{
                background: '#fff', borderRadius: 10, border: '1px solid var(--color-border)',
                padding: '0.85rem 1rem', display: 'flex', gap: '0.85rem', alignItems: 'flex-start',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-ink)', margin: 0, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.angle}
                  </p>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--color-muted)', margin: '0.35rem 0 0' }}>
                    {p.listing_name ? `${p.listing_name} · ` : ''}{p.created_at ? new Date(p.created_at).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                  </p>
                </div>
                <StatusPill status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
