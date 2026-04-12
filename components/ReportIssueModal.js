'use client'

import { useState } from 'react'

const REPORT_TYPES = [
  { key: 'permanently_closed', label: 'Permanently closed', desc: 'This business has closed for good.' },
  { key: 'temporarily_closed', label: 'Temporarily closed', desc: 'Closed for renovations, seasonal break, etc.' },
  { key: 'incorrect_info', label: 'Something is incorrect', desc: 'Wrong address, phone, hours, or other details.' },
]

export default function ReportIssueModal({ listingId, listingName, onClose }) {
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    if (!selected) return
    setSubmitting(true)
    try {
      await fetch('/api/community-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          report_type: selected,
          details: details.trim() || null,
        }),
      })
      setSubmitted(true)
    } catch {
      // Silent fail — report is non-critical
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }} onClick={onClose}>
        <div style={{
          background: 'white', borderRadius: 16, padding: '32px 28px',
          maxWidth: 420, width: '100%', textAlign: 'center',
        }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>Thank you</div>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)',
            lineHeight: 1.6, marginBottom: 20,
          }}>
            Your report about {listingName} has been received. We&apos;ll review it shortly.
          </p>
          <button onClick={onClose} style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
            background: 'var(--color-ink)', color: 'white', border: 'none',
            borderRadius: 8, padding: '10px 24px', cursor: 'pointer',
          }}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 16, padding: '28px 24px',
        maxWidth: 420, width: '100%',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20,
          color: 'var(--color-ink)', marginBottom: 4,
        }}>
          Report an issue
        </h3>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)',
          marginBottom: 20,
        }}>
          Help us keep {listingName} accurate.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.key}
              onClick={() => setSelected(rt.key)}
              style={{
                textAlign: 'left', padding: '12px 16px', borderRadius: 10,
                border: selected === rt.key ? '2px solid var(--color-ink)' : '1px solid var(--color-border)',
                background: selected === rt.key ? '#fafaf8' : 'white',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 14,
                color: 'var(--color-ink)',
              }}>
                {rt.label}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
                color: 'var(--color-muted)', marginTop: 2,
              }}>
                {rt.desc}
              </div>
            </button>
          ))}
        </div>

        {selected === 'incorrect_info' && (
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="What needs correcting?"
            rows={3}
            style={{
              width: '100%', fontFamily: 'var(--font-body)', fontSize: 13,
              border: '1px solid var(--color-border)', borderRadius: 8,
              padding: '10px 12px', resize: 'vertical', marginBottom: 16,
              outline: 'none',
            }}
          />
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
            background: 'transparent', color: 'var(--color-muted)',
            border: '1px solid var(--color-border)', borderRadius: 8,
            padding: '10px 20px', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selected || submitting}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
              background: selected ? 'var(--color-ink)' : '#ccc',
              color: 'white', border: 'none', borderRadius: 8,
              padding: '10px 20px', cursor: selected ? 'pointer' : 'default',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  )
}
