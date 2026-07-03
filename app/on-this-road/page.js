import OnThisRoadClient from './OnThisRoadClient'
import PlannerDiscoveryGate from '@/components/planner/PlannerDiscoveryGate'
import { getLocale } from 'next-intl/server'

export async function generateMetadata() {
  const locale = await getLocale()
  const isKo = locale === 'ko'
  const title = isKo ? '온 디스 로드 — Australian Atlas' : 'On This Road — Australian Atlas'
  const description = isKo
    ? '호주를 가로지르는 로드 트립을 계획하세요. 경로를 따라 독립 메이커, 숙소, 카페, 문화 공간을 발견하세요.'
    : 'Plan a road trip across Australia. Discover independent makers, stays, cafes, and cultural spaces along your route.'
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: 'https://australianatlas.com.au/on-this-road',
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'website',
    },
    alternates: {
      canonical: 'https://australianatlas.com.au/on-this-road',
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
