'use client'

import { useState } from 'react'

const TYPES = [
  { value: 'rates', label: 'Trade rates' },
  { value: 'availability', label: 'Availability' },
  { value: 'famil', label: 'Famil visit' },
  { value: 'general', label: 'General' },
]

/** Structured enquiry to the venue's trade contact. Atlas sends the intro;
 *  the reply goes straight to the buyer. */
export default function EnquiryForm({ listingId, venueName }) {
  const [type, setType] = useState('rates')
  const [message, setMessage] = useState('')
  const [groupSize, setGroupSize] = useState('')
  const [travelWindow, setTravelWindow] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  async function send(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/trade/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          enquiry_type: type,
          message: message.trim(),
          group_size: groupSize.trim() || null,
          travel_window: travelWindow.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send')
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <div style={{ background: 'rgba(196,155,59,0.1)', border: '1px solid var(--color-gold)', borderRadius: 12, padding: 18, marginTop: 14 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>
          Enquiry sent to {venueName}.
        </p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: '6px 0 0', lineHeight: 1.55 }}>
          Their reply goes straight to your email. Track it under <a href="/trade/enquiries" style={{ color: 'var(--color-gold)' }}>Enquiries</a>.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={send} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18, marginTop: 14 }}>
      <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0 0 12px' }}>
        Send an enquiry
      </h2>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {TYPES.map((t) => (
          <button
            key={t.value} type="button" onClick={() => setType(t.value)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600,
              color: type === t.value ? 'var(--color-ink)' : 'var(--color-muted)',
              background: type === t.value ? 'rgba(196,155,59,0.2)' : 'white',
              border: type === t.value ? '1px solid var(--color-gold)' : '1px solid var(--color-border)',
              padding: '6px 12px', borderRadius: 99, cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <textarea
        value={message} onChange={(e) => setMessage(e.target.value)} rows={4} required minLength={20}
        placeholder={`e.g. We run small-group food tours out of Melbourne and are building a new ${new Date().getFullYear() + 1} program…`}
        style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          value={groupSize} onChange={(e) => setGroupSize(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="Group size (optional)" inputMode="numeric"
          style={{ flex: '1 1 130px', fontFamily: 'var(--font-body)', fontSize: 12.5, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--color-border)', boxSizing: 'border-box' }}
        />
        <input
          value={travelWindow} onChange={(e) => setTravelWindow(e.target.value)}
          placeholder="Travel window (e.g. Mar–May 2027)"
          style={{ flex: '2 1 180px', fontFamily: 'var(--font-body)', fontSize: 12.5, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--color-border)', boxSizing: 'border-box' }}
        />
      </div>

      {error && <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: '#b3261e', margin: '10px 0 0' }}>{error}</p>}

      <button
        type="submit" disabled={sending || message.trim().length < 20}
        style={{
          width: '100%', marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
          color: 'var(--color-ink)', background: 'var(--color-gold)', border: 'none', padding: '11px', borderRadius: 99,
          cursor: sending || message.trim().length < 20 ? 'default' : 'pointer',
          opacity: sending || message.trim().length < 20 ? 0.55 : 1,
        }}
      >
        {sending ? 'Sending…' : 'Send via Atlas'}
      </button>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--color-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
        Atlas emails the venue’s trade contact and logs the enquiry. Replies come straight to you — any
        rates or terms are strictly between you and the operator.
      </p>
    </form>
  )
}
