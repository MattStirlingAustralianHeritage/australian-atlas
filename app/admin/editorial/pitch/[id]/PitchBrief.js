'use client'

import { useState, useEffect } from 'react'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
  portal: '#6B6760',
}

const PROGRESS_STEPS = [
  'Generating story brief...',
  'Researching venue...',
  'Building interview questions...',
  'Structuring the narrative...',
  'Finalising editorial brief...',
]

export default function PitchBrief({ pitchId, cachedBrief, verticalColor, verticalLabel, pitchStatus }) {
  const [brief, setBrief] = useState(cachedBrief || null)
  const [loading, setLoading] = useState(!cachedBrief)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [status, setStatus] = useState(pitchStatus)
  const [progressStep, setProgressStep] = useState(0)

  const generateBrief = () => {
    setLoading(true)
    setError(null)
    setProgressStep(0)

    // Cycle through progress messages
    const interval = setInterval(() => {
      setProgressStep(prev => (prev < PROGRESS_STEPS.length - 1 ? prev + 1 : prev))
    }, 3000)

    fetch('/api/admin/editorial-pitches/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pitchId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setBrief(data.brief)
      })
      .catch(err => setError(err.message))
      .finally(() => {
        clearInterval(interval)
        setLoading(false)
      })
  }

  useEffect(() => {
    if (cachedBrief) return
    generateBrief()
  }, [pitchId, cachedBrief]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (action) => {
    setActionLoading(action)
    try {
      const res = await fetch('/api/admin/editorial-pitches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pitchId, vertical: null }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStatus(action === 'approve' ? 'approved' : 'rejected')
    } catch (err) {
      alert(`Action failed: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ display: 'inline-block', width: 32, height: 32, borderRadius: '50%', border: `3px solid ${verticalColor}`, borderTopColor: 'transparent', animation: 'pitch-spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 14, color: '#1C1A17', fontFamily: 'DM Sans, system-ui, sans-serif', marginTop: 16, fontWeight: 500 }}>
            {PROGRESS_STEPS[progressStep]}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
            {PROGRESS_STEPS.map((_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i <= progressStep ? verticalColor : 'rgba(107,103,96,0.2)',
                transition: 'background 0.3s ease',
              }} />
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'rgba(107,103,96,0.6)', fontFamily: 'DM Sans, system-ui, sans-serif', marginTop: 12 }}>
            This may take 15-30 seconds
          </p>
          <style>{`@keyframes pitch-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{ textAlign: 'center', padding: '48px 32px', background: '#fff', borderRadius: 6, border: '1px solid rgba(28,26,23,0.08)' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(220,38,38,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <span style={{ fontSize: 20 }}>!</span>
          </div>
          <p style={{ fontSize: 16, color: '#1C1A17', fontFamily: 'Playfair Display, Georgia, serif', marginBottom: 8 }}>
            Brief generation failed
          </p>
          <p style={{ fontSize: 13, color: '#6B6760', fontFamily: 'DM Sans, system-ui, sans-serif', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
            The AI model was unable to generate the editorial brief after multiple attempts. This is usually temporary.
          </p>
          <button onClick={generateBrief}
            style={{
              padding: '10px 28px', border: 'none', borderRadius: 4, cursor: 'pointer',
              background: verticalColor, color: '#fff', fontSize: 12, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'DM Sans, system-ui, sans-serif',
            }}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!brief) return null

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 80px' }}>

      {/* Action buttons */}
      {status === 'active' && (
        <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 40 }}>
          <button
            onClick={() => handleAction('approve')}
            disabled={!!actionLoading}
            style={{
              padding: '10px 24px', border: 'none', borderRadius: 4, cursor: actionLoading ? 'wait' : 'pointer',
              background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase', fontFamily: 'DM Sans, system-ui, sans-serif',
              opacity: actionLoading ? 0.6 : 1,
            }}>
            {actionLoading === 'approve' ? 'Approving...' : 'Approve Pitch'}
          </button>
          <button
            onClick={() => handleAction('reject')}
            disabled={!!actionLoading}
            style={{
              padding: '10px 24px', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 4, cursor: actionLoading ? 'wait' : 'pointer',
              background: 'transparent', color: '#dc2626', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase', fontFamily: 'DM Sans, system-ui, sans-serif',
              opacity: actionLoading ? 0.6 : 1,
            }}>
            {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      )}

      {status !== 'active' && (
        <div style={{ padding: '12px 20px', borderRadius: 4, marginBottom: 40, border: `1px solid ${status === 'approved' ? '#16a34a' : '#dc2626'}20`, background: `${status === 'approved' ? '#16a34a' : '#dc2626'}08` }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: status === 'approved' ? '#16a34a' : '#dc2626', fontFamily: 'DM Sans, system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {status === 'approved' ? 'Pitch approved — draft created' : 'Pitch rejected'}
          </span>
        </div>
      )}

      {/* Deck */}
      {brief.deck && (
        <p style={{ fontSize: 18, fontStyle: 'italic', color: '#1C1A17', lineHeight: 1.6, fontFamily: 'Playfair Display, Georgia, serif', marginBottom: 40 }}>
          {brief.deck}
        </p>
      )}

      {/* The Story */}
      <Section title="The Story" color={verticalColor}>
        <div style={{ fontSize: 15, color: '#1C1A17', lineHeight: 1.85, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          {brief.the_story?.split('\n\n').map((p, i) => (
            <p key={i} style={{ marginBottom: 16 }}>{p}</p>
          ))}
        </div>
      </Section>

      {/* Suggested Angles */}
      {brief.suggested_angles?.length > 0 && (
        <Section title="Suggested Angles" color={verticalColor}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {brief.suggested_angles.map((angle, i) => (
              <div key={i} style={{ padding: '16px 20px', background: '#fff', border: '1px solid rgba(28,26,23,0.08)', borderRadius: 4 }}>
                <h4 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 16, fontWeight: 400, color: '#1C1A17', marginBottom: 6 }}>
                  {i + 1}. {angle.title}
                </h4>
                <p style={{ fontSize: 13, color: '#6B6760', lineHeight: 1.7, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  {angle.description}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Key Questions */}
      {brief.key_questions?.length > 0 && (
        <Section title="Key Questions to Ask" color={verticalColor}>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {brief.key_questions.map((q, i) => (
              <li key={i} style={{ fontSize: 14, color: '#1C1A17', lineHeight: 1.7, fontFamily: 'DM Sans, system-ui, sans-serif', marginBottom: 10, paddingLeft: 4 }}>
                {q}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Research Notes */}
      {brief.research_notes && (
        <Section title="Research Notes" color={verticalColor}>
          <div style={{ fontSize: 14, color: '#1C1A17', lineHeight: 1.85, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            {brief.research_notes.split('\n\n').map((p, i) => (
              <p key={i} style={{ marginBottom: 14 }}>{p}</p>
            ))}
          </div>
        </Section>
      )}

      {/* Structural Suggestion */}
      {brief.structural_suggestion && (
        <Section title="Structural Suggestion" color={verticalColor}>
          <div style={{ fontSize: 14, color: '#1C1A17', lineHeight: 1.7, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: verticalColor, fontFamily: 'DM Sans, system-ui, sans-serif' }}>Opening</span>
              <p style={{ marginTop: 4 }}>{brief.structural_suggestion.opening}</p>
            </div>
            {brief.structural_suggestion.sections?.map((s, i) => (
              <div key={i} style={{ marginBottom: 12, paddingLeft: 16, borderLeft: `2px solid ${verticalColor}30` }}>
                <p>{s}</p>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: verticalColor, fontFamily: 'DM Sans, system-ui, sans-serif' }}>Closing</span>
              <p style={{ marginTop: 4 }}>{brief.structural_suggestion.closing}</p>
            </div>
          </div>
        </Section>
      )}

      {/* Nearby Listings to Weave In */}
      {brief.nearby_listings?.length > 0 && (
        <Section title="Nearby Listings to Weave In" color={verticalColor}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {brief.nearby_listings.map(listing => {
              const lColor = VERTICAL_COLORS[listing.vertical] || '#6B6760'
              return (
                <a key={listing.id} href={`https://australianatlas.com.au/place/${listing.slug}`} target="_blank" rel="noopener noreferrer"
                  style={{ textDecoration: 'none', display: 'block', background: '#fff', border: '1px solid rgba(28,26,23,0.08)', borderRadius: 4, overflow: 'hidden', transition: 'box-shadow 0.15s' }}>
                  <div style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: lColor, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                      {listing.vertical_label}
                    </span>
                    <h5 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 14, fontWeight: 400, color: '#1C1A17', margin: '4px 0 2px', lineHeight: 1.3 }}>
                      {listing.name}
                    </h5>
                    <span style={{ fontSize: 11, color: '#6B6760', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                      {[listing.region, listing.state].filter(Boolean).join(', ')}
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        </Section>
      )}

      {/* Tone Reference */}
      {brief.tone_reference && (
        <Section title="Tone Reference" color={verticalColor}>
          <p style={{ fontSize: 14, color: '#1C1A17', lineHeight: 1.7, fontFamily: 'DM Sans, system-ui, sans-serif', fontStyle: 'italic' }}>
            {brief.tone_reference}
          </p>
        </Section>
      )}
    </div>
  )
}

function Section({ title, color, children }) {
  return (
    <section className="pitch-brief" style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 3, height: 18, background: color, borderRadius: 2 }} />
        <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 20, fontWeight: 400, color: '#1C1A17' }}>
          {title}
        </h3>
      </div>
      {children}
    </section>
  )
}
