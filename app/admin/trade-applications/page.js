'use client'

// Admin — Trade applications: the roster of Atlas Trade beta sign-ups
// (trade_accounts). Trade access auto-provisions when an organisation accepts
// the AUP + attribution terms — there is no approval gate — so this surface
// shows who has joined (newest first), flags the last 7 days, and lets you
// suspend or reactivate an account. One click from the dashboard.

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
const BTN_DANGER = { ...BTN, color: 'var(--color-accent, #C4603A)', borderColor: 'rgba(196,96,58,0.4)' }
const BTN_PRIMARY = { ...BTN, background: 'var(--color-sage, #5f8a7e)', color: '#fff', border: '1px solid transparent' }
const MUTED = { fontSize: 12.5, color: 'var(--color-muted, #6B6760)' }

const TYPE_LABEL = {
  tour_operator: 'Tour operator',
  inbound_operator: 'Inbound operator (ITO)',
  dmc: 'DMC',
  trip_designer: 'Trip designer',
  other: 'Travel trade',
}
const STATUS_LABEL = { active: 'Active', suspended: 'Suspended', pending: 'Pending' }
const STATUS_COLOR = { active: '#5f8a7e', suspended: '#C4603A', pending: '#d4a039' }

const RECENT_WINDOW_MS = 7 * 24 * 3600 * 1000

function fmt(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TradeApplicationsPage() {
  const [accounts, setAccounts] = useState(null)
  const [counts, setCounts] = useState({ total: 0, active: 0, suspended: 0, founding: 0, recent: 0 })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  async function load() {
    const res = await fetch('/api/admin/trade-applications')
    if (res.ok) {
      const d = await res.json()
      setAccounts(d.accounts || [])
      setCounts(d.counts || { total: 0, active: 0, suspended: 0, founding: 0, recent: 0 })
    } else {
      setError('Could not load trade accounts.')
      setAccounts([])
    }
  }

  useEffect(() => { load() }, [])

  async function act(payload, busyKey, successMsg) {
    setBusy(busyKey)
    setError('')
    setFlash('')
    try {
      const res = await fetch('/api/admin/trade-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Action failed')
      } else if (successMsg) {
        setFlash(successMsg)
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (!accounts) {
    return <div style={{ padding: 40, ...MUTED }}>Loading trade accounts…</div>
  }

  const cutoff = Date.now() - RECENT_WINDOW_MS
  const isRecent = (a) => a.created_at && new Date(a.created_at).getTime() >= cutoff
  const recent = accounts.filter(isRecent)
  const earlier = accounts.filter((a) => !isRecent(a))

  const Row = ({ a, condensed, first }) => (
    <div key={a.id} style={condensed ? {
      display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline',
      padding: '9px 18px', borderTop: first ? 'none' : '1px solid var(--color-border, rgba(28,26,23,0.08))',
    } : CARD}>
      {condensed ? (
        <>
          <span style={{ fontSize: 13.5, color: 'var(--color-ink, #222)' }}>
            {a.org_name}
            <span style={{ ...MUTED, fontWeight: 400 }}>
              {' · '}{TYPE_LABEL[a.account_type] || a.account_type}
              {a.contact_email ? ` · ${a.contact_email}` : ''}
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[a.status] || '#999' }} />
            <span style={{ ...MUTED, fontSize: 12 }}>{STATUS_LABEL[a.status] || a.status} · joined {fmt(a.created_at)}</span>
          </span>
        </>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ margin: '0 0 3px', fontSize: 16, fontWeight: 600, color: 'var(--color-ink, #222)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {a.org_name}
              {a.founding_member && (
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8a6520', background: 'rgba(138,101,32,0.12)', borderRadius: 100, padding: '2px 8px' }}>
                  Founding{a.founding_cohort_seq ? ` #${a.founding_cohort_seq}` : ''}
                </span>
              )}
            </p>
            <p style={{ ...MUTED, margin: '0 0 6px', fontSize: 13.5 }}>
              {TYPE_LABEL[a.account_type] || a.account_type}
              {a.contact_name ? ` · ${a.contact_name}` : ''}
              {a.contact_email ? (
                <> · <a href={`mailto:${a.contact_email}`} style={{ color: 'var(--color-sage-dark, #4a6d63)' }}>{a.contact_email}</a></>
              ) : ''}
            </p>
            <p style={{ ...MUTED, margin: 0, fontSize: 11.5 }}>
              Joined {fmt(a.created_at)}{a.aup_accepted_at ? ` · terms accepted ${fmt(a.aup_accepted_at)}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[a.status] || '#999' }} />
              <span style={{ ...MUTED }}>{STATUS_LABEL[a.status] || a.status}</span>
            </span>
            {a.status === 'suspended' ? (
              <button
                style={BTN_PRIMARY}
                disabled={busy === `r-${a.id}`}
                onClick={() => act({ action: 'reactivate', accountId: a.id }, `r-${a.id}`, `Reactivated ${a.org_name}`)}
              >
                {busy === `r-${a.id}` ? '…' : 'Reactivate'}
              </button>
            ) : (
              <button
                style={BTN_DANGER}
                disabled={busy === `s-${a.id}`}
                onClick={() => act({ action: 'suspend', accountId: a.id }, `s-${a.id}`, `Suspended ${a.org_name}`)}
              >
                {busy === `s-${a.id}` ? '…' : 'Suspend'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 28, fontWeight: 400, margin: 0 }}>
          Trade applications
        </h1>
        <span style={MUTED}>
          {counts.active} active · {counts.founding} founding · {counts.total} total ·{' '}
          <a href="/admin/trade-outreach" style={{ color: 'var(--color-sage-dark, #4a6d63)' }}>Trade outreach →</a>
        </span>
      </div>
      <p style={{ ...MUTED, margin: '0 0 24px', lineHeight: 1.55, maxWidth: 640 }}>
        Tour operators, DMCs and trip designers who have joined the free Atlas Trade founding beta.
        Accepting the acceptable-use and &ldquo;Curated via Atlas&rdquo; attribution terms is the only gate —
        accounts are created automatically. Suspend one to revoke builder access.
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

      {/* ── Recent joins ── */}
      <h2 style={{ ...MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11.5, margin: '0 0 10px' }}>
        Joined in the last 7 days{recent.length ? ` · ${recent.length}` : ''}
      </h2>
      {recent.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '28px 18px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--color-ink, #222)' }}>
            No new trade sign-ups this week
          </p>
          <p style={{ ...MUTED, margin: 0 }}>
            New organisations that accept the trade terms at /for-trade/apply appear here.
          </p>
        </div>
      ) : (
        recent.map((a) => <Row key={a.id} a={a} />)
      )}

      {/* ── Everyone else ── */}
      {earlier.length > 0 && (
        <>
          <h2 style={{ ...MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11.5, margin: '28px 0 10px' }}>
            All members
          </h2>
          <div style={{ ...CARD, padding: '4px 0' }}>
            {earlier.map((a, i) => <Row key={a.id} a={a} condensed first={i === 0} />)}
          </div>
        </>
      )}
    </div>
  )
}
