import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Deduplication Review — Admin' }

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

export default async function DuplicatesPage() {
  // Auth handled by middleware — no page-level check needed
  const sb = getSupabaseAdmin()

  let pending = []
  let totalPending = 0, totalDismissed = 0, totalMerged = 0

  try {
    // Fetch pending dedup flags with listing details
    const { data: flags } = await sb
      .from('dedup_flags')
      .select(`
        id, similarity_score, ai_assessment, ai_reasoning, status, created_at,
        listing_a:listing_id_a (id, name, vertical, suburb, state, region, slug),
        listing_b:listing_id_b (id, name, vertical, suburb, state, region, slug)
      `)
      .eq('status', 'pending')
      .order('similarity_score', { ascending: false })
      .limit(50)

    pending = (flags || []).filter(f => f.listing_a && f.listing_b)

    // Stats
    const [pRes, dRes, mRes] = await Promise.all([
      sb.from('dedup_flags').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      sb.from('dedup_flags').select('*', { count: 'exact', head: true }).eq('status', 'dismissed'),
      sb.from('dedup_flags').select('*', { count: 'exact', head: true }).eq('status', 'merged'),
    ])
    totalPending = pRes.count || 0
    totalDismissed = dRes.count || 0
    totalMerged = mRes.count || 0
  } catch (err) {
    console.error('[admin/duplicates] Query error:', err.message)
    // Continue with empty state rather than crashing
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Deduplication Review
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          Listings flagged by semantic similarity analysis. Review each pair and take action.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 32 }}>
        {[
          { n: totalPending || 0, label: 'Pending review' },
          { n: totalMerged || 0, label: 'Merged' },
          { n: totalDismissed || 0, label: 'Dismissed' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '14px 16px', borderRadius: 8,
            background: 'var(--color-cream)', textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>{s.n}</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Flagged pairs */}
      {pending.length > 0 ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {pending.map(flag => (
            <div key={flag.id} style={{
              padding: '20px 24px', borderRadius: 10,
              border: '1px solid var(--color-border)', background: '#fff',
            }}>
              {/* Similarity badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11,
                  color: flag.similarity_score > 0.95 ? '#C44' : 'var(--color-sage)',
                  background: flag.similarity_score > 0.95 ? '#FEE' : 'var(--color-cream)',
                  padding: '3px 10px', borderRadius: 100,
                }}>
                  {(flag.similarity_score * 100).toFixed(1)}% similar
                </span>
                {flag.ai_assessment && (
                  <span style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: flag.ai_assessment === 'duplicate' ? '#C44' : 'var(--color-muted)',
                  }}>
                    AI: {flag.ai_assessment}
                  </span>
                )}
              </div>

              {/* Side-by-side comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[flag.listing_a, flag.listing_b].map((listing, i) => (
                  <div key={i} style={{
                    padding: '12px 16px', borderRadius: 6,
                    background: 'var(--color-cream)',
                  }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--color-ink)', marginBottom: 4 }}>
                      {listing.name}
                    </p>
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12, color: 'var(--color-muted)', marginBottom: 2 }}>
                      {VERTICAL_NAMES[listing.vertical] || listing.vertical}
                    </p>
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12, color: 'var(--color-muted)', margin: 0 }}>
                      {[listing.suburb, listing.region, listing.state].filter(Boolean).join(', ')}
                    </p>
                  </div>
                ))}
              </div>

              {/* AI reasoning */}
              {flag.ai_reasoning && (
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5, marginTop: 12, marginBottom: 0 }}>
                  {flag.ai_reasoning}
                </p>
              )}

              {/* Action buttons — these will be wired to API routes */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <form action={`/api/admin/dedup/${flag.id}`} method="POST">
                  <input type="hidden" name="action" value="merge" />
                  <button type="submit" style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                    padding: '8px 16px', borderRadius: 6,
                    background: '#C44', color: '#fff', border: 'none', cursor: 'pointer',
                  }}>Merge</button>
                </form>
                <form action={`/api/admin/dedup/${flag.id}`} method="POST">
                  <input type="hidden" name="action" value="related" />
                  <button type="submit" style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                    padding: '8px 16px', borderRadius: 6,
                    background: 'var(--color-sage)', color: '#fff', border: 'none', cursor: 'pointer',
                  }}>Mark Related</button>
                </form>
                <form action={`/api/admin/dedup/${flag.id}`} method="POST">
                  <input type="hidden" name="action" value="dismiss" />
                  <button type="submit" style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                    padding: '8px 16px', borderRadius: 6,
                    background: '#fff', color: 'var(--color-muted)', border: '1px solid var(--color-border)', cursor: 'pointer',
                  }}>Dismiss</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)' }}>
            No pending deduplication flags. Run the similarity detection script to populate this queue.
          </p>
        </div>
      )}
    </div>
  )
}
