import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const metadata = { title: 'Editorial Queue — Admin' }

export default async function EditorialPage() {
  const cookieStore = await cookies()
  const adminToken = cookieStore.get('atlas_admin')?.value
    || cookieStore.get('admin_auth')?.value
  if (!adminToken) redirect('/admin/login')

  const sb = getSupabaseAdmin()

  let ideas = []
  try {
    const { data, error } = await sb
      .from('story_ideas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error && data) ideas = data
  } catch (err) {
    console.error('[admin/editorial] Query error:', err.message)
    // Continue with empty state rather than crashing
  }

  const statusColors = {
    idea: '#E8E3DA',
    pitched: '#D4E4DC',
    confirmed: '#C4D8B8',
    in_progress: '#FCE4B8',
    published: '#B8D4C8',
  }

  const byStatus = {}
  for (const idea of (ideas || [])) {
    if (!byStatus[idea.status]) byStatus[idea.status] = []
    byStatus[idea.status].push(idea)
  }

  const statusOrder = ['confirmed', 'in_progress', 'pitched', 'idea', 'published']

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Editorial Queue
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          Story ideas, pitches, and in-progress pieces across the Journal.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 32 }}>
        {statusOrder.map(status => (
          <div key={status} style={{
            padding: '14px 16px', borderRadius: 8,
            background: statusColors[status] || '#f0f0f0',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
              {(byStatus[status] || []).length}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
              {status.replace('_', ' ')}
            </p>
          </div>
        ))}
      </div>

      {/* Ideas list */}
      {statusOrder.map(status => {
        const items = byStatus[status] || []
        if (items.length === 0) return null
        return (
          <div key={status} style={{ marginBottom: 32 }}>
            <h2 style={{
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--color-muted)', marginBottom: 12,
            }}>
              {status.replace('_', ' ')} ({items.length})
            </h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map(idea => (
                <div key={idea.id} style={{
                  padding: '16px 20px', borderRadius: 8,
                  border: '1px solid var(--color-border)', background: '#fff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {idea.venue_name && (
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--color-ink)' }}>
                          {idea.venue_name}
                        </span>
                      )}
                      {idea.vertical && (
                        <span style={{
                          fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: 'var(--color-sage)', background: 'var(--color-cream)',
                          padding: '2px 8px', borderRadius: 100,
                        }}>
                          {idea.vertical}
                        </span>
                      )}
                      {idea.region && (
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12, color: 'var(--color-muted)' }}>
                          {idea.region}
                        </span>
                      )}
                    </div>
                    {idea.target_publish_date && (
                      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11, color: 'var(--color-muted)' }}>
                        Target: {idea.target_publish_date}
                      </span>
                    )}
                  </div>
                  {idea.story_angle && (
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5, margin: '0 0 6px' }}>
                      {idea.story_angle}
                    </p>
                  )}
                  {idea.notes && (
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12, color: 'var(--color-muted)', opacity: 0.7, lineHeight: 1.4, margin: 0 }}>
                      {idea.notes}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'var(--color-muted)', opacity: 0.5,
                    }}>
                      {idea.source || 'manual'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--color-border)' }}>|</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', opacity: 0.5 }}>
                      {new Date(idea.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {(!ideas || ideas.length === 0) && (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)' }}>
            No story ideas yet. Run migration 025 to seed the Turkey Flat interview.
          </p>
        </div>
      )}
    </div>
  )
}
