'use client'

import { useAuth } from '../layout'
import { useState, useEffect } from 'react'

export default function DashboardPicks() {
  const { user } = useAuth()
  const [outgoing, setOutgoing] = useState([])
  const [incoming, setIncoming] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/picks')
      .then((r) => r.json())
      .then((data) => {
        setOutgoing(data.outgoing || [])
        setIncoming(data.incoming || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.75rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: '0 0 0.25rem',
        }}>
          Producer Picks
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Recommendations shared across the Atlas network
        </p>
      </div>

      {/* Your Picks (outgoing) */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-muted)',
          margin: '0 0 0.75rem',
        }}>
          Your Picks
        </h2>

        {loading ? (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '1.5rem',
          }}>
            <div style={{ width: '50%', height: '12px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '0.75rem' }} />
            <div style={{ width: '30%', height: '10px', background: 'var(--color-border)', borderRadius: '4px' }} />
          </div>
        ) : outgoing.length === 0 ? (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <p style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1rem',
              color: 'var(--color-ink)',
              margin: '0 0 0.375rem',
            }}>
              No picks yet
            </p>
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.825rem',
              color: 'var(--color-muted)',
              margin: 0,
            }}>
              Producer picks let you recommend other venues in the network. Once your listing is claimed, you can share your favourite producers, cafes, stays, and more.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {outgoing.map((pick, i) => (
              <div key={i} style={{
                background: '#fff',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                padding: '1.25rem',
              }}>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.875rem',
                  color: 'var(--color-ink)',
                  margin: '0 0 0.25rem',
                  fontWeight: 500,
                }}>
                  {pick.venueName}
                </p>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.8rem',
                  color: 'var(--color-muted)',
                  margin: 0,
                }}>
                  {pick.pick_note || pick.vertical}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Picked by Others (incoming) */}
      <div>
        <h2 style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-muted)',
          margin: '0 0 0.75rem',
        }}>
          Picked by Others
        </h2>

        {loading ? (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '1.5rem',
          }}>
            <div style={{ width: '50%', height: '12px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '0.75rem' }} />
            <div style={{ width: '30%', height: '10px', background: 'var(--color-border)', borderRadius: '4px' }} />
          </div>
        ) : incoming.length === 0 ? (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <p style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1rem',
              color: 'var(--color-ink)',
              margin: '0 0 0.375rem',
            }}>
              No incoming picks yet
            </p>
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.825rem',
              color: 'var(--color-muted)',
              margin: 0,
            }}>
              When other venues in the Atlas network recommend your venue, it will appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {incoming.map((pick, i) => (
              <div key={i} style={{
                background: '#fff',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                padding: '1.25rem',
              }}>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.875rem',
                  color: 'var(--color-ink)',
                  margin: '0 0 0.25rem',
                  fontWeight: 500,
                }}>
                  {pick.venueName}
                </p>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.8rem',
                  color: 'var(--color-muted)',
                  margin: 0,
                }}>
                  {pick.pick_note || `Picked via ${pick.vertical}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
