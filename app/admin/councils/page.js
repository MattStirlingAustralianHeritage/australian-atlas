import { getSupabaseAdmin } from '@/lib/supabase/clients'
import CouncilsActions from './CouncilsActions'

export const metadata = { title: 'Councils — Admin' }
export const dynamic = 'force-dynamic'

const TIER_LABELS = {
  explorer: 'Explorer ($249/yr)',
  partner: 'Partner ($3,500/yr)',
  enterprise: 'Enterprise ($8,500/yr)',
}

const STATUS_COLORS = {
  active: '#5F8A7E',
  trial: '#B8860B',
  suspended: '#C0392B',
  cancelled: '#888',
  past_due: '#E67E22',
}

export default async function CouncilsPage() {
  const sb = getSupabaseAdmin()

  let councils = []
  let regions = []
  let error = null

  try {
    const { data, error: fetchError } = await sb
      .from('council_accounts')
      .select('*, council_regions(region_id, role, regions:region_id(name))')
      .order('created_at', { ascending: false })

    if (fetchError) throw fetchError
    councils = data || []
  } catch (err) {
    error = err.message
  }

  // Fetch all regions for the assign dropdown
  try {
    const { data } = await sb
      .from('regions')
      .select('id, name')
      .order('name')
    regions = data || []
  } catch {}

  const active = councils.filter(c => c.status === 'active')
  const trial = councils.filter(c => c.status === 'trial')
  const pastDue = councils.filter(c => c.status === 'past_due')
  const other = councils.filter(c => !['active', 'trial', 'past_due'].includes(c.status))

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400 }}>
          Council Management
        </h1>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-2)' }}>
          <span><strong style={{ color: '#5F8A7E' }}>{active.length}</strong> active</span>
          <span><strong style={{ color: '#B8860B' }}>{trial.length}</strong> trial</span>
          {pastDue.length > 0 && <span><strong style={{ color: '#E67E22' }}>{pastDue.length}</strong> past due</span>}
          <span><strong>{councils.length}</strong> total</span>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: 16, borderRadius: 6, marginBottom: 24, color: '#991B1B' }}>
          Error loading councils: {error}
        </div>
      )}

      <CouncilsActions councils={councils} regions={regions} />

      {councils.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-2)' }}>
          <p style={{ fontSize: 15 }}>No council accounts found.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>Create one below to get started.</p>
        </div>
      )}

      {/* Council cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
        {councils.map(council => (
          <div
            key={council.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '20px 24px',
              background: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 400, marginBottom: 4 }}>
                  {council.name}
                </h3>
                <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>{council.contact_email}</span>
                  {council.contact_name && <span>{council.contact_name}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '3px 10px',
                  borderRadius: 3,
                  background: `${STATUS_COLORS[council.status] || '#888'}18`,
                  color: STATUS_COLORS[council.status] || '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {council.status}
                </span>
                <span style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                }}>
                  {TIER_LABELS[council.tier] || council.tier}
                </span>
              </div>
            </div>

            {/* Regions */}
            {council.council_regions?.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {council.council_regions.map((cr, i) => (
                  <span key={i} style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 2,
                    background: 'var(--bg-2)',
                    color: 'var(--text-2)',
                  }}>
                    {cr.regions?.name || cr.region_id} ({cr.role})
                  </span>
                ))}
              </div>
            )}

            {/* Dates */}
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 16 }}>
              <span>Created: {new Date(council.created_at).toLocaleDateString()}</span>
              {council.last_login_at && <span>Last login: {new Date(council.last_login_at).toLocaleDateString()}</span>}
              {council.billing_cycle_end && <span>Billing ends: {new Date(council.billing_cycle_end).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
