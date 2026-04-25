import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'
import WikipediaActions from './WikipediaActions'

export const metadata = { title: 'Wikipedia Queue — Admin' }
export const dynamic = 'force-dynamic'

export default async function WikipediaQueuePage() {
  const sb = getSupabaseAdmin()

  const { data: pending } = await sb
    .from('wikipedia_opportunities')
    .select(`*, listings!inner(name, slug, vertical, region, state, ${LISTING_REGION_SELECT})`)
    .eq('status', 'pending')
    .order('found_at', { ascending: false })

  const { data: submitted } = await sb
    .from('wikipedia_opportunities')
    .select(`*, listings!inner(name, slug, vertical, region, state, ${LISTING_REGION_SELECT})`)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  const { data: live } = await sb
    .from('wikipedia_opportunities')
    .select(`*, listings!inner(name, slug, vertical, region, state, ${LISTING_REGION_SELECT})`)
    .eq('status', 'live')
    .order('submitted_at', { ascending: false })

  const pendingItems = pending || []
  const submittedItems = submitted || []
  const liveItems = live || []

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
          Wikipedia Opportunities
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          Listings with matching Wikipedia articles that could cite Australian Atlas. Submit manually — never automated.
        </p>
      </div>

      {/* Counters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ padding: '14px 20px', borderRadius: 8, background: '#FCE4B8', textAlign: 'center', minWidth: 100 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>{pendingItems.length}</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>Pending</p>
        </div>
        <div style={{ padding: '14px 20px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', textAlign: 'center', minWidth: 100 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: '#1e40af', margin: 0 }}>{submittedItems.length}</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>Submitted</p>
        </div>
        <div style={{ padding: '14px 20px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center', minWidth: 100 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: '#166534', margin: 0 }}>{liveItems.length}</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>Live</p>
        </div>
      </div>

      {/* Pending opportunities */}
      {pendingItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', border: '1px dashed var(--color-border, #e5e5e5)', borderRadius: 8, marginBottom: 32 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>No pending opportunities.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
          {pendingItems.map(opp => (
            <div key={opp.id} style={{ padding: '20px 24px', borderRadius: 8, border: '1px solid var(--color-border, #e5e5e5)', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15, color: 'var(--color-ink)' }}>
                    {opp.listings?.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginLeft: 8 }}>
                    {getListingRegion(opp.listings)?.name}{opp.listings?.state ? `, ${opp.listings.state}` : ''}
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                  Found {opp.found_at ? new Date(opp.found_at).toLocaleDateString('en-AU') : ''}
                </span>
              </div>

              <div style={{ marginBottom: 8 }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a7a5a', margin: '0 0 4px' }}>
                  Wikipedia Article
                </p>
                <a href={opp.wikipedia_url} target="_blank" rel="noopener" style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#1a0dab', textDecoration: 'none' }}>
                  {opp.article_title}
                </a>
              </div>

              <div style={{ padding: '10px 14px', borderRadius: 6, background: '#f8f6f0', border: '1px solid #e8e4da', marginBottom: 12, fontFamily: 'monospace', fontSize: 12, color: '#2d2a24', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {opp.suggested_citation}
              </div>

              <WikipediaActions opportunity={opp} />
            </div>
          ))}
        </div>
      )}

      {/* Submitted */}
      {submittedItems.length > 0 && (
        <>
          <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '0 0 12px' }}>Submitted</h2>
          <div style={{ display: 'grid', gap: 8, marginBottom: 32 }}>
            {submittedItems.map(opp => (
              <div key={opp.id} style={{ padding: '12px 20px', borderRadius: 8, border: '1px solid var(--color-border, #e5e5e5)', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)' }}>
                  {opp.listings?.name} → <a href={opp.wikipedia_url} target="_blank" rel="noopener" style={{ color: '#1a0dab', textDecoration: 'none' }}>{opp.article_title}</a>
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                  Submitted {opp.submitted_at ? new Date(opp.submitted_at).toLocaleDateString('en-AU') : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
