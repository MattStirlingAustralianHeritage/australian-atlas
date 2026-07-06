import PlanAStayV2Client from './PlanAStayV2Client'
import { getQualifyingRegions } from '@/lib/plan-a-stay/qualifying-regions'
import PlannerDiscoveryGate from '@/components/planner/PlannerDiscoveryGate'
import { getTranslations, getLocale } from 'next-intl/server'
import { ogLocale } from '@/lib/i18n/config'

export async function generateMetadata() {
  const t = await getTranslations('planStay')
  const locale = await getLocale()
  const title = t('metaTitle')
  const description = t('metaDescription')
  return {
    title,
    description,
    alternates: { canonical: 'https://www.australianatlas.com.au/plan-a-stay-v2' },
    openGraph: {
      title,
      description,
      url: 'https://www.australianatlas.com.au/plan-a-stay-v2',
      siteName: 'Australian Atlas',
      locale: ogLocale(locale),
      type: 'website',
    },
  }
}

export default async function PlanAStayV2Page() {
  const regions = await getQualifyingRegions()

  return (
    <PlannerDiscoveryGate planner="plan-a-stay">
      <PlanAStayV2Client regions={regions} />
    </PlannerDiscoveryGate>
  )
}
