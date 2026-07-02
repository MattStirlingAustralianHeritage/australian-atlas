'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../layout'
import { getDashboardToken } from '@/lib/dashboard-token'
import { getVerticalBadge } from '@/lib/verticalUrl'

/**
 * /dashboard/trade — "Reach group & tour buyers": the Atlas Trade opt-in.
 *
 * A paid operator authors the trade-readiness profile for a listing they own
 * (trade_welcome master switch + the details the trade builder surfaces).
 * Saves go through PATCH /api/dashboard/trade, which enforces ownership, the
 * paid gate, and the exact trade_* column allowlist server-side.
 *
 * These settings never touch visitor-facing ranking anywhere — they only add
 * operator-stated trade details for trade buyers inside the gated builder.
 */

const GROUP_SIZE_MAX = 999

function Eyebrow({ children }) {
  return (
    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-gold)', margin: '0 0 0.6rem' }}>
      {children}
    </p>
  )
}

function Toggle({ on, onChange, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      style={{
        flexShrink: 0, position: 'relative', width: 46, height: 26, borderRadius: 999,
        border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 0,
        background: on ? 'var(--color-sage, #4A7C59)' : 'var(--color-border)',
        opacity: disabled ? 0.5 : 1, transition: 'background 0.15s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

function ToggleRow({ label, help, on, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1rem 0', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>{label}</p>
        {help && (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.5, margin: '0.25rem 0 0' }}>{help}</p>
        )}
      </div>
      <Toggle on={on} onChange={onChange} disabled={disabled} label={label} />
    </div>
  )
}

function Header({ listingName, live }) {
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <Eyebrow>Atlas Trade</Eyebrow>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.9rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.4rem', lineHeight: 1.15 }}>
        Reach group &amp; tour buyers
      </h1>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: 0, maxWidth: 640 }}>
        Atlas Trade is our tool for the travel trade — tour operators, DMCs and trip designers who build
        itineraries from the Atlas network. Tell them here that {listingName} welcomes their business, and the
        builder shows your listing with the trade details you set below. Atlas stays non-transactional:
        buyers always contact and book you directly.{' '}
        <a href="/for-trade" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
          See what the trade sees →
        </a>
      </p>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', lineHeight: 1.55, color: 'var(--color-muted)', margin: '0.6rem 0 0', maxWidth: 640 }}>
        Opting in never changes where you appear in search, on the map, or anywhere visitors browse — it only
        adds your trade details for trade buyers inside the builder.
      </p>
      {live && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', fontFamily: 'var(--font-sans)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2f6f4f', background: '#eaf4ee', border: '1px solid #bcdcc7', borderRadius: 999, padding: '0.25rem 0.7rem' }}>
          ● Trade-welcome — visible to trade buyers
        </span>
      )}
    </div>
  )
}

const EMPTY_FORM = {
  trade_welcome: false,
  trade_group: false,
  trade_group_size_max: '',
  trade_bespoke: false,
  trade_rates_available: false,
  trade_contact_before_booking: false,
}

function TradeOptIn({ listingId, listingName }) {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paid, setPaid] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [savedWelcome, setSavedWelcome] = useState(false)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(null) // { kind: 'ok'|'err', text }

  // ── Hydrate ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true)
    setFlash(null)
    getDashboardToken().then(async (tok) => {
      if (!alive) return
      setToken(tok)
      if (!tok) { setLoading(false); return }
      try {
        const res = await fetch(`/api/dashboard/trade?listing_id=${encodeURIComponent(listingId)}`, {
          headers: { Authorization: `Bearer ${tok}` },
        })
        const data = await res.json()
        if (!alive) return
        if (res.ok) {
          setPaid(!!data.paid)
          const t = data.trade || {}
          setForm({
            trade_welcome: !!t.trade_welcome,
            trade_group: !!t.trade_group,
            trade_group_size_max: t.trade_group_size_max == null ? '' : String(t.trade_group_size_max),
            trade_bespoke: !!t.trade_bespoke,
            trade_rates_available: !!t.trade_rates_available,
            trade_contact_before_booking: !!t.trade_contact_before_booking,
          })
          setSavedWelcome(!!t.trade_welcome)
        } else {
          setFlash({ kind: 'err', text: data.error || 'Could not load your trade settings.' })
        }
      } catch { /* best-effort */ }
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [listingId])

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  async function save() {
    if (!token) { setFlash({ kind: 'err', text: 'Your session expired — please refresh.' }); return }

    // Group size: blank = unspecified; otherwise a whole number the API accepts.
    let groupSize = null
    const raw = String(form.trade_group_size_max).trim()
    if (form.trade_group && raw !== '') {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 1 || n > GROUP_SIZE_MAX) {
        setFlash({ kind: 'err', text: `Largest group must be a whole number between 1 and ${GROUP_SIZE_MAX} — or leave it blank.` })
        return
      }
      groupSize = n
    }

    setSaving(true); setFlash(null)
    try {
      const res = await fetch('/api/dashboard/trade', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listing_id: listingId,
          trade_welcome: form.trade_welcome,
          trade_group: form.trade_group,
          trade_group_size_max: groupSize,
          trade_bespoke: form.trade_bespoke,
          trade_rates_available: form.trade_rates_available,
          trade_contact_before_booking: form.trade_contact_before_booking,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'payment_required') setPaid(false)
        setFlash({ kind: 'err', text: data.error || 'Could not save.' })
      } else {
        setSavedWelcome(!!data.trade?.trade_welcome)
        setFlash({
          kind: 'ok',
          text: data.trade?.trade_welcome
            ? 'Saved — trade buyers now see your listing as trade-welcome in the builder.'
            : 'Saved — your listing shows standard information only in the trade builder.',
        })
      }
    } catch {
      setFlash({ kind: 'err', text: 'Could not reach the server.' })
    } finally { setSaving(false) }
  }

  if (loading) {
    return <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>Loading your trade settings…</p>
  }

  // ── Locked state (owner, not yet paid) ─────────────────────────────────────
  if (!paid) {
    return (
      <div>
        <Header listingName={listingName} live={false} />
        <div style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-gold)', borderRadius: 12, padding: '1.75rem 2rem' }}>
          <Eyebrow>A Standard-plan feature</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
            Put your hand up for the travel trade
          </h2>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
            The Atlas Trade opt-in is part of the Standard plan. Upgrade {listingName} to tell tour operators,
            DMCs and trip designers that you welcome their enquiries — groups, bespoke itineraries, trade rates —
            right where they build.
          </p>
          <a href="/dashboard/subscription" style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '0.88rem', fontWeight: 600, background: 'var(--color-ink)', color: 'var(--color-cream)', padding: '0.65rem 1.25rem', borderRadius: 8, textDecoration: 'none' }}>
            Manage subscription
          </a>
        </div>
      </div>
    )
  }

  const detailsDisabled = !form.trade_welcome

  return (
    <div>
      <Header listingName={listingName} live={savedWelcome} />

      <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Master switch */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>
              Welcome trade enquiries
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--color-muted)', lineHeight: 1.55, margin: '0.25rem 0 0' }}>
              The master switch. On, trade buyers see {listingName} marked trade-welcome in the builder, with the
              details below. Off, they simply see your standard listing — nothing is removed.
            </p>
          </div>
          <Toggle on={form.trade_welcome} onChange={v => setField('trade_welcome', v)} label="Welcome trade enquiries" />
        </div>

        {/* Details — only meaningful when the master switch is on */}
        <div style={{ marginTop: '1.25rem', opacity: detailsDisabled ? 0.55 : 1 }}>
          <ToggleRow
            label="We host groups"
            help="Coach, van and other group bookings are welcome."
            on={form.trade_group}
            onChange={v => setField('trade_group', v)}
            disabled={detailsDisabled}
          />
          {form.trade_group && (
            <div style={{ padding: '0 0 1rem', marginTop: '-0.25rem' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '0.3rem' }}>
                Largest group we can take
              </label>
              <input
                type="number" inputMode="numeric" min={1} max={GROUP_SIZE_MAX}
                value={form.trade_group_size_max}
                onChange={e => setField('trade_group_size_max', e.target.value)}
                disabled={detailsDisabled}
                placeholder="e.g. 25"
                style={{
                  fontFamily: 'var(--font-sans)', fontSize: '0.9rem', padding: '0.55rem 0.75rem',
                  borderRadius: 8, border: '1px solid var(--color-border)', width: 140,
                  boxSizing: 'border-box', outline: 'none', color: 'var(--color-ink)', background: '#fff',
                }}
              />
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.76rem', color: 'var(--color-muted)', margin: '0.35rem 0 0' }}>
                Leave blank if it varies.
              </p>
            </div>
          )}
          <ToggleRow
            label="We take bespoke itineraries"
            help="Private, one-off trips designed by DMCs and trip designers."
            on={form.trade_bespoke}
            onChange={v => setField('trade_bespoke', v)}
            disabled={detailsDisabled}
          />
          <ToggleRow
            label="We offer trade rates"
            help="We only ever show that trade rates exist — the numbers stay between you and the buyer."
            on={form.trade_rates_available}
            onChange={v => setField('trade_rates_available', v)}
            disabled={detailsDisabled}
          />
          <ToggleRow
            label="Contact us before booking"
            help="Ask buyers to get in touch before they include you in an itinerary."
            on={form.trade_contact_before_booking}
            onChange={v => setField('trade_contact_before_booking', v)}
            disabled={detailsDisabled}
          />
        </div>
      </section>

      {flash && (
        <div style={{
          fontFamily: 'var(--font-sans)', fontSize: '0.88rem', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem',
          background: flash.kind === 'ok' ? '#f0f7f2' : '#fbf0ec',
          border: `1px solid ${flash.kind === 'ok' ? '#bcdcc7' : '#e8c9bd'}`,
          color: flash.kind === 'ok' ? '#2f6f4f' : '#9a3b1f',
        }}>{flash.text}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            background: saving ? 'var(--color-border)' : 'var(--color-accent)', color: saving ? 'var(--color-muted)' : '#fff',
            border: 'none', borderRadius: 8, padding: '0.7rem 1.4rem',
          }}
        >{saving ? 'Saving…' : 'Save trade settings'}</button>
      </div>
    </div>
  )
}

export default function DashboardTradePage() {
  const { listings, listingsLoading } = useAuth()
  const [activeId, setActiveId] = useState(null)

  if (listingsLoading) {
    return <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>Loading…</p>
  }

  if (!listings || listings.length === 0) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
          Reach group &amp; tour buyers
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>
          Once you’ve claimed a listing, you can tell the travel trade you welcome their enquiries here.
        </p>
      </div>
    )
  }

  const listing = listings.find(l => l.id === activeId) || listings[0]

  return (
    <div style={{ maxWidth: 760 }}>
      {listings.length > 1 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '0.4rem' }}>
            Trade settings for
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {listings.map(l => {
              const active = l.id === listing.id
              return (
                <button
                  key={l.id}
                  onClick={() => setActiveId(l.id)}
                  style={{
                    fontFamily: 'var(--font-sans)', fontSize: '0.85rem', cursor: 'pointer',
                    padding: '0.45rem 0.8rem', borderRadius: 999,
                    border: `1px solid ${active ? 'var(--color-ink)' : 'var(--color-border)'}`,
                    background: active ? 'var(--color-ink)' : '#fff',
                    color: active ? 'var(--color-cream)' : 'var(--color-ink)',
                  }}
                >
                  {l.name} <span style={{ opacity: 0.6 }}>· {getVerticalBadge(l.vertical)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <TradeOptIn key={listing.id} listingId={listing.id} listingName={listing.name} />
    </div>
  )
}
