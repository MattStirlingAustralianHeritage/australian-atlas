import { getLocale } from 'next-intl/server'
import DiscoverClient from './DiscoverClient'

export async function generateMetadata() {
  const locale = await getLocale()
  const isKo = locale === 'ko'
  return {
    title: isKo ? '발견하기 — Australian Atlas' : 'Discover — Australian Atlas',
    description: isKo
      ? '한 번에 한 곳씩. 우연을 통해 호주의 독립적인 장소들을 만나보세요.'
      : 'One place at a time. Explore Australia\'s independent places through serendipity.',
  }
}

export default function DiscoverPage() {
  return <DiscoverClient />
}
