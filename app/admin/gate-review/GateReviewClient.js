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

const GATE_COLORS = {
  wrong_category: '#c4603a',
  character: '#7a5ea0',
  destination: '#3a6ea5',
  independence: '#5f8a7e',
}
const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const font = { body: 'var(--font-body, system-ui)', display: 'var(--font-display, Georgia)' }

export default function GateReviewClient({ initialRows, tableMissing, loadError, pendingCount, trashCount, facets }) {
  const [rows, setRows] = useState(initialRows || [])
  const [view, setView] = useState('queue') // 'queue' | 'trash'
  const [filters, setFilters] = useState({ vertical: '', gate: '', source: '' })
  const [selected, setSelected] = useState(() => new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(!!tableMissing)
  const [counts, setCounts] = useState({ pending: pendingCount || 0, trash: trashCount || 0 })
  const [scan, setScan] = useState({ running: false, result: null, error: null })
  const [msg, setMsg] = useState(loadError ? { kind: 'error', text: loadError } : null)

  const statusForView = view === 'trash' ? 'deleted' : 'pending'

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const refetch = useCallback(async (nextView = view, nextFilters = filters) => {
    setLoading(true)
    setSelected(new Set())
    try {
      const status = nextView === 'trash' ? 'deleted' : 'pending'
      const params = new URLSearchParams({ status })
      if (nextFilters.vertical) params.set('vertical', nextFilters.vertical)
      if (nextFilters.gate) params.set('gate', nextFilters.gate)
      if (nextFilters.source) params.set('source', nextFilters.source)
      const res = await fetch(`/api/admin/gate-review?${params}`)
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

  const changeView = (v) => { setView(v); refetch(v, filters) }
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
      const res = await fetch('/api/admin/gate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      // Optimistically drop the acted-on rows from the current view.
      const idSet = new Set(ids)
      setRows(prev => prev.filter(r => !idSet.has(r.id)))
      setSelected(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n })
      // Adjust counters.
      const n = ids.length
      setCounts(prev => {
        if (action === 'delete') return { pending: Math.max(0, prev.pending - n), trash: prev.trash + n }
        if (action === 'restore') return { pending: prev.pending + n, trash: Math.max(0, prev.trash - n) }
        if (action === 'approve' || action === 'hide') return { ...prev, pending: Math.max(0, prev.pending - n) }
        return prev
      })
      setMsg({ kind: 'ok', text: `${actionLabel(action)} ${n} listing${n === 1 ? '' : 's'}.` })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }, [])

  // Bulk hide/delete go through a branded confirm dialog first.
  const [pendingBulk, setPendingBulk] = useState(null) // { action: 'hide' | 'delete', ids }

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

  // ── Scanner ──────────────────────────────────────────────────────────────────
  const runScan = useCallback(async (dryRun) => {
    setScan({ running: true, result: null, error: null })
    setMsg(null)
    try {
      const res = await fetch('/api/admin/scan-gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      setScan({ running: false, result: { ...data, dryRun }, error: null })
      if (!dryRun) {
        setCounts(prev => ({ ...prev, pending: prev.pending + (data.inserted || 0) }))
        refetch('queue', filters)
        setView('queue')
      }
    } catch (err) {
      setScan({ running: false, result: null, error: err.message })
      if (/migration 145|does not exist/i.test(err.message)) setMissing(true)
    }
  }, [filters, refetch])

  // ── Selection ────────────────────────────────────────────────────────────────
  const allVisibleSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(rows.map(r => r.id)))
  }
  const toggleOne = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const isTrash = view === 'trash'

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
        danger
        busy={busy}
        onConfirm={confirmBulk}
        onCancel={() => setPendingBulk(null)}
      />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2rem 1.5rem 0' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: font.display, fontSize: '1.75rem', fontWeight: 600, color: INK, margin: '0 0 0.25rem' }}>
              Gate Review
            </h1>
            <p style={{ fontFamily: font.body, fontSize: '0.85rem', color: MUTED, margin: 0, maxWidth: 640 }}>
              Listings flagged as not fitting the Atlas proposition. The scanner only flags — every Approve / Hide / Delete here is your call. Delete is a reversible soft-delete (Trash).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => runScan(true)} disabled={scan.running || missing}
              style={btnStyle('ghost')}>{scan.running ? 'Scanning…' : 'Preview scan'}</button>
            <button onClick={() => runScan(false)} disabled={scan.running || missing}
              style={btnStyle('solid')}>{scan.running ? 'Scanning…' : 'Run scan'}</button>
          </div>
        </div>

        {/* Missing-table banner */}
        {missing && (
          <div style={bannerStyle('error')}>
            <strong>Migration 153 not applied.</strong> The table <code>listing_review_queue</code> does not exist yet.
            Paste <code>supabase/migrations/153_listing_review_queue.sql</code> into the Supabase SQL editor
            (portal project <code>nyhkcmvhwbydsqsyvizs</code>), then reload this page.
          </div>
        )}

        {/* Scan result */}
        {scan.error && <div style={bannerStyle('error')}>Scan error: {scan.error}</div>}
        {scan.result && <ScanResult result={scan.result} />}

        {/* Message */}
        {msg && (
          <div style={bannerStyle(msg.kind === 'error' ? 'error' : 'ok')}>
            {msg.text}
          </div>
        )}

        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', margin: '1.25rem 0 0.75rem' }}>
          {/* View toggle */}
          <div style={{ display: 'inline-flex', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            <ToggleBtn active={!isTrash} onClick={() => changeView('queue')}>Queue · {counts.pending}</ToggleBtn>
            <ToggleBtn active={isTrash} onClick={() => changeView('trash')}>Trash · {counts.trash}</ToggleBtn>
          </div>

          {/* Filters (queue view only) */}
          {!isTrash && (
            <>
              <FilterSelect label="Vertical" value={filters.vertical} onChange={v => changeFilter('vertical', v)}
                options={facets.verticals.map(v => [v, VERTICAL_NAMES[v] || v])} />
              <FilterSelect label="Gate" value={filters.gate} onChange={v => changeFilter('gate', v)}
                options={facets.gates.map(g => [g, g.replace('_', ' ')])} />
              <FilterSelect label="Source" value={filters.source} onChange={v => changeFilter('source', v)}
                options={facets.sources.map(s => [s, s.replace('_', ' ')])} />
            </>
          )}

          <span style={{ flex: 1 }} />
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
              <button onClick={() => bulk('approve')} disabled={!selected.size || busy} style={btnStyle('green', !selected.size)}>Approve / Keep</button>
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
                  <Th>Name</Th>
                  <Th>Vertical</Th>
                  <Th>Type</Th>
                  <Th>Region</Th>
                  <Th style={{ minWidth: 280 }}>Flag reason</Th>
                  <Th>Gate</Th>
                  <Th style={{ textAlign: 'right' }}>Conf</Th>
                  <Th>Suggested</Th>
                  <Th style={{ textAlign: 'right' }}>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: '2.5rem', textAlign: 'center', color: MUTED }}>
                    {missing ? 'Apply migration 145 to begin.' : isTrash ? 'Trash is empty.' : 'Nothing pending. Run a scan to flag listings.'}
                  </td></tr>
                )}
                {rows.map(r => (
                  <Row key={r.id} r={r} selected={selected.has(r.id)} onToggle={() => toggleOne(r.id)}
                    isTrash={isTrash} busy={busy} onAction={(action) => runAction([r.id], action)} />
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
function Row({ r, selected, onToggle, isTrash, busy, onAction }) {
  const l = r.listing || {}
  const name = l.name || '(listing missing)'
  const live = l.slug ? `/place/${l.slug}` : null
  const edit = l.name ? `/admin/listings?search=${encodeURIComponent(l.name)}` : '/admin/listings'
  const conf = r.confidence
  const confColor = conf >= 80 ? '#c4603a' : conf >= 50 ? AMBER : MUTED
  return (
    <tr style={{ borderTop: `1px solid ${BORDER}`, background: selected ? 'rgba(196,96,58,0.04)' : '#fff' }}>
      <Td><input type="checkbox" checked={selected} onChange={onToggle} /></Td>
      <Td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {live
            ? <a href={live} target="_blank" rel="noreferrer" style={{ color: INK, fontWeight: 600, textDecoration: 'none' }}>{name}</a>
            : <span style={{ color: INK, fontWeight: 600 }}>{name}</span>}
          <a href={edit} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: '0.7rem', textDecoration: 'none' }}>edit ›</a>
        </div>
      </Td>
      <Td>{VERTICAL_NAMES[l.vertical] || l.vertical || '—'}</Td>
      <Td>{l.sub_type || '—'}</Td>
      <Td>{l.region || l.state || '—'}</Td>
      <Td style={{ color: INK }}>{r.flag_reason}</Td>
      <Td>
        <span style={{ display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600,
          color: '#fff', background: GATE_COLORS[r.gate_flagged] || MUTED }}>
          {(r.gate_flagged || '').replace('_', ' ')}
        </span>
      </Td>
      <Td style={{ textAlign: 'right', fontWeight: 700, color: confColor }}>{conf}</Td>
      <Td><span style={{ color: MUTED }}>{r.suggested_action}</span></Td>
      <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {isTrash ? (
          <RowBtn kind="green" onClick={() => onAction('restore')} disabled={busy}>Restore</RowBtn>
        ) : (
          <>
            <RowBtn kind="green" onClick={() => onAction('approve')} disabled={busy}>Keep</RowBtn>
            <RowBtn kind="amber" onClick={() => onAction('hide')} disabled={busy}>Hide</RowBtn>
            <RowBtn kind="red" onClick={() => onAction('delete')} disabled={busy}>Delete</RowBtn>
          </>
        )}
      </Td>
    </tr>
  )
}

// ── Scan result panel ────────────────────────────────────────────────────────
function ScanResult({ result }) {
  const mech = result.by_mechanism || {}
  return (
    <div style={{ ...bannerBase, background: DARK, color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {result.dryRun ? 'Preview (nothing written)' : 'Scan complete'} — scanned {result.scanned},
        flagged {result.flagged}, {result.dryRun ? `would insert ${result.flagged}` : `inserted ${result.inserted}`},
        already queued {result.already_queued}.
      </div>
      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
        by mechanism: {Object.entries(mech).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ') || '—'}
        {result.by_gate ? `  |  by gate: ${Object.entries(result.by_gate).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(' · ')}` : ''}
      </div>
      {result.dryRun && result.sample?.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: AMBER }}>Top {result.sample.length} sample flags</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)' }}>
            {result.sample.map((s, i) => (
              <li key={i}>[{s.confidence}] {s.name} <span style={{ color: 'rgba(255,255,255,0.5)' }}>— {s.flag_reason}</span></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// ── Small presentational helpers ─────────────────────────────────────────────
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
  const c = { green: GREEN, amber: AMBER, red: '#b5482a' }[kind] || MUTED
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
  const c = { green: GREEN, amber: AMBER, red: '#b5482a' }[kind] || INK
  return { ...base, border: `1px solid ${c}`, background: '#fff', color: c }
}
const bannerBase = { padding: '0.7rem 0.95rem', borderRadius: 10, marginTop: '1rem', fontFamily: font.body, fontSize: '0.82rem', lineHeight: 1.45 }
function bannerStyle(kind) {
  if (kind === 'error') return { ...bannerBase, background: 'rgba(181,72,42,0.08)', border: '1px solid rgba(181,72,42,0.35)', color: '#8a3a22' }
  return { ...bannerBase, background: 'rgba(95,138,126,0.1)', border: '1px solid rgba(95,138,126,0.35)', color: '#3a5a50' }
}
function actionLabel(action) {
  return { approve: 'Kept', hide: 'Hid', delete: 'Deleted', restore: 'Restored' }[action] || 'Updated'
}
