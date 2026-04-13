import OnThisRoadClient from './OnThisRoadClient'

export const metadata = {
  title: 'On This Road — Australian Atlas',
  description: 'Plan a road trip across Australia. Discover independent makers, stays, cafes, and cultural spaces along your route.',
  openGraph: {
    title: 'On This Road — Australian Atlas',
    description: 'Plan a road trip across Australia. Discover independent makers, stays, cafes, and cultural spaces along your route.',
    url: 'https://australianatlas.com.au/on-this-road',
    siteName: 'Australian Atlas',
    locale: 'en_AU',
    type: 'website',
  },
  alternates: {
    canonical: 'https://australianatlas.com.au/on-this-road',
  },
}

export default function OnThisRoadPage() {
  return <OnThisRoadClient />
}
