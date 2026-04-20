import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { notFound } from 'next/navigation'
import PitchBrief from './PitchBrief'

export const dynamic = 'force-dynamic'

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  found: 'Found Atlas', corner: 'Corner Atlas', table: 'Table Atlas', portal: 'Australian Atlas',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
  portal: '#6B6760',
}

const CONFIDENCE_STYLES = {
  HIGH: { bg: '#16a34a18', border: '#16a34a40', color: '#16a34a' },
  MEDIUM: { bg: '#C49A3C18', border: '#C49A3C40', color: '#C49A3C' },
  LOW: { bg: '#dc262618', border: '#dc262630', color: '#dc2626' },
}

export default async function PitchDetailPage({ params }) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  const { data: pitch } = await sb
    .from('editorial_pitches')
    .select('id, vertical, estimated_read_time, status, headline, angle, suggested_venue, suggested_venue_id, listing_id, brief, confidence, verified_facts, research_needed, cross_vertical_connections, data_richness_score, listing_data_snapshot')
    .eq('id', id)
    .single()

  if (!pitch) notFound()

  const verticalLabel = VERTICAL_LABELS[pitch.vertical] || pitch.vertical
  const verticalColor = VERTICAL_COLORS[pitch.vertical] || '#6B6760'
  const confStyle = CONFIDENCE_STYLES[pitch.confidence] || CONFIDENCE_STYLES.MEDIUM
  const listingId = pitch.listing_id || pitch.suggested_venue_id

  let venueSlug = null
  if (listingId) {
    const { data: venue } = await sb
      .from('listings')
      .select('slug')
      .eq('id', listingId)
      .single()
    venueSlug = venue?.slug
  }

  return (
    <div style={{ background: '#F8F6F1', minHeight: '100vh' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .pitch-brief { box-shadow: none !important; border: none !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid rgba(28,26,23,0.12)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/admin" style={{ fontSize: 12, fontWeight: 500, color: '#6B6760', textDecoration: 'none', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          &larr; Admin Dashboard
        </a>
        <span style={{ color: 'rgba(28,26,23,0.2)' }}>/</span>
        <span style={{ fontSize: 12, color: '#6B6760', fontFamily: 'DM Sans, system-ui, sans-serif' }}>Editorial Pitch</span>
      </div>

      {/* Header */}
      <header style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#fff', background: verticalColor, padding: '4px 12px', borderRadius: 3,
            fontFamily: 'DM Sans, system-ui, sans-serif',
          }}>
            {verticalLabel}
          </span>
          {pitch.confidence && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: confStyle.color, background: confStyle.bg, border: `1px solid ${confStyle.border}`,
              padding: '3px 10px', borderRadius: 3,
              fontFamily: 'DM Sans, system-ui, sans-serif',
            }}>
              {pitch.confidence} confidence
            </span>
          )}
          <span style={{ fontSize: 11, color: '#6B6760', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            {pitch.estimated_read_time || '6 min'} read
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: pitch.status === 'approved' ? '#16a34a' : pitch.status === 'rejected' ? '#dc2626' : '#C49A3C',
            fontFamily: 'DM Sans, system-ui, sans-serif',
          }}>
            {pitch.status}
          </span>
          {pitch.data_richness_score > 0 && (
            <span style={{ fontSize: 10, color: '#6B6760', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
              Data richness: {pitch.data_richness_score}
            </span>
          )}
        </div>

        <h1 style={{
          fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(28px, 4vw, 40px)',
          fontWeight: 400, color: '#1C1A17', lineHeight: 1.2, marginBottom: 16,
        }}>
          {pitch.headline}
        </h1>

        <p style={{
          fontSize: 16, color: '#6B6760', lineHeight: 1.7, fontFamily: 'DM Sans, system-ui, sans-serif',
          marginBottom: 20, fontStyle: 'italic',
        }}>
          {pitch.angle}
        </p>

        {pitch.suggested_venue && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#6B6760', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
              Anchor venue:
            </span>
            {venueSlug ? (
              <a href={`https://australianatlas.com.au/place/${venueSlug}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, fontWeight: 600, color: verticalColor, textDecoration: 'none', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                {pitch.suggested_venue} &#8599;
              </a>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1A17', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                {pitch.suggested_venue}
              </span>
            )}
          </div>
        )}

        {/* Verified Facts (Grounding section) */}
        {pitch.verified_facts?.length > 0 && (
          <div style={{
            marginTop: 20, padding: '16px 20px', borderRadius: 6,
            background: '#fff', border: '1px solid rgba(28,26,23,0.08)',
          }}>
            <h4 style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#16a34a', fontFamily: 'DM Sans, system-ui, sans-serif', marginBottom: 10,
            }}>
              Grounded Facts
            </h4>
            <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'none' }}>
              {pitch.verified_facts.map((fact, i) => (
                <li key={i} style={{
                  fontSize: 13, color: '#1C1A17', lineHeight: 1.6,
                  fontFamily: 'DM Sans, system-ui, sans-serif', marginBottom: 6,
                  display: 'flex', gap: 8, alignItems: 'baseline',
                }}>
                  <span style={{ color: '#16a34a', fontSize: 11, flexShrink: 0 }}>&#10003;</span>
                  <span>
                    {fact.claim}
                    <span style={{ fontSize: 11, color: '#6B6760', marginLeft: 6 }}>
                      [{fact.source_field}]
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Research Needed */}
        {pitch.research_needed?.length > 0 && (
          <div style={{
            marginTop: 12, padding: '16px 20px', borderRadius: 6,
            background: '#fff', border: '1px solid rgba(196,154,60,0.2)',
          }}>
            <h4 style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#C49A3C', fontFamily: 'DM Sans, system-ui, sans-serif', marginBottom: 10,
            }}>
              Research Needed
            </h4>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {pitch.research_needed.map((item, i) => (
                <li key={i} style={{
                  fontSize: 13, color: '#1C1A17', lineHeight: 1.6,
                  fontFamily: 'DM Sans, system-ui, sans-serif', marginBottom: 4,
                }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cross-Vertical Connections */}
        {pitch.cross_vertical_connections?.length > 0 && (
          <div style={{
            marginTop: 12, padding: '16px 20px', borderRadius: 6,
            background: '#fff', border: '1px solid rgba(28,26,23,0.08)',
          }}>
            <h4 style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: verticalColor, fontFamily: 'DM Sans, system-ui, sans-serif', marginBottom: 10,
            }}>
              Cross-Vertical Connections
            </h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pitch.cross_vertical_connections.map((conn, i) => {
                const connColor = VERTICAL_COLORS[conn.vertical] || '#6B6760'
                const connLabel = VERTICAL_LABELS[conn.vertical] || conn.vertical
                return (
                  <a
                    key={i}
                    href={conn.slug ? `https://australianatlas.com.au/place/${conn.slug}` : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 4, textDecoration: 'none',
                      background: `${connColor}10`, border: `1px solid ${connColor}30`,
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: connColor, fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}>
                      {connLabel}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 500, color: '#1C1A17',
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}>
                      {conn.name}
                    </span>
                    {conn.region && (
                      <span style={{ fontSize: 11, color: '#6B6760', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                        {conn.region}
                      </span>
                    )}
                  </a>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ height: 1, background: 'rgba(28,26,23,0.1)', margin: '32px 0' }} />
      </header>

      {/* Brief content */}
      <PitchBrief
        pitchId={pitch.id}
        cachedBrief={pitch.brief}
        verticalColor={verticalColor}
        verticalLabel={verticalLabel}
        pitchStatus={pitch.status}
      />
    </div>
  )
}
