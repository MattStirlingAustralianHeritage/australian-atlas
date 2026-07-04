import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import ReportInfringementForm from './ReportInfringementForm'

export async function generateMetadata() {
  const t = await getTranslations('reportInfringement')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
}

export default async function ReportInfringementPage({ searchParams }) {
  const t = await getTranslations('reportInfringement')
  const sp = (await searchParams) || {}
  const slug = typeof sp.slug === 'string' ? sp.slug : ''
  const name = typeof sp.name === 'string' ? sp.name : ''

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-2xl mx-auto px-5 py-16">
        <nav className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}
          >
            ← Australian Atlas
          </Link>
        </nav>

        <h1
          className="mb-2"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(24px, 4vw, 32px)', lineHeight: 1.2, color: 'var(--color-ink)' }}
        >
          {t('heading')}
        </h1>
        <p className="mb-8" style={{ fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6 }}>
          {t('intro', { brand: 'Australian Atlas' })}
        </p>

        <ReportInfringementForm initialSlug={slug} initialName={name} />
      </div>
    </div>
  )
}
