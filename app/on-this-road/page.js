import OnThisRoadClient from './OnThisRoadClient'
import PlannerDiscoveryGate from '@/components/planner/PlannerDiscoveryGate'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('onThisRoad')
  const title = t('metaTitle')
  const description = t('metaDescription')
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: 'https://www.australianatlas.com.au/on-this-road',
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'website',
    },
    alternates: {
      canonical: 'https://www.australianatlas.com.au/on-this-road',
    },
  }
}

export default function OnThisRoadPage() {
  return (
    <PlannerDiscoveryGate planner="on-this-road">
      <OnThisRoadClient />
    </PlannerDiscoveryGate>
  )
}
