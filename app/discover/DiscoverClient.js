'use client'

import { useTranslations } from 'next-intl'
import DiscoverDeck from '@/components/discover/DiscoverDeck'

// The /discover surface is now an in-flow page below the global nav (no
// full-bleed overlay). All the mechanic lives in the shared DiscoverDeck so
// the homepage band reuses it verbatim. The masthead gives the floating deck
// an editorial frame — without it the card hovered in unexplained space.
export default function DiscoverClient() {
  const t = useTranslations('discoverPage')
  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="page-masthead max-w-2xl" style={{ paddingBottom: 0 }}>
          <p className="section-dateline">{t('kicker')}</p>
          <h1 className="masthead-title">{t('title')}</h1>
          <p className="masthead-sub">
            {t('sub')}
          </p>
        </div>
      </div>
      <DiscoverDeck variant="fullscreen" />
    </>
  )
}
