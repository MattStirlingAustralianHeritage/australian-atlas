'use client'

import { useState, useMemo } from 'react'
import { TRADE_TEMPLATE_OPTIONS, TRADE_TEMPLATES, TRADE_BETA_TEMPLATE } from '@/lib/outreach/tradeTemplates'

const SITE = 'https://australianatlas.com.au'

const MERGE_TOKENS = [
  ['{{company_name}}', 'Company name'],
  ['{{region}}', 'Focus region (or Australia)'],
  ['{{state}}', 'State'],
  ['{{listing_count}}', 'Places mapped in focus region'],
  ['{{network_count}}', 'Places mapped network-wide'],
  ['{{personal_note}}', 'AI personal opener'],
  ['{{for_trade_url}}', '/for-trade URL'],
  ['{{apply_url}}', 'Trade signup URL'],
  ['{{region_url}}', 'Public region page URL'],
]

const ORG_TYPES = [
  { value: 'tour_operator', label: 'Tour operator' },
  { value: 'inbound_operator', label: 'Inbound operator (ITO)' },
  { value: 'dmc', label: 'DMC / incentive house' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'travel_agent', label: 'Travel agent' },
  { value: 'trip_designer', label: 'Trip designer' },
  { value: 'other', label: 'Other' },
]
const ORG_TYPE_LABELS = Object.fromEntries(ORG_TYPES.map((o) => [o.value, o.label]))

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

// Mirrors buildTradeMergeContext (lib/outreach/tradeTemplate.js) so the live
// preview matches what the send route renders.
function countPhrase(count, fallback = 'thousands of') {
  if (count == null) return fallback
  if (count >= 1000) return `over ${(Math.floor(count / 100) * 100).toLocaleString()}`
  if (count >= 50) return `over ${Math.floor(count / 10) * 10}`
  return String(count)
}
function buildCtx(c, networkCount, noteOverride) {
  const regionCount = c.region?.listing_count
  return {
    company_name: c.company_name || 'your team',
    region: c.region?.name || c.region_name || 'Australia',
    state: c.state || c.region?.state || '',
    listing_count: regionCount != null ? countPhrase(regionCount) : countPhrase(networkCount),
    network_count: countPhrase(networkCount),
    personal_note: (noteOverride != null ? noteOverride : (c.personal_note || '')).trim(),
    for_trade_url: `${SITE}/for-trade`,
    apply_url: `${SITE}/for-trade/apply`,
    region_url: c.region?.slug ? `${SITE}/regions/${c.region.slug}` : `${SITE}/regions`,
  }
}
function applyMerge(str, ctx) {
  return (str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : '')).replace(/\n{3,}/g, '\n\n')
}

// Fetch that never throws a raw "JSON.parse: unexpected character…" — same
// defensive parse as the operator/council outreach UIs (504/502 HTML, auth
// redirects).
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

function StatCard({ n, label: text }) {
  return (
    <div style={{ ...card, padding: '12px 16px', minWidth: 96 }}>
      <div style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 22, color: 'var(--color-ink, #2D2A26)' }}>{n}</div>
      <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: 'var(--color-muted, #888)', marginTop: 2 }}>{text}</div>
    </div>
  )
}

// ── Compose & Send panel ──────────────────────────────────────
function ComposePanel({ statusColors, sendStatusColors, allStates, networkCount }) {
  const [filters, setFilters] = useState({ state: '', org_type: '', q: '', status: '', limit: 200 })
  const [loading, setLoading] = useState(false)
  const [seg, setSeg] = useState(null) // { companies, counts }
  const [selected, setSelected] = useState(() => new Set())
  const [discovering, setDiscovering] = useState(false)
  const [discoverProgress, setDiscoverProgress] = useState(null)
  const [discoverSummary, setDiscoverSummary] = useState(null)

  const [writing, setWriting] = useState(false) // personalise in-flight
  const [personaliseProgress, setPersonaliseProgress] = useState(null)

  const [templateChoice, setTemplateChoice] = useState('beta')
  const [subject, setSubject] = useState(TRADE_BETA_TEMPLATE.subject)
  const [emailBody, setEmailBody] = useState(TRADE_BETA_TEMPLATE.body)
  const [cap, setCap] = useState(30)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState(null)

  function loadTemplate(choice) {
    setTemplateChoice(choice)
    const t = TRADE_TEMPLATES[choice] || TRADE_BETA_TEMPLATE
    setSubject(t.subject)
    setEmailBody(t.body)
  }

  async function loadSegment() {
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await fetchJson('/api/admin/trade-outreach/segment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      })
      setSeg(data)
      setSelected(new Set((data.companies || []).filter((c) => c.sendable).map((c) => c.id)))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectAllSendable = () => seg && setSelected(new Set(seg.companies.filter((c) => c.sendable).map((c) => c.id)))
  const clearSelection = () => setSelected(new Set())

  function recomputeCounts(companies) {
    const un = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])
    return {
      total: companies.length,
      withWebsite: companies.filter((c) => c.website).length,
      withEmail: companies.filter((c) => c.contact_email).length,
      suppressed: companies.filter((c) => c.suppressed).length,
      alreadySent: companies.filter((c) => un.has(c.send_status)).length,
      sendable: companies.filter((c) => c.sendable).length,
    }
  }

  // Discover emails for companies that have a website, no email yet, and no
  // recorded check outcome — repeat runs target fresh sites only.
  async function discoverEmails() {
    if (!seg) return
    const needing = seg.companies.filter((c) => c.website && !c.contact_email && !c.website_status)
    if (needing.length === 0) return
    setDiscovering(true); setError(null); setDiscoverSummary(null)
    const chunkSize = 10
    let scanned = 0, found = 0
    const updated = new Map(seg.companies.map((c) => [c.id, c]))
    const failures = []
    const tally = { found: 0, no_email: 0, dead: 0, blocked: 0 }
    try {
      for (let i = 0; i < needing.length; i += chunkSize) {
        const chunk = needing.slice(i, i + chunkSize)
        setDiscoverProgress({ scanned, total: needing.length, found })
        try {
          const data = await fetchJson('/api/admin/trade-outreach/discover', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trade_ids: chunk.map((c) => c.id) }),
          })
          for (const r of data.results || []) {
            const c = updated.get(r.trade_id)
            if (!c) continue
            if (r.email && r.status === 'found') {
              updated.set(r.trade_id, { ...c, contact_email: r.email, email_source: 'website', website_status: 'has_email', sendable: !c.suppressed && !['sent', 'bounced', 'complained', 'unsubscribed'].includes(c.send_status) && c.funnel_status !== 'onboarded' })
              found++
            } else if (r.status && r.status !== 'pending' && r.status !== 'has_email') {
              updated.set(r.trade_id, { ...c, website_status: r.status })
            }
          }
          if (data.statusCounts) for (const k of ['found', 'no_email', 'dead', 'blocked']) tally[k] += (data.statusCounts[k] || 0)
        } catch (err) { failures.push(err.message) }
        scanned += chunk.length
        setDiscoverProgress({ scanned, total: needing.length, found })
      }
      const companies = seg.companies.map((c) => updated.get(c.id))
      setSeg({ companies, counts: recomputeCounts(companies) })
      setSelected((prev) => {
        const next = new Set(prev)
        for (const c of companies) if (c.sendable && c.contact_email) next.add(c.id)
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

  // Generate AI personal openers for selected recipients without one.
  async function personaliseSelected() {
    if (!seg) return
    const targets = seg.companies.filter((c) => selected.has(c.id) && c.sendable && !c.personal_note)
    if (targets.length === 0) return
    setWriting(true); setError(null)
    const chunkSize = 12
    let done = 0, wrote = 0
    const byId = new Map(seg.companies.map((c) => [c.id, c]))
    const failures = []
    try {
      for (let i = 0; i < targets.length; i += chunkSize) {
        const chunk = targets.slice(i, i + chunkSize)
        setPersonaliseProgress({ done, total: targets.length })
        try {
          const data = await fetchJson('/api/admin/trade-outreach/personalise', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trade_ids: chunk.map((c) => c.id) }),
          })
          for (const r of data.results || []) {
            const c = byId.get(r.trade_id)
            if (c && r.personal_note) { byId.set(r.trade_id, { ...c, personal_note: r.personal_note }); wrote++ }
          }
        } catch (err) { failures.push(err.message) }
        done += chunk.length
        setPersonaliseProgress({ done, total: targets.length })
      }
      setSeg((prev) => prev && { ...prev, companies: prev.companies.map((c) => byId.get(c.id)) })
      if (failures.length) {
        setError(`Wrote ${wrote} opener${wrote === 1 ? '' : 's'}, but ${failures.length} batch${failures.length === 1 ? '' : 'es'} failed — ${failures[0]}`)
      }
    } catch (err) { setError(err.message) } finally { setWriting(false); setPersonaliseProgress(null) }
  }

  function updateNote(id, note) {
    setSeg((prev) => prev && { ...prev, companies: prev.companies.map((c) => c.id === id ? { ...c, personal_note: note } : c) })
  }

  const eligibleSelected = useMemo(() => {
    if (!seg) return []
    return seg.companies.filter((c) => selected.has(c.id) && c.sendable && c.contact_email)
  }, [seg, selected])

  const notedCount = useMemo(() => eligibleSelected.filter((c) => c.personal_note).length, [eligibleSelected])
  const [previewId, setPreviewId] = useState(null)
  const previewCompany = (previewId && (seg?.companies || []).find((c) => c.id === previewId)) || eligibleSelected[0] || (seg?.companies || [])[0] || null
  const previewCtx = previewCompany ? buildCtx(previewCompany, networkCount) : null

  async function runSend({ dryRun = false, testMode = false } = {}) {
    setBusy(true); setError(null); setResult(null); setConfirmOpen(false)
    try {
      const data = await fetchJson('/api/admin/trade-outreach/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade_ids: eligibleSelected.map((c) => c.id),
          subject, body: emailBody, dryRun, testMode, cap: Number(cap),
          personal_notes: Object.fromEntries(eligibleSelected.filter((c) => c.personal_note).map((c) => [c.id, c.personal_note])),
        }),
      })
      setResult(data)
      if (!dryRun && !testMode) {
        setSeg((prev) => prev && {
          ...prev,
          companies: prev.companies.map((c) => eligibleSelected.find((e) => e.id === c.id) ? { ...c, send_status: 'sent', sendable: false, funnel_status: 'contacted' } : c),
          counts: prev.counts,
        })
        setSelected(new Set())
      }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div>
      {/* Segment builder */}
      <div style={{ ...card, padding: '16px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={label}>State</label>
            <select style={input} value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}>
              <option value="">All</option>
              {allStates.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Type</label>
            <select style={input} value={filters.org_type} onChange={(e) => setFilters({ ...filters, org_type: e.target.value })}>
              <option value="">All</option>
              {ORG_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Name / region / focus contains</label>
            <input style={{ ...input, width: 170 }} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="e.g. outback" />
          </div>
          <div>
            <label style={label}>Funnel status</label>
            <select style={input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="not_contacted">Not contacted</option>
              <option value="contacted">Contacted</option>
              <option value="responded">Responded</option>
              <option value="onboarded">Onboarded</option>
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
              <button style={btn} onClick={discoverEmails} disabled={discovering || seg.companies.filter((c) => c.website && !c.contact_email && !c.website_status).length === 0} title="Scan company websites we haven't checked yet for a contact email">
                {discovering ? 'Discovering…' : `Discover emails (${seg.companies.filter((c) => c.website && !c.contact_email && !c.website_status).length})`}
              </button>
              <button style={btn} onClick={personaliseSelected} disabled={writing || seg.companies.filter((c) => selected.has(c.id) && c.sendable && !c.personal_note).length === 0} title="AI-write a personal opener for each selected company that doesn't have one">
                {writing ? 'Writing…' : `Personalise (${seg.companies.filter((c) => selected.has(c.id) && c.sendable && !c.personal_note).length})`}
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
            {seg.companies.map((c) => {
              const isSel = selected.has(c.id)
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                  borderBottom: '1px solid var(--color-border, #eee)',
                  opacity: c.sendable ? 1 : 0.55,
                }}>
                  <input type="checkbox" checked={isSel} disabled={!c.sendable} onChange={() => toggle(c.id)} style={{ cursor: c.sendable ? 'pointer' : 'not-allowed' }} />
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setPreviewId(c.id)} title="Preview this recipient">
                    <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 500, color: previewCompany && previewCompany.id === c.id ? '#8a6520' : 'var(--color-ink, #2D2A26)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.company_name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: 'var(--color-muted, #888)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[ORG_TYPE_LABELS[c.org_type] || c.org_type, c.state, c.focus || c.region_name].filter(Boolean).join(' · ')}
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
                {TRADE_TEMPLATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              <label style={label}>Preview {previewCompany ? `· ${previewCompany.company_name}` : ''}</label>
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
                      You received this because {previewCtx.company_name} packages or sells Australian travel, and Australian Atlas maintains a verified public guide to the independent operators the trade builds with.<br />
                      <span style={{ textDecoration: 'underline' }}>Unsubscribe</span> · australianatlas.com.au
                    </div>
                  </>
                ) : (
                  <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 13, color: 'var(--color-muted, #888)' }}>Select a recipient to preview.</span>
                )}
              </div>

              {/* Editable personal opener for the previewed recipient */}
              {previewCompany && (
                <div style={{ marginTop: 12 }}>
                  <label style={label}>
                    Personal opener {emailBody.includes('{{personal_note}}') ? '' : '(add {{personal_note}} to the body to use it)'}
                  </label>
                  <textarea
                    value={previewCompany.personal_note || ''}
                    onChange={(e) => updateNote(previewCompany.id, e.target.value)}
                    rows={2}
                    placeholder="Click Personalise to AI-write one, or type your own…"
                    style={{ ...input, width: '100%', lineHeight: 1.5, resize: 'vertical', fontStyle: previewCompany.personal_note ? 'normal' : 'italic' }}
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
              <input type="number" min={1} max={500} value={cap} onChange={(e) => setCap(e.target.value)} style={{ ...input, width: 80 }} />
            </div>
            <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: 'var(--color-muted, #888)', maxWidth: 260, lineHeight: 1.5 }}>
              Sends to the lesser of your selection and the cap. Emails include a working unsubscribe and go out from matt@australianatlas.com.au.
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
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 440, width: '100%' }}>
            <h3 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 20, fontWeight: 400, margin: '0 0 8px', color: 'var(--color-ink, #2D2A26)' }}>Send this batch?</h3>
            <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 14, color: '#5a544c', lineHeight: 1.5, margin: '0 0 20px' }}>
              About to send <strong>{Math.min(eligibleSelected.length, Number(cap) || 0)}</strong> real emails to trade companies from matt@australianatlas.com.au. Recipients who have been contacted, suppressed, or unsubscribed are automatically excluded. This can't be undone.
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
// Small CSV parser: handles quoted fields and commas/tabs; header row required.
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
  const [form, setForm] = useState({ company_name: '', org_type: '', state: '', website: '', contact_email: '', region_slug: '', focus: '' })
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState(null)
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  const regionOptions = useMemo(() => regions.map((r) => ({ value: r.slug, label: `${r.name} (${r.state})` })), [regions])

  async function addCompany() {
    if (!form.company_name.trim()) { setAddMsg({ err: true, text: 'Company name is required.' }); return }
    setAdding(true); setAddMsg(null)
    try {
      await fetchJson('/api/admin/trade-outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setAddMsg({ err: false, text: `${form.company_name} added. Load a segment in Compose & Send to reach it.` })
      setForm({ company_name: '', org_type: '', state: '', website: '', contact_email: '', region_slug: '', focus: '' })
    } catch (err) { setAddMsg({ err: true, text: err.message }) } finally { setAdding(false) }
  }

  async function runImport() {
    const { header, rows } = parseCsv(csvText)
    if (!header.includes('company_name')) {
      setImportMsg({ err: true, text: 'Need a header row with at least company_name — e.g. company_name,org_type,state,website,contact_email,region_slug,focus' })
      return
    }
    if (rows.length === 0) { setImportMsg({ err: true, text: 'No data rows found.' }); return }
    setImporting(true); setImportMsg(null)
    try {
      const data = await fetchJson('/api/admin/trade-outreach/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const bits = [`${data.inserted} added`]
      if (data.skippedDuplicate) bits.push(`${data.skippedDuplicate} already in the directory`)
      if (data.skippedInvalid) bits.push(`${data.skippedInvalid} missing a name`)
      if (data.unmatchedRegion) bits.push(`${data.unmatchedRegion} without a matched region`)
      setImportMsg({ err: false, text: bits.join(' · ') })
      if (data.inserted > 0) setCsvText('')
    } catch (err) { setImportMsg({ err: true, text: err.message }) } finally { setImporting(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Add one */}
      <div style={{ ...card, padding: 18 }}>
        <h3 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 17, fontWeight: 400, margin: '0 0 14px', color: 'var(--color-ink, #2D2A26)' }}>Add a company</h3>
        <label style={label}>Company name *</label>
        <input style={{ ...input, width: '100%', marginBottom: 10 }} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="e.g. Outback Spirit Tours" />
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Type</label>
            <select style={{ ...input, width: '100%' }} value={form.org_type} onChange={(e) => setForm({ ...form, org_type: e.target.value })}>
              <option value="">—</option>
              {ORG_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <label style={label}>State</label>
            <select style={{ ...input, width: '100%' }} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
              <option value="">—</option>
              {allStates.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <label style={label}>Focus region (optional — grounds the personal opener)</label>
        <select style={{ ...input, width: '100%', marginBottom: 10 }} value={form.region_slug} onChange={(e) => setForm({ ...form, region_slug: e.target.value })}>
          <option value="">— none / national —</option>
          {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label style={label}>Official website</label>
        <input style={{ ...input, width: '100%', marginBottom: 10 }} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://www.company.com.au" />
        <label style={label}>Contact email (optional — Discover can find one)</label>
        <input style={{ ...input, width: '100%', marginBottom: 10 }} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="info@…" />
        <label style={label}>Focus (optional)</label>
        <input style={{ ...input, width: '100%', marginBottom: 14 }} value={form.focus} onChange={(e) => setForm({ ...form, focus: e.target.value })} placeholder="What they sell, e.g. Small-group 4WD touring, outback SA/NT" />
        <button style={btnPrimary} onClick={addCompany} disabled={adding}>{adding ? 'Adding…' : 'Add company'}</button>
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
          Paste CSV (or tab-separated) with a header row. Columns: <code>company_name</code> (required), <code>org_type</code>, <code>state</code>, <code>website</code>, <code>contact_email</code>, <code>region_slug</code>, <code>focus</code>. Duplicates already in the directory are skipped.
        </p>
        <textarea
          style={{ ...input, width: '100%', lineHeight: 1.5, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
          rows={12}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={'company_name,org_type,state,website,contact_email,focus\nOutback Spirit Tours,tour_operator,VIC,https://www.outbackspirittours.com.au,,Small-group 4WD touring'}
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
      await fetchJson('/api/admin/trade-outreach', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status: newStatus }),
      })
    } catch { setStatusVal(prev) /* revert on failure so the dot never lies */ }
    setSaving(false)
  }

  const sColor = statusColors[statusVal] || '#888'
  return (
    <div style={{ background: '#fff', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 8, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 14, fontWeight: 500, color: 'var(--color-ink, #2D2A26)' }}>{row.company_name}</div>
        <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: 'var(--color-muted, #888)', marginTop: 2 }}>
          {[ORG_TYPE_LABELS[row.org_type] || row.org_type, row.region_display, row.state].filter(Boolean).join(', ') || '—'}
          {row.contact_email && ` · ${row.contact_email}`}
          {row.sent_at && ` · sent ${new Date(row.sent_at).toLocaleDateString()}`}
          {row.campaign_id && ` · ${row.campaign_id}`}
        </div>
        {row.send_error && <div style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: '#c0392b', marginTop: 2 }}>{row.send_error}</div>}
      </div>
      {row.send_status && <Chip color={sendStatusColors[row.send_status] || '#888'} filled>{row.send_status}</Chip>}
      <select value={statusVal} onChange={(e) => updateStatus(e.target.value)} disabled={saving} style={{ ...input, fontSize: 11, padding: '4px 8px' }}>
        <option value="not_contacted">Not contacted</option>
        <option value="contacted">Contacted</option>
        <option value="responded">Responded</option>
        <option value="onboarded">Onboarded</option>
        <option value="declined">Declined</option>
      </select>
      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: sColor }} />
    </div>
  )
}

// ── Campaigns ─────────────────────────────────────────────────
function CampaignsPanel({ campaigns }) {
  if (!campaigns.length) {
    return <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: 'var(--font-body, system-ui)', fontSize: 14, color: 'var(--color-muted, #888)' }}>No trade campaigns sent yet.</div>
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
            <Chip color="#5F8A7E">{c.sent} sent</Chip>
            {c.failed > 0 && <Chip color="#c0392b">{c.failed} failed</Chip>}
            {c.skipped > 0 && <Chip color="#888">{c.skipped} skipped</Chip>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────
export default function TradeOutreachActions({
  logRows, campaigns, regions, statusColors, sendStatusColors, allStates, networkCount, stats,
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
      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
        <StatCard n={stats.directory.toLocaleString()} label="companies in directory" />
        <StatCard n={stats.withEmail} label="have email" />
        <StatCard n={stats.contacted} label="contacted" />
        <StatCard n={stats.onboarded} label="onboarded" />
        <StatCard n={stats.suppressed} label="suppressed" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border, #e5e5e5)', marginBottom: 24 }}>
        <button onClick={() => setTab('compose')} style={tabStyle(tab === 'compose')}>Compose &amp; Send</button>
        <button onClick={() => setTab('directory')} style={tabStyle(tab === 'directory')}>Directory</button>
        <button onClick={() => setTab('log')} style={tabStyle(tab === 'log')}>Sent Log ({logRows.length})</button>
        <button onClick={() => setTab('campaigns')} style={tabStyle(tab === 'campaigns')}>Campaigns ({campaigns.length})</button>
      </div>

      {tab === 'compose' && (
        <ComposePanel
          statusColors={statusColors}
          sendStatusColors={sendStatusColors}
          allStates={allStates}
          networkCount={networkCount}
        />
      )}

      {tab === 'directory' && <DirectoryPanel regions={regions} allStates={allStates} />}

      {tab === 'log' && (
        logRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: 'var(--font-body, system-ui)', fontSize: 14, color: 'var(--color-muted, #888)' }}>No trade outreach yet.</div>
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
