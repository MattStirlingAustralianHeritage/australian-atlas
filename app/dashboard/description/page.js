'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { INTAKE_FIELDS, STORY_QUESTIONS, AUTHORSHIP_LABELS, OWNER_TEXT_LIMITS } from '@/lib/operator-intake/voice.mjs'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const STATUS_LABELS = {
  pending_review: 'With our editors',
  approved: 'Published',
  rejected: 'Sent back',
  superseded: 'Replaced by a newer draft',
}
const STATUS_COLORS = {
  pending_review: '#C49A3C', approved: '#4A7C59', rejected: '#C4634F', superseded: 'var(--color-muted)',
}

const AMBER = '#C49A3C'
const SAGE = '#4A7C59'

// The Atlas interview, grouped into numbered movements. Keys reference
// INTAKE_FIELDS so labels/help stay defined in one place (voice.mjs).
const INTERVIEW_SECTIONS = [
  {
    num: '01',
    title: 'The essentials',
    sub: 'The two facts every description is built on.',
    keys: ['building_description', 'what_you_book'],
  },
  {
    num: '02',
    title: 'The texture',
    sub: 'The material detail that makes it yours. Skip anything that doesn’t apply.',
    keys: ['design_fitting_detail', 'where_it_sits', 'established_year', 'products_operators_named'],
  },
  {
    num: '03',
    title: 'In your own words',
    sub: 'A short interview. Answer any that suit — lines from here get woven in.',
    keys: [], // story questions render here
  },
  {
    num: '04',
    title: 'Anything we should know',
    sub: 'What you want covered, and anything that has changed.',
    keys: ['coverage_request', 'ownership_transition_note'],
  },
]

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

function wordCount(text) {
  const t = String(text || '').trim()
  return t ? t.split(/\s+/).length : 0
}

export default function DashboardDescription() {
  const [myListings, setMyListings] = useState([])
  const [listingId, setListingId] = useState(null)
  const [form, setForm] = useState(() => factsToForm(null))
  // Guided-interview answers — keyed by STORY_QUESTIONS ids, saved with the facts.
  const [storyAnswers, setStoryAnswers] = useState({})
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [submittingOwn, setSubmittingOwn] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Which path the operator is on: null (nothing chosen yet) | 'owner' | 'atlas'.
  // A deliberate click always wins; otherwise the latest draft's authorship is
  // the natural default when they come back.
  const [mode, setModeState] = useState(null)
  const modeChosenRef = useRef(false)
  const setMode = (m) => { modeChosenRef.current = true; setModeState(m) }

  const [ownerText, setOwnerText] = useState('')

  const load = useCallback(async (id, { keepMode = false } = {}) => {
    setLoading(true); setError(null)
    try {
      const qs = id ? `?listingId=${encodeURIComponent(id)}` : ''
      const r = await fetch(`/api/dashboard/description${qs}`)
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not load.'); return }
      const nextDrafts = data.drafts || []
      setMyListings(data.myListings || [])
      setListingId(data.listingId || id || data.myListings?.[0]?.id || null)
      setForm(factsToForm(data.facts))
      setStoryAnswers(data.storyAnswers || {})
      setDrafts(nextDrafts)
      // Prefill the writing surface with their most recent own words.
      const ownerDraft = nextDrafts.find(d => d.authorship === 'owner')
      setOwnerText(ownerDraft ? (ownerDraft.approved_text || ownerDraft.generated_text || '') : '')
      if (!keepMode || !modeChosenRef.current) {
        setModeState(nextDrafts[0]?.authorship || null)
        modeChosenRef.current = false
      }
    } catch {
      setError('Could not load your description workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(null) }, [load])

  const onSelectListing = (id) => { setListingId(id); modeChosenRef.current = false; load(id) }
  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const saveFacts = async ({ quiet = false } = {}) => {
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
      if (!quiet) setNotice('Progress saved.')
      return data.facts
    } catch { setError('Network error while saving.'); return null }
    finally { setSaving(false) }
  }

  const generate = async () => {
    if (!listingId || generating) return
    // Always persist the latest edits before generating from them.
    const saved = await saveFacts({ quiet: true })
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
      await load(listingId, { keepMode: true })
      setNotice(data.generation?.ok
        ? 'Atlas has written your draft — it’s below, and with our editors for a quick check.'
        : 'Atlas has written a draft, but it needs an editor’s look before it can be published — they’ll see the flags.')
    } catch { setError('Network error during generation.') }
    finally { setGenerating(false) }
  }

  const submitOwn = async () => {
    if (!listingId || submittingOwn) return
    setSubmittingOwn(true); setError(null); setNotice(null)
    try {
      const r = await fetch('/api/dashboard/description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, action: 'submit_own', text: ownerText }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not submit.'); return }
      await load(listingId, { keepMode: true })
      setNotice('Your words are with our editors for a quick once-over — then they’re live, credited to you.')
    } catch { setError('Network error while submitting.') }
    finally { setSubmittingOwn(false) }
  }

  // Inline change-request form for pending Atlas drafts. The note is what our
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
      await load(listingId, { keepMode: true })
      setNotice('Sent to our editors — they’ll rework the draft from your note.')
    } catch { setError('Network error.') }
    finally { setFlagSending(false) }
  }

  const latest = drafts[0] || null
  const currentListing = myListings.find(l => l.id === listingId) || null
  const hasDescription = Boolean(currentListing?.description)
  // The byline on the live copy: the latest approved draft is what published it.
  const liveDraft = drafts.find(d => d.status === 'approved') || null
  const liveAuthorship = hasDescription ? (liveDraft?.authorship || null) : null

  const fieldByKey = Object.fromEntries(INTAKE_FIELDS.map(f => [f.key, f]))
  const sectionFilled = (section) => {
    if (section.num === '03') return STORY_QUESTIONS.some(({ key }) => (storyAnswers[key] || '').trim())
    return section.keys.some(k => (form[k] || '').trim())
  }

  const ownerWords = wordCount(ownerText)
  const ownerChars = ownerText.trim().length
  const ownerTooShort = ownerChars < OWNER_TEXT_LIMITS.minChars
  const ownerTooLong = ownerChars > OWNER_TEXT_LIMITS.maxChars

  return (
    <div>
      <style>{descStyles}</style>

      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
          Your Description
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--color-muted)', margin: 0, maxWidth: 640, lineHeight: 1.55 }}>
          The paragraph readers see first on your page. Write it yourself, or let Atlas write it
          from what you tell us — either way our editors give it a quick check before it goes live.
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
          body="Claim your listing to write — or have Atlas write — the description on your page." />
      ) : (
        <>
          {/* ── What's live right now ─────────────────────────────────────── */}
          {hasDescription && (
            <section style={{ ...card, padding: '1.5rem', marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <h2 style={sectionHeading}>Live on your page</h2>
                {liveAuthorship && <BylineChip authorship={liveAuthorship} />}
              </div>
              <DraftText text={currentListing.description} muted />
            </section>
          )}

          {/* ── The choice ────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.35rem' }}>
              {hasDescription ? 'How would you like it rewritten?' : 'How would you like it written?'}
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0 0 1rem', lineHeight: 1.5 }}>
              Two ways to the same place — a description that’s true to you, checked by our editors.
              You can switch paths any time.
            </p>

            <div className="descv2-chooser">
              <PathCard
                active={mode === 'owner'}
                onClick={() => setMode('owner')}
                icon={<PenIcon />}
                title="Write it yourself"
                blurb="You know the place better than anyone. Your words, published verbatim, credited to you."
                byline="owner"
              />
              <PathCard
                active={mode === 'atlas'}
                onClick={() => setMode('atlas')}
                icon={<SparkIcon />}
                title="Let Atlas write it"
                blurb="Answer a few questions and Atlas writes bespoke copy in the house voice — from your facts, nothing invented."
                byline="atlas"
              />
            </div>
          </div>

          {/* ── Path A — the operator's own words ─────────────────────────── */}
          {mode === 'owner' && (
            <section style={{ ...card, padding: '1.5rem', marginBottom: '1.75rem' }}>
              <h2 style={sectionHeading}>In your own words</h2>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--color-muted)', margin: '0.4rem 0 1rem', lineHeight: 1.55 }}>
                Say what the place is, what a visitor actually books or buys, and what a first-timer
                should know. Plain and specific beats polished — it reads in the typeface below,
                exactly as it will on your page.
              </p>

              <textarea
                className="descv2-paper"
                value={ownerText}
                onChange={e => setOwnerText(e.target.value)}
                rows={9}
                maxLength={OWNER_TEXT_LIMITS.maxChars + 200}
                placeholder="A 1923 red-brick warehouse on Gertrude Street… we make small-batch gin on a copper still you can see from the bar…"
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0.6rem 0 1rem' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: ownerTooLong ? '#C4634F' : 'var(--color-muted)' }}>
                  {ownerWords} {ownerWords === 1 ? 'word' : 'words'} · most read best at 60–180
                  {ownerTooLong && ` · over the ${OWNER_TEXT_LIMITS.maxChars}-character limit`}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                  Appears on your page as <BylineChip authorship="owner" />
                </span>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={submitOwn} disabled={submittingOwn || ownerTooShort || ownerTooLong}
                  style={btn('primary', submittingOwn || ownerTooShort || ownerTooLong)}>
                  {submittingOwn ? 'Sending…' : 'Submit for review'}
                </button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                  A quick editorial once-over — then it’s live.
                </span>
              </div>
            </section>
          )}

          {/* ── Path B — the Atlas interview ──────────────────────────────── */}
          {mode === 'atlas' && (
            <>
              {INTERVIEW_SECTIONS.map(section => (
                <section key={section.num} style={{ ...card, padding: '1.5rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: '1.1rem' }}>
                    <span className={`descv2-num${sectionFilled(section) ? ' descv2-num-done' : ''}`}>
                      {sectionFilled(section) ? '✓' : section.num}
                    </span>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>
                        {section.title}
                      </h2>
                      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--color-muted)', margin: '0.15rem 0 0', lineHeight: 1.5 }}>
                        {section.sub}
                      </p>
                    </div>
                  </div>

                  {section.num === '03' ? (
                    STORY_QUESTIONS.map(({ key, q }) => (
                      <div key={key} style={{ marginBottom: '1.1rem' }}>
                        <label style={fieldLabel}>{q}</label>
                        <textarea
                          value={storyAnswers[key] || ''}
                          onChange={e => setStoryAnswers(prev => ({ ...prev, [key]: e.target.value }))}
                          rows={2}
                          maxLength={800}
                          placeholder="In your own words…"
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                      </div>
                    ))
                  ) : (
                    section.keys.map(key => (
                      <FactField key={key} field={fieldByKey[key]} value={form[key]} onChange={v => setField(key, v)} />
                    ))
                  )}
                </section>
              ))}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '1.25rem 0 1.75rem', flexWrap: 'wrap' }}>
                <button onClick={() => saveFacts()} disabled={saving || generating}
                  style={btn('ghost', saving || generating)}>
                  {saving ? 'Saving…' : 'Save progress'}
                </button>
                <button onClick={generate} disabled={saving || generating}
                  style={btn('primary', saving || generating)}>
                  {generating ? 'Atlas is writing…' : '✦ Have Atlas write it'}
                </button>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                  Appears on your page as <BylineChip authorship="atlas" />
                </span>
              </div>
            </>
          )}

          {/* ── Latest draft ──────────────────────────────────────────────── */}
          {latest && (
            <section style={{ ...card, padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={sectionHeading}>Latest draft · v{latest.version}</h2>
                  <BylineChip authorship={latest.authorship} />
                </div>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', fontWeight: 600, color: STATUS_COLORS[latest.status] || 'var(--color-muted)' }}>
                  {STATUS_LABELS[latest.status] || latest.status}
                </span>
              </div>

              <DraftText text={latest.approved_text || latest.generated_text} />

              {latest.authorship === 'atlas' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '1rem 0 0' }}>
                  <Chip ok={latest.source_binding_passed} label={latest.source_binding_passed ? 'Every detail traces to your facts' : 'Some details not in your facts'} />
                  <Chip ok={latest.banned_phrase_passed} label={latest.banned_phrase_passed ? 'Voice check passed' : 'Voice check flagged'} />
                </div>
              )}

              {latest.status === 'rejected' && latest.admin_note && (
                <div style={{ marginTop: '1rem' }}>
                  <Banner kind="notice"><strong>From the editor:</strong> {latest.admin_note}</Banner>
                </div>
              )}

              {latest.status === 'pending_review' && latest.authorship === 'owner' && (
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '1rem 0 0' }}>
                  Second thoughts? Edit your words above and resubmit — the newest version replaces this one.
                </p>
              )}

              {latest.status === 'pending_review' && latest.authorship === 'atlas' && !flagOpen && (
                <div style={{ display: 'flex', gap: 8, marginTop: '1rem', flexWrap: 'wrap' }}>
                  <button onClick={() => { setFlagOpen('request_changes'); setFlagNote('') }} style={btn('ghost', false)}>
                    Request changes
                  </button>
                  <button onClick={() => { setFlagOpen('flag_error'); setFlagNote('') }} style={btn('ghost', false)}>
                    Flag an error
                  </button>
                </div>
              )}
              {latest.status === 'pending_review' && latest.authorship === 'atlas' && flagOpen && (
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

          {/* ── History ───────────────────────────────────────────────────── */}
          {drafts.length > 1 && (
            <section>
              <Label>Earlier drafts</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {drafts.slice(1).map(d => (
                  <div key={d.id} style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.6rem 0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--color-ink)' }}>v{d.version}</span>
                      <BylineChip authorship={d.authorship} small />
                    </span>
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

// ── Pieces ───────────────────────────────────────────────────────────────────

function PathCard({ active, onClick, icon, title, blurb, byline }) {
  return (
    <button type="button" onClick={onClick}
      className={`descv2-path${active ? ' descv2-path-active' : ''}`}
      aria-pressed={active}>
      <span className="descv2-path-icon">{icon}</span>
      <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0.7rem 0 0.3rem' }}>
        {title}
      </span>
      <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: '0.9rem' }}>
        {blurb}
      </span>
      <BylineChip authorship={byline} />
    </button>
  )
}

function BylineChip({ authorship, small }) {
  const atlas = authorship === 'atlas'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontFamily: 'var(--font-sans)', fontSize: small ? '0.62rem' : '0.68rem', fontWeight: 700,
      letterSpacing: '0.07em', textTransform: 'uppercase',
      padding: small ? '0.14rem 0.5rem' : '0.22rem 0.65rem', borderRadius: 20,
      color: atlas ? '#7a5c1c' : '#3d5245',
      background: atlas ? '#C49A3C1A' : '#4A7C5914',
      border: `1px solid ${atlas ? '#C49A3C66' : '#4A7C5950'}`,
      whiteSpace: 'nowrap',
    }}>
      {atlas ? '✦' : <PenIcon size={11} />} {AUTHORSHIP_LABELS[authorship] || authorship}
    </span>
  )
}

function PenIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function SparkIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.7a2 2 0 001.3 1.3L21 11l-5.8 1.9a2 2 0 00-1.3 1.3L12 20l-1.9-5.8a2 2 0 00-1.3-1.3L3 11l5.8-2a2 2 0 001.3-1.3L12 2z" />
    </svg>
  )
}

function FactField({ field, value, onChange }) {
  const emph = field.emphasised
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <label style={fieldLabel}>
        {field.label}
        {field.required && <span style={{ color: '#C4634F' }}> *</span>}
        {emph && <span style={{ marginLeft: 8, fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: AMBER }}>Important</span>}
      </label>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0 0 0.4rem', lineHeight: 1.45 }}>{field.help}</p>
      {field.type === 'paragraph' || field.type === 'list' ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={field.type === 'list' ? 3 : 4}
          placeholder={field.type === 'list' ? 'One per line' : ''}
          style={{ ...inputStyle, resize: 'vertical', borderColor: emph ? AMBER : 'var(--color-border)' }} />
      ) : field.type === 'year' ? (
        <input type="number" inputMode="numeric" value={value} onChange={e => onChange(e.target.value)} min={1500} max={2100} placeholder="e.g. 1923"
          style={{ ...inputStyle, maxWidth: 160 }} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  )
}

function DraftText({ text, muted }) {
  const paras = String(text || '').split('\n').map(p => p.trim()).filter(Boolean)
  return (
    <div>
      {paras.map((p, i) => (
        <p key={i} style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', lineHeight: 1.65, color: muted ? 'var(--color-ink)' : 'var(--color-ink)', opacity: muted ? 0.85 : 1, margin: '0 0 0.75rem' }}>{p}</p>
      ))}
    </div>
  )
}

function Chip({ ok, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: '0.74rem', fontWeight: 600, padding: '0.25rem 0.6rem', borderRadius: 20, color: ok ? SAGE : '#C4634F', background: ok ? '#4A7C5915' : '#C4634F15', border: `1px solid ${ok ? '#4A7C5944' : '#C4634F44'}` }}>
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
    <div style={{ ...card, padding: '2rem', textAlign: 'center' }}>
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', color: 'var(--color-ink)', margin: '0 0 0.375rem' }}>{title}</p>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.825rem', color: 'var(--color-muted)', margin: '0 auto', maxWidth: 460 }}>{body}</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ ...card, padding: '1.5rem' }}>
      <div style={{ width: '40%', height: 12, background: 'var(--color-border)', borderRadius: 4, marginBottom: '1rem' }} />
      <div style={{ width: '100%', height: 10, background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
      <div style={{ width: '80%', height: 10, background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const card = { background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)' }

const sectionHeading = {
  fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: 0,
}

const fieldLabel = {
  display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.85rem',
  fontWeight: 600, color: 'var(--color-ink)', marginBottom: '0.3rem',
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

// Hover/active states need real CSS; everything structural stays inline above.
const descStyles = `
.descv2-chooser {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 14px;
}
.descv2-path {
  text-align: left;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 1.25rem 1.35rem;
  cursor: pointer;
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}
.descv2-path:hover {
  border-color: #C49A3C88;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  transform: translateY(-1px);
}
.descv2-path-active {
  border: 2px solid #C49A3C;
  padding: calc(1.25rem - 1px) calc(1.35rem - 1px);
  background: #FFFDF7;
  box-shadow: 0 2px 10px rgba(196,154,60,0.12);
}
.descv2-path-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: #7a5c1c;
  background: #C49A3C1A;
  border: 1px solid #C49A3C44;
}
.descv2-num {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  font-family: var(--font-serif);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-muted);
  transition: all .2s ease;
}
.descv2-num-done {
  border-color: #C49A3C;
  background: #C49A3C1A;
  color: #7a5c1c;
}
.descv2-paper {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--font-serif);
  font-size: 1.05rem;
  line-height: 1.7;
  color: var(--color-ink);
  background: #FFFEFA;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1.1rem 1.25rem;
  resize: vertical;
  outline: none;
  transition: border-color .16s ease;
}
.descv2-paper:focus {
  border-color: #C49A3C;
}
`
