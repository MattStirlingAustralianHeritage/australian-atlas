import PlanAStayV2Client from './PlanAStayV2Client'
import { getQualifyingRegions } from '@/lib/plan-a-stay/qualifying-regions'
import PlannerDiscoveryGate from '@/components/planner/PlannerDiscoveryGate'
import { getTranslations, getLocale } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('planStay')
  const locale = await getLocale()
  const title = t('metaTitle')
  const description = t('metaDescription')
  return {
    title,
    description,
    alternates: { canonical: 'https://australianatlas.com.au/plan-a-stay-v2' },
    openGraph: {
      title,
      description,
      url: 'https://australianatlas.com.au/plan-a-stay-v2',
      siteName: 'Australian Atlas',
      locale: locale === 'ko' ? 'ko_KR' : 'en_AU',
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
