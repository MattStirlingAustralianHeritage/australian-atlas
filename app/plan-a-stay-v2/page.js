import PlanAStayV2Client from './PlanAStayV2Client'
import { getQualifyingRegions } from '@/lib/plan-a-stay/qualifying-regions'

export const metadata = {
  title: 'Plan a stay — Australian Atlas',
  description: "Tell us what kind of trip you're after. We'll build it from what's listed.",
  alternates: { canonical: 'https://australianatlas.com.au/plan-a-stay-v2' },
  openGraph: {
    title: 'Plan a stay — Australian Atlas',
    description: "Tell us what kind of trip you're after. We'll build it from what's listed.",
    url: 'https://australianatlas.com.au/plan-a-stay-v2',
    siteName: 'Australian Atlas',
    locale: 'en_AU',
    type: 'website',
  },
}

export default async function PlanAStayV2Page() {
  const regions = await getQualifyingRegions()

  return <PlanAStayV2Client regions={regions} />
}
