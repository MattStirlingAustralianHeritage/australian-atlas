'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useOperator } from '../layout'

export default function OperatorTrailsPage() {
  const { refetch } = useOperator()
  const [trails, setTrails] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)

  const fetchTrails = useCallback(async () => {
    try {
      const res = await fetch('/api/operators/data?view=trails')
      if (res.ok) {
        const data = await res.json()
        setTrails(data.trails || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrails()
  }, [fetchTrails])

  async function handleDelete(id, name) {
    if (!confirm(`Delete trail "${name}"? This cannot be undone.`)) return
    try {
      const res = await fetch('/api/operators/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_trail', trail_id: id }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      setMessage({ type: 'success', text: `Trail "${name}" deleted` })
      fetchTrails()
      refetch()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  async function handleShare(id) {
    try {
      const res = await fetch('/api/operators/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'share_trail', trail_id: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create share link')
      const shareUrl = `${window.location.origin}/operators/share/${data.token}`
      await navigator.clipboard.writeText(shareUrl)
      setMessage({ type: 'success', text: 'Share link copied to clipboard' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  async function handleExport(id) {
    try {
      const res = await fetch('/api/operators/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trail_id: id }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      refetch()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading trails...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', marginBottom: 4,
          }}>
            Trails
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'var(--color-muted)',
          }}>
            Build and manage multi-day itineraries
          </p>
        </div>
        <Link
          href="/itinerary"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 20px', borderRadius: 8,
            background: 'var(--color-sage)', color: '#fff',
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Trail
        </Link>
      </div>

      {/* Messages */}
      {message && (
        <div style={{
          padding: '0.65rem 0.875rem', borderRadius: 8, marginBottom: 20,
          fontFamily: 'var(--font-body)', fontSize: '0.85rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          ...(message.type === 'error'
            ? { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }
            : { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }
          ),
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: 'inherit', opacity: 0.5,
          }}>&times;</button>
        </div>
      )}

      {/* Trails grid */}
      {trails.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 12, padding: '60px 24px',
          border: '1px solid var(--color-border)', textAlign: 'center',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-muted)',
            marginBottom: 16,
          }}>
            No trails yet. Use the trail builder to create your first itinerary.
          </p>
          <Link
            href="/itinerary"
            style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            Open trail builder
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {trails.map(trail => (
            <div key={trail.id} style={{
              background: '#fff', borderRadius: 12, padding: '20px 24px',
              border: '1px solid var(--color-border)',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{
                    fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                    color: 'var(--color-ink)', margin: '0 0 4px',
                  }}>
                    {trail.name}
                  </h3>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {trail.days && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '2px 8px',
                        borderRadius: 99, background: '#eff6ff',
                        color: '#1e40af', fontFamily: 'var(--font-body)',
                      }}>
                        {trail.days} day{trail.days !== 1 ? 's' : ''}
                      </span>
                    )}
                    {trail.region && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '2px 8px',
                        borderRadius: 99, background: 'var(--color-bg)',
                        color: 'var(--color-muted)', fontFamily: 'var(--font-body)',
                      }}>
                        {trail.region}
                      </span>
                    )}
                  </div>
                </div>
                {trail.description && (
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                    color: 'var(--color-muted)', lineHeight: 1.5, margin: '4px 0 0',
                  }}>
                    {trail.description}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div style={{
                display: 'flex', gap: 8, marginTop: 16, paddingTop: 12,
                borderTop: '1px solid var(--color-border)', flexWrap: 'wrap',
              }}>
                <button
                  onClick={() => handleShare(trail.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: 'var(--color-ink)', cursor: 'pointer',
                  }}
                >
                  Share
                </button>
                <button
                  onClick={() => handleExport(trail.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: 'var(--color-ink)', cursor: 'pointer',
                  }}
                >
                  Export PDF
                </button>
                <Link
                  href={`/itinerary?trail=${trail.id}`}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: 'var(--color-ink)', textDecoration: 'none',
                  }}
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(trail.id, trail.name)}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: '#fef2f2', border: '1px solid #fecaca',
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: '#b91c1c', cursor: 'pointer', marginLeft: 'auto',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
