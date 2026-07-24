'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { TEMPLATE_OPTIONS, GENERIC_TEMPLATE, VERTICAL_TEMPLATES } from '@/lib/outreach/templates'

const SITE = 'https://australianatlas.com.au'

const DEFAULT_TEMPLATE = GENERIC_TEMPLATE

const MERGE_TOKENS = [
  ['{{name}}', 'Venue name'],
  ['{{region}}', 'Region'],
  ['{{suburb}}', 'Suburb / town'],
  ['{{state}}', 'State'],
  ['{{vertical}}', 'Atlas'],
  ['{{personal_note}}', 'AI personal opener'],
  ['{{description}}', 'Our editorial line'],
  ['{{place_url}}', 'Live listing URL'],
  ['{{claim_url}}', 'Claim URL'],
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

function snippet(text, max = 260) {
  if (!text) return ''
  const s = String(text).replace(/\s+/g, ' ').trim()
  return s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, '') + '…'
}
function buildCtx(l, verticalNames, noteOverride) {
  return {
    name: l.name || 'your venue',
    region: l.region || 'Australia',
    suburb: l.suburb || '',
    state: l.state || '',
    vertical: verticalNames[l.vertical] || l.vertical || 'Australian Atlas',
    personal_note: (noteOverride != null ? noteOverride : (l.personal_note || '')).trim(),
    description: snippet(l.description),
    place_url: l.slug ? `${SITE}/place/${l.slug}` : SITE,
    claim_url: l.slug ? `${SITE}/claim/${l.slug}` : `${SITE}/claim`,
  }
}
function applyMerge(str, ctx) {
  return (str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : '')).replace(/\n{3,}/g, '\n\n')
}
function pct(a, b) {
  if (!b) return null
  return `${Math.round((a / b) * 100)}%`
}

// Fetch that never throws a raw "JSON.parse: unexpected character…". The
// discover/personalise routes scrape sites and call the AI, so a slow batch can
// exhaust the Vercel function budget and return a 504/502 HTML page instead of
// JSON — parsing that blind used to surface a cryptic error. Read the body once,
// parse defensively, and turn transport-level failures into a human message.
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
      // Body wasn't JSON: a gateway timeout, a crash page, or an auth redirect.
      if (res.status === 504 || res.status === 502 || res.status === 503) {
        throw new Error('The request timed out on the server. Try a smaller batch (fewer recipients at once) and retry.')
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('Your admin session has expired. Reload the page and sign in again.')
      }
      const snip = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
      throw new Error(`Server returned a non-JSON response (HTTP ${res.status})${snip ? `: ${snip}` : ''}.`)
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
      ...bodyFont, fontSize: 10, fontWeight: 600,
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

// ── Funnel header ─────────────────────────────────────────────
function FunnelHeader({ stats }) {
  const stages = [
    { n: stats.unclaimed, label: 'unclaimed listings' },
    { n: stats.withEmail, label: 'emails found', sub: stats.checked ? `${Number(stats.checked).toLocaleString()} sites checked` : null },
    { n: stats.contacted, label: 'contacted', sub: pct(stats.contacted, stats.withEmail) },
    { n: stats.opened, label: 'opened', sub: pct(stats.opened, stats.contacted) },
    { n: stats.claimed, label: 'claimed', sub: pct(stats.claimed, stats.contacted) },
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
          ['clicked', stats.clicked], ['follow-ups sent', stats.followedUp],
          ['replied', stats.replied], ['suppressed', stats.suppressed],
        ].filter(([, v]) => Number(v) > 0).map(([k, v]) => (
          <span key={k} style={{ ...bodyFont, fontSize: 11.5, color: 'var(--color-muted, #888)' }}>
            <strong style={{ color: 'var(--color-ink, #2D2A26)' }}>{Number(v).toLocaleString()}</strong> {k}
          </span>
        ))}
      </div>
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
      const d = await fetchJson('/api/admin/outreach/settings')
      setData(d)
      setForm(d.settings)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError(null)
    try {
      const d = await fetchJson('/api/admin/outreach/settings', {
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
        {error} {String(error).includes('relation') || String(error).includes('outreach_settings') ? '— run migration 251 first.' : ''}
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
        <StatCard n={`${st.sent_today ?? 0} / ${form.daily_send_cap}`} label="sent today (Melbourne)" />
        <StatCard n={`${st.followups_today ?? 0} / ${form.followup_daily_cap}`} label="follow-ups today" />
        <StatCard n={(st.sendable_pool ?? 0).toLocaleString()} label="ready to send" />
        <StatCard n={(st.need_note_pool ?? 0).toLocaleString()} label="awaiting AI opener" />
        <StatCard n={(st.followup_due ?? 0).toLocaleString()} label="follow-ups due" />
        <StatCard n={(st.sites_checked ?? 0).toLocaleString()} label="sites checked" />
      </div>
      {st.last_run && (
        <div style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)', marginBottom: 18 }}>
          Last run {new Date(st.last_run.started_at).toLocaleString()} — {st.last_run.status}
          {st.last_run.summary?.send?.sent != null ? ` · ${st.last_run.summary.send.sent} sent` : ''}
          {st.last_run.summary?.discover?.found != null ? ` · ${st.last_run.summary.discover.found} emails found` : ''}
        </div>
      )}

      <div style={{ ...card, background: '#fff', padding: '6px 18px 2px', marginBottom: 16 }}>
        <SettingRow
          title="Background pipeline"
          desc="Every weekday morning (09:30 Melbourne): sync claims, scan the next unchecked operator websites for contact emails, and AI-write personal openers. No email is sent by this switch alone. All outreach email holds outside 9am–5pm Melbourne time."
        >
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
        </SettingRow>
        <SettingRow
          title="Send first-touch emails"
          desc="Let the autopilot send the daily claim-invitation batch (quality-first, per-vertical template, weekdays only). Every email carries one-click unsubscribe and all suppression rules apply."
        >
          <Toggle checked={form.send_enabled} onChange={(v) => setForm({ ...form, send_enabled: v })} disabled={!form.enabled} />
        </SettingRow>
        <SettingRow title="Daily send cap" desc="First-touch emails per 24 hours. Keep modest while the sender domain warms up.">
          {num('daily_send_cap', 0, 200)}
        </SettingRow>
        <SettingRow title="Minimum quality score" desc="Only auto-email listings at or above this quality score (0 = everyone).">
          {num('min_quality', 0, 100, 5)}
        </SettingRow>
        <SettingRow
          title="Follow-up"
          desc="One (and only one) second touch if there's been no claim, reply or unsubscribe. Sent from the same thread-friendly template that closes the loop."
        >
          <Toggle checked={form.followup_enabled} onChange={(v) => setForm({ ...form, followup_enabled: v })} disabled={!form.enabled || !form.send_enabled} />
        </SettingRow>
        <SettingRow title="Follow-up after (days)" desc="How long to wait after the first email.">
          {num('followup_after_days', 2, 60)}
        </SettingRow>
        <SettingRow title="Follow-up daily cap" desc="Follow-ups per 24 hours.">
          {num('followup_daily_cap', 0, 200)}
        </SettingRow>
        <SettingRow title="Websites scanned per run" desc="Email discovery throughput. Scanning is free — this just bounds the run time.">
          {num('discover_per_run', 0, 400, 10)}
        </SettingRow>
        <SettingRow title="AI openers per run" desc="Personal openers written per run — metered against the monthly AI budget, so it degrades gracefully.">
          {num('personalise_per_run', 0, 100, 5)}
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
        <span style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)', marginLeft: 'auto', maxWidth: 380, lineHeight: 1.5 }}>
          The autopilot never emails claimed, suppressed, bounced or already-contacted operators, and holds all sending on weekends.
        </span>
      </div>
    </div>
  )
}

// ── Compose & Send panel ──────────────────────────────────────
function ComposePanel({ verticalNames, verticalColors, sendStatusColors, allStates, allVerticals }) {
  const [filters, setFilters] = useState({ vertical: '', state: '', minQuality: 0, region: '', limit: 200 })
  const [loading, setLoading] = useState(false)
  const [seg, setSeg] = useState(null) // { listings, counts }
  const [selected, setSelected] = useState(() => new Set())
  const [discovering, setDiscovering] = useState(false)
  const [discoverProgress, setDiscoverProgress] = useState(null)
  const [discoverSummary, setDiscoverSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [rowFilter, setRowFilter] = useState('all')

  const [discovering2, setDiscovering2] = useState(false) // personalise in-flight
  const [personaliseProgress, setPersonaliseProgress] = useState(null)

  const [templateChoice, setTemplateChoice] = useState('')
  const [subject, setSubject] = useState(DEFAULT_TEMPLATE.subject)
  const [emailBody, setEmailBody] = useState(DEFAULT_TEMPLATE.body)
  const [cap, setCap] = useState(50)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState(null)

  function loadTemplate(choice) {
    setTemplateChoice(choice)
    const t = choice ? (VERTICAL_TEMPLATES[choice] || GENERIC_TEMPLATE) : GENERIC_TEMPLATE
    setSubject(t.subject)
    setEmailBody(t.body)
  }

  async function loadSegment() {
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await fetchJson('/api/admin/outreach/segment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      })
      setSeg(data)
      // Default selection: everything currently sendable.
      setSelected(new Set((data.listings || []).filter((l) => l.sendable).map((l) => l.id)))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectAllSendable = () => seg && setSelected(new Set(seg.listings.filter((l) => l.sendable).map((l) => l.id)))
  const clearSelection = () => setSelected(new Set())

  // Discover emails for listings that have a website, no email yet, and haven't
  // already been checked (a prior scan recorded dead/no-email/blocked) — so
  // re-running Discover targets fresh sites instead of re-scanning known-empty
  // ones. The nightly autopilot does the same sweep in the background; this
  // button exists for "I want THIS segment covered now".
  async function discoverEmails() {
    if (!seg) return
    const needing = seg.listings.filter((l) => l.website && !l.contact_email && !l.website_status)
    if (needing.length === 0) return
    setDiscovering(true); setError(null); setDiscoverSummary(null)
    const chunkSize = 10 // keep each /discover call comfortably inside the function budget
    let scanned = 0, found = 0
    const updated = new Map(seg.listings.map((l) => [l.id, l]))
    const failures = []
    const tally = { found: 0, no_email: 0, dead: 0, blocked: 0 }
    try {
      for (let i = 0; i < needing.length; i += chunkSize) {
        const chunk = needing.slice(i, i + chunkSize)
        setDiscoverProgress({ scanned, total: needing.length, found })
        // Per-chunk isolation: a slow/timed-out batch records its error and the
        // run continues, so one bad chunk never wipes progress from earlier ones.
        try {
          const data = await fetchJson('/api/admin/outreach/discover', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listing_ids: chunk.map((l) => l.id) }),
          })
          for (const r of data.results || []) {
            const l = updated.get(r.listing_id)
            if (!l) continue
            if (r.email) {
              updated.set(r.listing_id, { ...l, contact_email: r.email, email_source: r.source ? 'website' : l.email_source, website_status: 'has_email', sendable: !l.suppressed && !['sent', 'bounced', 'complained', 'unsubscribed'].includes(l.send_status) })
              found++
            } else if (r.status && r.status !== 'pending') {
              // Record the outcome so this site drops out of the Discover count.
              updated.set(r.listing_id, { ...l, website_status: r.status })
            }
          }
          if (data.statusCounts) for (const k of ['found', 'no_email', 'dead', 'blocked']) tally[k] += (data.statusCounts[k] || 0)
        } catch (err) { failures.push(err.message) }
        scanned += chunk.length
        setDiscoverProgress({ scanned, total: needing.length, found })
      }
      const listings = seg.listings.map((l) => updated.get(l.id))
      const counts = recomputeCounts(listings)
      setSeg({ listings, counts })
      // Auto-select newly discovered, sendable rows.
      setSelected((prev) => {
        const next = new Set(prev)
        for (const l of listings) if (l.sendable && l.contact_email) next.add(l.id)
        return next
      })
      // Plain-language outcome so an empty run is explained, not mysterious.
      const parts = [`${found} email${found === 1 ? '' : 's'} found`]
      if (tally.no_email) parts.push(`${tally.no_email} with no published email`)
      if (tally.dead) parts.push(`${tally.dead} site${tally.dead === 1 ? '' : 's'} offline`)
      if (tally.blocked) parts.push(`${tally.blocked} blocked the scan`)
      let msg = parts.join(' · ')
      if (failures.length) msg += ` · ${failures.length} batch${failures.length === 1 ? '' : 'es'} failed (${failures[0]})`
      setDiscoverSummary(msg)
    } catch (err) { setError(err.message) } finally { setDiscovering(false); setDiscoverProgress(null) }
  }

  function recomputeCounts(listings) {
    const un = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])
    return {
      total: listings.length,
      withWebsite: listings.filter((l) => l.website).length,
      withEmail: listings.filter((l) => l.contact_email).length,
      suppressed: listings.filter((l) => l.suppressed).length,
      alreadySent: listings.filter((l) => un.has(l.send_status)).length,
      sendable: listings.filter((l) => l.sendable).length,
    }
  }

  // Generate AI personal openers for the selected recipients that don't have one.
  async function personaliseSelected() {
    if (!seg) return
    const targets = seg.listings.filter((l) => selected.has(l.id) && l.sendable && !l.personal_note)
    if (targets.length === 0) return
    setDiscovering2(true); setError(null)
    const chunkSize = 12 // route caps 20; keep each call inside its budget
    let done = 0, wrote = 0, budgetHit = false
    const byId = new Map(seg.listings.map((l) => [l.id, l]))
    const failures = []
    try {
      for (let i = 0; i < targets.length; i += chunkSize) {
        const chunk = targets.slice(i, i + chunkSize)
        setPersonaliseProgress({ done, total: targets.length })
        try {
          const data = await fetchJson('/api/admin/outreach/personalise', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listing_ids: chunk.map((l) => l.id) }),
          })
          for (const r of data.results || []) {
            const l = byId.get(r.listing_id)
            if (l && r.personal_note) { byId.set(r.listing_id, { ...l, personal_note: r.personal_note }); wrote++ }
          }
          if (data.budgetHit) { budgetHit = true; break }
        } catch (err) { failures.push(err.message) }
        done += chunk.length
        setPersonaliseProgress({ done, total: targets.length })
      }
      setSeg((prev) => prev && { ...prev, listings: prev.listings.map((l) => byId.get(l.id)) })
      if (budgetHit) {
        setError(`Wrote ${wrote} opener${wrote === 1 ? '' : 's'}, then hit the monthly AI budget — the rest will go out without an opener, or wait for next month.`)
      } else if (failures.length) {
        setError(`Wrote ${wrote} opener${wrote === 1 ? '' : 's'}, but ${failures.length} batch${failures.length === 1 ? '' : 'es'} failed — ${failures[0]}`)
      }
    } catch (err) { setError(err.message) } finally { setDiscovering2(false); setPersonaliseProgress(null) }
  }

  // Inline edit of a recipient's personal opener (kept in client state; applied
  // and persisted at send).
  function updateNote(id, note) {
    setSeg((prev) => prev && { ...prev, listings: prev.listings.map((l) => l.id === id ? { ...l, personal_note: note } : l) })
  }

  // Recipients actually eligible to send in this run.
  const eligibleSelected = useMemo(() => {
    if (!seg) return []
    return seg.listings.filter((l) => selected.has(l.id) && l.sendable && l.contact_email)
  }, [seg, selected])

  // Search + status filter over the recipient table (display only).
  const visibleListings = useMemo(() => {
    if (!seg) return []
    const q = search.trim().toLowerCase()
    const un = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])
    return seg.listings.filter((l) => {
      if (q && ![l.name, l.suburb, l.region, l.contact_email].some((v) => v && String(v).toLowerCase().includes(q))) return false
      switch (rowFilter) {
        case 'sendable': return l.sendable
        case 'needs_discovery': return !!l.website && !l.contact_email && !l.website_status
        case 'no_email': return !l.contact_email && (!l.website || ['no_email', 'dead', 'blocked'].includes(l.website_status))
        case 'contacted': return un.has(l.send_status)
        case 'engaged': return !!(l.opened_at || l.clicked_at)
        default: return true
      }
    })
  }, [seg, search, rowFilter])

  const notedCount = useMemo(() => eligibleSelected.filter((l) => l.personal_note).length, [eligibleSelected])
  const [previewId, setPreviewId] = useState(null)
  const previewListing = (previewId && (seg?.listings || []).find((l) => l.id === previewId)) || eligibleSelected[0] || (seg?.listings || [])[0] || null
  const previewCtx = previewListing ? buildCtx(previewListing, verticalNames) : null

  async function runSend({ dryRun = false, testMode = false } = {}) {
    setBusy(true); setError(null); setResult(null); setConfirmOpen(false)
    try {
      const data = await fetchJson('/api/admin/outreach/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_ids: eligibleSelected.map((l) => l.id),
          subject, body: emailBody, dryRun, testMode, cap: Number(cap),
          personal_notes: Object.fromEntries(eligibleSelected.filter((l) => l.personal_note).map((l) => [l.id, l.personal_note])),
        }),
      })
      setResult(data)
      if (!dryRun && !testMode) {
        // Reflect newly-sent rows in the table so they can't be double-sent.
        setSeg((prev) => prev && {
          ...prev,
          listings: prev.listings.map((l) => eligibleSelected.find((e) => e.id === l.id) ? { ...l, send_status: 'sent', sendable: false, funnel_status: 'contacted' } : l),
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
            <label style={label}>Atlas</label>
            <select style={input} value={filters.vertical} onChange={(e) => setFilters({ ...filters, vertical: e.target.value })}>
              <option value="">All</option>
              {allVerticals.map((v) => <option key={v} value={v}>{verticalNames[v] || v}</option>)}
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
            <label style={label}>Region contains</label>
            <input style={{ ...input, width: 150 }} value={filters.region} onChange={(e) => setFilters({ ...filters, region: e.target.value })} placeholder="e.g. Byron" />
          </div>
          <div>
            <label style={label}>Min quality: {filters.minQuality}</label>
            <input type="range" min={0} max={100} step={5} value={filters.minQuality} onChange={(e) => setFilters({ ...filters, minQuality: Number(e.target.value) })} style={{ width: 130, display: 'block' }} />
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
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 14px', borderRadius: 6, marginBottom: 16, ...bodyFont, fontSize: 13, color: '#991B1B' }}>
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
                <span style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)' }}>
                  Scanning {discoverProgress.scanned}/{discoverProgress.total} · {discoverProgress.found} found
                </span>
              )}
              {personaliseProgress && (
                <span style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)' }}>
                  Writing {personaliseProgress.done}/{personaliseProgress.total}…
                </span>
              )}
              <button style={btn} onClick={discoverEmails} disabled={discovering || seg.listings.filter((l) => l.website && !l.contact_email && !l.website_status).length === 0} title="Scan the websites of listings we haven't checked yet for a contact email (the autopilot also does this nightly)">
                {discovering ? 'Discovering…' : `Discover emails (${seg.listings.filter((l) => l.website && !l.contact_email && !l.website_status).length})`}
              </button>
              <button style={btn} onClick={personaliseSelected} disabled={discovering2 || seg.listings.filter((l) => selected.has(l.id) && l.sendable && !l.personal_note).length === 0} title="AI-write a personal opener for each selected recipient that doesn't have one">
                {discovering2 ? 'Writing…' : `Personalise (${seg.listings.filter((l) => selected.has(l.id) && l.sendable && !l.personal_note).length})`}
              </button>
            </div>
          </div>

          {discoverSummary && (
            <div style={{ background: '#F0F7F4', border: '1px solid #cfe6dc', padding: '9px 14px', borderRadius: 6, marginBottom: 14, ...bodyFont, fontSize: 12.5, color: '#3a5c4f' }}>
              {discoverSummary}
            </div>
          )}

          {/* Recipient table */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <button style={{ ...btn, padding: '5px 12px', fontSize: 12 }} onClick={selectAllSendable}>Select all sendable</button>
            <button style={{ ...btn, padding: '5px 12px', fontSize: 12 }} onClick={clearSelection}>Clear</button>
            <input
              style={{ ...input, padding: '5px 10px', fontSize: 12, width: 180 }}
              placeholder="Search name, town, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select style={{ ...input, padding: '5px 8px', fontSize: 12 }} value={rowFilter} onChange={(e) => setRowFilter(e.target.value)}>
              <option value="all">All rows</option>
              <option value="sendable">Sendable</option>
              <option value="needs_discovery">Needs discovery</option>
              <option value="no_email">No email found</option>
              <option value="contacted">Already contacted</option>
              <option value="engaged">Opened / clicked</option>
            </select>
            <span style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)', marginLeft: 4 }}>
              {visibleListings.length !== seg.listings.length ? `${visibleListings.length} shown · ` : ''}{selected.size} selected · {eligibleSelected.length} will send
            </span>
          </div>

          <div style={{ ...card, background: '#fff', maxHeight: 420, overflowY: 'auto', marginBottom: 22 }}>
            {visibleListings.length === 0 && (
              <div style={{ ...bodyFont, padding: '28px 0', textAlign: 'center', fontSize: 13, color: 'var(--color-muted, #888)' }}>
                Nothing matches this filter.
              </div>
            )}
            {visibleListings.map((l) => {
              const vColor = verticalColors[l.vertical] || '#888'
              const isSel = selected.has(l.id)
              return (
                <div key={l.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                  borderBottom: '1px solid var(--color-border, #eee)',
                  opacity: l.sendable ? 1 : 0.55,
                }}>
                  <input type="checkbox" checked={isSel} disabled={!l.sendable} onChange={() => toggle(l.id)} style={{ cursor: l.sendable ? 'pointer' : 'not-allowed' }} />
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setPreviewId(l.id)} title="Preview this recipient">
                    <div style={{ ...bodyFont, fontSize: 13, fontWeight: 500, color: previewListing && previewListing.id === l.id ? '#8a6520' : 'var(--color-ink, #2D2A26)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.name}
                    </div>
                    <div style={{ ...bodyFont, fontSize: 11, color: 'var(--color-muted, #888)' }}>
                      {[l.suburb || l.region, l.state].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  {(() => {
                    // Contact-cell text + colour reflect the website check outcome.
                    let text, color
                    if (l.contact_email) { text = l.contact_email; color = '#5F8A7E' }
                    else if (!l.website) { text = 'no website'; color = 'var(--color-muted, #999)' }
                    else if (l.website_status === 'dead') { text = 'site offline'; color = '#c0392b' }
                    else if (l.website_status === 'blocked') { text = 'scan blocked'; color = 'var(--color-muted, #999)' }
                    else if (l.website_status === 'no_email') { text = 'no email on site'; color = 'var(--color-muted, #999)' }
                    else { text = 'no email — discover'; color = '#c9a227' }
                    return (
                      <div title={l.website || ''} style={{ ...bodyFont, fontSize: 11, color, width: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {text}
                      </div>
                    )
                  })()}
                  {l.personal_note && <Chip color="#8a6520" title={l.personal_note}>✎ note</Chip>}
                  {l.clicked_at && <Chip color="#3b82f6" title={`Clicked ${new Date(l.clicked_at).toLocaleDateString()}`}>clicked</Chip>}
                  {!l.clicked_at && l.opened_at && <Chip color="#7c9ec4" title={`Opened ${new Date(l.opened_at).toLocaleDateString()}`}>opened</Chip>}
                  {l.followup_sent_at && <Chip color="#888" title={`Follow-up ${new Date(l.followup_sent_at).toLocaleDateString()}`}>2nd touch</Chip>}
                  <Chip color={vColor}>{verticalNames[l.vertical] || l.vertical}</Chip>
                  {l.suppressed && <Chip color="#c0392b">suppressed</Chip>}
                  {l.send_status && <Chip color={sendStatusColors[l.send_status] || '#888'}>{l.send_status}</Chip>}
                  {l.quality_score != null && (
                    <span style={{ ...bodyFont, fontSize: 11, color: 'var(--color-muted, #999)', width: 34, textAlign: 'right' }}>Q{l.quality_score}</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Template editor + preview */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label style={label}>Template</label>
              <select style={{ ...input, width: '100%', marginBottom: 12 }} value={templateChoice} onChange={(e) => loadTemplate(e.target.value)}>
                {TEMPLATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              <label style={label}>Preview {previewListing ? `· ${previewListing.name}` : ''}</label>
              <div style={{ ...card, background: '#fff', padding: 16, minHeight: 200 }}>
                {previewCtx ? (
                  <>
                    <div style={{ ...bodyFont, fontSize: 13, fontWeight: 600, color: 'var(--color-ink, #2D2A26)', marginBottom: 4, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
                      {applyMerge(subject, previewCtx)}
                    </div>
                    <div style={{ ...bodyFont, fontSize: 13, color: '#3a352e', whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: 8 }}>
                      {applyMerge(emailBody, previewCtx)}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #eee', ...bodyFont, fontSize: 11, color: '#8a8378', lineHeight: 1.6 }}>
                      Australian Atlas — a curated guide to independent Australian places.<br />
                      You received this because {previewCtx.name} is listed on our public guide.<br />
                      <span style={{ textDecoration: 'underline' }}>Unsubscribe</span> · australianatlas.com.au
                    </div>
                  </>
                ) : (
                  <span style={{ ...bodyFont, fontSize: 13, color: 'var(--color-muted, #888)' }}>Select a recipient to preview.</span>
                )}
              </div>

              {/* Editable personal opener for the previewed recipient */}
              {previewListing && (
                <div style={{ marginTop: 12 }}>
                  <label style={label}>
                    Personal opener {emailBody.includes('{{personal_note}}') ? '' : '(add {{personal_note}} to the body to use it)'}
                  </label>
                  <textarea
                    value={previewListing.personal_note || ''}
                    onChange={(e) => updateNote(previewListing.id, e.target.value)}
                    rows={2}
                    placeholder="Click Personalise to AI-write one, or type your own…"
                    style={{ ...input, width: '100%', lineHeight: 1.5, resize: 'vertical', fontStyle: previewListing.personal_note ? 'normal' : 'italic' }}
                  />
                  <div style={{ ...bodyFont, fontSize: 11, color: 'var(--color-muted, #999)', marginTop: 4 }}>
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
            <div style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)', maxWidth: 260, lineHeight: 1.5 }}>
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
            <div style={{ ...card, background: result.ok === false ? '#FEF2F2' : '#F0F7F4', border: `1px solid ${result.ok === false ? '#FECACA' : '#cfe6dc'}`, padding: '14px 18px', marginTop: 16, ...bodyFont, fontSize: 13, color: 'var(--color-ink, #2D2A26)' }}>
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
            <p style={{ ...bodyFont, fontSize: 14, color: '#5a544c', lineHeight: 1.5, margin: '0 0 20px' }}>
              About to send <strong>{Math.min(eligibleSelected.length, Number(cap) || 0)}</strong> real emails from matt@australianatlas.com.au. Recipients who have been contacted, suppressed, or unsubscribed are automatically excluded. This can't be undone.
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

// ── Sent log ──────────────────────────────────────────────────
function LogRow({ row, verticalNames, verticalColors, statusColors, sendStatusColors }) {
  const [statusVal, setStatusVal] = useState(row.status)
  const [saving, setSaving] = useState(false)
  const l = row.listing

  async function updateStatus(newStatus) {
    const prev = statusVal
    setSaving(true); setStatusVal(newStatus)
    try {
      await fetchJson('/api/admin/outreach', {
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
        <div style={{ ...bodyFont, fontSize: 14, fontWeight: 500, color: 'var(--color-ink, #2D2A26)' }}>
          {l ? l.name : (row.listing_name || `Listing ${row.listing_id || '—'}`)}
          {!l && row.listing_deleted_at && (
            <span style={{ fontWeight: 400, color: 'var(--color-muted, #888)' }}>
              {' '}· listing deleted {new Date(row.listing_deleted_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <div style={{ ...bodyFont, fontSize: 11, color: 'var(--color-muted, #888)', marginTop: 2 }}>
          {row.contact_email || '—'}
          {row.sent_at && ` · sent ${new Date(row.sent_at).toLocaleDateString()}`}
          {row.followup_sent_at && ` · 2nd touch ${new Date(row.followup_sent_at).toLocaleDateString()}`}
          {row.campaign_id && ` · ${row.campaign_id}`}
        </div>
        {row.send_error && <div style={{ ...bodyFont, fontSize: 11, color: '#c0392b', marginTop: 2 }}>{row.send_error}</div>}
      </div>
      {row.clicked_at && <Chip color="#3b82f6" title={`Clicked ${row.click_count || 1}× — last ${new Date(row.clicked_at).toLocaleString()}`}>clicked{row.click_count > 1 ? ` ×${row.click_count}` : ''}</Chip>}
      {!row.clicked_at && row.opened_at && <Chip color="#7c9ec4" title={`Opened ${row.open_count || 1}× — first ${new Date(row.opened_at).toLocaleString()}`}>opened{row.open_count > 1 ? ` ×${row.open_count}` : ''}</Chip>}
      {l && <Chip color={verticalColors[l.vertical] || '#888'}>{verticalNames[l.vertical] || l.vertical}</Chip>}
      {row.send_status && <Chip color={sendStatusColors[row.send_status] || '#888'} filled>{row.send_status}</Chip>}
      <select value={statusVal} onChange={(e) => updateStatus(e.target.value)} disabled={saving} style={{ ...input, fontSize: 11, padding: '4px 8px' }}>
        <option value="not_contacted">Not contacted</option>
        <option value="contacted">Contacted</option>
        <option value="replied">Replied</option>
        <option value="claimed">Claimed</option>
        <option value="declined">Declined</option>
      </select>
      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: sColor }} />
    </div>
  )
}

function LogPanel({ logRows, verticalNames, verticalColors, statusColors, sendStatusColors }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return logRows.filter((row) => {
      if (query) {
        const hay = [row.listing?.name, row.listing_name, row.contact_email, row.campaign_id].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(query)) return false
      }
      switch (filter) {
        case 'sent': return row.send_status === 'sent'
        case 'opened': return !!row.opened_at
        case 'clicked': return !!row.clicked_at
        case 'followed_up': return !!row.followup_sent_at
        case 'bounced': return ['bounced', 'complained'].includes(row.send_status)
        case 'unsubscribed': return row.send_status === 'unsubscribed'
        case 'claimed': return row.status === 'claimed'
        case 'replied': return row.status === 'replied'
        case 'failed': return row.send_status === 'failed'
        default: return true
      }
    })
  }, [logRows, q, filter])

  if (logRows.length === 0) {
    return <div style={{ ...bodyFont, textAlign: 'center', padding: '48px 0', fontSize: 14, color: 'var(--color-muted, #888)' }}>No outreach yet.</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          style={{ ...input, width: 220 }}
          placeholder="Search name, email, campaign…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select style={input} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All activity</option>
          <option value="sent">Sent</option>
          <option value="opened">Opened</option>
          <option value="clicked">Clicked</option>
          <option value="followed_up">Follow-up sent</option>
          <option value="replied">Replied</option>
          <option value="claimed">Claimed</option>
          <option value="bounced">Bounced / complained</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="failed">Failed</option>
        </select>
        <span style={{ ...bodyFont, fontSize: 12, color: 'var(--color-muted, #888)' }}>{rows.length} of {logRows.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => (
          <LogRow key={row.id} row={row} verticalNames={verticalNames} verticalColors={verticalColors} statusColors={statusColors} sendStatusColors={sendStatusColors} />
        ))}
      </div>
    </div>
  )
}

// ── Campaigns ─────────────────────────────────────────────────
const KIND_COLORS = { manual: '#888', autopilot: '#8a6520', followup: '#7c5cbf' }

function CampaignsPanel({ campaigns }) {
  if (!campaigns.length) {
    return <div style={{ ...bodyFont, textAlign: 'center', padding: '48px 0', fontSize: 14, color: 'var(--color-muted, #888)' }}>No campaigns sent yet.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {campaigns.map((c) => {
        const openRate = c.sent > 0 && c.opened != null ? Math.round((c.opened / c.sent) * 100) : null
        return (
          <div key={c.id} style={{ background: '#fff', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ ...bodyFont, fontSize: 14, fontWeight: 500, color: 'var(--color-ink, #2D2A26)' }}>{c.name || c.subject || c.id}</div>
                <div style={{ ...bodyFont, fontSize: 11, color: 'var(--color-muted, #888)', marginTop: 2 }}>
                  {c.id} · {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                </div>
              </div>
              {c.kind && c.kind !== 'manual' && <Chip color={KIND_COLORS[c.kind] || '#888'} filled>{c.kind}</Chip>}
              <Chip color="#5F8A7E">{c.sent} sent</Chip>
              {c.delivered != null && c.delivered > 0 && <Chip color="#6b8f85">{c.delivered} delivered</Chip>}
              {c.opened != null && c.opened > 0 && <Chip color="#7c9ec4">{c.opened} opened{openRate != null ? ` · ${openRate}%` : ''}</Chip>}
              {c.clicked != null && c.clicked > 0 && <Chip color="#3b82f6">{c.clicked} clicked</Chip>}
              {c.claims != null && c.claims > 0 && <Chip color="#5F8A7E" filled>{c.claims} claimed</Chip>}
              {c.failed > 0 && <Chip color="#c0392b">{c.failed} failed</Chip>}
              {c.skipped > 0 && <Chip color="#888">{c.skipped} skipped</Chip>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Suppressions ──────────────────────────────────────────────
function SuppressionsPanel() {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async (query = '') => {
    setError(null)
    try {
      const d = await fetchJson(`/api/admin/outreach/suppressions${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      setList(d.suppressions || [])
    } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!email.trim()) return
    setBusy(true); setError(null)
    try {
      await fetchJson('/api/admin/outreach/suppressions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      setEmail('')
      await load(q)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function remove(target) {
    if (!window.confirm(`Remove ${target} from the do-not-email list? They become contactable again.`)) return
    setBusy(true); setError(null)
    try {
      await fetchJson('/api/admin/outreach/suppressions', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      })
      await load(q)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const REASON_COLORS = { unsubscribed: '#888', bounced: '#c0392b', complained: '#c0392b', manual: '#8a6520' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          style={{ ...input, width: 220 }}
          placeholder="Search suppressed emails…"
          value={q}
          onChange={(e) => { setQ(e.target.value); load(e.target.value) }}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <input
            style={{ ...input, width: 240 }}
            placeholder="Add email to do-not-contact…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button style={btn} onClick={add} disabled={busy || !email.trim()}>Suppress</button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 14px', borderRadius: 6, marginBottom: 12, ...bodyFont, fontSize: 13, color: '#991B1B' }}>{error}</div>
      )}

      {!list ? (
        <div style={{ ...bodyFont, padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--color-muted, #888)' }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ ...bodyFont, padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--color-muted, #888)' }}>
          {q ? 'No suppressed emails match.' : 'The do-not-email list is empty.'}
        </div>
      ) : (
        <div style={{ ...card, background: '#fff' }}>
          {list.map((s) => (
            <div key={s.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: '1px solid var(--color-border, #eee)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...bodyFont, fontSize: 13, color: 'var(--color-ink, #2D2A26)' }}>{s.email}</div>
                {s.detail && <div style={{ ...bodyFont, fontSize: 11, color: 'var(--color-muted, #888)' }}>{s.detail}</div>}
              </div>
              <Chip color={REASON_COLORS[s.reason] || '#888'}>{s.reason}</Chip>
              <span style={{ ...bodyFont, fontSize: 11, color: 'var(--color-muted, #999)' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}</span>
              <button style={{ ...btn, padding: '3px 10px', fontSize: 11 }} onClick={() => remove(s.email)} disabled={busy}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <p style={{ ...bodyFont, fontSize: 11.5, color: 'var(--color-muted, #888)', marginTop: 10, lineHeight: 1.5 }}>
        Unsubscribes, bounces and spam complaints land here automatically and are never emailed again — by the autopilot or a manual batch.
      </p>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────
export default function OutreachActions({
  logRows, campaigns, verticalColors, verticalNames, statusColors, sendStatusColors, allStates, stats,
}) {
  const [tab, setTab] = useState('compose')

  const allVerticals = useMemo(() => Object.keys(verticalNames), [verticalNames])

  const tabStyle = (active) => ({
    ...bodyFont, fontSize: 13, fontWeight: 500,
    padding: '10px 20px', borderRadius: '6px 6px 0 0',
    border: '1px solid var(--color-border, #e5e5e5)',
    borderBottom: active ? '1px solid #fff' : '1px solid var(--color-border, #e5e5e5)',
    background: active ? '#fff' : 'var(--color-cream, #FAF8F5)',
    color: active ? 'var(--color-ink, #2D2A26)' : 'var(--color-muted, #888)',
    cursor: 'pointer', marginBottom: -1, position: 'relative', zIndex: active ? 1 : 0,
  })

  return (
    <div>
      <FunnelHeader stats={stats} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border, #e5e5e5)', marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('compose')} style={tabStyle(tab === 'compose')}>Compose &amp; Send</button>
        <button onClick={() => setTab('autopilot')} style={tabStyle(tab === 'autopilot')}>Autopilot</button>
        <button onClick={() => setTab('log')} style={tabStyle(tab === 'log')}>Activity ({logRows.length})</button>
        <button onClick={() => setTab('campaigns')} style={tabStyle(tab === 'campaigns')}>Campaigns ({campaigns.length})</button>
        <button onClick={() => setTab('suppressions')} style={tabStyle(tab === 'suppressions')}>Do-not-email</button>
      </div>

      {tab === 'compose' && (
        <ComposePanel
          verticalNames={verticalNames}
          verticalColors={verticalColors}
          sendStatusColors={sendStatusColors}
          allStates={allStates}
          allVerticals={allVerticals}
        />
      )}

      {tab === 'autopilot' && <AutopilotPanel />}

      {tab === 'log' && (
        <LogPanel
          logRows={logRows}
          verticalNames={verticalNames}
          verticalColors={verticalColors}
          statusColors={statusColors}
          sendStatusColors={sendStatusColors}
        />
      )}

      {tab === 'campaigns' && <CampaignsPanel campaigns={campaigns} />}

      {tab === 'suppressions' && <SuppressionsPanel />}
    </div>
  )
}
