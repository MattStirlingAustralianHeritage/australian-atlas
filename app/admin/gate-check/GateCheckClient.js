'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { getRemediations, getAutoRemediations, hasWebFailure } from '@/lib/gate-check/remediation'

// ── Palette / tokens (aligned to the admin design system + Candidate Review) ──
const SAGE = 'var(--color-sage, #5f8a7e)'
const INK = 'var(--color-ink, #2D2A26)'
const MUTED = 'var(--color-muted, #6B6760)'
const CREAM = 'var(--color-cream, #FAF8F5)'
const BORDER = 'var(--color-border, rgba(28,26,23,0.12))'
const KEEP = '#4A7C59'
const HIDE = '#C49A3C'
const DEL = '#CC4444'
const REPAIR = '#2f7f8f'

const GATE_META = {
  gate1_web:       { label: 'Web Presence', short: 'Web',       color: '#c4603a' },
  gate2_location:  { label: 'Location',     short: 'Location',  color: '#3a6ea5' },
  gate3_activity:  { label: 'Activity',     short: 'Activity',  color: '#7a5ea0' },
  gate4_vertical:  { label: 'Vertical Fit', short: 'Fit',       color: '#5f8a7e' },
  gate5_character: { label: 'Character',    short: 'Character', color: '#a24d7a' },
}
const SEVERITY_META = {
  high:   { color: DEL,  label: 'High' },
  medium: { color: HIDE, label: 'Medium' },
  low:    { color: MUTED, label: 'Low' },
}
const ACTION_META = {
  delete: { color: DEL,  label: 'Delete' },
  hide:   { color: HIDE, label: 'Hide' },
  pass:   { color: KEEP, label: 'Keep' },
}
const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}
const font = { body: 'var(--font-body, system-ui)', display: 'var(--font-display, Georgia)' }

export default function GateCheckClient({ initialRows, tableMissing, loadError, pendingCount, trashCount, hiddenCount, lastScannedAt, facets, mapboxToken }) {
  const [rows, setRows] = useState(initialRows || [])
  const [trashRows, setTrashRows] = useState([])
  const [hiddenRows, setHiddenRows] = useState([])
  const [view, setView] = useState('queue') // 'queue' | 'trash' | 'hidden'
  const [filters, setFilters] = useState({ vertical: '', gate: '', severity: '', action: '' })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(!!tableMissing)
  const [counts, setCounts] = useState({ pending: pendingCount || 0, trash: trashCount || 0, hidden: hiddenCount || 0 })
  const [session, setSession] = useState({ kept: 0, hidden: 0, deleted: 0, repaired: 0 })
  const [scan, setScan] = useState({ running: false, result: null, error: null })
  const [ai, setAi] = useState({}) // rowId -> { busy?, verdict?, error? }
  const [msg, setMsg] = useState(loadError ? { kind: 'error', text: loadError } : null)

  const isTrash = view === 'trash'
  const isHidden = view === 'hidden'
  const isQueue = view === 'queue'
  const current = rows[0] || null
  const sessionReviewed = session.kept + session.hidden + session.deleted + session.repaired
  const totalQueue = rows.length + sessionReviewed
  const progressPct = totalQueue > 0 ? (sessionReviewed / totalQueue) * 100 : 0

  const liveFacets = useMemo(() => {
    const verticals = new Set(facets.verticals || [])
    const gates = new Set(facets.gates || [])
    for (const r of rows) {
      if (r.listing?.vertical) verticals.add(r.listing.vertical)
      for (const g of (r.failed_gates || [])) gates.add(g)
    }
    return { verticals: [...verticals].sort(), gates: [...gates].sort() }
  }, [rows, facets])

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const refetch = useCallback(async (nextView = view, nextFilters = filters) => {
    setLoading(true)
    try {
      const status = nextView === 'trash' ? 'deleted' : nextView === 'hidden' ? 'hidden' : 'pending'
      const params = new URLSearchParams({ status })
      if (nextView === 'queue') {
        if (nextFilters.vertical) params.set('vertical', nextFilters.vertical)
        if (nextFilters.gate) params.set('gate', nextFilters.gate)
        if (nextFilters.severity) params.set('severity', nextFilters.severity)
        if (nextFilters.action) params.set('action', nextFilters.action)
      }
      const res = await fetch(`/api/admin/gate-check?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      if (data.tableMissing) { setMissing(true); return }
      if (nextView === 'trash') setTrashRows(data.rows || [])
      else if (nextView === 'hidden') setHiddenRows(data.rows || [])
      else setRows(data.rows || [])
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }, [view, filters])

  const changeView = (v) => {
    setView(v)
    if (v === 'trash') refetch('trash', filters)
    else if (v === 'hidden') refetch('hidden', filters)
  }
  const changeFilter = (key, val) => {
    const next = { ...filters, [key]: (filters[key] === val ? '' : val) }
    setFilters(next)
    refetch('queue', next)
  }

  // ── Actions (advance to the next card on success) ────────────────────────────
  const runAction = useCallback(async (id, action) => {
    if (!id) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/gate-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      setRows(prev => prev.filter(r => r.id !== id))
      if (action === 'delete') setCounts(prev => ({ ...prev, pending: Math.max(0, prev.pending - 1), trash: prev.trash + 1 }))
      else if (action === 'hide') setCounts(prev => ({ ...prev, pending: Math.max(0, prev.pending - 1), hidden: prev.hidden + 1 }))
      else setCounts(prev => ({ ...prev, pending: Math.max(0, prev.pending - 1) }))
      if (action === 'pass') setSession(s => ({ ...s, kept: s.kept + 1 }))
      else if (action === 'hide') setSession(s => ({ ...s, hidden: s.hidden + 1 }))
      else if (action === 'delete') setSession(s => ({ ...s, deleted: s.deleted + 1 }))
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }, [])

  const restore = useCallback(async (id) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/gate-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], action: 'restore' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Restore failed')
      const restored = trashRows.find(r => r.id === id)
      setTrashRows(prev => prev.filter(r => r.id !== id))
      setCounts(prev => ({ pending: prev.pending + 1, trash: Math.max(0, prev.trash - 1) }))
      // Bring it back into the working queue.
      if (restored) setRows(prev => [{ ...restored, status: 'pending' }, ...prev])
      setMsg({ kind: 'ok', text: 'Restored to the queue.' })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }, [trashRows])

  // Restore a hidden listing (listing-driven: works with or without a gate-check row).
  const restoreHidden = useCallback(async (listingId) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/gate-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restoreListingIds: [listingId] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Restore failed')
      const restored = hiddenRows.find(r => r.listing_id === listingId)
      setHiddenRows(prev => prev.filter(r => r.listing_id !== listingId))
      // If it carried a gate-check row it goes back to pending (into the queue).
      const backToQueue = !!restored?.id
      setCounts(prev => ({
        ...prev,
        hidden: Math.max(0, prev.hidden - 1),
        pending: backToQueue ? prev.pending + 1 : prev.pending,
      }))
      if (backToQueue) setRows(prev => [{ ...restored, status: 'pending' }, ...prev])
      setMsg({ kind: 'ok', text: backToQueue ? 'Restored — live again and back in the review queue.' : 'Restored — the listing is live again.' })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }, [hiddenRows])

  // ── AI fit check (LLM Gate 4) for the current card ───────────────────────────
  const runAi = useCallback(async (rowId) => {
    setAi(prev => ({ ...prev, [rowId]: { busy: true } }))
    try {
      const res = await fetch('/api/admin/gate-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiCheck: rowId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI check failed')
      setAi(prev => ({ ...prev, [rowId]: { verdict: data } }))
      if (data.updatedRow) setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...data.updatedRow } : r))
    } catch (err) {
      setAi(prev => ({ ...prev, [rowId]: { error: err.message } }))
    }
  }, [])

  // ── Repair (per-remediation, or manual URL) ──────────────────────────────────
  const [repairing, setRepairing] = useState(null) // `${rowId}:${type}` currently running
  // A near-miss website found by the Fix lookup — offered for one-click
  // confirmation (applies via the reviewer-supplied-URL path), never auto-set.
  const [suggestion, setSuggestion] = useState(null) // { rowId, url, placeName, reason }
  useEffect(() => { setSuggestion(null) }, [current?.id])
  const doRepair = useCallback(async (rowId, only = null, extra = {}) => {
    const key = `${rowId}:${only || (extra.manualWebsite ? 'manual' : 'auto')}`
    setRepairing(key)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/gate-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repair: rowId, ...(only ? { only } : {}), ...extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Repair failed')
      const applied = (data.applied || []).join('; ')
      setSuggestion(data.suggestion ? { rowId, ...data.suggestion } : null)
      // Fold any changed listing fields back into the card (map moves, link updates).
      const mergeListing = (r) => data.listingPatch ? { ...r, listing: { ...r.listing, ...data.listingPatch } } : r
      if (data.noop) {
        setMsg({ kind: 'error', text: `Nothing changed — ${applied || 'edit this listing manually'}.` })
      } else if (data.cleared) {
        setRows(prev => prev.filter(r => r.id !== rowId))
        setSession(s => ({ ...s, repaired: s.repaired + 1 }))
        setCounts(prev => ({ ...prev, pending: Math.max(0, prev.pending - 1) }))
        setMsg({ kind: 'ok', text: `Repaired — ${applied}.` })
      } else if (data.updatedRow) {
        setRows(prev => prev.map(r => r.id === rowId ? mergeListing({ ...r, ...data.updatedRow }) : r))
        setMsg({ kind: 'ok', text: `Applied — ${applied}. Some issue(s) remain on this listing.` })
      } else if (data.listingPatch) {
        setRows(prev => prev.map(r => r.id === rowId ? mergeListing(r) : r))
        setMsg({ kind: 'ok', text: `Applied — ${applied}.` })
      }
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setRepairing(null)
    }
  }, [])

  // ── Quick re-scan (Location + Vertical-fit gates) ────────────────────────────
  const runQuickScan = useCallback(async () => {
    setScan({ running: true, result: null, error: null })
    setMsg(null)
    try {
      const res = await fetch('/api/admin/gate-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickScan: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Quick scan failed')
      setScan({ running: false, result: data, error: null })
      setSession({ kept: 0, hidden: 0, deleted: 0 })
      refetch('queue', filters)
      setView('queue')
      if (typeof data.pending === 'number') setCounts(prev => ({ ...prev, pending: data.pending }))
    } catch (err) {
      setScan({ running: false, result: null, error: err.message })
    }
  }, [filters, refetch])

  // ── Keyboard shortcuts (queue view) — P keep · H hide · D delete · A ai ──────
  useEffect(() => {
    const onKey = (e) => {
      if (!isQueue || !current || busy) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return
      const k = e.key.toLowerCase()
      if (k === 'p' || e.key === 'ArrowRight') { e.preventDefault(); runAction(current.id, 'pass') }
      else if (k === 'h') { e.preventDefault(); runAction(current.id, 'hide') }
      else if (k === 'd') { e.preventDefault(); runAction(current.id, 'delete') }
      else if (k === 'a') { e.preventDefault(); if (!ai[current.id]?.busy) runAi(current.id) }
      else if (k === 'r') { e.preventDefault(); if (getAutoRemediations(current).length && !repairing) doRepair(current.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isQueue, current, busy, ai, runAction, runAi, doRepair, repairing])

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <style>{`@keyframes gcspin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: font.display, fontWeight: 400, fontSize: 28, color: INK, margin: '0 0 4px' }}>Gate Check</h1>
        <p style={{ fontFamily: font.body, fontWeight: 300, fontSize: 14, color: MUTED, margin: 0 }}>
          Review each flagged listing one at a time — keep it, hide it, or delete it.
        </p>
      </div>

      {missing && (
        <Banner kind="error">
          <strong>Migration 219 not applied.</strong> The table <code>listing_gate_check</code> does not exist yet — apply
          <code> supabase/migrations/219_listing_gate_check.sql</code> and run the sweep, then reload.
        </Banner>
      )}
      {scan.error && <Banner kind="error">Quick scan error: {scan.error}</Banner>}
      {scan.result && <Banner kind="ok">Quick re-scan complete — {scan.result.scanned} scanned, {scan.result.upserted} location/fit flags written, {scan.result.cleared} cleared.</Banner>}
      {msg && <Banner kind={msg.kind === 'error' ? 'error' : 'ok'}>{msg.text}</Banner>}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, marginBottom: 16 }}>
        <Tab active={isQueue} onClick={() => changeView('queue')}>Review Queue ({counts.pending})</Tab>
        <Tab active={isHidden} onClick={() => changeView('hidden')}>Hidden ({counts.hidden})</Tab>
        <Tab active={isTrash} onClick={() => changeView('trash')}>Trash ({counts.trash})</Tab>
      </div>

      {isTrash ? (
        <TrashView rows={trashRows} loading={loading} busy={busy} onRestore={restore} />
      ) : isHidden ? (
        <HiddenView rows={hiddenRows} loading={loading} busy={busy} onRestore={restoreHidden} />
      ) : (
        <>
          {/* Controls: filters + quick re-scan */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <PillGroup label="Severity" value={filters.severity} onPick={v => changeFilter('severity', v)}
              options={[['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} colorFor={v => SEVERITY_META[v]?.color} />
            <PillGroup label="Action" value={filters.action} onPick={v => changeFilter('action', v)}
              options={[['delete', 'Delete'], ['hide', 'Hide'], ['pass', 'Keep']]} colorFor={v => ACTION_META[v]?.color} />
            <span style={{ flex: 1 }} />
            <Dropdown label="Vertical" value={filters.vertical} onChange={v => changeFilter('vertical', v)}
              options={liveFacets.verticals.map(v => [v, VERTICAL_NAMES[v] || v])} />
            <Dropdown label="Gate" value={filters.gate} onChange={v => changeFilter('gate', v)}
              options={liveFacets.gates.map(g => [g, GATE_META[g]?.short || g])} />
            <button onClick={runQuickScan} disabled={scan.running || missing} style={ghostBtn(scan.running || missing)}>
              {scan.running ? 'Re-scanning…' : 'Quick re-scan'}
            </button>
          </div>

          {current && (
            <>
              {/* Keyboard hints */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
                padding: '9px 16px', marginBottom: 16, background: CREAM, borderRadius: 8,
                fontFamily: font.body, fontSize: 11, color: MUTED, flexWrap: 'wrap',
              }}>
                <span><Kbd>R</Kbd> repair</span><Sep />
                <span><Kbd>P</Kbd> keep</span><Sep />
                <span><Kbd>H</Kbd> hide</span><Sep />
                <span><Kbd>D</Kbd> delete</span><Sep />
                <span><Kbd>A</Kbd> AI fit check</span>
              </div>

              {/* Progress */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontFamily: font.body, fontSize: 13, fontWeight: 500, color: INK }}>
                    {sessionReviewed} of {totalQueue} reviewed
                    {lastScannedAt && <span style={{ fontWeight: 400, color: MUTED }}>{'  '}· swept {new Date(lastScannedAt).toLocaleDateString()}</span>}
                  </span>
                  <span style={{ fontFamily: font.body, fontSize: 11, color: MUTED }}>
                    <span style={{ color: REPAIR }}>{session.repaired} repaired</span>{' / '}
                    <span style={{ color: KEEP }}>{session.kept} kept</span>{' / '}
                    <span style={{ color: HIDE }}>{session.hidden} hidden</span>{' / '}
                    <span style={{ color: DEL }}>{session.deleted} deleted</span>
                  </span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: BORDER, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progressPct}%`, background: SAGE, borderRadius: 2, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            </>
          )}

          {loading ? (
            <Empty>Loading…</Empty>
          ) : current ? (
            <>
              <GateCard row={current} busy={busy} ai={ai[current.id]}
                onAction={(a) => runAction(current.id, a)} onAi={() => runAi(current.id)}
                onRepair={(only) => doRepair(current.id, only)}
                onManualWebsite={(url) => doRepair(current.id, null, { manualWebsite: url })}
                repairing={repairing}
                suggestion={suggestion && suggestion.rowId === current.id ? suggestion : null}
                mapboxToken={mapboxToken} />
              {rows.length > 1 && (
                <p style={{ textAlign: 'center', fontFamily: font.body, fontSize: 13, color: MUTED, marginTop: 10 }}>
                  {rows.length - 1} more flagged listing{rows.length - 1 !== 1 ? 's' : ''} in the queue
                </p>
              )}
            </>
          ) : sessionReviewed > 0 ? (
            <Completion session={session} />
          ) : (
            <Empty>
              <div style={{ fontFamily: font.display, fontSize: 22, color: INK, marginBottom: 6 }}>Nothing failing a gate 🎉</div>
              <div style={{ fontFamily: font.body, fontSize: 14, color: MUTED }}>
                {missing ? 'Apply migration 219 and run the sweep to begin.'
                  : Object.values(filters).some(Boolean) ? 'No flagged listings match these filters.'
                  : 'Every live listing passed the gates. Run a sweep to re-check.'}
              </div>
            </Empty>
          )}
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// The one-at-a-time review card
// ════════════════════════════════════════════════════════════════════════════
function GateCard({ row, busy, ai, onAction, onAi, onRepair, onManualWebsite, repairing, suggestion, mapboxToken }) {
  const l = row.listing || {}
  const name = l.name || '(listing missing)'
  const live = l.slug ? `/place/${l.slug}` : null
  const edit = l.name ? `/admin/listings?search=${encodeURIComponent(l.name)}` : '/admin/listings'
  const sev = SEVERITY_META[row.severity] || SEVERITY_META.low
  const act = ACTION_META[row.suggested_action] || ACTION_META.pass
  const meta = [VERTICAL_NAMES[l.vertical] || l.vertical, l.sub_type, l.region || l.state].filter(Boolean).join('  ·  ')
  const lat = Number(l.lat), lng = Number(l.lng)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  const details = row.gate_details || []
  const remediations = getRemediations(row, l)
  const showManualWebsite = hasWebFailure(row)
  const anyRepairBusy = busy || !!repairing

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 2px 16px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
      {/* Top strip: severity (left) + suggested action (right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: CREAM, borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: font.body, fontSize: 11, fontWeight: 600, color: sev.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: sev.color }} /> {sev.label} severity
        </span>
        <span style={{ fontFamily: font.body, fontSize: 11, color: MUTED }}>
          Suggested: <b style={{ color: act.color }}>{act.label}</b>
        </span>
      </div>

      <div style={{ padding: '22px 28px 24px' }}>
        {/* Gate badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {(row.failed_gates || []).map(g => (
            <span key={g} style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 3, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: GATE_META[g]?.color || MUTED, fontFamily: font.body }}>
              {GATE_META[g]?.label || g}
            </span>
          ))}
        </div>

        {/* Name + meta */}
        <h2 style={{ fontFamily: font.display, fontWeight: 400, fontSize: 24, color: INK, margin: '0 0 4px', lineHeight: 1.2 }}>
          {live ? <a href={live} target="_blank" rel="noreferrer" style={{ color: INK, textDecoration: 'none' }}>{name}</a> : name}
        </h2>
        <div style={{ fontFamily: font.body, fontSize: 13, color: MUTED, marginBottom: 18 }}>{meta || '—'}</div>

        {/* Why it failed */}
        <div style={{ background: CREAM, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 16px', marginBottom: hasCoords ? 16 : 18 }}>
          <div style={{ fontFamily: font.body, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>Why it failed</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {details.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, marginTop: 1, display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', background: GATE_META[d.gate]?.color || MUTED, fontFamily: font.body }}>
                  {GATE_META[d.gate]?.short || d.gate}
                </span>
                <span style={{ fontFamily: font.body, fontSize: 13.5, color: '#413d38', lineHeight: 1.45 }}>{d.reason}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fix strip — one button per available remediation, plus manual URL entry.
            Each repair runs on its own; destructive ones are visually distinct. */}
        {(remediations.length > 0 || showManualWebsite) && (
          <div style={{ padding: '12px 14px', borderRadius: 10, background: `${REPAIR}12`, border: `1px solid ${REPAIR}44`, marginBottom: 16 }}>
            <div style={{ fontFamily: font.body, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: REPAIR, marginBottom: 9 }}>Suggested fixes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {remediations.map(rem => {
                const spinning = repairing === `${row.id}:${rem.type}`
                return (
                  <div key={rem.type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: font.body, fontSize: 13, fontWeight: 600, color: rem.destructive ? '#8a3a22' : '#2a5560', lineHeight: 1.3 }}>{rem.label}</div>
                      {rem.hint && <div style={{ fontFamily: font.body, fontSize: 11.5, color: MUTED, lineHeight: 1.35, marginTop: 1 }}>{rem.hint}</div>}
                    </div>
                    <button onClick={() => onRepair(rem.type)} disabled={anyRepairBusy}
                      title={rem.hint || rem.label} style={{
                        height: 34, padding: '0 15px', borderRadius: 8, flexShrink: 0,
                        background: rem.destructive ? '#fff' : REPAIR, color: rem.destructive ? DEL : '#fff',
                        border: rem.destructive ? `1px solid ${DEL}` : 'none',
                        fontFamily: font.body, fontSize: 12.5, fontWeight: 600,
                        cursor: anyRepairBusy ? 'default' : 'pointer', opacity: anyRepairBusy && !spinning ? 0.5 : 1,
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                      }}>
                      {spinning
                        ? <><span style={{ width: 12, height: 12, border: `2px solid ${rem.destructive ? DEL + '55' : 'rgba(255,255,255,0.4)'}`, borderTopColor: rem.destructive ? DEL : '#fff', borderRadius: '50%', display: 'inline-block', animation: 'gcspin 0.6s linear infinite' }} />Working…</>
                        : (rem.destructive ? 'Remove' : 'Fix')}
                    </button>
                  </div>
                )
              })}
              {suggestion && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: '#fff', border: `1px dashed ${REPAIR}66` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: font.body, fontSize: 12.5, fontWeight: 600, color: '#2a5560' }}>
                      Possible match: {suggestion.placeName || 'found on Google Places'} —{' '}
                      <a href={suggestion.url} target="_blank" rel="noreferrer" style={{ color: REPAIR }}>{shortHost(suggestion.url)} ↗</a>
                    </div>
                    {suggestion.reason && <div style={{ fontFamily: font.body, fontSize: 11.5, color: MUTED, lineHeight: 1.35, marginTop: 1 }}>Not applied automatically — {suggestion.reason}.</div>}
                  </div>
                  <button onClick={() => onManualWebsite(suggestion.url)} disabled={anyRepairBusy} style={{
                    height: 32, padding: '0 14px', borderRadius: 8, flexShrink: 0, background: '#fff', color: REPAIR,
                    border: `1px solid ${REPAIR}`, fontFamily: font.body, fontSize: 12, fontWeight: 600,
                    cursor: anyRepairBusy ? 'default' : 'pointer', opacity: anyRepairBusy ? 0.5 : 1,
                  }}>Use this site</button>
                </div>
              )}
              {showManualWebsite && (
                <ManualWebsite onSubmit={onManualWebsite} busy={anyRepairBusy} spinning={repairing === `${row.id}:manual`} currentUrl={row.website} />
              )}
            </div>
          </div>
        )}

        {/* Mini map for coords (esp. Location failures) */}
        {hasCoords && mapboxToken && (
          <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" style={{ display: 'block', borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}`, marginBottom: 18, lineHeight: 0 }}>
            <img
              alt={`Map showing the pin for ${name}`}
              src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+cc4444(${lng},${lat})/${lng},${lat},4,0/760x220@2x?access_token=${mapboxToken}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
            />
          </a>
        )}

        {/* Links */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 4, fontFamily: font.body, fontSize: 12 }}>
          {row.website && <a href={row.website} target="_blank" rel="noreferrer" style={{ color: SAGE, textDecoration: 'none' }}>↗ Visit website{row.http_status ? ` (HTTP ${row.http_status})` : ''}</a>}
          {live && <a href={live} target="_blank" rel="noreferrer" style={{ color: MUTED, textDecoration: 'none' }}>View live ›</a>}
          <a href={edit} target="_blank" rel="noreferrer" style={{ color: MUTED, textDecoration: 'none' }}>Open in editor ›</a>
        </div>

        {/* AI verdict blurb */}
        {ai?.busy && <div style={{ marginTop: 12, fontFamily: font.body, fontSize: 12, color: MUTED }}>Running AI vertical-fit check…</div>}
        {ai?.error && <div style={{ marginTop: 12, fontFamily: font.body, fontSize: 12, color: DEL }}>AI check: {ai.error}</div>}
        {ai?.verdict && (
          <div style={{ marginTop: 12, fontFamily: font.body, fontSize: 12.5, color: ai.verdict.isFit === true ? '#3a5a50' : ai.verdict.isFit === null ? MUTED : '#8a3a22' }}>
            AI fit: <b>{ai.verdict.isFit === true ? 'belongs in this vertical' : ai.verdict.isFit === null ? 'could not verify' : 'poor fit'}</b>
            {ai.verdict.verdict?.suggestedVertical ? ` → suggests ${ai.verdict.verdict.suggestedVertical}` : ''}
            {ai.verdict.verdict?.reason ? ` — ${ai.verdict.verdict.reason}` : ''}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: CREAM, borderTop: `1px solid ${BORDER}` }}>
        <ActionBtn kind="keep" onClick={() => onAction('pass')} disabled={busy} title="Keep this listing active (P)">Keep</ActionBtn>
        <ActionBtn kind="hide" onClick={() => onAction('hide')} disabled={busy} title="Hide from public (H)">Hide</ActionBtn>
        <ActionBtn kind="delete" onClick={() => onAction('delete')} disabled={busy} title="Soft-delete to Trash (D)">Delete</ActionBtn>
        <span style={{ flex: 1 }} />
        <button onClick={onAi} disabled={busy || ai?.busy} style={{
          height: 34, padding: '0 12px', borderRadius: 8, background: '#fff', border: `1px solid ${BORDER}`,
          fontFamily: font.body, fontSize: 12, fontWeight: 500, color: MUTED, cursor: (busy || ai?.busy) ? 'default' : 'pointer', opacity: (busy || ai?.busy) ? 0.5 : 1,
        }}>AI fit check</button>
      </div>
    </div>
  )
}

function shortHost(u) { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

// Inline "paste the correct URL" entry — always offered when a web gate fails,
// so the reviewer can supply the right site when the auto-lookup can't find it.
function ManualWebsite({ onSubmit, busy, spinning, currentUrl }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} disabled={busy} style={{
        alignSelf: 'flex-start', marginTop: 2, background: 'none', border: 'none', padding: 0,
        fontFamily: font.body, fontSize: 12, fontWeight: 600, color: REPAIR,
        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, textDecoration: 'underline',
      }}>… or enter the correct URL yourself</button>
    )
  }
  const submit = () => { const v = url.trim(); if (v) onSubmit(v) }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <input
        type="url" value={url} autoFocus placeholder={currentUrl ? 'https://the-correct-site.com.au' : 'https://…'}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        disabled={busy}
        style={{ flex: 1, minWidth: 0, height: 34, padding: '0 10px', borderRadius: 8, border: `1px solid ${BORDER}`, fontFamily: font.body, fontSize: 12.5, color: INK, background: '#fff' }}
      />
      <button onClick={submit} disabled={busy || !url.trim()} style={{
        height: 34, padding: '0 15px', borderRadius: 8, flexShrink: 0, background: REPAIR, color: '#fff', border: 'none',
        fontFamily: font.body, fontSize: 12.5, fontWeight: 600, cursor: (busy || !url.trim()) ? 'default' : 'pointer', opacity: (busy || !url.trim()) ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 7,
      }}>
        {spinning ? <><span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'gcspin 0.6s linear infinite' }} />Saving…</> : 'Set URL'}
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Trash (soft-deleted) — compact list with Restore
// ════════════════════════════════════════════════════════════════════════════
function TrashView({ rows, loading, busy, onRestore }) {
  if (loading) return <Empty>Loading…</Empty>
  if (!rows.length) return <Empty><div style={{ fontFamily: font.body, fontSize: 14, color: MUTED }}>Trash is empty.</div></Empty>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(r => {
        const l = r.listing || {}
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: font.body, fontWeight: 600, fontSize: 13.5, color: INK }}>{l.name || '(listing)'}</div>
              <div style={{ fontFamily: font.body, fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[VERTICAL_NAMES[l.vertical] || l.vertical, l.region || l.state].filter(Boolean).join(' · ')}  —  {r.reason_summary}
              </div>
            </div>
            <button onClick={() => onRestore(r.id)} disabled={busy} style={{
              height: 32, padding: '0 14px', borderRadius: 8, background: '#fff', border: `1px solid ${KEEP}`,
              fontFamily: font.body, fontSize: 12, fontWeight: 600, color: KEEP, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, flexShrink: 0,
            }}>Restore</button>
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Hidden — every listing currently hidden (Gate-Check, dedupe, or editor), with
// its reason and a Restore. Listing-driven, so it surfaces hides that never
// produced a gate-check row.
// ════════════════════════════════════════════════════════════════════════════
const HIDDEN_SOURCE_META = {
  gate_check: { label: 'Gate Check', color: HIDE },
  merge:      { label: 'Merged duplicate', color: '#a24d7a' },
  other:      { label: 'Editor / other', color: MUTED },
}
function HiddenView({ rows, loading, busy, onRestore }) {
  if (loading) return <Empty>Loading…</Empty>
  if (!rows.length) return <Empty><div style={{ fontFamily: font.body, fontSize: 14, color: MUTED }}>No hidden listings — nothing to restore.</div></Empty>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontFamily: font.body, fontSize: 12.5, color: MUTED, margin: '0 0 4px', lineHeight: 1.5 }}>
        Every listing currently hidden from the public site — hidden here in the Gate Check, merged as a duplicate, or hidden in the editor.
        Restore brings a listing back live (and, if it was a merged duplicate, un-merges it).
      </p>
      {rows.map(r => {
        const l = r.listing || {}
        const src = HIDDEN_SOURCE_META[r.hidden_source] || HIDDEN_SOURCE_META.other
        const edit = l.name ? `/admin/listings?search=${encodeURIComponent(l.name)}` : '/admin/listings'
        return (
          <div key={r.listing_id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: font.body, fontWeight: 600, fontSize: 13.5, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name || '(listing)'}</span>
                <span style={{ flexShrink: 0, fontFamily: font.body, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff', background: src.color, borderRadius: 4, padding: '2px 6px' }}>{src.label}</span>
              </div>
              <div style={{ fontFamily: font.body, fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[VERTICAL_NAMES[l.vertical] || l.vertical, l.region || l.state].filter(Boolean).join(' · ')}  —  {r.reason_summary}
              </div>
              <a href={edit} target="_blank" rel="noreferrer" style={{ fontFamily: font.body, fontSize: 11, color: MUTED, textDecoration: 'none' }}>Open in editor ›</a>
            </div>
            <button onClick={() => onRestore(r.listing_id)} disabled={busy} style={{
              height: 32, padding: '0 14px', borderRadius: 8, background: '#fff', border: `1px solid ${KEEP}`,
              fontFamily: font.body, fontSize: 12, fontWeight: 600, color: KEEP, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, flexShrink: 0,
            }}>Restore</button>
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Completion screen
// ════════════════════════════════════════════════════════════════════════════
function Completion({ session }) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2.5rem', background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
      <h2 style={{ fontFamily: font.display, fontWeight: 400, fontSize: 24, color: INK, margin: '0 0 16px' }}>Queue cleared</h2>
      <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', fontFamily: font.body, fontSize: 13, color: MUTED }}>
        <span style={{ color: REPAIR, fontWeight: 500 }}>⚡ {session.repaired} repaired</span><span style={{ opacity: 0.3 }}>·</span>
        <span style={{ color: KEEP, fontWeight: 500 }}>✓ {session.kept} kept</span><span style={{ opacity: 0.3 }}>·</span>
        <span style={{ color: HIDE, fontWeight: 500 }}>{session.hidden} hidden</span><span style={{ opacity: 0.3 }}>·</span>
        <span style={{ color: DEL, fontWeight: 500 }}>{session.deleted} deleted</span>
      </div>
      <p style={{ fontFamily: font.body, fontSize: 12, color: MUTED, opacity: 0.7, marginTop: 24, marginBottom: 0 }}>
        Run a fresh sweep (server-side) to re-check the Atlas, or Quick re-scan to refresh Location & Fit flags.
      </p>
    </div>
  )
}

// ── Small presentational helpers ─────────────────────────────────────────────
function ActionBtn({ kind, onClick, disabled, title, children }) {
  const c = { keep: KEEP, hide: HIDE, delete: DEL }[kind]
  const solid = kind === 'keep'
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      height: 38, padding: '0 20px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
      fontFamily: font.body, fontSize: 13, fontWeight: 600, letterSpacing: '0.02em', transition: 'all 0.15s',
      background: solid ? c : '#fff', color: solid ? '#fff' : c, border: solid ? 'none' : `1px solid ${c}`,
      boxShadow: solid ? '0 1px 3px rgba(74,124,89,0.3)' : 'none', opacity: disabled ? 0.5 : 1,
    }}
      onMouseEnter={e => { if (!disabled && !solid) { e.currentTarget.style.background = c; e.currentTarget.style.color = '#fff' } }}
      onMouseLeave={e => { if (!solid) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = c } }}>
      {children}
    </button>
  )
}
function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: font.body, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? INK : MUTED,
      background: 'none', border: 'none', borderBottom: active ? `2px solid ${SAGE}` : '2px solid transparent',
      padding: '10px 20px', cursor: 'pointer', transition: 'all 0.15s',
    }}>{children}</button>
  )
}
function PillGroup({ label, value, onPick, options, colorFor }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontFamily: font.body, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, opacity: 0.7 }}>{label}</span>
      {options.map(([v, lbl]) => {
        const on = value === v
        const c = (colorFor && colorFor(v)) || SAGE
        return (
          <button key={v} onClick={() => onPick(v)} style={{
            fontFamily: font.body, fontSize: 11, fontWeight: on ? 600 : 500,
            color: on ? '#fff' : c, background: on ? c : `${typeof c === 'string' && c.startsWith('#') ? c + '15' : 'transparent'}`,
            border: `1px solid ${on ? c : (typeof c === 'string' && c.startsWith('#') ? c + '40' : BORDER)}`,
            borderRadius: 100, padding: '3px 10px', cursor: 'pointer', transition: 'all 0.15s',
          }}>{lbl}</button>
        )
      })}
    </div>
  )
}
function Dropdown({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: font.body, fontSize: 11, color: MUTED }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: '4px 6px', border: `1px solid ${BORDER}`, borderRadius: 7, background: '#fff', fontFamily: font.body, fontSize: 11.5, color: INK }}>
        <option value="">All</option>
        {options.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
      </select>
    </label>
  )
}
function Kbd({ children }) {
  return <kbd style={{ display: 'inline-block', minWidth: 16, padding: '1px 5px', borderRadius: 4, background: '#fff', border: `1px solid ${BORDER}`, boxShadow: '0 1px 0 rgba(0,0,0,0.05)', fontFamily: font.body, fontSize: 10.5, fontWeight: 600, color: INK, textAlign: 'center' }}>{children}</kbd>
}
function Sep() { return <span style={{ opacity: 0.3 }}>|</span> }
function Empty({ children }) {
  return <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}` }}>{children}</div>
}
function Banner({ kind, children }) {
  const s = kind === 'error'
    ? { background: 'rgba(181,72,42,0.08)', border: '1px solid rgba(181,72,42,0.35)', color: '#8a3a22' }
    : { background: 'rgba(95,138,126,0.1)', border: '1px solid rgba(95,138,126,0.35)', color: '#3a5a50' }
  return <div style={{ padding: '0.7rem 0.95rem', borderRadius: 10, marginBottom: 12, fontFamily: font.body, fontSize: 13, lineHeight: 1.45, ...s }}>{children}</div>
}
function ghostBtn(disabled) {
  return { height: 32, padding: '0 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', fontFamily: font.body, fontSize: 12, fontWeight: 600, color: INK, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }
}
