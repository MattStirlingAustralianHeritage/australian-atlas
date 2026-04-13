import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ImageCandidateActions from './ImageCandidateActions'

export const metadata = { title: 'Dead Images — Admin' }
export const dynamic = 'force-dynamic'

const VERT_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERT_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

export default async function DeadImagesPage() {
  const sb = getSupabaseAdmin()

  // Section 1: Broken images (hero_image_status = 'dead')
  const { data: deadListings } = await sb
    .from('listings')
    .select('id, name, vertical, region, state')
    .eq('status', 'active')
    .eq('staleness_flags->>hero_image_status', 'dead')
    .order('vertical')
    .order('name')

  const dead = deadListings || []

  // Section 2: Image candidates awaiting review
  const { data: candidateListings } = await sb
    .from('listings')
    .select('id, name, vertical, region, state, hero_image_candidate_url')
    .not('hero_image_candidate_url', 'is', null)
    .order('vertical')
    .order('name')

  const candidates = candidateListings || []

  // Group dead by vertical for summary badges
  const deadByVertical = {}
  for (const l of dead) {
    if (!deadByVertical[l.vertical]) deadByVertical[l.vertical] = []
    deadByVertical[l.vertical].push(l)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 28,
          color: 'var(--color-ink)',
          marginBottom: 4,
        }}>
          Dead Images
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          Broken hero images flagged by the Dead Image Agent, and OG image candidates discovered from listing websites.
        </p>
      </div>

      {/* Summary badges */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 32,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: dead.length > 0 ? '#FEE2E2' : '#DCFCE7',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: dead.length > 0 ? '#dc2626' : '#16a34a', margin: 0 }}>
            {dead.length}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Broken Images
          </p>
        </div>
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: '#FCE4B8',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: '#C49A3C', margin: 0 }}>
            {candidates.length}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Candidates
          </p>
        </div>
        {Object.entries(deadByVertical).map(([vert, arr]) => (
          <div key={vert} style={{
            padding: '14px 20px',
            borderRadius: 8,
            background: (VERT_COLORS[vert] || '#888') + '18',
            border: `1px solid ${VERT_COLORS[vert] || '#888'}30`,
            textAlign: 'center',
            minWidth: 100,
          }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: VERT_COLORS[vert] || '#888', margin: 0 }}>
              {arr.length}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
              {VERT_NAMES[vert] || vert}
            </p>
          </div>
        ))}
      </div>

      {/* ── Section 1: Broken Images ──────────────────────────── */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 20,
          color: 'var(--color-ink)',
          marginBottom: 12,
        }}>
          Broken Hero Images
        </h2>

        {dead.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '2rem 0',
            border: '1px dashed var(--color-border, #e5e5e5)',
            borderRadius: 8,
          }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
              No broken hero images detected.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {dead.map(listing => (
              <div
                key={listing.id}
                style={{
                  padding: '14px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: 14,
                    color: 'var(--color-ink)',
                  }}>
                    {listing.name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: VERT_COLORS[listing.vertical] || '#888',
                    background: (VERT_COLORS[listing.vertical] || '#888') + '18',
                    padding: '2px 8px',
                    borderRadius: 100,
                    whiteSpace: 'nowrap',
                  }}>
                    {VERT_NAMES[listing.vertical] || listing.vertical}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 400,
                    fontSize: 12,
                    color: 'var(--color-muted)',
                  }}>
                    {listing.region ? `${listing.region}, ` : ''}{listing.state}
                  </span>
                  <a
                    href={`/admin/listings/${listing.id}`}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      fontSize: 12,
                      color: '#C49A3C',
                      textDecoration: 'none',
                      padding: '4px 12px',
                      border: '1px solid #C49A3C',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Edit Listing
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Image Candidates ───────────────────────── */}
      <div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 20,
          color: 'var(--color-ink)',
          marginBottom: 12,
        }}>
          Image Candidates
        </h2>

        {candidates.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '2rem 0',
            border: '1px dashed var(--color-border, #e5e5e5)',
            borderRadius: 8,
          }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
              No image candidates awaiting review.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {candidates.map(listing => (
              <div
                key={listing.id}
                style={{
                  padding: '16px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 12,
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 14,
                      color: 'var(--color-ink)',
                    }}>
                      {listing.name}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: VERT_COLORS[listing.vertical] || '#888',
                      background: (VERT_COLORS[listing.vertical] || '#888') + '18',
                      padding: '2px 8px',
                      borderRadius: 100,
                      whiteSpace: 'nowrap',
                    }}>
                      {VERT_NAMES[listing.vertical] || listing.vertical}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 400,
                    fontSize: 12,
                    color: 'var(--color-muted)',
                  }}>
                    {listing.region ? `${listing.region}, ` : ''}{listing.state}
                  </span>
                </div>

                {/* Candidate image preview */}
                <div style={{
                  marginBottom: 12,
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#f5f5f5',
                  maxHeight: 200,
                }}>
                  <img
                    src={listing.hero_image_candidate_url}
                    alt={`Candidate image for ${listing.name}`}
                    style={{
                      width: '100%',
                      height: 200,
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>

                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  color: 'var(--color-muted)',
                  margin: '0 0 10px',
                  wordBreak: 'break-all',
                }}>
                  {listing.hero_image_candidate_url}
                </p>

                <ImageCandidateActions listingId={listing.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
