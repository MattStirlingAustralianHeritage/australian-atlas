import { getTranslations } from 'next-intl/server'
import NearMeClient from './NearMeClient'

export const metadata = {
  title: 'Near Me — Australian Atlas',
  description: 'Discover independent places near your current location across the Atlas network.',
}

export default async function NearMePage() {
  const t = await getTranslations('map')
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <p className="section-dateline" style={{ marginBottom: 12 }}>
            {t('discovery')}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.015em',
            fontSize: 'clamp(30px, 4.4vw, 46px)', color: 'var(--color-ink)',
          }}>
            {t('whatsNearYou')}
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 16,
            color: 'var(--color-muted)', marginTop: 8, maxWidth: 480, marginInline: 'auto',
          }}>
            {t('nearMeSubtitle')}
          </p>
        </div>
        <NearMeClient />
      </div>
    </div>
  )
}
