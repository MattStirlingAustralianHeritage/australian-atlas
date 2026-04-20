import PlanChat from './PlanChat'

const SITE_URL = 'https://australianatlas.com.au'

export const metadata = {
  title: 'Plan Your Trip — Australian Atlas',
  description: 'Plan your next trip across independent Australia. Our AI concierge builds personalised itineraries from thousands of verified makers, producers, stays, and places.',
  openGraph: {
    title: 'Plan Your Trip — Australian Atlas',
    description: 'Plan your next trip across independent Australia. Our AI concierge builds personalised itineraries from thousands of verified makers, producers, stays, and places.',
    url: `${SITE_URL}/plan`,
    siteName: 'Australian Atlas',
    locale: 'en_AU',
    type: 'website',
  },
  alternates: { canonical: `${SITE_URL}/plan` },
}

export default function PlanPage() {
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <PlanChat />
    </div>
  )
}
