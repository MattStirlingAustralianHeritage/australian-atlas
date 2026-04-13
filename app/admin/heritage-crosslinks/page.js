import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HeritageActions from './HeritageActions'

export const metadata = { title: 'Heritage Crosslinks — Admin' }
export const dynamic = 'force-dynamic'

export default async function HeritageCrosslinksPage() {
  const sb = getSupabaseAdmin()

  const { data: pending } = await sb
    .from('heritage_crosslinks')
    .select('*, listings!inner(name, slug, vertical, region, state)')
    .eq('status', 'pending')
    .order('confidence', { ascending: false })

  const { data: approved } = await sb
    .from('heritage_crosslinks')
    .select('*, listings!inner(name, slug, vertical, region, state)')
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })
    .limit(30)

  const pendingItems = pending || []
  const approvedItems = approved || []

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
          Heritage Crosslinks
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          Matches between Australian Heritage articles and Atlas listings. Approval adds a &ldquo;Visit today&rdquo; card to Heritage and a &ldquo;Read the history&rdquo; link to Atlas.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ padding: '14px 20px', borderRadius: 8, background: '#FCE4B8', textAlign: 'center', minWidth: 100 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>{pendingItems.length}</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>Pending</p>
        </div>
        <div style={{ padding: '14px 20px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center', minWidth: 100 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: '#166534', margin: 0 }}>{approvedItems.length}</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>Approved</p>
        </div>
      </div>

      {pendingItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', border: '1px dashed var(--color-border, #e5e5e5)', borderRadius: 8, marginBottom: 32 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>No pending crosslinks.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
          {pendingItems.map(link => (
            <div key={link.id} style={{ padding: '20px 24px', borderRadius: 8, border: '1px solid var(--color-border, #e5e5e5)', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 24,
                      fontWeight: 400,
                      color: link.confidence >= 0.9 ? '#4a7c59' : link.confidence >= 0.8 ? '#C49A3C' : '#8a7a5a',
                    }}>
                      {(link.confidence * 100).toFixed(0)}%
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>
                      Confidence
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a7a5a', margin: '0 0 4px' }}>Heritage Article</p>
                  <a href={link.heritage_article_url} target="_blank" rel="noopener" style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#1a0dab', textDecoration: 'none', fontWeight: 500 }}>
                    {link.heritage_article_title}
                  </a>
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--color-muted)' }}>↔</span>
                <div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a7a5a', margin: '0 0 4px' }}>Atlas Listing</p>
                  <a href={`/place/${link.listings?.slug}`} style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', textDecoration: 'none', fontWeight: 500 }}>
                    {link.listings?.name}
                  </a>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: '2px 0 0' }}>
                    {link.listings?.region}{link.listings?.state ? `, ${link.listings.state}` : ''}
                  </p>
                </div>
              </div>

              <HeritageActions crosslink={link} />
            </div>
          ))}
        </div>
      )}

      {approvedItems.length > 0 && (
        <>
          <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '0 0 12px' }}>Approved</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {approvedItems.map(link => (
              <div key={link.id} style={{ padding: '12px 20px', borderRadius: 8, border: '1px solid var(--color-border, #e5e5e5)', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)' }}>
                  {link.heritage_article_title} ↔ {link.listings?.name}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                  {link.approved_at ? new Date(link.approved_at).toLocaleDateString('en-AU') : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
