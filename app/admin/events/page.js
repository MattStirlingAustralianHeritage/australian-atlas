'use client'

import { useState, useEffect } from 'react'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}
const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

function formatDateRange(startDate, endDate) {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null

  const dayStart = start.getDate()
  const monthStart = start.toLocaleDateString('en-AU', { month: 'short' })
  const yearStart = start.getFullYear()

  if (!end || start.toDateString() === end.toDateString()) {
    return `${dayStart} ${monthStart} ${yearStart}`
  }

  const dayEnd = end.getDate()
  const monthEnd = end.toLocaleDateString('en-AU', { month: 'short' })
  const yearEnd = end.getFullYear()

  if (monthStart === monthEnd && yearStart === yearEnd) {
    return `${dayStart}\u2013${dayEnd} ${monthStart} ${yearStart}`
  }

  return `${dayStart} ${monthStart} \u2013 ${dayEnd} ${monthEnd} ${yearEnd}`
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    try {
      const res = await fetch('/api/admin/events')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setEvents(data.events || [])
    } catch (err) {
      console.error('Failed to fetch events:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(eventId, action) {
    setActionLoading(eventId)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Action failed')
        return
      }

      // Remove event from list
      setEvents(prev => prev.filter(e => e.id !== eventId))
    } catch (err) {
      alert('Something went wrong. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-[family-name:var(--font-serif)] text-2xl font-bold">Event Review Queue</h1>
        <p className="mt-4 text-[var(--color-muted)]">Loading...</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-[family-name:var(--font-serif)] text-2xl font-bold">Event Review Queue</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        {events.length} pending event{events.length !== 1 ? 's' : ''}
      </p>

      {events.length === 0 ? (
        <div className="mt-12 text-center py-16 border border-dashed border-[var(--color-border)] rounded-xl">
          <p className="text-[var(--color-muted)] text-lg">No pending events</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">All caught up.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {events.map(event => {
            const verticals = Array.isArray(event.verticals) ? event.verticals : []
            const isProcessing = actionLoading === event.id

            return (
              <div
                key={event.id}
                className="border border-[var(--color-border)] rounded-xl bg-white p-5 sm:p-6"
              >
                <div className="flex flex-col sm:flex-row gap-5">
                  {/* Thumbnail */}
                  {event.image_url ? (
                    <div className="w-full sm:w-40 flex-shrink-0">
                      <img
                        src={event.image_url}
                        alt={event.name}
                        className="w-full aspect-[16/9] sm:aspect-square object-cover rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="w-full sm:w-40 flex-shrink-0 aspect-[16/9] sm:aspect-square bg-[#F1EFE8] rounded-lg flex items-center justify-center">
                      <span className="text-xs text-[var(--color-muted)]">No image</span>
                    </div>
                  )}

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {event.category && (
                        <span className="bg-[#F1EFE8] text-[#5F5E5A] text-xs px-2.5 py-1 rounded-full">
                          {event.category}
                        </span>
                      )}
                      {verticals.map(v => (
                        <span
                          key={v}
                          className="text-xs px-2.5 py-1 rounded-full text-white"
                          style={{ backgroundColor: VERTICAL_COLORS[v] || '#888' }}
                        >
                          {VERTICAL_LABELS[v] || v}
                        </span>
                      ))}
                      {event.payment_status && (
                        <span className={`text-xs px-2.5 py-1 rounded-full ${
                          event.payment_status === 'succeeded'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          Payment: {event.payment_status}
                        </span>
                      )}
                    </div>

                    <h2 className="font-[family-name:var(--font-serif)] text-xl font-bold text-[var(--color-ink)]">
                      {event.name}
                    </h2>

                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {formatDateRange(event.start_date, event.end_date)}
                    </p>

                    <p className="text-sm text-[var(--color-muted)]">
                      {[event.location_name, event.suburb, event.state].filter(Boolean).join(', ')}
                    </p>

                    {/* Submitter info */}
                    <div className="mt-3 text-sm text-[var(--color-muted)] space-y-0.5">
                      <p>
                        <span className="font-medium text-[var(--color-ink)]">Submitted by:</span>{' '}
                        {event.submitter_name || 'Unknown'}
                        {event.submitter_email && ` (${event.submitter_email})`}
                      </p>
                      {event.submitter_organisation && (
                        <p>
                          <span className="font-medium text-[var(--color-ink)]">Organisation:</span>{' '}
                          {event.submitter_organisation}
                        </p>
                      )}
                    </div>

                    {/* Description */}
                    {event.description && (
                      <p className="mt-3 text-sm text-[var(--color-ink)] leading-relaxed whitespace-pre-line">
                        {event.description}
                      </p>
                    )}

                    {/* Links */}
                    {(event.website_url || event.ticket_url) && (
                      <div className="mt-3 flex gap-3 text-sm">
                        {event.website_url && (
                          <a
                            href={event.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-sage)] hover:underline"
                          >
                            Website
                          </a>
                        )}
                        {event.ticket_url && (
                          <a
                            href={event.ticket_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-sage)] hover:underline"
                          >
                            Tickets
                          </a>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={() => handleAction(event.id, 'approve')}
                        disabled={isProcessing}
                        className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {isProcessing ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Decline this event? A refund will be issued if payment was made.')) {
                            handleAction(event.id, 'decline')
                          }
                        }}
                        disabled={isProcessing}
                        className="px-4 py-2 rounded-lg border border-red-500 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {isProcessing ? 'Processing...' : 'Decline'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
