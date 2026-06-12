'use client'

import { useState } from 'react'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const VERTICAL_COLORS = VERTICAL_ACCENTS

const SLOT_TYPE_LABELS = { general: 'General', new_producer: 'New Producer' }

const VERTICAL_OPTIONS = Object.keys(VERTICAL_NAMES)

// Plain-English copy for each non-success pipeline outcome.
const OUTCOME_COPY = {
  no_grounding_source: 'No source to ground against',
  insufficient_data: 'Sources too thin for a pitch',
  bail_token_detected: 'Model returned a placeholder',
  llm_error: 'The model call failed',
  fact_check_failed: 'Draft failed fact-check',
  verification_failed: 'Draft failed prose verification',
}

export default function ManualPitch() {
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [listingRef, setListingRef] = useState('')
  const [vertical, setVertical] = useState('')
  const [slotType, setSlotType] = useState('general')

  const [phase, setPhase] = useState('idle') // idle | researching | done | error
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const researching = phase === 'researching'

  async function research(e) {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg('A place name is required.')
      setPhase('error')
      return
    }
    setPhase('researching')
    setErrorMsg(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/pitches/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'research',
          name: name.trim(),
          website: website.trim(),
          listingRef: listingRef.trim(),
          vertical: vertical || undefined,
          slotType,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(d.error || 'Research failed.')
        setPhase('error')
        return
      }
      setResult(d.result || null)
      setPhase('done')
    } catch (err) {
      setErrorMsg(err.message || 'Network error.')
      setPhase('error')
    }
  }

  function reset() {
    setResult(null)
    setErrorMsg(null)
    setPhase('idle')
  }

  return (
    <div>
      <form onSubmit={research} style={cardStyle}>
        <Field label="Place name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pialligo Estate"
            disabled={researching}
            style={inputStyle}
          />
        </Field>

        <Field label="Website" hint="Researched first-party for grounded facts. Optional, but the richest source.">
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com.au"
            disabled={researching}
            style={inputStyle}
          />
        </Field>

        <Field label="Atlas listing" hint="Optional. Paste a place URL, slug, or listing id — its fields become a second grounding source.">
          <input
            type="text"
            value={listingRef}
            onChange={(e) => setListingRef(e.target.value)}
            placeholder="slug, /place/… URL, or listing id"
            disabled={researching}
            style={inputStyle}
          />
        </Field>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Field label="Vertical" hint="Used to file the kept story. A matched listing overrides this." style={{ flex: '1 1 220px' }}>
            <select value={vertical} onChange={(e) => setVertical(e.target.value)} disabled={researching} style={inputStyle}>
              <option value="">— auto / none —</option>
              {VERTICAL_OPTIONS.map((v) => (
                <option key={v} value={v}>{VERTICAL_NAMES[v]}</option>
              ))}
            </select>
          </Field>

          <Field label="Slot type" style={{ flex: '1 1 220px' }}>
            <select value={slotType} onChange={(e) => setSlotType(e.target.value)} disabled={researching} style={inputStyle}>
              <option value="general">{SLOT_TYPE_LABELS.general}</option>
              <option value="new_producer">{SLOT_TYPE_LABELS.new_producer}</option>
            </select>
          </Field>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <button
            type="submit"
            disabled={researching}
            style={{
              height: 40, padding: '0 22px', borderRadius: 9, border: 'none',
              cursor: researching ? 'default' : 'pointer',
              background: 'var(--color-ink)', color: '#fff',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
              opacity: researching ? 0.65 : 1,
            }}
          >
            {researching ? 'Researching…' : 'Research pitch'}
          </button>
          {researching && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)' }}>
              Fetching the site, drafting, fact-checking, and verifying — this can take up to a minute.
            </span>
          )}
        </div>
      </form>

      {phase === 'error' && errorMsg && (
        <div style={{ margin: '18px 0 0', padding: '12px 14px', background: '#FCEDEA', border: '1px solid #C4634F55', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 13, color: '#9A3A2A' }}>
          {errorMsg}
        </div>
      )}

      {phase === 'done' && result && (
        <div style={{ marginTop: 24 }}>
          <ResultView result={result} name={name} formVertical={vertical} onDiscard={reset} />
        </div>
      )}
    </div>
  )
}

// ─── Result switch ──────────────────────────────────────────
function ResultView({ result, name, formVertical, onDiscard }) {
  if (result.kind === 'researched_pitch') {
    return <ResearchedPitch result={result} name={name} formVertical={formVertical} onDiscard={onDiscard} />
  }
  return <OutcomePanel result={result} onDiscard={onDiscard} />
}

// ─── Success: a grounded, gated pitch ───────────────────────
function ResearchedPitch({ result, name, formVertical, onDiscard }) {
  const pitch = result.pitch_data || {}
  const L = result.sources?.listing || null
  const effVertical = L?.vertical || formVertical || null
  const color = (effVertical && VERTICAL_COLORS[effVertical]) || 'var(--color-ink)'

  const [keepStatus, setKeepStatus] = useState('idle') // idle | keeping | kept | error
  const [keepError, setKeepError] = useState(null)

  async function keep() {
    if (keepStatus === 'keeping' || keepStatus === 'kept') return
    setKeepStatus('keeping')
    setKeepError(null)
    try {
      const res = await fetch('/api/admin/pitches/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'keep',
          name: name.trim(),
          vertical: effVertical || undefined,
          listingId: L?.id || undefined,
          region: L?.region || undefined,
          pitch,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setKeepError(d.error || 'Keep failed.')
        setKeepStatus('error')
        return
      }
      setKeepStatus('kept')
    } catch (err) {
      setKeepError(err.message || 'Network error.')
      setKeepStatus('error')
    }
  }

  const facts = Array.isArray(pitch.verified_facts) ? pitch.verified_facts : []
  const research = Array.isArray(pitch.research_needed) ? pitch.research_needed : []
  const pages = Array.isArray(result.sources?.pages) ? result.sources.pages : []
  const fetchErrors = Array.isArray(result.sources?.fetch_errors) ? result.sources.fetch_errors : []

  return (
    <div style={{ ...resultCardStyle, border: `1px solid ${color}28` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 20px', background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ padding: '2px 10px', borderRadius: 6, background: color + '1A', border: `1px solid ${color}55`, color, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11, letterSpacing: '0.02em' }}>
          {effVertical ? (VERTICAL_NAMES[effVertical] || effVertical) : 'Unfiled'}
        </span>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
          {SLOT_TYPE_LABELS[result.slot_type] || result.slot_type}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11, color: '#4A7C59' }}>
          ✓ fact-checked · ✓ verified
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '18px 20px 4px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21, color: 'var(--color-ink)', lineHeight: 1.25, margin: '0 0 8px' }}>
          {pitch.headline || <span style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>No headline</span>}
        </h2>
        {pitch.angle && (
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.55, margin: '0 0 10px' }}>
            {pitch.angle}
          </p>
        )}
        {pitch.editorial_framing && (
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 12px', fontStyle: 'italic' }}>
            {pitch.editorial_framing}
          </p>
        )}

        {facts.length > 0 && <FactsBlock facts={facts} color={color} />}

        {research.length > 0 && (
          <div style={{ margin: '4px 0 12px' }}>
            <SmallLabel>Research needed</SmallLabel>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              {research.map((r, i) => (
                <li key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-ink)', lineHeight: 1.5, marginBottom: 2 }}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Sources */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: '6px 0 2px' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>Grounded on:</span>
          {L && <span>{L.name || 'Atlas listing'}{L.region ? ` · ${L.region}` : ''}</span>}
          {pages.length > 0 && (
            <span>{L ? '· ' : ''}{pages.length} website page{pages.length === 1 ? '' : 's'}</span>
          )}
          {!L && pages.length === 0 && <span>—</span>}
        </div>
        {pages.length > 0 && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: 4 }}>
            {pages.map((p, i) => (
              <span key={i}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color, textDecoration: 'underline' }}>{shortUrl(p.url)}</a>
                {i < pages.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </div>
        )}
        {fetchErrors.length > 0 && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#9A6A2A', marginBottom: 4 }}>
            {fetchErrors.length} page{fetchErrors.length === 1 ? '' : 's'} could not be fetched.
          </div>
        )}
      </div>

      {keepError && (
        <div style={{ margin: '0 20px 12px', padding: '8px 12px', background: '#FCEDEA', border: '1px solid #C4634F55', borderRadius: 6, fontFamily: 'var(--font-body)', fontSize: 12, color: '#9A3A2A' }}>
          {keepError}
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--color-border)', background: '#fff' }}>
        {keepStatus === 'kept' ? (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: '#4A7C59' }}>
            ✓ Kept — opened in the Editorial queue (In Progress).
          </span>
        ) : (
          <>
            <button
              onClick={keep}
              disabled={keepStatus === 'keeping'}
              style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', cursor: keepStatus === 'keeping' ? 'default' : 'pointer', background: '#4A7C59', color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, opacity: keepStatus === 'keeping' ? 0.6 : 1, boxShadow: '0 1px 3px rgba(74,124,89,0.3)' }}
            >
              {keepStatus === 'keeping' ? 'Keeping…' : 'Keep — add to Editorial (In Progress)'}
            </button>
            <button
              onClick={onDiscard}
              disabled={keepStatus === 'keeping'}
              style={{ height: 36, padding: '0 14px', borderRadius: 8, cursor: keepStatus === 'keeping' ? 'default' : 'pointer', background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, opacity: keepStatus === 'keeping' ? 0.6 : 1 }}
            >
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Verified facts, with per-fact source provenance ────────
function FactsBlock({ facts, color }) {
  return (
    <div style={{ margin: '4px 0 12px', padding: '10px 12px', background: '#FAFAF7', border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <SmallLabel>Verified facts ({facts.length})</SmallLabel>
      <ul style={{ margin: '6px 0 0', paddingLeft: 16, listStyle: 'disc' }}>
        {facts.map((f, i) => {
          const isWeb = f?.source === 'website'
          return (
            <li key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-ink)', lineHeight: 1.5, marginBottom: 5 }}>
              {typeof f === 'string' ? f : (f.claim || JSON.stringify(f))}
              {f && typeof f === 'object' && (
                <div style={{ marginTop: 1 }}>
                  {isWeb ? (
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      <SourceTag kind="website" color={color} />
                      {f.url && (
                        <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color, textDecoration: 'underline', marginLeft: 4 }}>{shortUrl(f.url)} ↗</a>
                      )}
                      {f.excerpt && <span style={{ fontStyle: 'italic' }}>{' '}— “{f.excerpt}”</span>}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      <SourceTag kind="listing" color={color} />
                      {f.field != null && <span style={{ marginLeft: 4 }}>{f.field}: {String(f.value)}</span>}
                    </span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SourceTag({ kind, color }) {
  const isWeb = kind === 'website'
  return (
    <span style={{ display: 'inline-block', padding: '0px 6px', borderRadius: 4, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: isWeb ? color + '18' : '#00000010', color: isWeb ? color : 'var(--color-muted)', border: `1px solid ${isWeb ? color + '44' : 'var(--color-border)'}` }}>
      {isWeb ? 'website' : 'listing'}
    </span>
  )
}

// ─── Non-success outcomes ───────────────────────────────────
function OutcomePanel({ result, onDiscard }) {
  const title = OUTCOME_COPY[result.kind] || 'No pitch produced'
  const rejected = result.pitch_data && typeof result.pitch_data === 'object' ? result.pitch_data : null

  return (
    <div style={{ ...resultCardStyle, border: '1px solid #C49A3C44' }}>
      <div style={{ padding: '14px 20px', background: '#FBF6EA', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: '#8A6A1E' }}>{title}</div>
      </div>

      <div style={{ padding: '16px 20px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.6 }}>
        {result.kind === 'no_grounding_source' && <p style={{ margin: 0 }}>{result.note}</p>}
        {result.kind === 'insufficient_data' && (
          <p style={{ margin: 0 }}>The model judged the sources too thin to ground a complete pitch. <em>{result.reason}</em></p>
        )}
        {result.kind === 'bail_token_detected' && (
          <p style={{ margin: 0 }}>The draft contained a placeholder rather than real content, so it was rejected. No pitch was produced.</p>
        )}
        {result.kind === 'llm_error' && (
          <p style={{ margin: 0 }}>The model call failed: <em>{result.error}</em></p>
        )}
        {result.kind === 'fact_check_failed' && (
          <FailList
            lead="The draft made claims that did not trace back to the listing or website, even after a revision. Nothing was kept."
            items={(result.failed_claims || []).map((c) => ({
              text: (c.fact && (c.fact.claim || c.fact)) || c.claim || 'claim',
              reason: c.reason,
            }))}
          />
        )}
        {result.kind === 'verification_failed' && (
          <FailList
            lead={result.verify_error
              ? 'The verification step errored, so the pitch was failed closed and nothing was kept.'
              : 'The prose made claims the sources do not literally support (a derivation, inference, or recombination), even after a revision. Nothing was kept.'}
            items={(result.flags || []).map((f) => ({ text: f.claim, reason: f.reason }))}
          />
        )}

        {rejected && (
          <div style={{ marginTop: 14 }}>
            <SmallLabel>Rejected draft (not verified — shown for context)</SmallLabel>
            <div style={{ marginTop: 6, padding: 12, background: '#FAFAF7', border: '1px dashed var(--color-border)', borderRadius: 8, opacity: 0.85 }}>
              {rejected.headline && <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)', marginBottom: 6 }}>{rejected.headline}</div>}
              {rejected.angle && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-muted)', lineHeight: 1.55 }}>{rejected.angle}</p>}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--color-border)', background: '#fff' }}>
        <button
          onClick={onDiscard}
          style={{ height: 36, padding: '0 16px', borderRadius: 8, cursor: 'pointer', background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13 }}
        >
          ← Adjust and try again
        </button>
      </div>
    </div>
  )
}

function FailList({ lead, items }) {
  return (
    <div>
      <p style={{ margin: '0 0 8px' }}>{lead}</p>
      {items.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {items.map((it, i) => (
            <li key={i} style={{ fontSize: 12.5, color: 'var(--color-ink)', lineHeight: 1.5, marginBottom: 4 }}>
              {it.text}{it.reason ? <span style={{ color: 'var(--color-muted)' }}> — {it.reason}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Small presentational helpers ───────────────────────────
function Field({ label, hint, required, style, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14, ...style }}>
      <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12.5, color: 'var(--color-ink)', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#C4634F' }}> *</span>}
      </span>
      {children}
      {hint && (
        <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11.5, color: 'var(--color-muted)', marginTop: 3, lineHeight: 1.4 }}>
          {hint}
        </span>
      )}
    </label>
  )
}

function SmallLabel({ children }) {
  return (
    <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
      {children}
    </div>
  )
}

function shortUrl(url) {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : '')
  } catch {
    return url
  }
}

const cardStyle = {
  background: '#fff',
  border: '1px solid var(--color-border)',
  borderRadius: 16,
  padding: '20px 22px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
}

const resultCardStyle = {
  position: 'relative',
  borderRadius: 16,
  background: '#fff',
  overflow: 'hidden',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  fontFamily: 'var(--font-body)',
  fontSize: 13.5,
  color: 'var(--color-ink)',
  background: '#fff',
}
