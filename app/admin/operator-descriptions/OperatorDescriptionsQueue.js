'use client'

import { useState, useRef } from 'react'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

// The labelled facts in form order, for the verify-against-source panel.
const FACT_ROWS = [
  ['coverage_request', 'What they’d like covered'],
  ['building_description', 'The building'],
  ['what_you_book', 'What you book'],
  ['design_fitting_detail', 'Design & fittings'],
  ['where_it_sits', 'Where it sits'],
  ['established_year', 'Established'],
  ['products_operators_named', 'Named products'],
  ['ownership_transition_note', 'Ownership / change note'],
]

function factValue(v) {
  if (Array.isArray(v)) return v.join(', ')
  if (v == null || v === '') return null
  return String(v)
}

function DraftCard({ draft, listing, onResolved, onReplaced }) {
  const [status, setStatus] = useState('idle') // idle | approving | rejecting | rewriting | error
  const [errorMsg, setErrorMsg] = useState(null)
  const [exiting, setExiting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(draft.generated_text || '')
  const [showReject, setShowReject] = useState(false)
  const [note, setNote] = useState('')
  const [showRewrite, setShowRewrite] = useState(false)
  const [guidance, setGuidance] = useState('')
  const busyRef = useRef(false)

  const facts = draft.source_facts || {}
  const binding = draft.source_binding_report || null
  const failedClaims = Array.isArray(binding?.failed_claims) ? binding.failed_claims : []
  const warnings = Array.isArray(binding?.warnings) ? binding.warnings : []
  const edited = text.trim() !== (draft.generated_text || '').trim()

  const act = async (action) => {
    if (busyRef.current) return
    busyRef.current = true
    setErrorMsg(null)
    setStatus(action === 'approve' ? 'approving' : action === 'rewrite' ? 'rewriting' : 'rejecting')
    try {
      const res = await fetch('/api/admin/operator-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          draftId: draft.id,
          editedText: action === 'approve' && edited ? text : undefined,
          note: action === 'reject' ? note : undefined,
          guidance: action === 'rewrite' ? guidance : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(d.error || 'Action failed')
        setStatus('error')
        busyRef.current = false
        return
      }
      if (action === 'rewrite') {
        // The revised draft replaces this card in place — a fresh card mounts
        // (keyed by the new draft id) with the improved copy ready to approve.
        onReplaced(draft.id, d.draft)
        return
      }
      setExiting(true)
      setTimeout(() => onResolved(draft.id), 420)
    } catch (err) {
      setErrorMsg(err.message || 'Network error')
      setStatus('error')
      busyRef.current = false
    }
  }

  const busy = status === 'approving' || status === 'rejecting' || status === 'rewriting'
  const gatesPass = draft.source_binding_passed && draft.banned_phrase_passed
  const isRewrite = draft.origin === 'admin_rewrite'

  return (
    <div style={{
      position: 'relative', borderRadius: 16, background: '#fff', overflow: 'hidden',
      transition: 'all 0.42s cubic-bezier(0.4,0,0.2,1)',
      opacity: exiting ? 0 : 1, maxHeight: exiting ? 0 : 6000, marginBottom: exiting ? 0 : 24,
      transform: exiting ? 'translateY(-12px) scale(0.98)' : 'none',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: '1px solid var(--color-border)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 20px', background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--color-ink)' }}>
          {listing?.name || draft.listing_id}
        </span>
        {listing?.vertical && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
            {VERTICAL_NAMES[listing.vertical] || listing.vertical}{listing.region ? ` · ${listing.region}` : ''}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>v{draft.version}</span>
      </div>

      <div style={{ padding: '16px 20px 4px' }}>
        {/* Gate chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {isRewrite && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 20, color: '#7a5c1c', background: '#C49A3C18', border: '1px solid #C49A3C55' }}>
              ✦ Claude revision
            </span>
          )}
          <Chip ok={draft.source_binding_passed} label={draft.source_binding_passed ? 'Source-binding passed' : `Source-binding failed (${failedClaims.length})`} />
          <Chip ok={draft.banned_phrase_passed} label={draft.banned_phrase_passed ? 'Voice check passed' : 'Voice check flagged'} />
          {draft.model && <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', alignSelf: 'center' }}>{draft.model}</span>}
        </div>

        {/* What this revision was asked to address */}
        {isRewrite && draft.rewrite_note && (
          <div style={{ margin: '0 0 12px', padding: '8px 12px', background: '#F4F7F4', border: '1px solid #4A7C5933', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 12, color: '#2f5540', whiteSpace: 'pre-line' }}>
            <strong>Revision brief</strong>{'\n'}{draft.rewrite_note}
          </div>
        )}

        {!gatesPass && (failedClaims.length > 0 || warnings.length > 0) && (
          <div style={{ margin: '0 0 12px', padding: '10px 12px', background: '#FCEDEA', border: '1px solid #C4634F44', borderRadius: 8 }}>
            {failedClaims.length > 0 && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#9A3A2A' }}>
                <strong>Not in the facts:</strong> {failedClaims.map(c => c.value).join(', ')}
              </div>
            )}
            {warnings.length > 0 && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#8a6d3b', marginTop: 4 }}>
                <strong>Worth checking:</strong> {warnings.map(c => c.value).join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Operator flag */}
        {draft.operator_action && (
          <div style={{ margin: '0 0 12px', padding: '8px 12px', background: '#FFF7E6', border: '1px solid #C49A3C44', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 12, color: '#7a5c1c' }}>
            Operator {draft.operator_action === 'flagged_error' ? 'flagged an error' : 'requested changes'}
            {draft.operator_note ? `: ${draft.operator_note}` : ''}
          </div>
        )}

        {/* The draft text — editable before approving */}
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6 }}>
          Generated description {edited && <span style={{ color: '#C49A3C' }}>· edited</span>}
        </div>
        {editing ? (
          <textarea value={text} onChange={e => setText(e.target.value)} rows={10}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.6, color: 'var(--color-ink)', resize: 'vertical' }} />
        ) : (
          <div style={{ padding: '10px 12px', background: '#FAFAF7', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            {String(text || '').split('\n').map(p => p.trim()).filter(Boolean).map((p, i) => (
              <p key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.6, color: 'var(--color-ink)', margin: i === 0 ? 0 : '0.6rem 0 0' }}>{p}</p>
            ))}
          </div>
        )}
        <button onClick={() => setEditing(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>
          {editing ? '✓ Done editing' : '✎ Edit before approving'}
        </button>

        {/* Source facts — verify the text against these */}
        <details style={{ margin: '4px 0 12px' }}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', letterSpacing: '0.02em' }}>
            The facts it was written from
          </summary>
          <div style={{ marginTop: 8, padding: 12, background: '#FAFAF7', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            {FACT_ROWS.map(([key, label]) => {
              const v = factValue(facts[key])
              if (!v) return null
              return (
                <div key={key} style={{ marginBottom: 6, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-ink)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>{label}: </span>{v}
                </div>
              )
            })}
          </div>
        </details>

        {/* Current live description for comparison */}
        {listing?.description && (
          <details style={{ margin: '0 0 12px' }}>
            <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>
              Current live description (will be replaced)
            </summary>
            <p style={{ marginTop: 8, padding: 12, background: '#FAFAF7', border: '1px solid var(--color-border)', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6 }}>
              {listing.description}
            </p>
          </details>
        )}
      </div>

      {errorMsg && (
        <div style={{ margin: '0 20px 12px', padding: '8px 12px', background: '#FCEDEA', border: '1px solid #C4634F55', borderRadius: 6, fontFamily: 'var(--font-body)', fontSize: 12, color: '#9A3A2A' }}>
          {errorMsg}
        </div>
      )}

      {showReject && (
        <div style={{ margin: '0 20px 12px' }}>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Reason to send back (the operator sees this)…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: 13 }} />
        </div>
      )}

      {showRewrite && (
        <div style={{ margin: '0 20px 12px' }}>
          <textarea value={guidance} onChange={e => setGuidance(e.target.value)} rows={2}
            placeholder={draft.operator_note
              ? 'Optional editor guidance — Claude already has the operator’s note above…'
              : 'What should the revision do? (e.g. tighten the middle, drop the last line)…'}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid #C49A3C66', fontFamily: 'var(--font-body)', fontSize: 13, resize: 'vertical' }} />
          <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
            The revision only rearranges what the facts and the live description already support — it can’t invent. It replaces this card as a new pending draft; nothing publishes until you approve it.
          </p>
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--color-border)', background: '#fff', flexWrap: 'wrap' }}>
        <button onClick={() => act('approve')} disabled={busy}
          style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', cursor: busy ? 'default' : 'pointer', background: '#4A7C59', color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, opacity: busy ? 0.6 : 1 }}>
          {status === 'approving' ? 'Publishing…' : edited ? 'Approve edited & publish' : 'Approve & publish'}
        </button>
        {!showRewrite ? (
          <button onClick={() => { setShowRewrite(true); setShowReject(false) }} disabled={busy}
            style={{ height: 36, padding: '0 14px', borderRadius: 8, cursor: busy ? 'default' : 'pointer', background: '#C49A3C14', border: '1px solid #C49A3C88', color: '#7a5c1c', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, opacity: busy ? 0.6 : 1 }}>
            ✦ Rewrite with Claude
          </button>
        ) : (
          <button onClick={() => act('rewrite')} disabled={busy}
            style={{ height: 36, padding: '0 16px', borderRadius: 8, cursor: busy ? 'default' : 'pointer', background: '#C49A3C', border: 'none', color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, opacity: busy ? 0.6 : 1 }}>
            {status === 'rewriting' ? 'Rewriting…' : 'Generate revision'}
          </button>
        )}
        {!showReject ? (
          <button onClick={() => { setShowReject(true); setShowRewrite(false) }} disabled={busy}
            style={{ height: 36, padding: '0 14px', borderRadius: 8, cursor: busy ? 'default' : 'pointer', background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, opacity: busy ? 0.6 : 1 }}>
            Send back
          </button>
        ) : (
          <button onClick={() => act('reject')} disabled={busy}
            style={{ height: 36, padding: '0 16px', borderRadius: 8, cursor: busy ? 'default' : 'pointer', background: '#C4634F', border: 'none', color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, opacity: busy ? 0.6 : 1 }}>
            {status === 'rejecting' ? 'Sending…' : 'Confirm send back'}
          </button>
        )}
      </div>
    </div>
  )
}

function Chip({ ok, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 20, color: ok ? '#4A7C59' : '#C4634F', background: ok ? '#4A7C5915' : '#C4634F15', border: `1px solid ${ok ? '#4A7C5944' : '#C4634F44'}` }}>
      {ok ? '✓' : '!'} {label}
    </span>
  )
}

export default function OperatorDescriptionsQueue({ initialDrafts, listingsById }) {
  const [drafts, setDrafts] = useState(initialDrafts || [])
  const onResolved = (id) => setDrafts(prev => prev.filter(d => d.id !== id))
  // A Claude revision supersedes the draft it revised — swap it in place so
  // the improved copy lands exactly where the admin was already looking.
  const onReplaced = (id, revised) => setDrafts(prev => prev.map(d =>
    d.id === id ? { ...revised, listing: revised.listing || d.listing } : d))

  if (!drafts.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
        No descriptions awaiting review.
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 20, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)' }}>
        <strong style={{ color: 'var(--color-ink)' }}>{drafts.length}</strong> awaiting review
      </div>
      {drafts.map(d => (
        <DraftCard key={d.id} draft={d} listing={d.listing || listingsById?.[d.listing_id] || null} onResolved={onResolved} onReplaced={onReplaced} />
      ))}
    </div>
  )
}
