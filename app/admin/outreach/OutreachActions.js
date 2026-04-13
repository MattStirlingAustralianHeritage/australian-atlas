'use client'

import { useState, useMemo } from 'react'

function generateEmailTemplate(listing) {
  const descSnippet = listing.description
    ? listing.description.slice(0, 150) + (listing.description.length > 150 ? '...' : '')
    : ''

  return {
    subject: `${listing.name} on Australian Atlas`,
    body: `Hi,

We've been building Australian Atlas — a curated guide to independent Australian places across nine verticals. We've listed ${listing.name} as part of our guide to independent ${listing.region || 'Australia'}.

${descSnippet ? `Here's what we wrote: "${descSnippet}"` : ''}

Your listing is live and being discovered at https://australianatlas.com.au/place/${listing.slug}. We'd love for you to claim it and tell your own story.

Claim your listing: https://australianatlas.com.au/claim/${listing.slug}

Matt
Australian Atlas`,
  }
}

function ListingCard({ listing, verticalColors, verticalNames, onDraftEmail }) {
  const vColor = verticalColors[listing.vertical] || '#888'
  const vName = verticalNames[listing.vertical] || listing.vertical

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--color-border, #e5e5e5)',
      borderRadius: 8,
      padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontSize: '1rem',
            fontWeight: 500,
            color: 'var(--color-ink, #2D2A26)',
            margin: 0,
            lineHeight: 1.3,
          }}>
            {listing.name}
          </h3>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 12,
            color: 'var(--color-muted, #888)',
            margin: '4px 0 0',
          }}>
            {[listing.region, listing.state].filter(Boolean).join(', ')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: 100,
            background: `${vColor}14`,
            color: vColor,
            whiteSpace: 'nowrap',
          }}>
            {vName}
          </span>
          {listing.quality_score != null && (
            <span style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 100,
              background: listing.quality_score >= 70 ? '#5F8A7E18' : listing.quality_score >= 40 ? '#d4a03c18' : '#c0392b18',
              color: listing.quality_score >= 70 ? '#5F8A7E' : listing.quality_score >= 40 ? '#d4a03c' : '#c0392b',
            }}>
              Q{listing.quality_score}
            </span>
          )}
        </div>
      </div>

      {/* Details row */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 12, fontSize: 12, fontFamily: 'var(--font-body, system-ui)',
        color: 'var(--color-muted, #888)',
      }}>
        {listing.website && (
          <a
            href={listing.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6', textDecoration: 'none' }}
          >
            Website
          </a>
        )}
        {listing.phone && <span>{listing.phone}</span>}
        {listing.address && <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.address}</span>}
      </div>

      <button
        onClick={() => onDraftEmail(listing)}
        style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 12,
          fontWeight: 500,
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid var(--color-border, #e5e5e5)',
          background: '#fff',
          color: 'var(--color-ink, #2D2A26)',
          cursor: 'pointer',
        }}
      >
        Draft Email
      </button>
    </div>
  )
}

function EmailDraftModal({ listing, onClose, verticalNames }) {
  const template = generateEmailTemplate(listing)
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)
  const [contactEmail, setContactEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  async function handleQueue() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          contact_email: contactEmail || null,
          notes: `Subject: ${subject}\n\n${body}${notes ? '\n\n---\nNotes: ' + notes : ''}`,
          status: 'contacted',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkContacted() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          contact_email: contactEmail || null,
          notes: notes || null,
          status: 'contacted',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 24,
      }}>
        <div style={{
          background: '#fff', borderRadius: 12, padding: '32px',
          maxWidth: 480, width: '100%', textAlign: 'center',
        }}>
          <p style={{
            fontFamily: 'var(--font-display, Georgia)', fontSize: 20,
            color: 'var(--color-ink, #2D2A26)', marginBottom: 8,
          }}>
            Outreach recorded
          </p>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
            color: 'var(--color-muted, #888)', marginBottom: 20,
          }}>
            {listing.name} has been marked in the outreach queue.
          </p>
          <button
            onClick={() => { onClose(); window.location.reload() }}
            style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 500,
              padding: '10px 24px', borderRadius: 6,
              background: 'var(--color-ink, #2D2A26)', color: '#fff',
              border: 'none', cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24, overflowY: 'auto',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '24px',
        maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display, Georgia)', fontSize: 20, fontWeight: 400,
              color: 'var(--color-ink, #2D2A26)', margin: 0,
            }}>
              Draft email for {listing.name}
            </h2>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 12,
              color: 'var(--color-muted, #888)', marginTop: 4,
            }}>
              {verticalNames[listing.vertical] || listing.vertical} &middot; {listing.region || ''}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 20,
              color: 'var(--color-muted, #888)', cursor: 'pointer', padding: 4,
            }}
          >
            &times;
          </button>
        </div>

        {/* Contact email */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--color-muted, #888)', display: 'block', marginBottom: 4,
          }}>
            Contact email
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            placeholder="operator@example.com"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--color-border, #e5e5e5)',
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
              color: 'var(--color-ink, #2D2A26)', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Subject */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--color-muted, #888)', display: 'block', marginBottom: 4,
          }}>
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--color-border, #e5e5e5)',
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
              color: 'var(--color-ink, #2D2A26)', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Body */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--color-muted, #888)', display: 'block', marginBottom: 4,
          }}>
            Email body
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={14}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 6,
              border: '1px solid var(--color-border, #e5e5e5)',
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
              color: 'var(--color-ink, #2D2A26)', lineHeight: 1.6,
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--color-muted, #888)', display: 'block', marginBottom: 4,
          }}>
            Internal notes
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Any notes about this outreach..."
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--color-border, #e5e5e5)',
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
              color: 'var(--color-ink, #2D2A26)', lineHeight: 1.5,
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            padding: '10px 14px', borderRadius: 6, marginBottom: 16,
            fontFamily: 'var(--font-body, system-ui)', fontSize: 13, color: '#991B1B',
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 500,
              padding: '10px 20px', borderRadius: 6,
              border: '1px solid var(--color-border, #e5e5e5)',
              background: '#fff', color: 'var(--color-ink, #2D2A26)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleMarkContacted}
            disabled={saving}
            style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 500,
              padding: '10px 20px', borderRadius: 6,
              border: '1px solid var(--color-border, #e5e5e5)',
              background: '#fff', color: '#3b82f6',
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            Mark as Contacted
          </button>
          <button
            onClick={handleQueue}
            disabled={saving}
            style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 500,
              padding: '10px 20px', borderRadius: 6,
              border: 'none',
              background: 'var(--color-ink, #2D2A26)', color: '#fff',
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Queue for Sending'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoryRow({ row, statusColors }) {
  const [notes, setNotes] = useState(row.notes || '')
  const [saving, setSaving] = useState(false)
  const [statusVal, setStatusVal] = useState(row.status)

  async function saveNotes() {
    if (notes === (row.notes || '')) return
    setSaving(true)
    try {
      await fetch('/api/admin/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, notes }),
      })
    } catch { /* swallow */ }
    setSaving(false)
  }

  async function updateStatus(newStatus) {
    setSaving(true)
    setStatusVal(newStatus)
    try {
      await fetch('/api/admin/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status: newStatus }),
      })
    } catch { /* swallow */ }
    setSaving(false)
  }

  const sColor = statusColors[statusVal] || '#888'
  const listing = row.listing

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--color-border, #e5e5e5)',
      borderRadius: 8,
      padding: '14px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontSize: 15, fontWeight: 500,
            color: 'var(--color-ink, #2D2A26)', margin: 0,
          }}>
            {listing ? listing.name : `Listing ${row.listing_id}`}
          </h4>
          {listing && (
            <p style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 12,
              color: 'var(--color-muted, #888)', margin: '2px 0 0',
            }}>
              {[listing.region, listing.state].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 10, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 10px', borderRadius: 100,
            background: `${sColor}18`, color: sColor,
          }}>
            {statusVal}
          </span>
          <select
            value={statusVal}
            onChange={e => updateStatus(e.target.value)}
            disabled={saving}
            style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 11,
              padding: '4px 8px', borderRadius: 4,
              border: '1px solid var(--color-border, #e5e5e5)',
              color: 'var(--color-ink, #2D2A26)', cursor: 'pointer',
              background: '#fff',
            }}
          >
            <option value="not_contacted">Not contacted</option>
            <option value="contacted">Contacted</option>
            <option value="claimed">Claimed</option>
            <option value="declined">Declined</option>
          </select>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
        fontSize: 12, fontFamily: 'var(--font-body, system-ui)',
        color: 'var(--color-muted, #888)', marginBottom: 8,
      }}>
        {row.contact_email && <span>{row.contact_email}</span>}
        {row.last_contacted_at && (
          <span>Last contacted: {new Date(row.last_contacted_at).toLocaleDateString()}</span>
        )}
        <span>Created: {new Date(row.created_at).toLocaleDateString()}</span>
      </div>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={saveNotes}
        placeholder="Notes..."
        rows={2}
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 4,
          border: '1px solid var(--color-border, #e5e5e5)',
          fontFamily: 'var(--font-body, system-ui)', fontSize: 12,
          color: 'var(--color-ink, #2D2A26)', lineHeight: 1.5,
          resize: 'vertical', boxSizing: 'border-box',
          opacity: saving ? 0.5 : 1,
        }}
      />
    </div>
  )
}

export default function OutreachActions({
  readyListings,
  outreachHistory,
  verticals,
  states,
  verticalColors,
  verticalNames,
  statusColors,
  allStates,
}) {
  const [tab, setTab] = useState('ready')
  const [draftListing, setDraftListing] = useState(null)

  // Filters for Ready tab
  const [filterVertical, setFilterVertical] = useState('')
  const [filterState, setFilterState] = useState('')
  const [filterMinScore, setFilterMinScore] = useState(0)

  // Filter for History tab
  const [filterStatus, setFilterStatus] = useState('')

  const filteredReady = useMemo(() => {
    return readyListings.filter(l => {
      if (filterVertical && l.vertical !== filterVertical) return false
      if (filterState && l.state !== filterState) return false
      if (filterMinScore > 0 && (l.quality_score || 0) < filterMinScore) return false
      return true
    })
  }, [readyListings, filterVertical, filterState, filterMinScore])

  const filteredHistory = useMemo(() => {
    if (!filterStatus) return outreachHistory
    return outreachHistory.filter(r => r.status === filterStatus)
  }, [outreachHistory, filterStatus])

  const tabStyle = (active) => ({
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 13,
    fontWeight: 500,
    padding: '10px 20px',
    borderRadius: '6px 6px 0 0',
    border: '1px solid var(--color-border, #e5e5e5)',
    borderBottom: active ? '1px solid #fff' : '1px solid var(--color-border, #e5e5e5)',
    background: active ? '#fff' : 'var(--color-cream, #FAF8F5)',
    color: active ? 'var(--color-ink, #2D2A26)' : 'var(--color-muted, #888)',
    cursor: 'pointer',
    marginBottom: -1,
    position: 'relative',
    zIndex: active ? 1 : 0,
  })

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border, #e5e5e5)', marginBottom: 24 }}>
        <button onClick={() => setTab('ready')} style={tabStyle(tab === 'ready')}>
          Ready to Contact ({readyListings.length})
        </button>
        <button onClick={() => setTab('history')} style={tabStyle(tab === 'history')}>
          Outreach History ({outreachHistory.length})
        </button>
      </div>

      {/* Ready to Contact */}
      {tab === 'ready' && (
        <div>
          {/* Filters */}
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
            marginBottom: 20, padding: '14px 16px',
            background: 'var(--color-cream, #FAF8F5)',
            border: '1px solid var(--color-border, #e5e5e5)',
            borderRadius: 8,
          }}>
            <div>
              <label style={{
                fontFamily: 'var(--font-body, system-ui)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--color-muted, #888)', display: 'block', marginBottom: 4,
              }}>
                Vertical
              </label>
              <select
                value={filterVertical}
                onChange={e => setFilterVertical(e.target.value)}
                style={{
                  fontFamily: 'var(--font-body, system-ui)', fontSize: 12,
                  padding: '6px 10px', borderRadius: 4,
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff', color: 'var(--color-ink, #2D2A26)',
                }}
              >
                <option value="">All verticals</option>
                {verticals.map(v => (
                  <option key={v} value={v}>{verticalNames[v] || v}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{
                fontFamily: 'var(--font-body, system-ui)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--color-muted, #888)', display: 'block', marginBottom: 4,
              }}>
                State
              </label>
              <select
                value={filterState}
                onChange={e => setFilterState(e.target.value)}
                style={{
                  fontFamily: 'var(--font-body, system-ui)', fontSize: 12,
                  padding: '6px 10px', borderRadius: 4,
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff', color: 'var(--color-ink, #2D2A26)',
                }}
              >
                <option value="">All states</option>
                {allStates.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{
                fontFamily: 'var(--font-body, system-ui)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--color-muted, #888)', display: 'block', marginBottom: 4,
              }}>
                Min quality score: {filterMinScore}
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={filterMinScore}
                onChange={e => setFilterMinScore(Number(e.target.value))}
                style={{ width: 140 }}
              />
            </div>

            <div style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 12,
              color: 'var(--color-muted, #888)', marginLeft: 'auto',
            }}>
              Showing {filteredReady.length} of {readyListings.length}
            </div>
          </div>

          {/* Listing grid */}
          {filteredReady.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 0',
              fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
              color: 'var(--color-muted, #888)',
            }}>
              No listings match the current filters.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 12,
            }}>
              {filteredReady.map(listing => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  verticalColors={verticalColors}
                  verticalNames={verticalNames}
                  onDraftEmail={setDraftListing}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Outreach History */}
      {tab === 'history' && (
        <div>
          {/* Status filter */}
          <div style={{
            display: 'flex', gap: 8, marginBottom: 20,
            alignItems: 'center',
          }}>
            <label style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--color-muted, #888)',
            }}>
              Filter:
            </label>
            {['', 'not_contacted', 'contacted', 'claimed', 'declined'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  fontFamily: 'var(--font-body, system-ui)', fontSize: 12, fontWeight: 500,
                  padding: '5px 12px', borderRadius: 100,
                  border: filterStatus === s ? 'none' : '1px solid var(--color-border, #e5e5e5)',
                  background: filterStatus === s ? 'var(--color-ink, #2D2A26)' : '#fff',
                  color: filterStatus === s ? '#fff' : 'var(--color-ink, #2D2A26)',
                  cursor: 'pointer',
                }}
              >
                {s === '' ? 'All' : s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {filteredHistory.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 0',
              fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
              color: 'var(--color-muted, #888)',
            }}>
              No outreach records found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredHistory.map(row => (
                <HistoryRow key={row.id} row={row} statusColors={statusColors} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Email draft modal */}
      {draftListing && (
        <EmailDraftModal
          listing={draftListing}
          onClose={() => setDraftListing(null)}
          verticalNames={verticalNames}
        />
      )}
    </div>
  )
}
