'use client'

import { useState, useEffect, useCallback } from 'react'
import { INTAKE_FIELDS, STORY_QUESTIONS } from '@/lib/operator-intake/voice.mjs'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const STATUS_LABELS = {
  pending_review: 'Awaiting admin review',
  approved: 'Published',
  rejected: 'Sent back',
  superseded: 'Replaced by a newer draft',
}
const STATUS_COLORS = {
  pending_review: '#C49A3C', approved: '#4A7C59', rejected: '#C4634F', superseded: 'var(--color-muted)',
}

// Map a stored operator_facts row onto the editable form shape.
function factsToForm(facts) {
  const f = {}
  for (const field of INTAKE_FIELDS) {
    const v = facts?.[field.key]
    if (field.type === 'list') f[field.key] = Array.isArray(v) ? v.join('\n') : ''
    else if (field.type === 'year') f[field.key] = v == null ? '' : String(v)
    else f[field.key] = typeof v === 'string' ? v : ''
  }
  return f
}

export default function DashboardDescription() {
  const [myListings, setMyListings] = useState([])
  const [listingId, setListingId] = useState(null)
  const [form, setForm] = useState(() => factsToForm(null))
  // Guided-interview answers (the old "Your Story" page, now part of this
  // workspace) — keyed by STORY_QUESTIONS ids, saved alongside the facts.
  const [storyAnswers, setStoryAnswers] = useState({})
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async (id) => {
    setLoading(true); setError(null)
    try {
      const qs = id ? `?listingId=${encodeURIComponent(id)}` : ''
      const r = await fetch(`/api/dashboard/description${qs}`)
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not load.'); return }
      setMyListings(data.myListings || [])
      setListingId(data.listingId || id || data.myListings?.[0]?.id || null)
      setForm(factsToForm(data.facts))
      setStoryAnswers(data.storyAnswers || {})
      setDrafts(data.drafts || [])
    } catch {
      setError('Could not load your description workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(null) }, [load])

  const onSelectListing = (id) => { setListingId(id); load(id) }
  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const saveFacts = async () => {
    if (!listingId) return null
    setSaving(true); setError(null); setNotice(null)
    try {
      const r = await fetch('/api/dashboard/description', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, ...form, story_answers: storyAnswers }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not save.'); return null }
      setForm(factsToForm(data.facts))
      if (data.storyAnswers) setStoryAnswers(data.storyAnswers)
      setNotice('Facts saved.')
      return data.facts
    } catch { setError('Network error while saving.'); return null }
    finally { setSaving(false) }
  }

  const generate = async () => {
    if (!listingId || generating) return
    // Always persist the latest edits before generating from them.
    const saved = await saveFacts()
    if (!saved) return
    setGenerating(true); setError(null); setNotice(null)
    try {
      const r = await fetch('/api/dashboard/description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, action: 'generate' }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Generation failed.'); return }
      await load(listingId)
      setNotice(data.generation?.ok
        ? 'Draft generated and sent for admin review.'
        : 'Draft generated, but it needs a look before it can be published — the admin will see the flags.')
    } catch { setError('Network error during generation.') }
    finally { setGenerating(false) }
  }

  // Inline change-request form (replaces window.prompt). The note is what our
  // editors hand to the rewrite agent, so 'request_changes' requires one.
  const [flagOpen, setFlagOpen] = useState(null) // null | 'request_changes' | 'flag_error'
  const [flagNote, setFlagNote] = useState('')
  const [flagSending, setFlagSending] = useState(false)

  const sendFlag = async (draftId) => {
    if (flagSending) return
    setFlagSending(true); setError(null); setNotice(null)
    try {
      const r = await fetch('/api/dashboard/description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, action: flagOpen, draftId, note: flagNote }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not send.'); return }
      setFlagOpen(null); setFlagNote('')
      await load(listingId)
      setNotice('Sent to our editors — they’ll rework the draft from your note.')
    } catch { setError('Network error.') }
    finally { setFlagSending(false) }
  }

  const latest = drafts[0] || null
  // Lead with the free-text request; keep the structured facts below it.
  const coverageField = INTAKE_FIELDS.find(f => f.key === 'coverage_request')
  const factFields = INTAKE_FIELDS.filter(f => f.key !== 'coverage_request')
  const currentListing = myListings.find(l => l.id === listingId) || null
  const hasDescription = Boolean(currentListing?.description) || drafts.length > 0
  const primaryLabel = hasDescription ? 'Request a rewrite' : 'Request my description'

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
          Your Description
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--color-muted)', margin: 0, maxWidth: 640 }}>
          Tell us what you’d like your listing to say — the things you want written about and anything to add —
          along with a few key facts. We write it in the Atlas voice and send it for a quick editorial check before
          it goes live. We only ever write from what you tell us.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="notice">{notice}</Banner>}

      {myListings.length > 1 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Label>Editing the description for</Label>
          <select value={listingId || ''} onChange={e => onSelectListing(e.target.value)}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)', minWidth: 260 }}>
            {myListings.map(l => (
              <option key={l.id} value={l.id}>{l.name} ({VERTICAL_LABELS[l.vertical] || l.vertical})</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <Skeleton />
      ) : !listingId ? (
        <EmptyState title="No claimed listing yet"
          body="Claim your listing to submit the facts we use to write your description." />
      ) : (
        <>
          {/* Rewrite request — lead with what the operator wants, in their words */}
          {coverageField && (
            <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
                {hasDescription ? 'Request a rewrite' : 'What you’d like written'}
              </h2>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--color-muted)', margin: '0 0 1rem', lineHeight: 1.5 }}>
                {hasDescription
                  ? 'Want something changed or added? Tell us here — what to mention, what to add, what to drop — and we’ll rewrite it in the Atlas voice.'
                  : 'Start here. Tell us what you want your listing to say.'}
              </p>
              <FactField field={coverageField} value={form.coverage_request} onChange={v => setField('coverage_request', v)} />
            </section>
          )}

          {/* Key facts — the grounding details we write from */}
          <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
              The facts
            </h2>
            {factFields.map(field => (
              <FactField key={field.key} field={field} value={form[field.key]} onChange={v => setField(field.key, v)} />
            ))}
          </section>

          {/* Your story — the guided interview, in the operator's own words.
              Optional grounding: anything answered here can be woven into the
              description, through the same editorial check as everything else. */}
          <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
              Your story · optional
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--color-muted)', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
              A few questions in your own words. Answer any that suit — what you write here can be woven
              into your description, and we still only ever write from what you tell us.
            </p>
            {STORY_QUESTIONS.map(({ key, q }) => (
              <div key={key} style={{ marginBottom: '1.1rem' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '0.3rem' }}>{q}</label>
                <textarea
                  value={storyAnswers[key] || ''}
                  onChange={e => setStoryAnswers(prev => ({ ...prev, [key]: e.target.value }))}
                  rows={2}
                  maxLength={800}
                  placeholder="In your own words…"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            ))}
          </section>

          <div style={{ display: 'flex', gap: 10, margin: '0 0 1.5rem', flexWrap: 'wrap' }}>
            <button onClick={saveFacts} disabled={saving || generating}
              style={btn('ghost', saving || generating)}>
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button onClick={generate} disabled={saving || generating}
              style={btn('primary', saving || generating)}>
              {generating ? 'Writing…' : primaryLabel}
            </button>
          </div>

          {/* Latest draft */}
          {latest && (
            <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: '0.75rem' }}>
                <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: 0 }}>
                  Latest draft · v{latest.version}
                </h2>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', fontWeight: 600, color: STATUS_COLORS[latest.status] || 'var(--color-muted)' }}>
                  {STATUS_LABELS[latest.status] || latest.status}
                </span>
              </div>

              <DraftText text={latest.approved_text || latest.generated_text} />

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '1rem 0 0' }}>
                <Chip ok={latest.source_binding_passed} label={latest.source_binding_passed ? 'Every detail traces to your facts' : 'Some details not in your facts'} />
                <Chip ok={latest.banned_phrase_passed} label={latest.banned_phrase_passed ? 'Voice check passed' : 'Voice check flagged'} />
              </div>

              {latest.status === 'rejected' && latest.admin_note && (
                <Banner kind="notice"><strong>From the editor:</strong> {latest.admin_note}</Banner>
              )}

              {latest.status === 'pending_review' && !flagOpen && (
                <div style={{ display: 'flex', gap: 8, marginTop: '1rem', flexWrap: 'wrap' }}>
                  <button onClick={() => { setFlagOpen('request_changes'); setFlagNote('') }} style={btn('ghost', false)}>
                    Request changes
                  </button>
                  <button onClick={() => { setFlagOpen('flag_error'); setFlagNote('') }} style={btn('ghost', false)}>
                    Flag an error
                  </button>
                </div>
              )}
              {latest.status === 'pending_review' && flagOpen && (
                <div style={{ marginTop: '1rem', padding: '0.9rem 1rem', background: '#FFFDF7', border: '1px solid #C49A3C55', borderRadius: 10 }}>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.4rem' }}>
                    {flagOpen === 'flag_error' ? 'What’s wrong with this draft?' : 'What would you like changed?'}
                  </p>
                  <textarea value={flagNote} onChange={e => setFlagNote(e.target.value)} rows={3}
                    placeholder={flagOpen === 'flag_error'
                      ? 'e.g. We don’t serve lunch on Sundays — that line is wrong. (optional)'
                      : 'e.g. Lead with the courtyard, drop the mention of the old owners…'}
                    style={{ ...inputStyle, resize: 'vertical' }} />
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)', margin: '0.35rem 0 0.6rem' }}>
                    Our editors rework the draft from this note, so the more specific the better. Nothing changes on your live page until they publish.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => sendFlag(latest.id)}
                      disabled={flagSending || (flagOpen === 'request_changes' && !flagNote.trim())}
                      style={btn('primary', flagSending || (flagOpen === 'request_changes' && !flagNote.trim()))}>
                      {flagSending ? 'Sending…' : 'Send to our editors'}
                    </button>
                    <button onClick={() => { setFlagOpen(null); setFlagNote('') }} disabled={flagSending} style={btn('ghost', flagSending)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {latest.operator_action && (
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.75rem 0 0' }}>
                  You {latest.operator_action === 'flagged_error' ? 'flagged an error' : 'requested changes'} on this draft.
                </p>
              )}
            </section>
          )}

          {/* History */}
          {drafts.length > 1 && (
            <section>
              <Label>Earlier drafts</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {drafts.slice(1).map(d => (
                  <div key={d.id} style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.6rem 0.9rem', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--color-ink)' }}>v{d.version}</span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: STATUS_COLORS[d.status] || 'var(--color-muted)' }}>
                      {STATUS_LABELS[d.status] || d.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function FactField({ field, value, onChange }) {
  const emph = field.emphasised
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600, color: emph ? 'var(--color-ink)' : 'var(--color-ink)', marginBottom: '0.3rem' }}>
        {field.label}
        {field.required && <span style={{ color: '#C4634F' }}> *</span>}
        {emph && <span style={{ marginLeft: 8, fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#C49A3C' }}>Important</span>}
      </label>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0 0 0.4rem' }}>{field.help}</p>
      {field.type === 'paragraph' || field.type === 'list' ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={field.type === 'list' ? 3 : 4}
          placeholder={field.type === 'list' ? 'One per line' : ''}
          style={{ ...inputStyle, resize: 'vertical', borderColor: emph ? '#C49A3C' : 'var(--color-border)' }} />
      ) : field.type === 'year' ? (
        <input type="number" inputMode="numeric" value={value} onChange={e => onChange(e.target.value)} min={1500} max={2100} placeholder="e.g. 1923"
          style={{ ...inputStyle, maxWidth: 160 }} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  )
}

function DraftText({ text }) {
  const paras = String(text || '').split('\n').map(p => p.trim()).filter(Boolean)
  return (
    <div>
      {paras.map((p, i) => (
        <p key={i} style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', lineHeight: 1.6, color: 'var(--color-ink)', margin: '0 0 0.75rem' }}>{p}</p>
      ))}
    </div>
  )
}

function Chip({ ok, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: '0.74rem', fontWeight: 600, padding: '0.25rem 0.6rem', borderRadius: 20, color: ok ? '#4A7C59' : '#C4634F', background: ok ? '#4A7C5915' : '#C4634F15', border: `1px solid ${ok ? '#4A7C5944' : '#C4634F44'}` }}>
      {ok ? '✓' : '!'} {label}
    </span>
  )
}

function Banner({ kind, children }) {
  const err = kind === 'error'
  return (
    <div style={{ background: err ? '#fef2f2' : '#f0f7f2', border: `1px solid ${err ? '#fca5a5' : '#9ec9af'}`, color: err ? '#c62828' : '#2f6b45', borderRadius: 10, padding: '0.75rem 1rem', margin: '0 0 1.25rem', fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}>
      {children}
    </div>
  )
}

function Label({ children }) {
  return (
    <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>
      {children}
    </label>
  )
}

function EmptyState({ title, body }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '2rem', textAlign: 'center' }}>
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', color: 'var(--color-ink)', margin: '0 0 0.375rem' }}>{title}</p>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.825rem', color: 'var(--color-muted)', margin: '0 auto', maxWidth: 460 }}>{body}</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem' }}>
      <div style={{ width: '40%', height: 12, background: 'var(--color-border)', borderRadius: 4, marginBottom: '1rem' }} />
      <div style={{ width: '100%', height: 10, background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
      <div style={{ width: '80%', height: 10, background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

const inputStyle = {
  fontFamily: 'var(--font-sans)', fontSize: '0.9rem', padding: '0.55rem 0.75rem',
  borderRadius: 8, border: '1px solid var(--color-border)', width: '100%',
  boxSizing: 'border-box', outline: 'none', color: 'var(--color-ink)', background: '#fff',
}

function btn(kind, disabled) {
  const base = {
    fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600,
    padding: '0.55rem 1.1rem', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
  if (kind === 'primary') return { ...base, border: 'none', background: 'var(--color-sage, #4A7C59)', color: '#fff' }
  return { ...base, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)' }
}
