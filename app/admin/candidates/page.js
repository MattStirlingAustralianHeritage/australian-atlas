import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const metadata = { title: 'Listing Candidates — Admin' }

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

export default async function CandidatesPage({ searchParams }) {
  const cookieStore = await cookies()
  const adminToken = cookieStore.get('atlas_admin')?.value
    || cookieStore.get('admin_auth')?.value
  if (!adminToken) redirect('/admin/login')

  const params = await searchParams
  const filterVertical = params?.vertical || null
  const filterRegion = params?.region || null
  const filterStatus = params?.status || 'pending'

  const sb = getSupabaseAdmin()

  let query = sb
    .from('listing_candidates')
    .select('*')
    .order('confidence', { ascending: false })
    .limit(100)

  if (filterStatus) query = query.eq('status', filterStatus)
  if (filterVertical) query = query.eq('vertical', filterVertical)
  if (filterRegion) query = query.ilike('region', `%${filterRegion}%`)

  const { data: candidates } = await query

  // Stats
  const { count: pending } = await sb.from('listing_candidates').select('*', { count: 'exact', head: true }).eq('status', 'pending')
  const { count: reviewing } = await sb.from('listing_candidates').select('*', { count: 'exact', head: true }).eq('status', 'reviewing')
  const { count: converted } = await sb.from('listing_candidates').select('*', { count: 'exact', head: true }).eq('status', 'converted')

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Listing Candidates
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          Venues identified for potential addition to the Atlas Network. All require human review.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { n: pending || 0, label: 'Pending', active: filterStatus === 'pending' },
          { n: reviewing || 0, label: 'Reviewing', active: filterStatus === 'reviewing' },
          { n: converted || 0, label: 'Converted', active: filterStatus === 'converted' },
        ].map(s => (
          <a key={s.label} href={`/admin/candidates?status=${s.label.toLowerCase()}`} style={{
            padding: '14px 16px', borderRadius: 8,
            background: s.active ? 'var(--color-ink)' : 'var(--color-cream)',
            textAlign: 'center', textDecoration: 'none', display: 'block',
          }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: s.active ? '#fff' : 'var(--color-ink)', margin: 0 }}>{s.n}</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: s.active ? 'rgba(255,255,255,0.6)' : 'var(--color-muted)', margin: '4px 0 0' }}>{s.label}</p>
          </a>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(VERTICAL_NAMES).map(([key, name]) => (
          <a key={key} href={`/admin/candidates?status=${filterStatus}&vertical=${key}`} style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
            padding: '4px 12px', borderRadius: 100,
            background: filterVertical === key ? 'var(--color-sage)' : '#fff',
            color: filterVertical === key ? '#fff' : 'var(--color-muted)',
            border: '1px solid var(--color-border)', textDecoration: 'none',
          }}>
            {name}
          </a>
        ))}
      </div>

      {/* Candidates list */}
      {(candidates || []).length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {candidates.map(c => (
            <div key={c.id} style={{
              padding: '16px 20px', borderRadius: 8,
              border: '1px solid var(--color-border)', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--color-ink)' }}>
                    {c.name}
                  </span>
                  {c.vertical && (
                    <span style={{
                      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: 'var(--color-sage)', background: 'var(--color-cream)',
                      padding: '2px 8px', borderRadius: 100,
                    }}>
                      {VERTICAL_NAMES[c.vertical] || c.vertical}
                    </span>
                  )}
                  {c.confidence && (
                    <span style={{
                      fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11,
                      color: 'var(--color-muted)',
                    }}>
                      {Math.round(c.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {c.region && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>{c.region}</span>}
                  {c.website_url && (
                    <a href={c.website_url} target="_blank" rel="noopener" style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-sage)', textDecoration: 'underline' }}>
                      website
                    </a>
                  )}
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--color-muted)', opacity: 0.5 }}>
                    {c.source}
                  </span>
                </div>
              </div>
              {c.status === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
                    padding: '6px 14px', borderRadius: 6,
                    background: 'var(--color-sage)', color: '#fff', border: 'none', cursor: 'pointer',
                  }}>Create Draft</button>
                  <button style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
                    padding: '6px 14px', borderRadius: 6,
                    background: '#fff', color: 'var(--color-muted)', border: '1px solid var(--color-border)', cursor: 'pointer',
                  }}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)' }}>
            No candidates found for these filters.
          </p>
        </div>
      )}
    </div>
  )
}
