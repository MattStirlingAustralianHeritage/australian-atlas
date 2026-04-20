import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const SITE_URL = 'https://australianatlas.com.au'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#8B6F4E', fine_grounds: '#8A7055',
  rest: '#5B7B6F', field: '#5A7247', corner: '#6B7280', found: '#9B6B4A', table: '#A0522D',
}

export async function generateMetadata({ params }) {
  const { code } = await params
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('plan_conversations')
    .select('title')
    .eq('short_code', code)
    .single()

  if (!data) return {}

  return {
    title: `${data.title} — Australian Atlas`,
    description: 'A trip plan built with the Australian Atlas AI concierge.',
    openGraph: {
      title: data.title,
      description: 'A trip plan built with the Australian Atlas AI concierge.',
      url: `${SITE_URL}/plan/${code}`,
      siteName: 'Australian Atlas',
    },
  }
}

export default async function SharedPlanPage({ params }) {
  const { code } = await params
  const sb = getSupabaseAdmin()

  const { data: plan } = await sb
    .from('plan_conversations')
    .select('*')
    .eq('short_code', code)
    .single()

  if (!plan) notFound()

  const messages = plan.messages || []

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 80px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 8,
          }}>
            Shared Plan
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(22px, 3vw, 32px)', color: 'var(--color-ink)',
            marginBottom: 12,
          }}>
            {plan.title}
          </h1>
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center',
            fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-body)',
          }}>
            <span>{new Date(plan.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            {plan.regions && plan.regions.length > 0 && (
              <>
                <span>&middot;</span>
                <span>{plan.regions.join(', ')}</span>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        {messages.map((m, i) => (
          <div key={i}>
            {m.role === 'user' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <div style={{
                  maxWidth: '80%', padding: '12px 16px', borderRadius: '16px 16px 4px 16px',
                  background: 'var(--color-ink, #1c1a17)', color: '#fff',
                  fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.6,
                }}>
                  {m.content}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
                <div style={{
                  maxWidth: '85%', padding: '14px 18px', borderRadius: '16px 16px 16px 4px',
                  background: 'var(--color-cream, #f5f0e8)',
                  border: '1px solid var(--color-border)',
                  fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.7,
                  color: 'var(--color-ink)',
                  whiteSpace: 'pre-line',
                }}>
                  {m.content}
                </div>
              </div>
            )}
            {m.venues && m.venues.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, paddingLeft: 4 }}>
                {m.venues.map(v => (
                  <Link key={v.id} href={`/place/${v.slug}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-card-bg, #fff)',
                    textDecoration: 'none', fontSize: 12,
                    fontFamily: 'var(--font-body)', color: 'var(--color-ink)',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: VERTICAL_COLORS[v.vertical] || '#999', flexShrink: 0,
                    }} />
                    <span style={{ fontWeight: 500 }}>{v.name}</span>
                    {v.region && <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{v.region}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* CTA */}
        <div style={{
          borderTop: '1px solid var(--color-border)',
          marginTop: 32, paddingTop: 24,
          textAlign: 'center',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14,
            color: 'var(--color-muted)', marginBottom: 16,
          }}>
            Want to plan your own trip?
          </p>
          <Link href="/plan" style={{
            display: 'inline-block', padding: '11px 24px',
            background: 'var(--color-ink, #1c1a17)', color: '#fff',
            textDecoration: 'none', borderRadius: 6,
            fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
          }}>
            Start Planning
          </Link>
        </div>
      </div>
    </div>
  )
}
