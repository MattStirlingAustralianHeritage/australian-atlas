'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { PRESS_TEMPLATE_OPTIONS, PRESS_TEMPLATES, PRESS_INVITE_TEMPLATE } from '@/lib/outreach/pressTemplates'

const SITE = 'https://australianatlas.com.au'

const MERGE_TOKENS = [
  ['{{greeting_name}}', 'First name / "there"'],
  ['{{outlet_name}}', 'Outlet / masthead'],
  ['{{journalist_name}}', 'Journalist name'],
  ['{{beat}}', 'Beat phrase'],
  ['{{region}}', 'Region / "Australia"'],
  ['{{state}}', 'State'],
  ['{{personal_note}}', 'AI personal opener'],
  ['{{for_press_url}}', '/for-press URL'],
  ['{{example_url}}', 'Live fact-sheet URL'],
]

// ── shared style helpers ──────────────────────────────────────
const label = {
  fontFamily: 'var(--font-body, system-ui)', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--color-muted, #888)', display: 'block', marginBottom: 4,
}
const input = {
  fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
  padding: '7px 10px', borderRadius: 6,
  border: '1px solid var(--color-border, #e5e5e5)',
  background: '#fff', color: 'var(--color-ink, #2D2A26)', boxSizing: 'border-box',
}
const btn = {
  fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 500,
  padding: '9px 18px', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--color-border, #e5e5e5)', background: '#fff',
  color: 'var(--color-ink, #2D2A26)',
}
const btnPrimary = { ...btn, border: 'none', background: 'var(--color-ink, #2D2A26)', color: '#fff' }
const card = {
  background: 'var(--color-cream, #FAF8F5)',
  border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 8,
}
const bodyFont = { fontFamily: 'var(--font-body, system-ui)' }

function pct(a, b) {
  if (!b) return null
  return `${Math.round((a / b) * 100)}%`
}

// Mirror buildPressMergeContext (lib/outreach/pressTemplate.js) so the live
// preview matches what the send route renders.
function beatPhrase(beat) {
  const list = (Array.isArray(beat) ? beat : (beat ? String(beat).split(',') : []))
    .map((b) => String(b).trim()).filter(Boolean)
  if (list.length === 0) return 'independent Australia'
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}
function firstName(name) {
  const n = (name || '').trim()
  return n ? n.split(/\s+/)[0] : ''
}
function buildCtx(c, noteOverride) {
  return {
    greeting_name: firstName(c.journalist_name) || 'there',
    outlet_name: c.outlet_name || 'your newsroom',
    journalist_name: c.journalist_name || '',
    beat: beatPhrase(c.beat),
    region: c.region?.name || c.region_name || (c.state || 'Australia'),
    state: c.state || c.region?.state || '',
    personal_note: (noteOverride != null ? noteOverride : (c.personal_note || '')).trim(),
    for_press_url: `${SITE}/for-press`,
    example_url: `${SITE}/newsroom/example`,
  }
}
function applyMerge(str, ctx) {
  return (str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : '')).replace(/\n{3,}/g, '\n\n')
}

// Defensive fetch — never a raw "JSON.parse: unexpected character…" (504/502
// HTML, auth redirects). Same as the operator/council outreach UI.
async function fetchJson(url, options) {
  let res
  try {
    res = await fetch(url, options)
  } catch (err) {
    throw new Error(`Network error — ${err.message || 'request could not be sent'}. Check your connection and retry.`)
  }
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      if (res.status === 504 || res.status === 502 || res.status === 503) {
        throw new Error('The request timed out on the server. Try a smaller batch (fewer recipients at once) and retry.')
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('Your admin session has expired. Reload the page and sign in again.')
      }
      const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
      throw new Error(`Server returned a non-JSON response (HTTP ${res.status})${snippet ? `: ${snippet}` : ''}.`)
    }
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (HTTP ${res.status}).`)
  }
  return data || {}
}

function Chip({ children, color = '#888', filled, title }) {
  return (
    <span title={title} style={{
      fontFamily: 'var(--font-body, system-ui)', fontSize: 10, fontWeight: 600,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap',
      background: filled ? color : `${color}18`, color: filled ? '#fff' : color,
      cursor: title ? 'help' : 'default',
    }}>
      {children}
    </span>
  )
}

function StatCard({ n, label: text, sub }) {
  return (
    <div style={{ ...card, padding: '12px 16px', minWidth: 96 }}>
      <div style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 22, color: 'var(--color-ink, #2D2A26)' }}>{n}</div>
      <div style={{ ...bodyFont, fontSize: 11, color: 'var(--color-muted, #888)', marginTop: 2 }}>{text}</div>
      {sub && <div style={{ ...bodyFont, fontSize: 10, color: '#8a6520', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Funnel header (directory → have email → contacted → opened) ──
function FunnelHeader({ stats }) {
  const stages = [
    { n: stats.directory, label: 'in directory' },
    { n: stats.withEmail, label: 'have email', sub: pct(stats.withEmail, stats.directory) },
    { n: stats.contacted, label: 'contacted', sub: pct(stats.contacted, stats.withEmail) },
    { n: stats.opened, label: 'opened', sub: pct(stats.opened, stats.contacted) },
  ]
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {stages.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatCard n={Number(s.n || 0).toLocaleString()} label={s.label} sub={s.sub} />
            {i < stages.length - 1 && (
              <span style={{ ...bodyFont, color: 'var(--color-muted, #bbb)', fontSize: 16 }}>›</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {[
          ['journalists', stats.journalists], ['press desks', stats.desks], ['suppressed', stats.suppressed],
        ].filter(([, v]) => Number(v) > 0).map(([k, v]) => (
          <span key={k} style={{ ...bodyFont, fontSize: 11.5, color: 'var(--color-muted, #888)' }}>
            <strong style={{ color: 'var(--color-ink, #2D2A26)' }}>{Number(v).toLocaleString()}</strong> {k}
          </span>
        ))}
      </div>
    </div>
  )
}

function displayName(c) {
  return c.journalist_name ? c.journalist_name : c.outlet_name
}

// ── Compose & Send panel ──────────────────────────────────────
function ComposePanel({ statusColors, sendStatusColors, allStates }) {
  const [filters, setFilters] = useState({ kind: '', state: '', beat: '', q: '', status: '', limit: 200 })
  const [loading, setLoading] = useState(false)
  const [seg, setSeg] = useState(null) // { press, counts }
  const [selected, setSelected] = useState(() => new Set())
  const [discovering, setDiscovering] = useState(false)
  const [discoverProgress, setDiscoverProgress] = useState(null)
  const [discoverSummary, setDiscoverSummary] = useState(null)

  const [writing, setWriting] = useState(false)
  const [personaliseProgress, setPersonaliseProgress] = useState(null)

  const [templateChoice, setTemplateChoice] = useState('invite')
  const [subject, setSubject] = useState(PRESS_INVITE_TEMPLATE.subject)
  const [emailBody, setEmailBody] = useState(PRESS_INVITE_TEMPLATE.body)
  const [cap, setCap] = useState(15)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState(null)

  function loadTemplate(choice) {
    setTemplateChoice(choice)
    const t = PRESS_TEMPLATES[choice] || PRESS_INVITE_TEMPLATE
    setSubject(t.subject)
    setEmailBody(t.body)
  }

  async function loadSegment() {
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await fetchJson('/api/admin/press-outreach/segment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      })
      setSeg(data)
      setSelected(new Set((data.press || []).filter((c) => c.sendable).map((c) => c.id)))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectAllSendable = () => seg && setSelected(new Set(seg.press.filter((c) => c.sendable).map((c) => c.id)))
  const clearSelection = () => setSelected(new Set())

  function recomputeCounts(press) {
    const un = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])
    return {
      total: press.length,
      journalists: press.filter((c) => c.kind === 'journalist').length,
      desks: press.filter((c) => c.kind === 'desk').length,
      withWebsite: press.filter((c) => c.website).length,
      withEmail: press.filter((c) => c.contact_email).length,
      suppressed: press.filter((c) => c.suppressed).length,
      alreadySent: press.filter((c) => un.has(c.send_status)).length,
      sendable: press.filter((c) => c.sendable).length,
    }
  }

  const needDiscover = (list) => list.filter((c) => c.website && !c.contact_email && !c.website_status)

  async function discoverEmails() {
    if (!seg) return
    const needing = needDiscover(seg.press)
    if (needing.length === 0) return
    setDiscovering(true); setError(null); setDiscoverSummary(null)
    const chunkSize = 10
    let scanned = 0, found = 0
    const updated = new Map(seg.press.map((c) => [c.id, c]))
    const failures = []
    const tally = { found: 0, no_email: 0, dead: 0, blocked: 0 }
    try {
      for (let i = 0; i < needing.length; i += chunkSize) {
        const chunk = needing.slice(i, i + chunkSize)
        setDiscoverProgress({ scanned, total: needing.length, found })
        try {
          const data = await fetchJson('/api/admin/press-outreach/discover', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ press_ids: chunk.map((c) => c.id) }),
          })
          for (const r of data.results || []) {
            const c = updated.get(r.press_id)
            if (!c) continue
            if (r.email && r.status === 'found') {
              updated.set(r.press_id, { ...c, contact_email: r.email, email_source: 'website', website_status: 'has_email', sendable: !c.suppressed && !['sent', 'bounced', 'complained', 'unsubscribed'].includes(c.send_status) && c.funnel_status !== 'declined' })
              found++
            } else if (r.status && r.status !== 'pending' && r.status !== 'has_email') {
              updated.set(r.press_id, { ...c, website_status: r.status })
            }
          }
          if (data.statusCounts) for (const k of ['found', 'no_email', 'dead', 'blocked']) tally[k] += (data.statusCounts[k] || 0)
        } catch (err) { failures.push(err.message) }
        scanned += chunk.length
        setDiscoverProgress({ scanned, total: needing.length, found })
      }
      const press = seg.press.map((c) => updated.get(c.id))
      setSeg({ press, counts: recomputeCounts(press) })
      setSelected((prev) => {
        const next = new Set(prev)
        for (const c of press) if (c.sendable && c.contact_email) next.add(c.id)
        return next
      })
      const parts = [`${found} email${found === 1 ? '' : 's'} found`]
      if (tally.no_email) parts.push(`${tally.no_email} with no published email`)
      if (tally.dead) parts.push(`${tally.dead} site${tally.dead === 1 ? '' : 's'} offline`)
      if (tally.blocked) parts.push(`${tally.blocked} blocked the scan`)
      let msg = parts.join(' · ')
      if (failures.length) msg += ` · ${failures.length} batch${failures.length === 1 ? '' : 'es'} failed (${failures[0]})`
      setDiscoverSummary(msg)
    } catch (err) { setError(err.message) } finally { setDiscovering(false); setDiscoverProgress(null) }
  }

  async function personaliseSelected() {
    if (!seg) return
    const targets = seg.press.filter((c) => selected.has(c.id) && c.sendable && !c.personal_note)
    if (targets.length === 0) return
    setWriting(true); setError(null)
    const chunkSize = 12
    let done = 0, wrote = 0
    const byId = new Map(seg.press.map((c) => [c.id, c]))
    const failures = []
    try {
      for (let i = 0; i < targets.length; i += chunkSize) {
        const chunk = targets.slice(i, i + chunkSize)
        setPersonaliseProgress({ done, total: targets.length })
        try {
          const data = await fetchJson('/api/admin/press-outreach/personalise', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ press_ids: chunk.map((c) => c.id) }),
          })
          for (const r of data.results || []) {
            const c = byId.get(r.press_id)
            if (c && r.personal_note) { byId.set(r.press_id, { ...c, personal_note: r.personal_note }); wrote++ }
          }
        } catch (err) { failures.push(err.message) }
        done += chunk.length
        setPersonaliseProgress({ done, total: targets.length })
      }
      setSeg((prev) => prev && { ...prev, press: prev.press.map((c) => byId.get(c.id)) })
      if (failures.length) {
        setError(`Wrote ${wrote} opener${wrote === 1 ? '' : 's'}, but ${failures.length} batch${failures.length === 1 ? '' : 'es'} failed — ${failures[0]}`)
      }
    } catch (err) { setError(err.message) } finally { setWriting(false); setPersonaliseProgress(null) }
  }

  function updateNote(id, note) {
    setSeg((prev) => prev && { ...prev, press: prev.press.map((c) => c.id === id ? { ...c, personal_note: note } : c) })
  }

  const eligibleSelected = useMemo(() => {
    if (!seg) return []
    return seg.press.filter((c) => selected.has(c.id) && c.sendable && c.contact_email)
  }, [seg, selected])

  const notedCount = useMemo(() => eligibleSelected.filter((c) => c.personal_note).length, [eligibleSelected])
  const [previewId, setPreviewId] = useState(null)
  const previewRow = (previewId && (seg?.press || []).find((c) => c.id === previewId)) || eligibleSelected[0] || (seg?.press || [])[0] || null
  const previewCtx = previewRow ? buildCtx(previewRow) : null

  async function runSend({ dryRun = false, testMode = false } = {}) {
    setBusy(true); setError(null); setResult(null); setConfirmOpen(false)
    try {
      const data = await fetchJson('/api/admin/press-outreach/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          press_ids: eligibleSelected.map((c) => c.id),
          subject, body: emailBody, dryRun, testMode, cap: Number(cap),
          personal_notes: Object.fromEntries(eligibleSelected.filter((c) => c.personal_note).map((c) => [c.id, c.personal_note])),
        }),
      })
      setResult(data)
      if (!dryRun && !testMode) {
        setSeg((prev) => prev && {
          ...prev,
          press: prev.press.map((c) => eligibleSelected.find((e) => e.id === c.id) ? { ...c, send_status: 'sent', sendable: false, funnel_status: 'contacted' } : c),
          counts: prev.counts,
        })
        setSelected(new Set())
      }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const discoverCount = seg ? needDiscover(seg.press).length : 0
  const personaliseCount = seg ? seg.press.filter((c) => selected.has(c.id) && c.sendable && !c.personal_note).length : 0

  return (
    <div>
      {/* Segment builder */}
      <div style={{ ...card, padding: '16px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={label}>Type</label>
            <select style={input} value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
              <option value="">All</option>
              <option value="journalist">Journalists</option>
              <option value="desk">Press desks</option>
            </select>
          </div>
          <div>
            <label style={label}>State</label>
            <select style={input} value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}>
              <option value="">All</option>
              {allStates.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Beat</label>
            <input style={{ ...input, width: 110 }} value={filters.beat} onChange={(e) => setFilters({ ...filters, beat: e.target.value })} placeholder="e.g. travel" />
          </div>
          <div>
            <label style={label}>Name / outlet contains</label>
            <input style={{ ...input, width: 160 }} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="e.g. Herald" />
          </div>
          <div>
            <label style={label}>Funnel status</label>
            <select style={input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="not_contacted">Not contacted</option>
              <option value="contacted">Contacted</option>
              <option value="responded">Responded</option>
              <option value="featured">Featured</option>
              <option value="declined">Declined</option>
            </select>
          </div>
          <div>
            <label style={label}>Max</label>
            <select style={input} value={filters.limit} onChange={(e) => setFilters({ ...filters, limit: Number(e.target.value) })}>
              {[100, 200, 300, 500].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button style={btnPrimary} onClick={loadSegment} disabled={loading}>
            {loading ? 'Loading…' : 'Load segment'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontFamily: 'var(--font-body, system-ui)', fontSize: 13, color: '#991B1B' }}>
          {error}
        </div>
      )}

      {seg && (
        <>
          {/* Counts + discover */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <StatCard n={seg.counts.total} label="in segment" />
            <StatCard n={seg.counts.withEmail} label="have email" />
            <StatCard n={seg.counts.sendable} label="sendable" />
            {seg.counts.suppressed > 0 && <StatCard n={seg.counts.suppressed} label="suppressed" />}
            {seg.counts.alreadySent > 0 && <StatCard n={seg.counts.alreadySent} label="already sent" />}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {discoverProgress && (
                <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: 'var(--color-muted, #888)' }}>
                  Scanning {discoverProgress.scanned}/{discoverProgress.total} · {discoverProgress.found} found
                </span>
              )}
              {personaliseProgress && (
                <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: 'var(--color-muted, #888)' }}>
                  Writing {personaliseProgress.done}/{personaliseProgress.total}…
                </span>
              )}
              <button style={btn} onClick={discoverEmails} disabled={discovering || discoverCount === 0} title="Scan outlet/staff pages we haven't checked yet for a contact email">
                {discovering ? 'Discovering…' : `Discover emails (${discoverCount})`}
              </button>
              <button style={btn} onClick={personaliseSelected} disabled={writing || personaliseCount === 0} title="AI-write a grounded opener for each selected contact that doesn't have one">
                {writing ? 'Writing…' : `Personalise (${personaliseCount})`}
              </button>
            </div>
          </div>

          {discoverSummary && (
            <div style={{ background: '#F0F7F4', border: '1px solid #cfe6dc', padding: '9px 14px', borderRadius: 6, marginBottom: 14, fontFamily: 'var(--font-body, system-ui)', fontSize: 12.5, color: '#3a5c4f' }}>
              {discoverSummary}
            </div>
          )}

          {/* Recipient table */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <button style={{ ...btn, padding: '5px 12px', fontSize: 12 }} onClick={selectAllSendable}>Select all sendable</button>
            <button style={{ ...btn, padding: '5px 12px', fontSize: 12 }} onClick={clearSelection}>Clear</button>
            <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: 'var(--color-muted, #888)', marginLeft: 4 }}>
              {selected.size} selected · {eligibleSelected.length} will send
            </span>
          </div>

          <div style={{ ...card, background: '#fff', maxHeight: 340, overflowY: 'auto', marginBottom: 22 }}>
            {seg.press.map((c) => {
              const isSel = selected.has(c.id)
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                  borderBottom: '1px solid var(--color-border, #eee)',
                  opacity: c.sendable ? 1 : 0.55,
                }}>
                  <input type="checkbox" checked={isSel} disabled={!c.sendable} onChange={() => toggle(c.id)} style={{ cursor: c.sendable ? 'pointer' : 'not-allowed' }} />
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setPreviewId(c.id)} title="Preview this recipient">
                    <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 500, color: previewRow && previewRow.id === c.id ? '#8a6520' : 'var(--color-ink, #2D2A26)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName(c)}
                      <Chip color={c.kind === 'desk' ? '#7a6f5f' : '#8a6520'}>{c.kind}</Chip>
                    </div>
                    <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: 'var(--color-muted, #888)' }}>
                      {[c.journalist_name ? c.outlet_name : c.role_title, (c.beat || []).join(' / '), c.state].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {(() => {
                    let text, color
                    if (c.contact_email) { text = c.contact_email; color = '#5F8A7E' }
                    else if (!c.website) { text = 'no website'; color = 'var(--color-muted, #999)' }
                    else if (c.website_status === 'dead') { text = 'site offline'; color = '#c0392b' }
                    else if (c.website_status === 'blocked') { text = 'scan blocked'; color = 'var(--color-muted, #999)' }
                    else if (c.website_status === 'no_email') { text = 'no email on site'; color = 'var(--color-muted, #999)' }
                    else { text = 'no email — discover'; color = '#c9a227' }
                    return (
                      <div title={c.website || ''} style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color, width: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {text}
                      </div>
                    )
                  })()}
                  {c.personal_note && <Chip color="#8a6520" title={c.personal_note}>✎ note</Chip>}
                  {c.opened_at && <Chip color="#5F8A7E" title="Opened a prior email">opened</Chip>}
                  {c.funnel_status && c.funnel_status !== 'not_contacted' && <Chip color={statusColors[c.funnel_status] || '#888'}>{c.funnel_status.replace(/_/g, ' ')}</Chip>}
                  {c.suppressed && <Chip color="#c0392b">suppressed</Chip>}
                  {c.send_status && <Chip color={sendStatusColors[c.send_status] || '#888'}>{c.send_status}</Chip>}
                </div>
              )
            })}
          </div>

          {/* Template editor + preview */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label style={label}>Template</label>
              <select style={{ ...input, width: '100%', marginBottom: 12 }} value={templateChoice} onChange={(e) => loadTemplate(e.target.value)}>
                {PRESS_TEMPLATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <label style={label}>Subject</label>
              <input style={{ ...input, width: '100%', marginBottom: 12 }} value={subject} onChange={(e) => setSubject(e.target.value)} />
              <label style={label}>Body</label>
              <textarea style={{ ...input, width: '100%', lineHeight: 1.6, resize: 'vertical' }} rows={16} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {MERGE_TOKENS.map(([tok, desc]) => (
                  <button key={tok} title={desc} onClick={() => setEmailBody((b) => b + ' ' + tok)}
                    style={{ ...btn, padding: '3px 8px', fontSize: 11, fontFamily: 'monospace', color: '#8a6520' }}>
                    {tok}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={label}>Preview {previewRow ? `· ${displayName(previewRow)}` : ''}</label>
              <div style={{ ...card, background: '#fff', padding: 16, minHeight: 200 }}>
                {previewCtx ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink, #2D2A26)', marginBottom: 4, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
                      {applyMerge(subject, previewCtx)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 13, color: '#3a352e', whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: 8 }}>
                      {applyMerge(emailBody, previewCtx)}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #eee', fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: '#8a8378', lineHeight: 1.6 }}>
                      Australian Atlas — a curated guide to independent Australian places.<br />
                      You received this because you cover {previewCtx.beat} — we reach out to independent Australian journalists and newsdesks with the Atlas as a story source.<br />
                      <span style={{ textDecoration: 'underline' }}>Unsubscribe</span> · australianatlas.com.au
                    </div>
                  </>
                ) : (
                  <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 13, color: 'var(--color-muted, #888)' }}>Select a recipient to preview.</span>
                )}
              </div>

              {previewRow && (
                <div style={{ marginTop: 12 }}>
                  <label style={label}>
                    Personal opener {emailBody.includes('{{personal_note}}') ? '' : '(add {{personal_note}} to the body to use it)'}
                  </label>
                  <textarea
                    value={previewRow.personal_note || ''}
                    onChange={(e) => updateNote(previewRow.id, e.target.value)}
                    rows={2}
                    placeholder="Click Personalise to AI-write one, or type your own…"
                    style={{ ...input, width: '100%', lineHeight: 1.5, resize: 'vertical', fontStyle: previewRow.personal_note ? 'normal' : 'italic' }}
                  />
                  <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: 'var(--color-muted, #999)', marginTop: 4 }}>
                    {notedCount} of {eligibleSelected.length} selected have a personal opener. Edits are saved when you send.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Send controls */}
          <div style={{ ...card, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <label style={label}>Send cap</label>
              <input type="number" min={1} max={200} value={cap} onChange={(e) => setCap(e.target.value)} style={{ ...input, width: 80 }} />
            </div>
            <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: 'var(--color-muted, #888)', maxWidth: 280, lineHeight: 1.5 }}>
              Sends to the lesser of your selection and the cap. Emails include a working unsubscribe, go out from matt@australianatlas.com.au, and reply to editor@.
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button style={btn} onClick={() => runSend({ testMode: true })} disabled={busy || eligibleSelected.length === 0}>Send test to me</button>
              <button style={btn} onClick={() => runSend({ dryRun: true })} disabled={busy || eligibleSelected.length === 0}>Dry run</button>
              <button style={btnPrimary} onClick={() => setConfirmOpen(true)} disabled={busy || eligibleSelected.length === 0}>
                Send batch ({Math.min(eligibleSelected.length, Number(cap) || 0)})
              </button>
            </div>
          </div>

          {result && (
            <div style={{ ...card, background: result.ok === false ? '#FEF2F2' : '#F0F7F4', border: `1px solid ${result.ok === false ? '#FECACA' : '#cfe6dc'}`, padding: '14px 18px', marginTop: 16, fontFamily: 'var(--font-body, system-ui)', fontSize: 13, color: 'var(--color-ink, #2D2A26)' }}>
              {result.dryRun && <div><strong>Dry run:</strong> {result.wouldSend} would send (of {result.eligible} eligible, cap {result.cap}){typeof result.withPersonalNote === 'number' ? `, ${result.withPersonalNote} with a personal opener` : ''}. Skips: {Object.entries(result.skips).filter(([, v]) => v > 0).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ') || 'none'}.</div>}
              {result.testMode && <div><strong>Test sent:</strong> {result.sentToAdmin} sample email(s) to {result.testEmail}. {result.errors?.length ? `Errors: ${result.errors.join('; ')}` : 'Check your inbox.'}</div>}
              {result.campaignId && <div><strong>Batch sent.</strong> {result.sent} delivered, {result.failed} failed (campaign {result.campaignId}).{result.errors?.length ? ` Errors: ${result.errors.join('; ')}` : ''}</div>}
            </div>
          )}
        </>
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 460, width: '100%' }}>
            <h3 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 20, fontWeight: 400, margin: '0 0 8px', color: 'var(--color-ink, #2D2A26)' }}>Send this batch?</h3>
            <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 14, color: '#5a544c', lineHeight: 1.5, margin: '0 0 20px' }}>
              About to send <strong>{Math.min(eligibleSelected.length, Number(cap) || 0)}</strong> real emails to press contacts from matt@australianatlas.com.au. Recipients who have been contacted, suppressed, or unsubscribed are automatically excluded. This can&apos;t be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btn} onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button style={btnPrimary} onClick={() => runSend()} disabled={busy}>{busy ? 'Sending…' : 'Send now'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Directory panel (add + import) ────────────────────────────
function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { header: [], rows: [] }
  const delim = lines[0].includes('\t') ? '\t' : ','
  const parseLine = (line) => {
    const out = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === delim) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }
  const header = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'))
  const rows = lines.slice(1).map((line) => {
    const vals = parseLine(line)
    const row = {}
    header.forEach((h, i) => { row[h] = vals[i] || '' })
    return row
  })
  return { header, rows }
}

function DirectoryPanel({ regions, allStates }) {
  const [form, setForm] = useState({ kind: 'journalist', outlet_name: '', journalist_name: '', role_title: '', beat: '', state: '', website: '', contact_email: '', twitter: '', region_slug: '' })
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState(null)
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  const regionOptions = useMemo(() => regions.map((r) => ({ value: r.slug, label: `${r.name} (${r.state})` })), [regions])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function addPress() {
    if (!form.outlet_name.trim()) { setAddMsg({ err: true, text: 'Outlet name is required.' }); return }
    setAdding(true); setAddMsg(null)
    try {
      await fetchJson('/api/admin/press-outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setAddMsg({ err: false, text: `${form.journalist_name || form.outlet_name} added. Load a segment in Compose & Send to reach them.` })
      setForm({ kind: 'journalist', outlet_name: '', journalist_name: '', role_title: '', beat: '', state: '', website: '', contact_email: '', twitter: '', region_slug: '' })
    } catch (err) { setAddMsg({ err: true, text: err.message }) } finally { setAdding(false) }
  }

  async function runImport() {
    const { header, rows } = parseCsv(csvText)
    if (!header.includes('outlet_name')) {
      setImportMsg({ err: true, text: 'Need a header row with at least outlet_name — e.g. outlet_name,journalist_name,role_title,beat,state,website,contact_email,region_slug,kind' })
      return
    }
    if (rows.length === 0) { setImportMsg({ err: true, text: 'No data rows found.' }); return }
    setImporting(true); setImportMsg(null)
    try {
      const data = await fetchJson('/api/admin/press-outreach/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const bits = [`${data.inserted} added`]
      if (data.skippedDuplicate) bits.push(`${data.skippedDuplicate} already in the directory`)
      if (data.skippedInvalid) bits.push(`${data.skippedInvalid} missing an outlet`)
      if (data.unmatchedRegion) bits.push(`${data.unmatchedRegion} without a matched region`)
      setImportMsg({ err: false, text: bits.join(' · ') })
      if (data.inserted > 0) setCsvText('')
    } catch (err) { setImportMsg({ err: true, text: err.message }) } finally { setImporting(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Add one */}
      <div style={{ ...card, padding: 18 }}>
        <h3 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 17, fontWeight: 400, margin: '0 0 14px', color: 'var(--color-ink, #2D2A26)' }}>Add a contact</h3>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 130 }}>
            <label style={label}>Type</label>
            <select style={{ ...input, width: '100%' }} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="journalist">Journalist</option>
              <option value="desk">Press desk</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Outlet / masthead *</label>
            <input style={{ ...input, width: '100%' }} value={form.outlet_name} onChange={(e) => set('outlet_name', e.target.value)} placeholder="e.g. The Sydney Morning Herald" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Journalist name {form.kind === 'desk' ? '(optional)' : ''}</label>
            <input style={{ ...input, width: '100%' }} value={form.journalist_name} onChange={(e) => set('journalist_name', e.target.value)} placeholder="e.g. Jane Smith" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Role / title</label>
            <input style={{ ...input, width: '100%' }} value={form.role_title} onChange={(e) => set('role_title', e.target.value)} placeholder="e.g. Travel Editor / Newsdesk" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Beat (comma-separated)</label>
            <input style={{ ...input, width: '100%' }} value={form.beat} onChange={(e) => set('beat', e.target.value)} placeholder="travel, food, regional" />
          </div>
          <div style={{ width: 90 }}>
            <label style={label}>State</label>
            <select style={{ ...input, width: '100%' }} value={form.state} onChange={(e) => set('state', e.target.value)}>
              <option value="">—</option>
              {allStates.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <label style={label}>Atlas region (optional — for regional rounds)</label>
        <select style={{ ...input, width: '100%', marginBottom: 10 }} value={form.region_slug} onChange={(e) => set('region_slug', e.target.value)}>
          <option value="">— none —</option>
          {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label style={label}>Outlet / staff-page website</label>
        <input style={{ ...input, width: '100%', marginBottom: 10 }} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://www.smh.com.au/contact-us" />
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Contact email (optional — Discover can find one)</label>
            <input style={{ ...input, width: '100%' }} value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} placeholder="newsdesk@…" />
          </div>
          <div style={{ width: 130 }}>
            <label style={label}>Social (optional)</label>
            <input style={{ ...input, width: '100%' }} value={form.twitter} onChange={(e) => set('twitter', e.target.value)} placeholder="@handle" />
          </div>
        </div>
        <button style={btnPrimary} onClick={addPress} disabled={adding}>{adding ? 'Adding…' : 'Add contact'}</button>
        {addMsg && (
          <div style={{ marginTop: 12, fontFamily: 'var(--font-body, system-ui)', fontSize: 12.5, color: addMsg.err ? '#991B1B' : '#3a5c4f' }}>
            {addMsg.text}
          </div>
        )}
      </div>

      {/* Bulk import */}
      <div style={{ ...card, padding: 18 }}>
        <h3 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 17, fontWeight: 400, margin: '0 0 8px', color: 'var(--color-ink, #2D2A26)' }}>Bulk import (CSV)</h3>
        <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: 'var(--color-muted, #888)', margin: '0 0 10px', lineHeight: 1.5 }}>
          Paste CSV (or tab-separated) with a header row. Columns: <code>outlet_name</code> (required), <code>journalist_name</code>, <code>role_title</code>, <code>beat</code>, <code>state</code>, <code>website</code>, <code>contact_email</code>, <code>twitter</code>, <code>region_slug</code>, <code>kind</code>. Duplicates already in the directory are skipped.
        </p>
        <textarea
          style={{ ...input, width: '100%', lineHeight: 1.5, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
          rows={12}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={'outlet_name,journalist_name,role_title,beat,state,website,contact_email,kind\nThe Sydney Morning Herald,,Newsdesk,news,NSW,https://www.smh.com.au,newsdesk@smh.com.au,desk'}
        />
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={btnPrimary} onClick={runImport} disabled={importing || !csvText.trim()}>{importing ? 'Importing…' : 'Import'}</button>
          {importMsg && (
            <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12.5, color: importMsg.err ? '#991B1B' : '#3a5c4f' }}>
              {importMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sent log ──────────────────────────────────────────────────
function LogRow({ row, statusColors, sendStatusColors }) {
  const [statusVal, setStatusVal] = useState(row.status)
  const [saving, setSaving] = useState(false)

  async function updateStatus(newStatus) {
    const prev = statusVal
    setSaving(true); setStatusVal(newStatus)
    try {
      await fetchJson('/api/admin/press-outreach', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status: newStatus }),
      })
    } catch { setStatusVal(prev) }
    setSaving(false)
  }

  const sColor = statusColors[statusVal] || '#888'
  return (
    <div style={{ background: '#fff', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 8, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 14, fontWeight: 500, color: 'var(--color-ink, #2D2A26)' }}>
          {row.journalist_name || row.outlet_name}
          <Chip color={row.kind === 'desk' ? '#7a6f5f' : '#8a6520'}>{row.kind}</Chip>
        </div>
        <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: 'var(--color-muted, #888)', marginTop: 2 }}>
          {[row.journalist_name ? row.outlet_name : row.role_title, (row.beat || []).join(' / '), row.state].filter(Boolean).join(' · ') || '—'}
          {row.contact_email && ` · ${row.contact_email}`}
          {row.sent_at && ` · sent ${new Date(row.sent_at).toLocaleDateString()}`}
          {row.opened_at && ' · opened'}
          {row.campaign_id && ` · ${row.campaign_id}`}
        </div>
        {row.send_error && <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: '#c0392b', marginTop: 2 }}>{row.send_error}</div>}
      </div>
      {row.send_status && <Chip color={sendStatusColors[row.send_status] || '#888'} filled>{row.send_status}</Chip>}
      <select value={statusVal} onChange={(e) => updateStatus(e.target.value)} disabled={saving} style={{ ...input, fontSize: 11, padding: '4px 8px' }}>
        <option value="not_contacted">Not contacted</option>
        <option value="contacted">Contacted</option>
        <option value="responded">Responded</option>
        <option value="featured">Featured</option>
        <option value="declined">Declined</option>
      </select>
      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: sColor }} />
    </div>
  )
}

// ── Campaigns ─────────────────────────────────────────────────
function CampaignsPanel({ campaigns }) {
  if (!campaigns.length) {
    return <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: 'var(--font-body, system-ui)', fontSize: 14, color: 'var(--color-muted, #888)' }}>No press campaigns sent yet.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {campaigns.map((c) => (
        <div key={c.id} style={{ background: '#fff', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 14, fontWeight: 500, color: 'var(--color-ink, #2D2A26)' }}>{c.name || c.subject || c.id}</div>
              <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: 'var(--color-muted, #888)', marginTop: 2 }}>
                {c.id} · {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
              </div>
            </div>
            {c.kind && c.kind !== 'manual' && <Chip color="#7a6f5f">{c.kind}</Chip>}
            <Chip color="#5F8A7E">{c.sent} sent</Chip>
            {c.failed > 0 && <Chip color="#c0392b">{c.failed} failed</Chip>}
            {c.skipped > 0 && <Chip color="#888">{c.skipped} skipped</Chip>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Autopilot panel ───────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 100, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? '#5F8A7E' : '#d5d0c8', position: 'relative', transition: 'background 0.15s',
        opacity: disabled ? 0.5 : 1, padding: 0, flexShrink: 0,
      }}
      aria-pressed={checked}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18,
        borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

function SettingRow({ title, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--color-border, #eee)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...bodyFont, fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink, #2D2A26)' }}>{title}</div>
        <div style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)', marginTop: 2, lineHeight: 1.5, maxWidth: 460 }}>{desc}</div>
      </div>
      {children}
    </div>
  )
}

function AutopilotPanel() {
  const [data, setData] = useState(null)      // { settings, status }
  const [form, setForm] = useState(null)      // editable copy of settings
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await fetchJson('/api/admin/press-outreach/settings')
      setData(d)
      setForm(d.settings)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError(null)
    try {
      const d = await fetchJson('/api/admin/press-outreach/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setForm(d.settings)
      setData((prev) => prev && { ...prev, settings: d.settings })
      setSavedAt(Date.now())
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  if (loading) return <div style={{ ...bodyFont, padding: '48px 0', textAlign: 'center', color: 'var(--color-muted, #888)', fontSize: 14 }}>Loading autopilot…</div>
  if (error && !form) {
    return (
      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '12px 16px', borderRadius: 8, ...bodyFont, fontSize: 13, color: '#991B1B' }}>
        {error} {String(error).includes('relation') || String(error).includes('press_outreach') ? '— run migration 253 first.' : ''}
        <button style={{ ...btn, marginLeft: 12, padding: '4px 12px', fontSize: 12 }} onClick={load}>Retry</button>
      </div>
    )
  }

  const st = data?.status || {}
  const dirty = JSON.stringify(form) !== JSON.stringify(data?.settings)
  const num = (field, min, max, step = 1) => (
    <input
      type="number" min={min} max={max} step={step} value={form[field]}
      onChange={(e) => setForm({ ...form, [field]: Number(e.target.value) })}
      style={{ ...input, width: 84 }}
    />
  )

  return (
    <div>
      {/* Live status */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard n={`${st.sent_today ?? 0} / ${form.daily_send_cap}`} label="pitched in last 24h" />
        <StatCard n={`${st.followups_today ?? 0} / ${form.followup_daily_cap}`} label="follow-ups in last 24h" />
        <StatCard n={(st.sendable_pool ?? 0).toLocaleString()} label="ready to pitch" />
        <StatCard n={(st.need_note_pool ?? 0).toLocaleString()} label="awaiting AI opener" />
        <StatCard n={(st.need_discover_pool ?? 0).toLocaleString()} label="need discovery" />
        <StatCard n={(st.followup_due ?? 0).toLocaleString()} label="follow-ups due" />
      </div>
      {st.last_run && (
        <div style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)', marginBottom: 18 }}>
          Last run {new Date(st.last_run.started_at).toLocaleString()} — {st.last_run.status}
          {st.last_run.summary?.send?.sent != null ? ` · ${st.last_run.summary.send.sent} pitched` : ''}
          {st.last_run.summary?.discover?.found != null ? ` · ${st.last_run.summary.discover.found} emails found` : ''}
        </div>
      )}

      {form.enabled && !form.send_enabled && (
        <div style={{ background: '#FDF6E9', border: '1px solid #e8d3a0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, ...bodyFont, fontSize: 12.5, color: '#8a6520', lineHeight: 1.5 }}>
          Sending is currently <strong>off</strong>. The pipeline still discovers emails and writes openers, so a warm, ready segment is waiting whenever you turn it on — or send by hand from Compose &amp; Send.
        </div>
      )}

      <div style={{ ...card, background: '#fff', padding: '6px 18px 2px', marginBottom: 16 }}>
        <SettingRow
          title="Background pipeline"
          desc="Every weekday morning (09:45 Melbourne): scan the next unchecked outlet and staff pages for a contact email, and AI-write personal openers. No email is sent by this switch alone. All outreach email holds outside 9am–5pm Melbourne time."
        >
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
        </SettingRow>
        <SettingRow
          title="Send first-touch pitches"
          desc="Let the autopilot send the daily newsroom-invite batch (weekdays only). Every email carries one-click unsubscribe and all suppression rules apply."
        >
          <Toggle checked={form.send_enabled} onChange={(v) => setForm({ ...form, send_enabled: v })} disabled={!form.enabled} />
        </SettingRow>
        <SettingRow title="Daily send cap" desc="First-touch pitches per 24 hours. Keep this small — you court press, you do not blast them.">
          {num('daily_send_cap', 0, 60)}
        </SettingRow>
        <SettingRow
          title="Follow-up"
          desc="One (and only one) second touch if there's been no reply, response or decline. Sent from the same thread-friendly template that closes the loop."
        >
          <Toggle checked={form.followup_enabled} onChange={(v) => setForm({ ...form, followup_enabled: v })} disabled={!form.enabled || !form.send_enabled} />
        </SettingRow>
        <SettingRow title="Follow-up after (days)" desc="How long to wait after the first pitch.">
          {num('followup_after_days', 2, 60)}
        </SettingRow>
        <SettingRow title="Follow-up daily cap" desc="Follow-ups per 24 hours.">
          {num('followup_daily_cap', 0, 60)}
        </SettingRow>
        <SettingRow title="Outlets scanned per run" desc="Email discovery throughput. Scanning is free — this just bounds the run time.">
          {num('discover_per_run', 0, 200, 10)}
        </SettingRow>
        <SettingRow title="AI openers per run" desc="Personal openers written per run.">
          {num('personalise_per_run', 0, 60, 5)}
        </SettingRow>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 14px', borderRadius: 6, marginBottom: 12, ...bodyFont, fontSize: 13, color: '#991B1B' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button style={dirty ? btnPrimary : btn} onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save autopilot settings'}
        </button>
        {savedAt && !dirty && <span style={{ ...bodyFont, fontSize: 12, color: '#5F8A7E' }}>Saved.</span>}
        <span style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)', marginLeft: 'auto', maxWidth: 400, lineHeight: 1.5 }}>
          The autopilot never emails suppressed, bounced, declined or already-contacted press, and holds all sending on weekends.
        </span>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────
export default function PressOutreachActions({
  logRows, campaigns, regions, statusColors, sendStatusColors, allStates, stats,
}) {
  const [tab, setTab] = useState('compose')

  const tabStyle = (active) => ({
    fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 500,
    padding: '10px 20px', borderRadius: '6px 6px 0 0',
    border: '1px solid var(--color-border, #e5e5e5)',
    borderBottom: active ? '1px solid #fff' : '1px solid var(--color-border, #e5e5e5)',
    background: active ? '#fff' : 'var(--color-cream, #FAF8F5)',
    color: active ? 'var(--color-ink, #2D2A26)' : 'var(--color-muted, #888)',
    cursor: 'pointer', marginBottom: -1, position: 'relative', zIndex: active ? 1 : 0,
  })

  return (
    <div>
      {/* Funnel header */}
      <FunnelHeader stats={stats} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border, #e5e5e5)', marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('compose')} style={tabStyle(tab === 'compose')}>Compose &amp; Send</button>
        <button onClick={() => setTab('autopilot')} style={tabStyle(tab === 'autopilot')}>Autopilot</button>
        <button onClick={() => setTab('directory')} style={tabStyle(tab === 'directory')}>Directory</button>
        <button onClick={() => setTab('log')} style={tabStyle(tab === 'log')}>Sent Log ({logRows.length})</button>
        <button onClick={() => setTab('campaigns')} style={tabStyle(tab === 'campaigns')}>Campaigns ({campaigns.length})</button>
      </div>

      {tab === 'compose' && (
        <ComposePanel
          statusColors={statusColors}
          sendStatusColors={sendStatusColors}
          allStates={allStates}
        />
      )}

      {tab === 'autopilot' && <AutopilotPanel />}

      {tab === 'directory' && <DirectoryPanel regions={regions} allStates={allStates} />}

      {tab === 'log' && (
        logRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: 'var(--font-body, system-ui)', fontSize: 14, color: 'var(--color-muted, #888)' }}>No press outreach yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {logRows.map((row) => (
              <LogRow key={row.id} row={row} statusColors={statusColors} sendStatusColors={sendStatusColors} />
            ))}
          </div>
        )
      )}

      {tab === 'campaigns' && <CampaignsPanel campaigns={campaigns} />}
    </div>
  )
}
