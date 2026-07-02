'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const TYPE_LABEL = { rates: 'Trade rates', availability: 'Availability', famil: 'Famil', general: 'General' }
const STATUS_META = {
  sent: { label: 'Awaiting reply', color: 'var(--color-gold)' },
  answered: { label: 'Answered', color: '#2e7d32' },
  closed: { label: 'Closed', color: 'var(--color-muted)' },
}

export default function TradeEnquiriesClient() {
  const [enquiries, setEnquiries] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // enquiry id being updated

  useEffect(() => {
    fetch('/api/trade/enquiry')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setEnquiries(data.enquiries || [])
      })
      .catch(() => setError('Could not load enquiries'))
  }, [])

  async function setStatus(id, status) {
    setBusy(id)
    try {
      const res = await fetch(`/api/trade/enquiry/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (res.ok) {
        setEnquiries((prev) => prev.map((e) => (e.id === id ? { ...e, status: data.enquiry.status } : e)))
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.5rem 6rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
        Enquiries
      </h1>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 300, color: 'var(--color-muted)', margin: '8px 0 24px', lineHeight: 1.6 }}>
        Replies land in your inbox — this is the ledger. Mark an enquiry answered or closed as your
        program firms up.
      </p>

      {error && <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#b3261e' }}>{error}</p>}
      {enquiries === null && !error && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Loading…</p>
      )}
      {enquiries?.length === 0 && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--color-muted)' }}>
          Nothing yet. Find trade-ready venues in the <Link href="/trade/directory?trade=1" style={{ color: 'var(--color-gold)' }}>directory</Link> and
          send your first rates or famil enquiry from any fact sheet.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(enquiries || []).map((e) => {
          const meta = STATUS_META[e.status] || STATUS_META.sent
          return (
            <div key={e.id} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)', margin: 0 }}>
                  {e.venue_name || 'Venue'}
                </p>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {meta.label}
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '4px 0 0' }}>
                {[TYPE_LABEL[e.enquiry_type], e.group_size ? `group of ${e.group_size}` : null, e.travel_window, new Date(e.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-ink)', margin: '10px 0 0', lineHeight: 1.6 }}>
                {e.message}
              </p>
              {e.status === 'sent' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setStatus(e.id, 'answered')} disabled={busy === e.id} style={actionBtn}>
                    ✓ They replied
                  </button>
                  <button onClick={() => setStatus(e.id, 'closed')} disabled={busy === e.id} style={{ ...actionBtn, color: 'var(--color-muted)' }}>
                    Close
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const actionBtn = {
  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--color-ink)',
  background: 'white', border: '1px solid var(--color-border)', padding: '7px 14px',
  borderRadius: 99, cursor: 'pointer',
}
