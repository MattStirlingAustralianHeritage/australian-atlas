'use client'

import { useState, useCallback, useMemo } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

// ── Palette (matches the admin dashboard) ───────────────────────────────────
const INK = '#2D2A26'
const MUTED = '#6B6760'
const CREAM = '#FAF8F5'
const ACCENT = '#C4603A'
const BORDER = 'rgba(28,26,23,0.12)'
const DARK = '#1C1A17'
const GREEN = '#5f8a7e'
const AMBER = '#d4a039'
const RED = '#b5482a'

const GATE_META = {
  gate1_web:      { label: 'Web',      color: '#c4603a' },
  gate2_location: { label: 'Location', color: '#3a6ea5' },
  gate3_activity: { label: 'Activity', color: '#7a5ea0' },
  gate4_vertical: { label: 'Fit',      color: '#5f8a7e' },
}
const SEVERITY_META = {
  high:   { color: RED,   label: 'High' },
  medium: { color: AMBER, label: 'Medium' },
  low:    { color: MUTED, label: 'Low' },
}
const ACTION_COLOR = { delete: RED, hide: AMBER, pass: GREEN }
const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}
const font = { body: 'var(--font-body, system-ui)', display: 'var(--font-display, Georgia)' }

export default function GateCheckClient({ initialRows, tableMissing, loadError, pendingCount, trashCount, lastScannedAt, facets }) {
  const [rows, setRows] = useState(initialRows || [])
  const [view, setView] = useState('queue') // 'queue' | 'trash'
  const [filters, setFilters] = useState({ vertical: '', gate: '', severity: '', action: '' })
  const [selected, setSelected] = useState(() => new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(!!tableMissing)
  const [counts, setCounts] = useState({ pending: pendingCount || 0, trash: trashCount || 0 })
  const [scan, setScan] = useState({ running: false, result: null, error: null })
  const [ai, setAi] = useState({}) // rowId -> { busy?, verdict?, error? }
  const [msg, setMsg] = useState(loadError ? { kind: 'error', text: loadError } : null)

  const isTrash = view === 'trash'

  // Breakdown of the currently-loaded queue (for the summary strip).
  const breakdown = useMemo(() => {
    const byGate = {}, bySeverity = {}, byAction = {}
    for (const r of rows) {
      for (const g of (r.failed_gates || [])) byGate[g] = (byGate[g] || 0) + 1
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1
      byAction[r.suggested_action] = (byAction[r.suggested_action] || 0) + 1
    }
    return { byGate, bySeverity, byAction }
  }, [rows])

  // Filter options = initial server facets UNION whatever is loaded now, so a
  // rescan that surfaces a new vertical/gate still appears in the dropdowns.
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
    setSelected(new Set())
    try {
      const status = nextView === 'trash' ? 'deleted' : 'pending'
      const params = new URLSearchParams({ status })
      if (nextFilters.vertical) params.set('vertical', nextFilters.vertical)
      if (nextFilters.gate) params.set('gate', nextFilters.gate)
      if (nextFilters.severity) params.set('severity', nextFilters.severity)
      if (nextFilters.action) params.set('action', nextFilters.action)
      const res = await fetch(`/api/admin/gate-check?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      if (data.tableMissing) { setMissing(true); setRows([]); return }
      setRows(data.rows || [])
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }, [view, filters])

  const changeView = (v) => {
    setView(v)
    // Don't carry queue filters into Trash — its filter UI is hidden, so a filtered
    // row would silently vanish from Trash with no way to clear the filter there.
    if (v === 'trash') { const cleared = { vertical: '', gate: '', severity: '', action: '' }; setFilters(cleared); refetch(v, cleared) }
    else refetch(v, filters)
  }
  const changeFilter = (key, val) => {
    const next = { ...filters, [key]: val }
    setFilters(next)
    refetch(view, next)
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  const runAction = useCallback(async (ids, action) => {
    if (!ids.length) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/gate-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      const idSet = new Set(ids)
      setRows(prev => prev.filter(r => !idSet.has(r.id)))
      setSelected(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n })
      const n = ids.length
      setCounts(prev => {
        if (action === 'delete') return { pending: Math.max(0, prev.pending - n), trash: prev.trash + n }
        if (action === 'restore') return { pending: prev.pending + n, trash: Math.max(0, prev.trash - n) }
        if (action === 'pass' || action === 'hide') return { ...prev, pending: Math.max(0, prev.pending - n) }
        return prev
      })
      setMsg({ kind: 'ok', text: `${actionLabel(action)} ${n} listing${n === 1 ? '' : 's'}.` })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }, [])

  const [pendingBulk, setPendingBulk] = useState(null) // { action, ids }
  const bulk = (action) => {
    const ids = [...selected]
    if (!ids.length) return
    if (action === 'hide' || action === 'delete') { setPendingBulk({ action, ids }); return }
    runAction(ids, action)
  }
  const confirmBulk = async () => {
    if (!pendingBulk) return
    await runAction(pendingBulk.ids, pendingBulk.action)
    setPendingBulk(null)
  }

  // ── AI fit check (LLM Gate 4) for one row ─────────────────────────────────────
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
      // The AI check may have persisted new gates/severity/suggested action — reconcile the row.
      if (data.updatedRow) setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...data.updatedRow } : r))
    } catch (err) {
      setAi(prev => ({ ...prev, [rowId]: { error: err.message } }))
    }
  }, [])

  // ── Quick re-scan (Location + Vertical-fit gates) ─────────────────────────────
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
      refetch('queue', filters)
      setView('queue')
      // Use the exact pending count the quick-scan returns (head count, not capped rows).
      if (typeof data.pending === 'number') setCounts(prev => ({ ...prev, pending: data.pending }))
    } catch (err) {
      setScan({ running: false, result: null, error: err.message })
    }
  }, [filters, refetch])

  // ── Selection ────────────────────────────────────────────────────────────────
  const allVisibleSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(rows.map(r => r.id)))
  const toggleOne = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const pendingCountLabel = pendingBulk ? `${pendingBulk.ids.length} listing${pendingBulk.ids.length === 1 ? '' : 's'}` : ''

  return (
    <div style={{ minHeight: '100vh', background: CREAM, paddingBottom: '4rem' }}>
      <ConfirmDialog
        open={!!pendingBulk}
        title={pendingBulk?.action === 'hide' ? `Hide ${pendingCountLabel}?` : `Soft-delete ${pendingCountLabel}?`}
        message={pendingBulk?.action === 'hide'
          ? 'They will be removed from every public surface and the map (reversible).'
          : 'They move to Trash, removed from public + the default admin views. Reversible via Restore.'}
        confirmLabel={pendingBulk?.action === 'hide' ? 'Hide' : 'Delete'}
        danger busy={busy}
        onConfirm={confirmBulk}
        onCancel={() => setPendingBulk(null)}
      />
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '2rem 1.5rem 0' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: font.display, fontSize: '1.75rem', fontWeight: 600, color: INK, margin: '0 0 0.25rem' }}>
              Gate Check
            </h1>
            <p style={{ fontFamily: font.body, fontSize: '0.85rem', color: MUTED, margin: 0, maxWidth: 720 }}>
              Every live listing swept through the Atlas quality gates — <b>Web Presence</b>, <b>Location</b>, <b>Activity</b> and <b>Vertical Fit</b>.
              Only the listings that <i>failed</i> a gate appear here, with the reason and a suggested action. Pass keeps it; Hide / Delete are reversible.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={runQuickScan} disabled={scan.running || missing} style={btnStyle('ghost', scan.running || missing)}>
              {scan.running ? 'Re-scanning…' : 'Quick re-scan'}
            </button>
          </div>
        </div>

        {/* Missing-table banner */}
        {missing && (
          <div style={bannerStyle('error')}>
            <strong>Migration 219 not applied.</strong> The table <code>listing_gate_check</code> does not exist yet.
            Apply <code>supabase/migrations/219_listing_gate_check.sql</code> to the portal project <code>nyhkcmvhwbydsqsyvizs</code>,
            run <code>scripts/sweep-gate-check.mjs</code>, then reload.
          </div>
        )}

        {/* Quick-scan result / error */}
        {scan.error && <div style={bannerStyle('error')}>Quick scan error: {scan.error}</div>}
        {scan.result && (
          <div style={bannerStyle('ok')}>
            Quick re-scan complete — {scan.result.scanned} scanned, {scan.result.upserted} location/fit flags written, {scan.result.cleared} cleared.
          </div>
        )}
        {msg && <div style={bannerStyle(msg.kind === 'error' ? 'error' : 'ok')}>{msg.text}</div>}

        {/* Summary strip */}
        {!isTrash && !missing && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '1rem 0 0' }}>
            {Object.entries(breakdown.byGate).sort((a, b) => b[1] - a[1]).map(([g, n]) => (
              <SummaryPill key={g} color={GATE_META[g]?.color || MUTED} label={GATE_META[g]?.label || g} value={n} />
            ))}
            <span style={{ width: 1, background: BORDER, margin: '0 0.25rem' }} />
            {['high', 'medium', 'low'].filter(s => breakdown.bySeverity[s]).map(s => (
              <SummaryPill key={s} color={SEVERITY_META[s].color} label={SEVERITY_META[s].label} value={breakdown.bySeverity[s]} outline />
            ))}
          </div>
        )}

        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', margin: '1rem 0 0.75rem' }}>
          <div style={{ display: 'inline-flex', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            <ToggleBtn active={!isTrash} onClick={() => changeView('queue')}>Queue · {counts.pending}</ToggleBtn>
            <ToggleBtn active={isTrash} onClick={() => changeView('trash')}>Trash · {counts.trash}</ToggleBtn>
          </div>
          {!isTrash && (
            <>
              <FilterSelect label="Vertical" value={filters.vertical} onChange={v => changeFilter('vertical', v)}
                options={liveFacets.verticals.map(v => [v, VERTICAL_NAMES[v] || v])} />
              <FilterSelect label="Gate" value={filters.gate} onChange={v => changeFilter('gate', v)}
                options={liveFacets.gates.map(g => [g, GATE_META[g]?.label || g])} />
              <FilterSelect label="Severity" value={filters.severity} onChange={v => changeFilter('severity', v)}
                options={[['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
              <FilterSelect label="Suggested" value={filters.action} onChange={v => changeFilter('action', v)}
                options={[['delete', 'Delete'], ['hide', 'Hide'], ['pass', 'Pass']]} />
            </>
          )}
          <span style={{ flex: 1 }} />
          {lastScannedAt && <span style={{ fontFamily: font.body, fontSize: '0.72rem', color: MUTED }}>Last sweep: {new Date(lastScannedAt).toLocaleString()}</span>}
          {loading && <span style={{ fontFamily: font.body, fontSize: '0.8rem', color: MUTED }}>Loading…</span>}
        </div>

        {/* Bulk action bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem',
          background: selected.size ? 'rgba(196,96,58,0.06)' : '#fff',
          border: `1px solid ${selected.size ? 'rgba(196,96,58,0.3)' : BORDER}`, borderRadius: 10, marginBottom: '0.75rem',
        }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: font.body, fontSize: '0.8rem', color: INK, cursor: 'pointer' }}>
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={!rows.length} />
            Select all visible
          </label>
          <span style={{ fontFamily: font.body, fontSize: '0.8rem', color: MUTED }}>
            {selected.size ? `${selected.size} selected` : `${rows.length} shown`}
          </span>
          <span style={{ flex: 1 }} />
          {isTrash ? (
            <button onClick={() => bulk('restore')} disabled={!selected.size || busy} style={btnStyle('green', !selected.size)}>Restore</button>
          ) : (
            <>
              <button onClick={() => bulk('pass')} disabled={!selected.size || busy} style={btnStyle('green', !selected.size)}>Pass / Keep</button>
              <button onClick={() => bulk('hide')} disabled={!selected.size || busy} style={btnStyle('amber', !selected.size)}>Hide</button>
              <button onClick={() => bulk('delete')} disabled={!selected.size || busy} style={btnStyle('red', !selected.size)}>Delete</button>
            </>
          )}
        </div>

        {/* Table */}
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: font.body, fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: CREAM, textAlign: 'left', color: MUTED }}>
                  <Th style={{ width: 34 }}></Th>
                  <Th>Listing</Th>
                  <Th>Vertical</Th>
                  <Th>Gates failed</Th>
                  <Th style={{ minWidth: 340 }}>Why it failed</Th>
                  <Th>Severity</Th>
                  <Th>Suggested</Th>
                  <Th style={{ textAlign: 'right' }}>Action</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: MUTED }}>
                    {missing ? 'Apply migration 219 and run the sweep to begin.' : isTrash ? 'Trash is empty.' : 'No listings are failing a gate. 🎉'}
                  </td></tr>
                )}
                {rows.map(r => (
                  <Row key={r.id} r={r} selected={selected.has(r.id)} onToggle={() => toggleOne(r.id)}
                    isTrash={isTrash} busy={busy} ai={ai[r.id]} onAi={() => runAi(r.id)}
                    onAction={(action) => runAction([r.id], action)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Row ──────────────────────────────────────────────────────────────────────
function Row({ r, selected, onToggle, isTrash, busy, ai, onAi, onAction }) {
  const l = r.listing || {}
  const name = l.name || '(listing missing)'
  const live = l.slug ? `/place/${l.slug}` : null
  const edit = l.name ? `/admin/listings?search=${encodeURIComponent(l.name)}` : '/admin/listings'
  const sev = SEVERITY_META[r.severity] || SEVERITY_META.low
  return (
    <tr style={{ borderTop: `1px solid ${BORDER}`, background: selected ? 'rgba(196,96,58,0.04)' : '#fff' }}>
      <Td><input type="checkbox" checked={selected} onChange={onToggle} /></Td>
      <Td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {live
            ? <a href={live} target="_blank" rel="noreferrer" style={{ color: INK, fontWeight: 600, textDecoration: 'none' }}>{name}</a>
            : <span style={{ color: INK, fontWeight: 600 }}>{name}</span>}
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={edit} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: '0.7rem', textDecoration: 'none' }}>edit ›</a>
            {r.website && <a href={r.website} target="_blank" rel="noreferrer" style={{ color: MUTED, fontSize: '0.7rem', textDecoration: 'none' }}>site ›</a>}
          </div>
          <span style={{ color: MUTED, fontSize: '0.68rem' }}>{[l.sub_type, l.region || l.state].filter(Boolean).join(' · ') || '—'}</span>
        </div>
      </Td>
      <Td>{VERTICAL_NAMES[l.vertical] || l.vertical || '—'}</Td>
      <Td>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(r.failed_gates || []).map(g => (
            <span key={g} style={{ display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: 6, fontSize: '0.66rem', fontWeight: 600,
              color: '#fff', background: GATE_META[g]?.color || MUTED }}>
              {GATE_META[g]?.label || g}
            </span>
          ))}
        </div>
      </Td>
      <Td style={{ color: INK }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {(r.gate_details || []).map((d, i) => (
            <div key={i} style={{ lineHeight: 1.35 }}>
              <span style={{ color: GATE_META[d.gate]?.color || MUTED, fontWeight: 600 }}>{GATE_META[d.gate]?.label || d.gate}:</span>{' '}
              <span style={{ color: '#413d38' }}>{d.reason}</span>
            </div>
          ))}
          {ai?.busy && <div style={{ color: MUTED, fontSize: '0.7rem' }}>Running AI fit check…</div>}
          {ai?.error && <div style={{ color: RED, fontSize: '0.7rem' }}>AI check: {ai.error}</div>}
          {ai?.verdict && (
            <div style={{ fontSize: '0.72rem', color: ai.verdict.isFit === true ? '#3a5a50' : ai.verdict.isFit === null ? MUTED : '#8a3a22', marginTop: 2 }}>
              AI fit: <b>{ai.verdict.isFit === true ? 'belongs here' : ai.verdict.isFit === null ? 'could not verify' : 'poor fit'}</b>
              {ai.verdict.verdict?.suggestedVertical ? ` → suggests ${ai.verdict.verdict.suggestedVertical}` : ''}
              {ai.verdict.verdict?.reason ? ` — ${ai.verdict.verdict.reason}` : ''}
            </div>
          )}
        </div>
      </Td>
      <Td><span style={{ display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: 6, fontSize: '0.66rem', fontWeight: 700,
        color: '#fff', background: sev.color }}>{sev.label}</span></Td>
      <Td><span style={{ color: ACTION_COLOR[r.suggested_action] || MUTED, fontWeight: 600, textTransform: 'capitalize' }}>{r.suggested_action}</span></Td>
      <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {isTrash ? (
          <RowBtn kind="green" onClick={() => onAction('restore')} disabled={busy}>Restore</RowBtn>
        ) : (
          <>
            <RowBtn kind="green" onClick={() => onAction('pass')} disabled={busy}>Pass</RowBtn>
            <RowBtn kind="amber" onClick={() => onAction('hide')} disabled={busy}>Hide</RowBtn>
            <RowBtn kind="red" onClick={() => onAction('delete')} disabled={busy}>Delete</RowBtn>
            <RowBtn kind="ghost" onClick={onAi} disabled={busy || ai?.busy}>AI fit</RowBtn>
          </>
        )}
      </Td>
    </tr>
  )
}

// ── Small presentational helpers ─────────────────────────────────────────────
function SummaryPill({ color, label, value, outline }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.6rem', borderRadius: 8,
      background: outline ? '#fff' : `${color}14`, border: `1px solid ${outline ? BORDER : color + '55'}`,
      fontFamily: font.body, fontSize: '0.74rem', color: INK,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <b>{value}</b> {label}
    </span>
  )
}
function Th({ children, style }) {
  return <th style={{ padding: '0.6rem 0.75rem', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', ...style }}>{children}</th>
}
function Td({ children, style }) {
  return <td style={{ padding: '0.55rem 0.75rem', verticalAlign: 'top', ...style }}>{children}</td>
}
function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.4rem 0.85rem', border: 'none', cursor: 'pointer', fontFamily: font.body, fontSize: '0.78rem', fontWeight: 600,
      background: active ? INK : '#fff', color: active ? '#fff' : MUTED,
    }}>{children}</button>
  )
}
function FilterSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontFamily: font.body, fontSize: '0.75rem', color: MUTED }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        padding: '0.35rem 0.5rem', border: `1px solid ${BORDER}`, borderRadius: 7, background: '#fff',
        fontFamily: font.body, fontSize: '0.78rem', color: INK,
      }}>
        <option value="">All</option>
        {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </label>
  )
}
function RowBtn({ kind, onClick, disabled, children }) {
  const c = { green: GREEN, amber: AMBER, red: RED, ghost: MUTED }[kind] || MUTED
  return (
    <button onClick={onClick} disabled={disabled} style={{
      marginLeft: 4, padding: '0.28rem 0.55rem', border: `1px solid ${c}`, borderRadius: 6, background: '#fff',
      color: c, fontFamily: font.body, fontSize: '0.72rem', fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  )
}
function btnStyle(kind, disabled) {
  const base = { padding: '0.5rem 0.9rem', borderRadius: 8, fontFamily: font.body, fontSize: '0.8rem', fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }
  if (kind === 'solid') return { ...base, border: `1px solid ${INK}`, background: INK, color: '#fff' }
  if (kind === 'ghost') return { ...base, border: `1px solid ${BORDER}`, background: '#fff', color: INK }
  const c = { green: GREEN, amber: AMBER, red: RED }[kind] || INK
  return { ...base, border: `1px solid ${c}`, background: '#fff', color: c }
}
const bannerBase = { padding: '0.7rem 0.95rem', borderRadius: 10, marginTop: '1rem', fontFamily: font.body, fontSize: '0.82rem', lineHeight: 1.45 }
function bannerStyle(kind) {
  if (kind === 'error') return { ...bannerBase, background: 'rgba(181,72,42,0.08)', border: '1px solid rgba(181,72,42,0.35)', color: '#8a3a22' }
  return { ...bannerBase, background: 'rgba(95,138,126,0.1)', border: '1px solid rgba(95,138,126,0.35)', color: '#3a5a50' }
}
function actionLabel(action) {
  return { pass: 'Passed', hide: 'Hid', delete: 'Deleted', restore: 'Restored' }[action] || 'Updated'
}
