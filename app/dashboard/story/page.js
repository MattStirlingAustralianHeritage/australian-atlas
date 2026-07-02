'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../layout'
import { getDashboardToken } from '@/lib/dashboard-token'

// ─────────────────────────────────────────────────────────────────────────────
// "Your story, written by the Atlas" (paid perk). The operator answers a short
// guided interview; Claude drafts a ~200-word story grounded ONLY in those
// answers; the operator reviews, regenerates or approves; the live story
// renders on their public place page. API: /api/dashboard/story (Bearer).
// ─────────────────────────────────────────────────────────────────────────────

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

function LockedState() {
  return (
    <div style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-gold)', borderRadius: 12, padding: '1.75rem 2rem' }}>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-gold)', margin: '0 0 0.6rem' }}>
        A Standard-plan feature
      </p>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
        Let the Atlas write your story
      </h2>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
        Answer a few questions in your own words and we&rsquo;ll draft a warm, accurate story for your
        listing — in the Atlas editorial voice, grounded only in what you tell us. You review and approve
        before it goes live.
      </p>
      <a href="/dashboard/subscription" style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '0.88rem', fontWeight: 600, background: 'var(--color-ink)', color: 'var(--color-cream)', padding: '0.65rem 1.25rem', borderRadius: 8, textDecoration: 'none' }}>
        Manage subscription
      </a>
    </div>
  )
}

export default function DashboardStory() {
  const { listings, listingsLoading } = useAuth()
  const [listingId, setListingId] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('draft')
  const [paid, setPaid] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null) // 'save' | 'generate' | 'approve'
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!listingId && listings && listings.length) setListingId(listings[0].id)
  }, [listings, listingId])

  const load = useCallback(async (id) => {
    if (!id) return
    setLoading(true); setError(null); setNotice(null)
    try {
      const token = await getDashboardToken()
      if (!token) { setError('Please sign in again.'); return }
      const r = await fetch(`/api/dashboard/story?listing_id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not load.'); return }
      setQuestions(data.questions || [])
      setAnswers(data.story?.answers || {})
      setDraft(data.story?.draft || '')
      setStatus(data.story?.status || 'draft')
      setPaid(data.paid !== false)
    } catch {
      setError('Could not load your story workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (listingId) load(listingId) }, [listingId, load])

  const post = async (action) => {
    setBusy(action); setError(null); setNotice(null)
    try {
      const token = await getDashboardToken()
      if (!token) { setError('Please sign in again.'); return null }
      const r = await fetch('/api/dashboard/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listing_id: listingId, action, answers }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Something went wrong.'); return null }
      return data
    } catch {
      setError('Something went wrong. Please try again.'); return null
    } finally {
      setBusy(null)
    }
  }

  const onSave = async () => { const d = await post('save'); if (d) setNotice('Answers saved.') }
  const onGenerate = async () => {
    const d = await post('generate')
    if (d?.draft) { setDraft(d.draft); setStatus('generated'); setNotice('Draft written — review it below, then approve or rewrite.') }
  }
  const onApprove = async () => { const d = await post('approve'); if (d) { setStatus('live'); setNotice('Your story is live on your listing.') } }
  const onRetire = async () => { const d = await post('retire'); if (d) { setStatus('retired'); setNotice('Story removed from your listing.') } }

  const label = (id) => { const l = (listings || []).find(x => x.id === id); return l ? `${l.name} · ${VERTICAL_LABELS[l.vertical] || l.vertical}` : '' }
  const answeredCount = questions.filter(q => (answers[q.key] || '').trim()).length

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
          Your Story
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--color-muted)', margin: 0 }}>
          Answer a few questions in your own words. We&rsquo;ll draft a story for your listing — grounded only in what you tell us, in your review before anything goes live.
        </p>
      </div>

      {listings && listings.length > 1 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <select value={listingId || ''} onChange={e => setListingId(e.target.value)} style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)' }}>
            {listings.map(l => <option key={l.id} value={l.id}>{label(l.id)}</option>)}
          </select>
        </div>
      )}

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#c62828', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}>{error}</div>}
      {notice && <div style={{ background: '#f0f7f3', border: '1px solid #b6d8c7', color: '#2f6b4f', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}>{notice}</div>}

      {(loading || listingsLoading) ? (
        <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-muted)', fontSize: '0.9rem' }}>Loading…</p>
      ) : !paid ? (
        <LockedState />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.75rem' }}>
            {questions.map(q => (
              <div key={q.key}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '0.4rem' }}>{q.q}</label>
                <textarea
                  value={answers[q.key] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
                  rows={3}
                  maxLength={800}
                  placeholder="In your own words…"
                  style={{ width: '100%', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', lineHeight: 1.5, padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', resize: 'vertical', color: 'var(--color-ink)', background: '#fff' }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            <button onClick={onSave} disabled={!!busy} style={{ fontFamily: 'var(--font-sans)', fontSize: '0.88rem', fontWeight: 600, background: '#fff', color: 'var(--color-ink)', border: '1px solid var(--color-border)', padding: '0.6rem 1.1rem', borderRadius: 8, cursor: busy ? 'default' : 'pointer' }}>
              {busy === 'save' ? 'Saving…' : 'Save answers'}
            </button>
            <button onClick={onGenerate} disabled={!!busy || answeredCount < 3} title={answeredCount < 3 ? 'Answer at least three questions first' : undefined} style={{ fontFamily: 'var(--font-sans)', fontSize: '0.88rem', fontWeight: 600, background: 'var(--color-ink)', color: 'var(--color-cream)', border: 'none', padding: '0.6rem 1.1rem', borderRadius: 8, cursor: (busy || answeredCount < 3) ? 'default' : 'pointer', opacity: answeredCount < 3 ? 0.5 : 1 }}>
              {busy === 'generate' ? 'Writing…' : draft ? 'Rewrite my story' : 'Write my story'}
            </button>
          </div>

          {draft && (
            <div style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1.5rem 1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>Your story {status === 'live' ? '· live' : status === 'generated' ? '· draft' : ''}</h2>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: status === 'live' ? '#2f6b4f' : 'var(--color-muted)' }}>
                  {status === 'live' ? 'Showing on your listing' : 'Not yet published'}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', lineHeight: 1.7, color: 'var(--color-ink)', whiteSpace: 'pre-wrap' }}>{draft}</div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                {status !== 'live' && (
                  <button onClick={onApprove} disabled={!!busy} style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600, background: 'var(--color-sage, #5f8a7e)', color: '#fff', border: 'none', padding: '0.55rem 1.1rem', borderRadius: 8, cursor: busy ? 'default' : 'pointer' }}>
                    {busy === 'approve' ? 'Publishing…' : 'Approve & publish'}
                  </button>
                )}
                {status === 'live' && (
                  <button onClick={onRetire} disabled={!!busy} style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600, background: '#fff', color: 'var(--color-ink)', border: '1px solid var(--color-border)', padding: '0.55rem 1.1rem', borderRadius: 8, cursor: busy ? 'default' : 'pointer' }}>
                    Remove from listing
                  </button>
                )}
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)', alignSelf: 'center' }}>
                  Built only from your answers — edit above and rewrite any time.
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
