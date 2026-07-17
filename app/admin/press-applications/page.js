'use client'

// Admin — Press applications: the focused approval queue for journalists
// requesting Newsroom access (press_enquiries). Approving one creates the
// press account and emails their sign-in link. This is the same approve /
// decline actions the Press Desk exposes, pulled out into a single-purpose
// surface so the pending queue is one click from the dashboard.

import { useEffect, useState } from 'react'

const CARD = {
  background: 'var(--color-card-bg, #fff)',
  border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
  borderRadius: 12,
  padding: '16px 18px',
  marginBottom: 12,
}

const BTN = {
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: '1px solid var(--color-border, #ccc)', borderRadius: 999,
  padding: '7px 16px', background: 'transparent', color: 'var(--color-ink, #222)',
}
const BTN_PRIMARY = { ...BTN, background: 'var(--color-sage, #5f8a7e)', color: '#fff', border: '1px solid transparent' }
const BTN_DANGER = { ...BTN, color: 'var(--color-accent, #C4603A)', borderColor: 'rgba(196,96,58,0.4)' }
const MUTED = { fontSize: 12.5, color: 'var(--color-muted, #6B6760)' }

function fmt(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABEL = { approved: 'Approved', declined: 'Declined', new: 'Waiting' }
const STATUS_COLOR = { approved: '#5f8a7e', declined: '#C4603A', new: '#d4a039' }

export default function PressApplicationsPage() {
  const [enquiries, setEnquiries] = useState(null)
  const [memberCount, setMemberCount] = useState(0)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  async function load() {
    const res = await fetch('/api/admin/press')
    if (res.ok) {
      const d = await res.json()
      setEnquiries(d.enquiries || [])
      setMemberCount((d.members || []).length)
    } else {
      setError('Could not load applications.')
      setEnquiries([])
    }
  }

  useEffect(() => { load() }, [])

  async function act(payload, busyKey, successMsg) {
    setBusy(busyKey)
    setError('')
    setFlash('')
    try {
      const res = await fetch('/api/admin/press', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Action failed')
      } else if (successMsg) {
        setFlash(d.note ? `${successMsg} (${d.note})` : successMsg)
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (!enquiries) {
    return <div style={{ padding: 40, ...MUTED }}>Loading applications…</div>
  }

  const pending = enquiries.filter(e => e.status === 'new')
  const handled = enquiries.filter(e => e.status !== 'new').slice(0, 30)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 28, fontWeight: 400, margin: 0 }}>
          Press applications
        </h1>
        <span style={MUTED}>
          {pending.length} waiting · {memberCount} member{memberCount === 1 ? '' : 's'} ·{' '}
          <a href="/admin/press" style={{ color: 'var(--color-sage-dark, #4a6d63)' }}>Press desk →</a>
        </span>
      </div>
      <p style={{ ...MUTED, margin: '0 0 24px', lineHeight: 1.55, maxWidth: 620 }}>
        Journalists request access from the Newsroom sign-up form. Approving one creates their
        press account and emails their passwordless sign-in link automatically — no further setup.
      </p>

      {error && (
        <div style={{ ...CARD, borderColor: 'var(--color-accent, #C4603A)', color: 'var(--color-accent, #C4603A)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {flash && (
        <div style={{ ...CARD, borderColor: 'rgba(95,138,126,0.5)', color: 'var(--color-sage-dark, #4a6d63)', fontSize: 13 }}>
          {flash}
        </div>
      )}

      {/* ── Pending ── */}
      <h2 style={{ ...MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11.5, margin: '0 0 10px' }}>
        Waiting on you{pending.length ? ` · ${pending.length}` : ''}
      </h2>
      {pending.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '28px 18px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--color-ink, #222)' }}>
            No applications waiting
          </p>
          <p style={{ ...MUTED, margin: 0 }}>
            New requests from the Newsroom sign-up form land here for one-click approval.
          </p>
        </div>
      ) : (
        pending.map(e => (
          <div key={e.id} style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <p style={{ margin: '0 0 3px', fontSize: 16, fontWeight: 600, color: 'var(--color-ink, #222)' }}>
                  {e.outlet || '(no outlet given)'}
                </p>
                <p style={{ ...MUTED, margin: '0 0 6px', fontSize: 13.5 }}>
                  {e.name}{e.outlet_type ? ` · ${e.outlet_type}` : ''} ·{' '}
                  <a href={`mailto:${e.email}`} style={{ color: 'var(--color-sage-dark, #4a6d63)' }}>{e.email}</a>
                </p>
                {e.regions && <p style={{ ...MUTED, margin: '0 0 4px' }}>Covers: {e.regions}</p>}
                {e.message && (
                  <p style={{ ...MUTED, margin: '0 0 6px', whiteSpace: 'pre-wrap', color: 'var(--color-ink, #333)', fontSize: 13.5, lineHeight: 1.5 }}>
                    &ldquo;{e.message}&rdquo;
                  </p>
                )}
                <p style={{ ...MUTED, margin: 0, fontSize: 11.5 }}>Applied {fmt(e.created_at)}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', flexShrink: 0 }}>
                <button
                  style={BTN_PRIMARY}
                  disabled={busy === `a-${e.id}`}
                  onClick={() => act({ action: 'approve_enquiry', enquiryId: e.id }, `a-${e.id}`, `Approved ${e.outlet || e.name} — sign-in link emailed`)}
                >
                  {busy === `a-${e.id}` ? 'Approving…' : 'Approve + create account'}
                </button>
                <button
                  style={BTN_DANGER}
                  disabled={busy === `d-${e.id}`}
                  onClick={() => act({ action: 'decline_enquiry', enquiryId: e.id }, `d-${e.id}`, 'Application declined')}
                >
                  {busy === `d-${e.id}` ? '…' : 'Decline'}
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {/* ── Recently handled ── */}
      {handled.length > 0 && (
        <>
          <h2 style={{ ...MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11.5, margin: '28px 0 10px' }}>
            Recently handled
          </h2>
          <div style={{ ...CARD, padding: '4px 0' }}>
            {handled.map((e, i) => (
              <div key={e.id} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline',
                padding: '9px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--color-border, rgba(28,26,23,0.08))',
              }}>
                <span style={{ fontSize: 13.5, color: 'var(--color-ink, #222)' }}>
                  {e.outlet || e.name}
                  <span style={{ ...MUTED, fontWeight: 400 }}> · {e.name} · {e.email}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[e.status] || '#999' }} />
                  <span style={{ ...MUTED, fontSize: 12 }}>{STATUS_LABEL[e.status] || e.status} · {fmt(e.created_at)}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
