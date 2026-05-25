import PlanAStayV2Client from './PlanAStayV2Client'

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

export default function PlanAStayV2Page() {
  return <PlanAStayV2Client />
}
