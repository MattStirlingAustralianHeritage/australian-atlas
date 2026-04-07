import { getSupabaseAdmin } from '@/lib/supabase/clients'
import AuditActions from './AuditActions'

export const metadata = { title: 'Data Audit Review — Admin' }
export const dynamic = 'force-dynamic'

export default async function AuditReviewPage() {
  const sb = getSupabaseAdmin()

  const { data: listings } = await sb
    .from('listings')
    .select('id, source_id, name, slug, website, state, region, address, lat, lng, status, vertical, sub_type, created_at')
    .eq('status', 'hidden')
    .order('vertical')
    .order('name')

  const items = listings || []
  const byVertical = {}
  for (const l of items) {
    if (!byVertical[l.vertical]) byVertical[l.vertical] = []
    byVertical[l.vertical].push(l)
  }

  const VERT_NAMES = {
    sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
    fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
    corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
  }

  const VERT_COLORS = {
    sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
    fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
    corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 28,
          color: 'var(--color-ink)',
          marginBottom: 4,
        }}>
          Data Audit Review
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          Listings flagged during data integrity audits. Review each and approve or delete.
        </p>
      </div>

      {/* Summary */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 32,
        flexWrap: 'wrap',
      }}>
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: '#FCE4B8',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
            {items.length}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Awaiting Review
          </p>
        </div>
        {Object.entries(byVertical).map(([vert, arr]) => (
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

      {/* Listings by vertical */}
      {items.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 0',
          border: '1px dashed var(--color-border, #e5e5e5)',
          borderRadius: 8,
        }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
            No flagged listings awaiting review.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map(listing => (
            <div
              key={listing.id}
              style={{
                padding: '16px 20px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--color-ink)',
                  }}>
                    {listing.name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: VERT_COLORS[listing.vertical] || '#888',
                    background: (VERT_COLORS[listing.vertical] || '#888') + '18',
                    padding: '2px 8px', borderRadius: 100,
                  }}>
                    {listing.sub_type || listing.vertical}
                  </span>
                </div>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11, color: 'var(--color-muted)',
                }}>
                  {listing.region ? `${listing.region}, ` : ''}{listing.state}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                {listing.website ? (
                  <a
                    href={listing.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
                      color: '#4a7c59', textDecoration: 'underline',
                      wordBreak: 'break-all',
                    }}
                  >
                    {listing.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                ) : (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#a44', fontWeight: 500 }}>
                    No website
                  </span>
                )}
                {listing.address && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', fontWeight: 300 }}>
                    {listing.address}
                  </span>
                )}
              </div>

              <AuditActions listingId={listing.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
