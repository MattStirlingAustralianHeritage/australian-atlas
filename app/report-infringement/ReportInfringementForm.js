'use client'

import { useState } from 'react'

const ACCENT = '#5F8A7E'

export default function ReportInfringementForm({ initialSlug = '', initialName = '' }) {
  const [reporterName, setReporterName] = useState('')
  const [reporterEmail, setReporterEmail] = useState('')
  const [rightsBasis, setRightsBasis] = useState('')
  const [listingSlug, setListingSlug] = useState(initialSlug)
  const [allegedlyInfringingUrl, setAllegedlyInfringingUrl] = useState('')
  const [description, setDescription] = useState('')
  const [goodFaith, setGoodFaith] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  const canSubmit = reporterName.trim() && reporterEmail.trim() && rightsBasis.trim() && description.trim() && goodFaith

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!canSubmit) {
      setError('Please complete the required fields and confirm the good-faith statement.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/report-infringement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_name: reporterName.trim(),
          reporter_email: reporterEmail.trim(),
          rights_basis: rightsBasis.trim(),
          listing_slug: listingSlug.trim() || null,
          allegedly_infringing_url: allegedlyInfringingUrl.trim() || null,
          description: description.trim(),
          good_faith_statement: goodFaith,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong. Please try again.'); return }
      setSubmitted(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-10 px-5 rounded-xl" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
        <h3 className="mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px', color: 'var(--color-ink)' }}>
          Report received
        </h3>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6 }}>
          Thank you. We&apos;ve recorded your report and our team will review it promptly. We may contact you at the email you provided.
        </p>
      </div>
    )
  }

  const inputStyle = {
    fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-ink)',
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: '8px', padding: '10px 14px', width: '100%', outline: 'none',
  }
  const labelStyle = {
    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
    color: 'var(--color-ink)', display: 'block', marginBottom: '6px',
  }
  const req = <span style={{ color: ACCENT }}>*</span>

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-5">
        <div>
          <label htmlFor="ri-name" style={labelStyle}>Your name {req}</label>
          <input id="ri-name" type="text" required value={reporterName} onChange={e => setReporterName(e.target.value)} placeholder="Full name" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="ri-email" style={labelStyle}>Your email {req}</label>
          <input id="ri-email" type="email" required value={reporterEmail} onChange={e => setReporterEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="ri-basis" style={labelStyle}>Basis of your rights {req}</label>
          <input id="ri-basis" type="text" required value={rightsBasis} onChange={e => setRightsBasis(e.target.value)} placeholder="e.g. I am the copyright owner / exclusive licensee / authorised agent" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="ri-slug" style={labelStyle}>
            Listing <span style={{ fontWeight: 300, color: 'var(--color-muted)' }}>(slug, if known)</span>
          </label>
          <input id="ri-slug" type="text" value={listingSlug} onChange={e => setListingSlug(e.target.value)} placeholder="e.g. admin-test-roastery" style={inputStyle} />
          {initialName && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 300, color: 'var(--color-muted)', marginTop: '4px' }}>
              Reporting about: <strong style={{ fontWeight: 500 }}>{initialName}</strong>
            </p>
          )}
        </div>
        <div>
          <label htmlFor="ri-url" style={labelStyle}>
            Link to the allegedly infringing content <span style={{ fontWeight: 300, color: 'var(--color-muted)' }}>(optional)</span>
          </label>
          <input id="ri-url" type="text" value={allegedlyInfringingUrl} onChange={e => setAllegedlyInfringingUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="ri-desc" style={labelStyle}>Describe the issue {req}</label>
          <textarea id="ri-desc" required rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is being infringed, and how?" style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <label htmlFor="ri-goodfaith" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', padding: '12px 14px', border: '1px solid var(--color-border)', borderRadius: '10px', background: 'var(--color-cream)' }}>
          <input id="ri-goodfaith" type="checkbox" checked={goodFaith} onChange={e => setGoodFaith(e.target.checked)} style={{ marginTop: '2px', accentColor: ACCENT, width: '15px', height: '15px', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12.5px', color: 'var(--color-ink)', lineHeight: 1.5 }}>
            I have a good-faith belief that the use of the material described is not authorised by the rights holder, its agent, or the law, and the information in this report is accurate.
          </span>
        </label>
      </div>

      {error && (
        <p className="mt-4" style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: '#b44' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || !canSubmit}
        className="mt-8 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: ACCENT, fontFamily: 'var(--font-body)', cursor: submitting ? 'wait' : 'pointer' }}
      >
        {submitting ? 'Submitting…' : 'Submit report'}
      </button>
    </form>
  )
}
