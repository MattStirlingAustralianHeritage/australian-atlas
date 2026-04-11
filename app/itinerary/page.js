'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'
import TrailQuestionFlow from '@/components/TrailQuestionFlow'

const TrailMap = dynamic(() => import('./TrailMap'), { ssr: false })

// --- Constants ---

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table',
}

// Brand colours per vertical — used for card borders and map markers
const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const FLOW_LABELS = {
  accommodation: { need: 'Accommodation included', sorted: 'Own accommodation', daytrip: 'Day trip' },
  transport: { driving: 'Driving', public: 'Public transport', walking: 'Walking / cycling' },
  group: { solo: 'Solo', couple: 'Couple', friends: 'Small group', family: 'Family with kids' },
  pace: { relaxed: 'Relaxed', balanced: 'Balanced', packed: 'Packed' },
}

// --- Small components ---

function MetadataChip({ children }) {
  return (
    <span style={{
      fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12,
      color: 'var(--color-muted)', background: 'var(--color-cream)',
      border: '1px solid var(--color-border)', borderRadius: 99,
      padding: '4px 12px', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function StopCard({ stop, index, isOvernight }) {
  if (!stop) return null
  const style = VERTICAL_STYLES[stop?.vertical]
  const label = VERTICAL_LABELS[stop?.vertical] || stop?.vertical || ''
  const isAccom = isOvernight || stop?.vertical === 'rest'
  const venueUrl = stop?.slug ? `/place/${stop.slug}` : null
  const brandColor = VERTICAL_COLORS[stop?.vertical] || '#1a1a1a'

  return (
    <div style={{
      background: isAccom ? 'linear-gradient(135deg, #faf6f2 0%, #f5efe8 100%)' : 'var(--color-card-bg)',
      border: `1px solid ${isAccom ? '#5A8A9A30' : 'var(--color-border)'}`,
      borderLeft: `3px solid ${brandColor}`,
      borderRadius: 12, padding: '16px 18px',
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      {/* Number circle or STAY badge */}
      <div style={{
        width: 30, height: 30, borderRadius: isAccom ? 6 : '50%', flexShrink: 0, marginTop: 2,
        background: brandColor,
        color: 'white', fontWeight: 700, fontSize: isAccom ? 8 : 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        letterSpacing: isAccom ? '0.06em' : 0,
      }}>
        {isAccom ? 'STAY' : index}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Bed icon for accommodation */}
          {isAccom && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={brandColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M2 4v16M2 8h18a2 2 0 012 2v10M2 17h20M6 8v2"/>
              <circle cx="6" cy="12" r="2"/>
            </svg>
          )}
          {venueUrl ? (
            <a href={venueUrl} style={{
              fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 16,
              color: 'var(--color-ink)', textDecoration: 'none',
            }} className="hover:underline">
              {stop.venue_name}
            </a>
          ) : (
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 16,
              color: 'var(--color-ink)',
            }}>
              {stop.venue_name}
            </span>
          )}
          {style && (
            <span style={{
              backgroundColor: brandColor, color: '#fff',
              padding: '2px 8px', borderRadius: 99, fontSize: 10,
              fontWeight: 600, fontFamily: 'var(--font-body)', letterSpacing: '0.02em',
            }}>
              {label}
            </span>
          )}
          {stop.multi_night && (
            <span style={{
              backgroundColor: '#f5efe8', color: brandColor,
              padding: '2px 8px', borderRadius: 99, fontSize: 10,
              fontWeight: 600, fontFamily: 'var(--font-body)', letterSpacing: '0.02em',
              border: `1px solid ${brandColor}30`,
            }}>
              2-night stay
            </span>
          )}
        </div>
        {stop.note && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13,
            color: 'var(--color-muted)', marginTop: 4, lineHeight: 1.5,
          }}>
            {stop.note}
          </p>
        )}
        {venueUrl && (
          <a href={venueUrl} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11,
            color: 'var(--color-sage)', textDecoration: 'none', opacity: 0.8,
          }} className="hover:opacity-100">
            View listing
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}

function RecommendationCard({ rec, onAdd, added }) {
  if (!rec) return null
  const label = VERTICAL_LABELS[rec?.vertical] || rec?.vertical || ''
  const isAccom = rec?.vertical === 'rest'
  const brandColor = VERTICAL_COLORS[rec?.vertical] || 'var(--color-sage)'

  return (
    <div style={{
      background: isAccom ? 'linear-gradient(135deg, #faf6f2 0%, #f5efe8 100%)' : 'var(--color-card-bg)',
      border: `1px solid ${isAccom ? '#5A8A9A40' : 'var(--color-border)'}`,
      borderLeft: `3px solid ${brandColor}`,
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12, minHeight: 72,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 14,
            color: 'var(--color-ink)',
          }}>
            {rec.name}
          </span>
          <span style={{
            backgroundColor: brandColor, color: 'white',
            padding: '1px 7px', borderRadius: 99, fontSize: 10,
            fontWeight: 600, fontFamily: 'var(--font-body)',
          }}>
            {label}
          </span>
        </div>
        {rec.description && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11.5,
            color: 'var(--color-muted)', marginTop: 3, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', whiteSpace: 'normal',
          }}>
            {rec.description}
          </p>
        )}
      </div>
      <button onClick={() => onAdd(rec)} disabled={added} title={added ? 'Added' : 'Add to itinerary'}
        style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
          border: added ? 'none' : '1.5px solid var(--color-sage)',
          background: added ? '#4A6741' : 'transparent',
          color: added ? 'white' : 'var(--color-sage)',
          cursor: added ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 300, lineHeight: 1, transition: 'all 0.2s ease',
        }}>
        {added ? '\u2713' : '+'}
      </button>
    </div>
  )
}

// --- Main page ---

function ItineraryPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const q = searchParams.get('q') || ''

  // Flow params
  const flowAccommodation = searchParams.get('accommodation')
  const flowTransport = searchParams.get('transport')
  const flowGroup = searchParams.get('group')
  const flowPace = searchParams.get('pace')

  // Prefs gate: modal must be completed before generation
  const hasPrefsFlag = searchParams.has('_prefs') || searchParams.has('rest_prefs')
  const hasAllFlowParams = flowAccommodation && flowTransport && flowGroup && flowPace
  const needsPrefsModal = q && !hasPrefsFlag && !hasAllFlowParams

  const [itinerary, setItinerary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showFlow, setShowFlow] = useState(false)
  const [addedRecs, setAddedRecs] = useState(new Set())

  // Show / dismiss question flow modal.
  // After the modal submits (adds _prefs=1 to URL), needsPrefsModal flips
  // to false — dismiss the modal so the loading spinner is visible.
  useEffect(() => {
    if (needsPrefsModal && q) setShowFlow(true)
    else setShowFlow(false)
  }, [needsPrefsModal, q])

  // Fetch itinerary when query + prefs are ready
  useEffect(() => {
    if (!q || needsPrefsModal) return

    let cancelled = false
    async function fetchItinerary() {
      setLoading(true)
      setError(null)
      setItinerary(null)

      const params = new URLSearchParams({ q })
      if (flowAccommodation) params.set('accommodation', flowAccommodation)
      if (flowTransport) params.set('transport', flowTransport)
      if (flowGroup) params.set('group', flowGroup)
      if (flowPace) params.set('pace', flowPace)

      try {
        const res = await fetch(`/api/itinerary?${params.toString()}`)
        const data = await res.json()
        if (cancelled) return

        if (data.error === 'no_region' || data.error === 'insufficient_venues') {
          setError(data)
        } else if (data.error === 'generation_failed') {
          setError({ error: 'generation_failed', message: data.message || 'Something went wrong building your trail. Please try again.' })
        } else if (data.error) {
          setError({ error: data.error, message: data.message || data.error })
        } else {
          setItinerary(data)
        }
      } catch {
        if (!cancelled) setError({ error: 'network', message: 'Something went wrong. Please try again.' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchItinerary()
    return () => { cancelled = true }
  }, [q, flowAccommodation, flowTransport, flowGroup, flowPace, needsPrefsModal])

  // --- Prompt input (no query yet) ---
  if (!q) {
    return <TrailPromptInput />
  }

  // --- Question flow modal ---
  if (showFlow) {
    return (
      <TrailQuestionFlow
        query={q}
        regionName={extractDestination(q)}
        onClose={() => setShowFlow(false)}
      />
    )
  }

  // --- Loading ---
  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', gap: 16,
      }}>
        <div style={{
          width: 32, height: 32, border: '2px solid var(--color-border)',
          borderTopColor: 'var(--color-sage)', borderRadius: '50%',
          animation: 'trailSpin 0.8s linear infinite',
        }} />
        <p style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20,
          color: 'var(--color-ink)',
        }}>
          Building your trail...
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13,
          color: 'var(--color-muted)',
        }}>
          Finding verified venues across nine atlases
        </p>
        <style>{`@keyframes trailSpin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // --- Error ---
  if (error) {
    const isNoRegion = error.error === 'no_region'
    const isInsufficient = error.error === 'insufficient_venues'

    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
          color: 'var(--color-ink)', marginBottom: 8,
        }}>
          {isNoRegion ? 'Which region did you have in mind?'
            : isInsufficient ? 'Not enough listings in this area yet'
            : 'Could not build this itinerary'}
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
          color: 'var(--color-muted)', maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.6,
        }}>
          {error.message || 'Something went wrong. Please try again.'}
        </p>

        {/* Suggested trails for no_region */}
        {isNoRegion && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
            {['Barossa Valley wineries', 'Weekend in Hobart', 'Yarra Valley day trip', 'Byron Bay 3 days'].map(s => (
              <Link key={s} href={`/itinerary?q=${encodeURIComponent(s)}`} style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
                color: 'var(--color-ink)', background: 'var(--color-cream)',
                padding: '6px 14px', borderRadius: 99, textDecoration: 'none',
                border: '1px solid var(--color-border)',
              }}>
                {s}
              </Link>
            ))}
          </div>
        )}

        {/* Suggested alternatives for insufficient */}
        {isInsufficient && error.suggested_alternatives?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
            {error.suggested_alternatives.map(alt => (
              <Link key={alt.region} href={`/itinerary?q=${encodeURIComponent(alt.region)}`} style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
                color: 'var(--color-ink)', background: 'var(--color-cream)',
                padding: '6px 14px', borderRadius: 99, textDecoration: 'none',
                border: '1px solid var(--color-border)',
              }}>
                {alt.region} ({alt.count} listings)
              </Link>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link href="/itinerary" style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
            color: '#fff', background: 'var(--color-ink)',
            padding: '10px 24px', borderRadius: 8, textDecoration: 'none',
          }}>
            Try again
          </Link>
          <Link href="/regions" style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
            color: 'var(--color-sage)', border: '1px solid var(--color-border)',
            padding: '10px 24px', borderRadius: 8, textDecoration: 'none',
          }}>
            Browse regions
          </Link>
        </div>
      </div>
    )
  }

  // --- Result ---
  if (!itinerary) return null

  // Guard: if days array is missing or empty, show a graceful message
  if (!itinerary.days || itinerary.days.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', marginBottom: 8 }}>
          We couldn&apos;t build a full itinerary for this destination
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)', maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.6 }}>
          This region may not have enough verified listings yet. Browse the region directly to see what&apos;s available.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link href="/itinerary" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: '#fff', background: 'var(--color-ink)', padding: '10px 24px', borderRadius: 8, textDecoration: 'none' }}>
            Try again
          </Link>
          <Link href="/regions" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-sage)', border: '1px solid var(--color-border)', padding: '10px 24px', borderRadius: 8, textDecoration: 'none' }}>
            Browse regions
          </Link>
        </div>
      </div>
    )
  }

  const totalStops = (itinerary.days || []).reduce((n, d) => n + (d?.stops?.length || 0), 0)
  const flow = itinerary.flow || {}

  return (
    <TrailResult
      itinerary={itinerary}
      totalStops={totalStops}
      flow={flow}
      addedRecs={addedRecs}
      onAddRec={(rec) => setAddedRecs(prev => new Set(prev).add(rec.id))}
      query={q}
    />
  )
}

// --- TrailPromptInput ---

function TrailPromptInput() {
  const router = useRouter()
  const [value, setValue] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed.length < 3) return
    router.push(`/itinerary?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 style={{
        fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 32,
        color: 'var(--color-ink)', marginBottom: 8,
      }}>
        Trail Builder
      </h1>
      <p style={{
        fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15,
        color: 'var(--color-muted)', marginBottom: 32, lineHeight: 1.6,
      }}>
        Build a personalised itinerary from verified venues across nine atlases.
      </p>

      <form onSubmit={handleSubmit} style={{
        display: 'flex', gap: 8, maxWidth: 520, margin: '0 auto',
      }}>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Where do you want to go? What do you want to do?"
          style={{
            flex: 1, fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14,
            color: 'var(--color-ink)', background: 'var(--color-card-bg)',
            border: '1px solid var(--color-border)', borderRadius: 8,
            padding: '14px 16px', outline: 'none',
          }}
          autoFocus
        />
        <button type="submit" style={{
          fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 14,
          color: '#fff', background: 'var(--color-ink)',
          border: 'none', borderRadius: 8, padding: '14px 24px',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          Build trail
        </button>
      </form>

      {/* Example queries */}
      <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        {['Weekend in the Barossa', '3 days in Melbourne', 'Yarra Valley day trip', 'Hobart craft and coffee'].map(s => (
          <Link key={s} href={`/itinerary?q=${encodeURIComponent(s)}`} style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12,
            color: 'var(--color-muted)', background: 'transparent',
            padding: '4px 10px', borderRadius: 99, textDecoration: 'none',
            border: '1px solid var(--color-border)',
          }}>
            {s}
          </Link>
        ))}
      </div>
    </div>
  )
}

// --- TrailResult (split layout) ---

function TrailResult({ itinerary, totalStops, flow, addedRecs, onAddRec, query }) {
  const scrollRef = useRef(null)

  return (
    <div style={{
      display: 'flex', flexDirection: 'row', height: 'calc(100vh - 64px)',
      overflow: 'hidden',
    }} className="trail-result-layout">
      {/* Left column — scrollable itinerary */}
      <div ref={scrollRef} style={{
        width: '55%', overflowY: 'auto', padding: '32px 32px 64px',
      }} className="trail-left-col">
        {/* Back link */}
        <Link href="/itinerary" style={{
          fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12,
          color: 'var(--color-muted)', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to search
        </Link>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28,
          color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 12,
        }}>
          {itinerary.title}
        </h1>

        {/* Intro */}
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
          color: 'var(--color-muted)', lineHeight: 1.65, marginBottom: 20,
        }}>
          {itinerary.intro}
        </p>

        {/* Fallback notice — shown when Claude was unavailable */}
        {itinerary.fallback && (
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
            color: 'var(--color-muted)', background: 'var(--color-cream)',
            border: '1px solid var(--color-border)', borderRadius: 8,
            padding: '10px 14px', marginBottom: 20, lineHeight: 1.5,
          }}>
            This is a simplified itinerary. For a fully curated trail with editorial notes, try again in a few minutes.
          </div>
        )}

        {/* Metadata chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <MetadataChip>{itinerary?.duration?.days || itinerary?.days?.length || 0} {(itinerary?.duration?.days || itinerary?.days?.length || 0) === 1 ? 'day' : 'days'}</MetadataChip>
          <MetadataChip>{totalStops} stops</MetadataChip>
          {flow.accommodation && FLOW_LABELS.accommodation[flow.accommodation] && (
            <MetadataChip>{FLOW_LABELS.accommodation[flow.accommodation]}</MetadataChip>
          )}
          {flow.transport && FLOW_LABELS.transport[flow.transport] && (
            <MetadataChip>{FLOW_LABELS.transport[flow.transport]}</MetadataChip>
          )}
          {flow.group && FLOW_LABELS.group[flow.group] && (
            <MetadataChip>{FLOW_LABELS.group[flow.group]}</MetadataChip>
          )}
          {flow.pace && FLOW_LABELS.pace[flow.pace] && (
            <MetadataChip>{FLOW_LABELS.pace[flow.pace]}</MetadataChip>
          )}
          {itinerary.personalised && (
            <span style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
              color: 'var(--color-sage)', background: '#e8f5f0',
              border: '1px solid #5f8a7e30', borderRadius: 99,
              padding: '4px 12px', whiteSpace: 'nowrap',
            }}>
              Personalised
            </span>
          )}
        </div>

        {/* Personalised interests */}
        {itinerary.preference_labels?.length > 0 && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
            color: 'var(--color-sage)', marginBottom: 20,
          }}>
            Personalised for: {itinerary.preference_labels.join(' \u00B7 ')}
          </p>
        )}

        {/* Accommodation note — shown when no Rest Atlas listings available */}
        {itinerary.accommodation_note && (
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400,
            color: '#744210', background: '#fefbf3',
            border: '1px solid #f0dba8', borderRadius: 8,
            padding: '12px 16px', marginBottom: 20, lineHeight: 1.6,
          }}>
            {itinerary.accommodation_note}
          </div>
        )}

        {/* Days */}
        {(() => {
          let globalIndex = 0
          return (itinerary?.days || []).map((day, di) => (
            <div key={di} style={{ marginBottom: 32 }}>
              {/* Day header with full-width rule */}
              <div style={{
                borderTop: di > 0 ? '1px solid var(--color-border)' : 'none',
                paddingTop: di > 0 ? 24 : 0,
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 11,
                    color: '#fff', background: 'var(--color-ink)',
                    padding: '4px 12px', borderRadius: 99,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>
                    Day {day.day_number || di + 1}
                  </span>
                  {day.label && (
                    <span style={{
                      fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18,
                      color: 'var(--color-ink)',
                    }}>
                      {day.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Stops */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(day.stops || []).map((stop) => {
                  globalIndex++
                  return <StopCard key={stop.listing_id || globalIndex} stop={stop} index={globalIndex} />
                })}
                {day.overnight && (
                  <>
                    {(() => { globalIndex++; return null })()}
                    <StopCard stop={day.overnight} index={globalIndex} isOvernight />
                  </>
                )}
                {day.accommodation_gap && !day.overnight && (
                  <div style={{
                    background: '#faf6f2', border: '1px solid #e8dfd4',
                    borderLeft: `3px solid ${VERTICAL_COLORS.rest}`,
                    borderRadius: 12, padding: '14px 18px',
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400,
                    color: '#744210', lineHeight: 1.5,
                  }}>
                    No Rest Atlas listings available in this area — book direct for tonight.
                  </div>
                )}
              </div>
            </div>
          ))
        })()}

        {/* Recommendations */}
        {itinerary.recommendations?.length > 0 && (
          <div style={{ marginTop: 16, marginBottom: 32 }}>
            <h3 style={{
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11,
              color: 'var(--color-muted)', textTransform: 'uppercase',
              letterSpacing: '0.1em', marginBottom: 12,
            }}>
              You might also add
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {itinerary.recommendations.map(rec => (
                <RecommendationCard
                  key={rec.id}
                  rec={rec}
                  added={addedRecs.has(rec.id)}
                  onAdd={onAddRec}
                />
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{
          display: 'flex', gap: 10, paddingTop: 16,
          borderTop: '1px solid var(--color-border)',
        }}>
          <SaveTrailButton itinerary={itinerary} query={query} />
          <ShareButton />
        </div>
      </div>

      {/* Right column — sticky map */}
      <div style={{
        width: '45%', position: 'sticky', top: 0,
        height: 'calc(100vh - 64px)', borderLeft: '1px solid var(--color-border)',
      }} className="trail-right-col">
        <TrailMap days={itinerary.days} />
      </div>

      {/* Mobile overrides */}
      <style>{`
        @media (max-width: 768px) {
          .trail-result-layout {
            flex-direction: column-reverse !important;
            height: auto !important;
          }
          .trail-left-col {
            width: 100% !important;
            padding: 20px 16px 48px !important;
          }
          .trail-right-col {
            width: 100% !important;
            height: 300px !important;
            position: relative !important;
            border-left: none !important;
            border-bottom: 1px solid var(--color-border) !important;
          }
        }
      `}</style>
    </div>
  )
}

// --- Save & Share buttons ---

function SaveTrailButton({ itinerary, query }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const stops = (itinerary?.days || []).flatMap((day, di) =>
        (day?.stops || []).map((stop, si) => ({
          listing_id: stop.listing_id || null,
          vertical: stop.vertical || null,
          venue_name: stop.venue_name,
          venue_lat: stop.lat,
          venue_lng: stop.lng,
          venue_image_url: stop.hero_image_url || null,
          order_index: di * 100 + si,
          notes: stop.note || null,
        }))
      )

      const res = await fetch('/api/trails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: itinerary.title,
          description: itinerary.intro,
          type: 'user',
          visibility: 'private',
          region: itinerary.region || null,
          vertical_focus: itinerary.focus_verticals?.join(', ') || null,
          stops,
        }),
      })

      if (res.ok) {
        setSaved(true)
      }
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  return (
    <button onClick={handleSave} disabled={saving || saved} style={{
      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
      color: saved ? '#fff' : 'var(--color-ink)',
      background: saved ? '#4A6741' : 'var(--color-card-bg)',
      border: '1px solid var(--color-border)', borderRadius: 8,
      padding: '10px 20px', cursor: saving || saved ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {saved ? '\u2713 Saved' : saving ? 'Saving...' : 'Save trail'}
    </button>
  )
}

function ShareButton() {
  const [copied, setCopied] = useState(false)

  function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button onClick={handleShare} style={{
      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
      color: 'var(--color-muted)', background: 'transparent',
      border: '1px solid var(--color-border)', borderRadius: 8,
      padding: '10px 20px', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
      </svg>
      {copied ? 'Link copied' : 'Share'}
    </button>
  )
}

// --- Helpers ---

function extractDestination(query) {
  if (!query) return null
  const q = query.toLowerCase()
  const regions = ['barossa', 'yarra valley', 'mornington', 'blue mountains', 'byron', 'adelaide hills',
    'hunter valley', 'margaret river', 'daylesford', 'macedon', 'gippsland', 'southern highlands',
    'melbourne', 'sydney', 'hobart', 'brisbane', 'adelaide', 'perth', 'tasmania', 'noosa',
    'sunshine coast', 'gold coast', 'bellarine', 'goldfields', 'bendigo', 'ballarat', 'fremantle',
    'great ocean road', 'grampians', 'beechworth', 'bright', 'healesville', 'launceston',
    'kangaroo island', 'mclaren vale', 'clare valley', 'orange', 'mudgee']
  for (const r of regions.sort((a, b) => b.length - a.length)) {
    if (q.includes(r)) return r.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
  }
  return null
}

// --- Page export ---

export default function ItineraryPage() {
  return (
    <Suspense>
      <ItineraryPageInner />
    </Suspense>
  )
}
