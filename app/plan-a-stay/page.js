import PlanAStayV2Client from './PlanAStayV2Client'
import { getQualifyingRegions } from '@/lib/plan-a-stay/qualifying-regions'

export const metadata = {
  title: 'Plan a weekend away — Australian Atlas',
  description: "Tell us what you're into and we'll find the region and build the weekend — independent stays, makers, food and the places worth the detour.",
  alternates: { canonical: 'https://australianatlas.com.au/plan-a-stay' },
  openGraph: {
    title: 'Plan a weekend away — Australian Atlas',
    description: "Tell us what you're into and we'll find the region and build the weekend — independent stays, makers, food and the places worth the detour.",
    url: 'https://australianatlas.com.au/plan-a-stay',
    siteName: 'Australian Atlas',
    locale: 'en_AU',
    type: 'website',
  },
}

export default async function PlanAStayV2Page({ searchParams }) {
  const regions = await getQualifyingRegions()

  // Optional region seed from a deep link (e.g. /plan-a-stay?region=barossa-valley).
  // Only seed when the slug matches a qualifying region, so an unknown or
  // below-threshold slug cleanly falls back to the normal flow.
  const params = await searchParams
  const seedRegion = params?.region
    ? (regions.find(r => r.slug === params.region)?.name ?? null)
    : null

  return <PlanAStayV2Client regions={regions} seedRegion={seedRegion} />
}
