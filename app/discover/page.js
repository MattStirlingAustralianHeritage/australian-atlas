import { getLocale } from 'next-intl/server'
import DiscoverClient from './DiscoverClient'

export async function generateMetadata() {
  const locale = await getLocale()
  return {
    title: {
      en: 'Discover — Australian Atlas',
      ko: '발견하기 — Australian Atlas',
      zh: '发现 — Australian Atlas',
    }[locale] || 'Discover — Australian Atlas',
    description: {
      en: 'One place at a time. Explore Australia\'s independent places through serendipity.',
      ko: '한 번에 한 곳씩. 우연을 통해 호주의 독립적인 장소들을 만나보세요.',
      zh: '一次一个地方。在不期而遇中探索澳大利亚的独立场所。',
    }[locale] || 'One place at a time. Explore Australia\'s independent places through serendipity.',
  }
}

export default function DiscoverPage() {
  return <DiscoverClient />
}
