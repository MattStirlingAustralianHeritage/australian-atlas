import { getSupabaseAdmin } from '@/lib/supabase/clients'
import OperatorActions from './OperatorActions'
import EditAccessManager from './EditAccessManager'

export const metadata = { title: 'Operators — Admin' }
export const dynamic = 'force-dynamic'

const TIER_LABELS = {
  starter: 'Starter ($499/yr)',
  pro: 'Pro ($1,999/yr)',
  trial: 'Trial',
}

const TYPE_LABELS = {
  day_tour: 'Day tour',
  multi_day: 'Multi-day',
  inbound_agency: 'Inbound agency',
  travel_designer: 'Travel designer',
  other: 'Other',
}

const STATUS_COLORS = {
  active: '#5F8A7E',
  trial: '#B8860B',
  suspended: '#C0392B',
  cancelled: '#888',
  past_due: '#E67E22',
}

export default async function AdminOperatorsPage() {
  const sb = getSupabaseAdmin()

  let operators = []
  let error = null

  try {
    const { data, error: fetchError } = await sb
      .from('operator_accounts')
      .select('id, business_name, contact_email, contact_name, status, tier, operator_type, website, created_at, last_login_at, approved')
      .order('created_at', { ascending: false })

    if (fetchError) throw fetchError
    operators = data || []
  } catch (err) {
    error = err.message
  }

  const active = operators.filter(o => o.status === 'active')
  const trial = operators.filter(o => o.status === 'trial')
  const pastDue = operators.filter(o => o.status === 'past_due')

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400 }}>
          Operator Management
        </h1>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-2)' }}>
          <span><strong style={{ color: '#5F8A7E' }}>{active.length}</strong> active</span>
          <span><strong style={{ color: '#B8860B' }}>{trial.length}</strong> trial</span>
          {pastDue.length > 0 && <span><strong style={{ color: '#E67E22' }}>{pastDue.length}</strong> past due</span>}
          <span><strong>{operators.length}</strong> total</span>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: 16, borderRadius: 6, marginBottom: 24, color: '#991B1B' }}>
          Error loading operators: {error}
        </div>
      )}

      <OperatorActions operators={operators} />

      {operators.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-2)' }}>
          <p style={{ fontSize: 15 }}>No operator accounts found.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>Create one below to get started.</p>
        </div>
      )}

      {/* Operator cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
        {operators.map(op => (
          <div
            key={op.id}
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
                  {op.business_name}
                </h3>
                <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>{op.contact_email}</span>
                  {op.contact_name && <span>{op.contact_name}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '3px 10px',
                  borderRadius: 3,
                  background: `${STATUS_COLORS[op.status] || '#888'}18`,
                  color: STATUS_COLORS[op.status] || '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {op.status}
                </span>
                <span style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                }}>
                  {TIER_LABELS[op.tier] || op.tier}
                </span>
                {op.operator_type && (
                  <span style={{
                    fontSize: 11,
                    padding: '3px 10px',
                    borderRadius: 3,
                    background: 'var(--bg-2)',
                    color: 'var(--text-2)',
                  }}>
                    {TYPE_LABELS[op.operator_type] || op.operator_type}
                  </span>
                )}
              </div>
            </div>

            {op.website && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <a href={op.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-2)' }}>
                  {op.website}
                </a>
              </div>
            )}

            {/* Dates */}
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 16 }}>
              <span>Created: {new Date(op.created_at).toLocaleDateString()}</span>
              {op.last_login_at && <span>Last login: {new Date(op.last_login_at).toLocaleDateString()}</span>}
              <span>Approved: {op.approved ? 'Yes' : 'No'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Access Manager — grant inline edit to non-admin users */}
      <EditAccessManager />
    </div>
  )
}
