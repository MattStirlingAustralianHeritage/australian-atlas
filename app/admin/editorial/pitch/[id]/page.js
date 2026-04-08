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

export default async function PitchDetailPage({ params }) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  const { data: pitch } = await sb
    .from('editorial_pitches')
    .select('*')
    .eq('id', id)
    .single()

  if (!pitch) notFound()

  const verticalLabel = VERTICAL_LABELS[pitch.vertical] || pitch.vertical
  const verticalColor = VERTICAL_COLORS[pitch.vertical] || '#6B6760'

  // If we have a suggested_venue_id, get venue URL
  let venueSlug = null
  if (pitch.suggested_venue_id) {
    const { data: venue } = await sb
      .from('listings')
      .select('slug')
      .eq('id', pitch.suggested_venue_id)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#fff', background: verticalColor, padding: '4px 12px', borderRadius: 3,
            fontFamily: 'DM Sans, system-ui, sans-serif',
          }}>
            {verticalLabel}
          </span>
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

        <div style={{ height: 1, background: 'rgba(28,26,23,0.1)', margin: '32px 0' }} />
      </header>

      {/* Brief content — client component handles loading + generation */}
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
