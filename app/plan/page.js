import PlanChat from './PlanChat'
import { getLocale } from 'next-intl/server'
import { ogLocale } from '@/lib/i18n/config'

const SITE_URL = 'https://australianatlas.com.au'

export async function generateMetadata() {
  const locale = await getLocale()
  const title = { en: 'Plan Your Trip — Australian Atlas', ko: '여행 계획하기 — Australian Atlas', zh: '规划您的旅程 — Australian Atlas' }[locale] || 'Plan Your Trip — Australian Atlas'
  const description = {
    en: 'Plan your next trip across independent Australia. Our AI concierge builds personalised itineraries from thousands of verified makers, producers, stays, and places.',
    ko: '독립적인 호주 전역을 아우르는 다음 여행을 계획하세요. AI 컨시어지가 검증된 수천 곳의 메이커, 생산자, 숙소, 명소를 바탕으로 맞춤 여정을 만들어 드립니다.',
    zh: '规划您在独立澳大利亚的下一趟旅程。我们的 AI 向导从数千家经核实的匠人、生产商、住宿与场所中，为您量身打造专属行程。',
  }[locale] || 'Plan your next trip across independent Australia. Our AI concierge builds personalised itineraries from thousands of verified makers, producers, stays, and places.'
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/plan`,
      siteName: 'Australian Atlas',
      locale: ogLocale(locale),
      type: 'website',
    },
    alternates: { canonical: `${SITE_URL}/plan` },
  }
}

export default function PlanPage() {
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <PlanChat />
    </div>
  )
}
