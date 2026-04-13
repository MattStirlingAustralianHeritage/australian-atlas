import { getSupabaseAdmin } from '@/lib/supabase/clients'
import MemoryActions from './MemoryActions'

export const metadata = { title: 'Memories — Admin' }
export const dynamic = 'force-dynamic'

const VERTICAL_COLORS = {
  sba: '#6b3a2a',
  collection: '#5a6b7c',
  craft: '#7c6b5a',
  fine_grounds: '#5F8A7E',
  rest: '#8a5a6b',
  field: '#5a7c5a',
  corner: '#7c5a7c',
  found: '#5a7c6b',
  table: '#7c6b5a',
}

const VERTICAL_NAMES = {
  sba: 'Small Batch',
  collection: 'Culture Atlas',
  craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds',
  rest: 'Boutique Stays',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

export default async function AdminMemoriesPage() {
  const sb = getSupabaseAdmin()

  const { data: pending } = await sb
    .from('place_memories')
    .select(`
      id, listing_id, author_name, memory, created_at, flagged_for_pullquote,
      listing:listing_id (name, vertical)
    `)
    .eq('approved', false)
    .order('created_at', { ascending: false })

  const { data: approved } = await sb
    .from('place_memories')
    .select(`
      id, listing_id, author_name, memory, created_at, flagged_for_pullquote,
      listing:listing_id (name, vertical)
    `)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(50)

  const pendingItems = pending || []
  const approvedItems = approved || []

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
          Place Memories
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          Community-submitted memories. Review, approve, or flag as pull quotes.
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: '#FCE4B8',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
            {pendingItems.length}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Pending
          </p>
        </div>
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: '#166534', margin: 0 }}>
            {approvedItems.length}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Approved
          </p>
        </div>
      </div>

      {/* Pending queue */}
      <h2 style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        fontSize: 14,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-muted)',
        margin: '0 0 16px',
      }}>
        Pending Review
      </h2>

      {pendingItems.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 0',
          border: '1px dashed var(--color-border, #e5e5e5)',
          borderRadius: 8,
          marginBottom: 32,
        }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
            No memories pending review.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
          {pendingItems.map(item => {
            const vertical = item.listing?.vertical
            const verticalColor = VERTICAL_COLORS[vertical] || '#666'
            const verticalName = VERTICAL_NAMES[vertical] || vertical

            return (
              <div
                key={item.id}
                style={{
                  padding: '20px 24px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h3 style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 16,
                      color: 'var(--color-ink)',
                      margin: '0 0 4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      {item.listing?.name || 'Unknown listing'}
                      {vertical && (
                        <span style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 999,
                          fontSize: '0.6rem',
                          fontWeight: 600,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          background: verticalColor,
                          color: '#fff',
                        }}>
                          {verticalName}
                        </span>
                      )}
                    </h3>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--color-muted)',
                      margin: 0,
                    }}>
                      by {item.author_name || 'Anonymous'} &middot; {new Date(item.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Memory text */}
                <blockquote style={{
                  margin: '12px 0',
                  padding: '12px 16px',
                  borderLeft: '3px solid #d97706',
                  background: '#fffbf0',
                  borderRadius: '0 6px 6px 0',
                }}>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontStyle: 'italic',
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--color-ink)',
                    margin: 0,
                  }}>
                    {item.memory}
                  </p>
                </blockquote>

                <MemoryActions memoryId={item.id} />
              </div>
            )
          })}
        </div>
      )}

      {/* Approved memories */}
      {approvedItems.length > 0 && (
        <>
          <h2 style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 14,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-muted)',
            margin: '0 0 16px',
          }}>
            Approved
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {approvedItems.map(item => (
              <div
                key={item.id}
                style={{
                  padding: '12px 20px',
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--color-ink)' }}>
                    {item.listing?.name || 'Unknown'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginLeft: 8 }}>
                    — {item.author_name || 'Anonymous'}
                  </span>
                  {item.flagged_for_pullquote && (
                    <span style={{
                      display: 'inline-block',
                      marginLeft: 8,
                      padding: '0.1rem 0.4rem',
                      borderRadius: 4,
                      fontSize: '0.6rem',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      background: '#fef3c7',
                      color: '#92400e',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      Pull quote
                    </span>
                  )}
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--color-muted)',
                    margin: '4px 0 0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.memory}
                  </p>
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                  {new Date(item.created_at).toLocaleDateString('en-AU')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
