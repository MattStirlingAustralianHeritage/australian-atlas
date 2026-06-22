'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'

export default function CouncilContent() {
  const { council, regions } = useCouncil()
  const [content, setContent] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/council/data?view=content')
      .then(r => r.json())
      .then(d => {
        setContent(d.content || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (!council) return null

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          margin: '0 0 0.25rem',
        }}>
          Content
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Co-create itineraries, editorials, and regional picks
        </p>
      </div>

      {loading ? (
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading...</p>
      ) : (
        <>
          {/* Create new content */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}>
            {['Itinerary', 'Editorial', 'Regional Pick'].map(type => (
              <button
                key={type}
                onClick={() => alert(`Create ${type} — coming soon`)}
                style={{
                  background: '#fff',
                  borderRadius: '12px',
                  border: '1px dashed var(--color-border)',
                  padding: '1.5rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'border-color 0.15s',
                }}
              >
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '1.5rem',
                  margin: '0 0 0.5rem',
                  color: 'var(--color-muted)',
                }}>
                  +
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: 'var(--color-ink)',
                  margin: 0,
                }}>
                  New {type}
                </p>
              </button>
            ))}
          </div>

          {/* Existing content */}
          {content.length === 0 ? (
            <div style={{
              background: '#fff',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              padding: '2rem',
              textAlign: 'center',
            }}>
              <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
                No content created yet. Start by creating an itinerary or editorial for your region.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {content.map(item => (
                <div key={item.id} style={{
                  background: '#fff',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-sage)',
                      margin: '0 0 0.25rem',
                    }}>
                      {item.content_type}
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.95rem',
                      fontWeight: 500,
                      color: 'var(--color-ink)',
                      margin: '0 0 0.25rem',
                    }}>
                      {item.title}
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.8rem',
                      color: 'var(--color-muted)',
                      margin: 0,
                    }}>
                      Updated {new Date(item.updated_at).toLocaleDateString('en-AU')}
                    </p>
                  </div>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '999px',
                    fontSize: '0.7rem',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    textTransform: 'capitalize',
                    background: item.status === 'published' ? '#dcfce7' : '#f3f4f6',
                    color: item.status === 'published' ? '#166534' : 'var(--color-muted)',
                  }}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
