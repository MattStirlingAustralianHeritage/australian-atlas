'use client'

import { useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

const INK = '#2D2A26'
const MUTED = '#6B6760'
const CREAM = '#FAF8F5'
const ACCENT = '#C4603A'
const BORDER = 'rgba(28,26,23,0.12)'
const GREEN = '#5f8a7e'
const AMBER = '#d4a039'
const RED = '#c0392b'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const SIGNAL_META = {
  closed_permanently: { label: 'Permanently closed?', color: RED },
  closed_temporarily: { label: 'Temporarily closed?', color: AMBER },
  possibly_closed: { label: 'Possibly closed', color: MUTED },
  reopened: { label: 'Reopened?', color: GREEN },
}

const RESOLUTION_LABELS = {
  hidden_permanent: 'Hidden — permanently closed',
  marked_temporary: 'Marked temporarily closed',
  cleared_temporary: 'Temporary closure cleared',
  dismissed: 'Dismissed — false positive',
}

export default function ClosuresClient({ initialRows, initialCounts, tableMissing, loadError }) {
  const [rows, setRows] = useState(initialRows || [])
  const [counts, setCounts] = useState(initialCounts || { open: 0, resolved: 0 })
  const [view, setView] = useState('open')
  const [busy, setBusy] = useState(null) // signal id being acted on
  const [msg, setMsg] = useState(null)   // { kind: 'ok'|'warn'|'error', text }
  const [confirmHide, setConfirmHide] = useState(null) // row pending hide confirmation
  const [sweepTriggered, setSweepTriggered] = useState(false)

  async function switchView(next) {
    setView(next)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/closures?view=${next}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setRows(data.rows || [])
      setCounts(data.counts || counts)
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    }
  }

  async function runAction(row, action) {
    setBusy(row.id)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/closures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      setRows(prev => prev.filter(r => r.id !== row.id))
      setCounts(prev => ({ open: Math.max(0, prev.open - 1), resolved: prev.resolved + 1 }))
      setMsg(data.warning
        ? { kind: 'warn', text: data.warning }
        : { kind: 'ok', text: `${RESOLUTION_LABELS[data.resolution] || data.resolution}: ${data.listing_name}` })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
      setConfirmHide(null)
    }
  }

  async function triggerSweep() {
    setMsg(null)
    try {
      const res = await fetch('/api/admin/run-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: '/api/cron/closure-sweep' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Trigger failed')
      setSweepTriggered(true)
      setMsg({ kind: 'ok', text: 'Sweep triggered — it works through the backlog in ~5-minute runs. Check back shortly.' })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: CREAM, padding: '2rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: '1.75rem', fontWeight: 600, color: INK, margin: '0 0 0.25rem' }}>
              Closures
            </h1>
            <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.85rem', color: MUTED, margin: 0, maxWidth: 640 }}>
              The monthly deep sweep checks every active listing for shut-down and paused venues —
              Google Places status, website reachability, and closure notices on the venue&apos;s own site.
              Nothing is hidden automatically: every signal below is your call.
            </p>
          </div>
          <button
            onClick={triggerSweep}
            disabled={sweepTriggered}
            style={{ ...btnStyle('#fff', INK), opacity: sweepTriggered ? 0.5 : 1 }}
          >
            {sweepTriggered ? 'Sweep running…' : 'Run sweep now'}
          </button>
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', margin: '1.25rem 0 1rem' }}>
          <ToggleBtn active={view === 'open'} onClick={() => switchView('open')}>
            Open {counts.open > 0 ? `(${counts.open})` : ''}
          </ToggleBtn>
          <ToggleBtn active={view === 'resolved'} onClick={() => switchView('resolved')}>
            Resolved {counts.resolved > 0 ? `(${counts.resolved})` : ''}
          </ToggleBtn>
        </div>

        {msg && (
          <div style={bannerStyle(msg.kind)}>
            {msg.text}
          </div>
        )}

        {tableMissing && (
          <div style={bannerStyle('warn')}>
            The closure_signals table does not exist yet — apply migration 269_closure_sweep.sql, then run the sweep.
          </div>
        )}
        {loadError && <div style={bannerStyle('error')}>{loadError}</div>}

        {/* Empty state */}
        {!rows.length && !tableMissing && !loadError && (
          <div style={{
            padding: '3rem 1.5rem', textAlign: 'center', background: '#fff',
            border: `1px solid ${BORDER}`, borderRadius: 14,
            fontFamily: 'var(--font-body, system-ui)', color: MUTED, fontSize: '0.9rem',
          }}>
            {view === 'open'
              ? 'No open closure signals. The sweep runs nightly and reports here when a venue looks shut or paused.'
              : 'Nothing resolved yet.'}
          </div>
        )}

        {/* Signal cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {rows.map(row => (
            <SignalCard
              key={row.id}
              row={row}
              view={view}
              busy={busy === row.id}
              onAction={(action) => action === 'hide_permanent' ? setConfirmHide(row) : runAction(row, action)}
            />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmHide}
        title="Hide this listing?"
        message={`“${confirmHide?.listing?.name}” will be removed from the public site and unpublished in its vertical. You can restore it later from Gate Review → Hidden.`}
        confirmLabel="Hide listing"
        danger
        busy={busy === confirmHide?.id}
        onConfirm={() => runAction(confirmHide, 'hide_permanent')}
        onCancel={() => setConfirmHide(null)}
      />
    </div>
  )
}

function SignalCard({ row, view, busy, onAction }) {
  const l = row.listing
  const meta = SIGNAL_META[row.signal] || SIGNAL_META.possibly_closed
  const ev = row.evidence || {}
  const isOpen = view === 'open'
  const tempClosed = l?.closure_status === 'temporarily_closed'

  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Venue + signal */}
        <div style={{ minWidth: 260, flex: '1 1 300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, color: '#fff', background: meta.color,
              padding: '3px 9px', borderRadius: 100, fontFamily: 'var(--font-body, system-ui)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              {meta.label}
            </span>
            <span style={{ fontSize: '0.65rem', color: MUTED, fontFamily: 'var(--font-body, system-ui)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {row.confidence} confidence
            </span>
            {tempClosed && isOpen && row.signal !== 'reopened' && (
              <span style={{ fontSize: '0.65rem', color: AMBER, fontFamily: 'var(--font-body, system-ui)' }}>
                currently badged “Temporarily closed”
              </span>
            )}
          </div>
          <div style={{ margin: '0.4rem 0 0.15rem' }}>
            {l?.slug ? (
              <a href={`/place/${l.slug}`} target="_blank" rel="noreferrer" style={{
                fontFamily: 'var(--font-display, Georgia)', fontSize: '1.05rem', fontWeight: 600,
                color: INK, textDecoration: 'none',
              }}>
                {l?.name || 'Unknown listing'}
              </a>
            ) : (
              <span style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: '1.05rem', fontWeight: 600, color: INK }}>
                {l?.name || 'Listing removed'}
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.75rem', color: MUTED }}>
            {[VERTICAL_NAMES[l?.vertical] || l?.vertical, l?.suburb || (l?.region || '').split(',')[0], l?.state]
              .filter(Boolean).join(' · ')}
            {' · '}detected {formatDate(row.detected_at)}
          </div>

          {/* Reasons */}
          <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem', fontFamily: 'var(--font-body, system-ui)', fontSize: '0.8rem', color: INK, lineHeight: 1.5 }}>
            {(row.reasons || []).map((r, i) => <li key={i}>{r}</li>)}
          </ul>

          {/* Evidence */}
          <Evidence ev={ev} website={l?.website} />

          {!isOpen && (
            <div style={{ marginTop: '0.6rem', fontFamily: 'var(--font-body, system-ui)', fontSize: '0.78rem', color: MUTED }}>
              {RESOLUTION_LABELS[row.resolution] || row.resolution} · {formatDate(row.resolved_at)} · {row.resolved_by}
            </div>
          )}
        </div>

        {/* Actions */}
        {isOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 190 }}>
            {row.signal === 'reopened' ? (
              <>
                <ActionBtn color={GREEN} disabled={busy} onClick={() => onAction('clear_temporary')}>
                  Reopened — clear the badge
                </ActionBtn>
                <ActionBtn color={MUTED} disabled={busy} onClick={() => onAction('dismiss')}>
                  Still closed — dismiss
                </ActionBtn>
              </>
            ) : (
              <>
                <ActionBtn color={RED} disabled={busy} onClick={() => onAction('hide_permanent')}>
                  Shut down — hide listing
                </ActionBtn>
                <ActionBtn color={AMBER} disabled={busy || tempClosed} onClick={() => onAction('mark_temporary')}>
                  {tempClosed ? 'Already marked temporary' : 'Paused — mark temporarily closed'}
                </ActionBtn>
                {tempClosed && (
                  <ActionBtn color={GREEN} disabled={busy} onClick={() => onAction('clear_temporary')}>
                    Trading again — clear the badge
                  </ActionBtn>
                )}
                <ActionBtn color={MUTED} disabled={busy} onClick={() => onAction('dismiss')}>
                  Open as usual — dismiss
                </ActionBtn>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Evidence({ ev, website }) {
  const bits = []
  if (ev.places?.status) {
    bits.push(`Google Places: ${ev.places.status}${ev.places.matched_name ? ` (matched “${ev.places.matched_name}”${ev.places.name_similarity != null ? `, ${Math.round(ev.places.name_similarity * 100)}% name match` : ''})` : ''}`)
  }
  if (ev.places?.no_match) bits.push('Google Places: no result for this venue')
  if (ev.places?.budget_exhausted) bits.push('Google Places: check deferred — monthly lookup budget exhausted (raise AI_CAP_PLACES_CLOSURE_USD)')
  if (ev.website) {
    bits.push(`Website ${website ? `(${shortUrl(website)}) ` : ''}: ${ev.website.classification}${ev.website.status_code ? ` — HTTP ${ev.website.status_code}` : ''}`)
  }
  if (ev.community_reports > 0) bits.push(`${ev.community_reports} community report${ev.community_reports === 1 ? '' : 's'} filed by the public`)

  const snippets = [...(ev.site_snippets?.permanent || []), ...(ev.site_snippets?.temporary || [])]

  if (!bits.length && !snippets.length) return null
  return (
    <details style={{ marginTop: '0.5rem' }}>
      <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-body, system-ui)', fontSize: '0.75rem', color: MUTED }}>
        Evidence
      </summary>
      <div style={{ marginTop: '0.4rem', padding: '0.6rem 0.75rem', background: CREAM, borderRadius: 8, border: `1px solid ${BORDER}` }}>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontFamily: 'var(--font-body, system-ui)', fontSize: '0.75rem', color: INK, lineHeight: 1.55 }}>
          {bits.map((b, i) => <li key={i}>{b}</li>)}
          {snippets.map((s, i) => (
            <li key={`s${i}`} style={{ fontStyle: 'italic' }}>On their site: “{s}”</li>
          ))}
        </ul>
      </div>
    </details>
  )
}

function ActionBtn({ color, disabled, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '0.45rem 0.8rem', borderRadius: 8, border: `1px solid ${color}`,
        background: '#fff', color, fontFamily: 'var(--font-body, system-ui)',
        fontSize: '0.75rem', fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1, textAlign: 'left',
      }}
    >
      {children}
    </button>
  )
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.45rem 0.9rem', borderRadius: 8,
        border: `1px solid ${active ? INK : BORDER}`,
        background: active ? INK : '#fff', color: active ? '#fff' : MUTED,
        fontFamily: 'var(--font-body, system-ui)', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function btnStyle(bg, color) {
  return {
    padding: '0.5rem 1rem', borderRadius: 8, border: `1px solid ${BORDER}`,
    background: bg, color, fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
  }
}

function bannerStyle(kind) {
  const palette = {
    ok: { bg: 'rgba(95,138,126,0.1)', border: GREEN, color: '#3d6457' },
    warn: { bg: 'rgba(212,160,57,0.12)', border: AMBER, color: '#8a6a1c' },
    error: { bg: 'rgba(192,57,43,0.08)', border: RED, color: RED },
  }[kind] || {}
  return {
    padding: '0.6rem 0.9rem', borderRadius: 8, marginBottom: '1rem',
    background: palette.bg, border: `1px solid ${palette.border}`, color: palette.color,
    fontFamily: 'var(--font-body, system-ui)', fontSize: '0.8rem',
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function shortUrl(url) {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return String(url).slice(0, 40)
  }
}
