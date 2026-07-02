import { redirect } from 'next/navigation'
import { getTradeContext } from '@/lib/trade/server-auth'
import TradeNav from '@/components/trade/TradeNav'
import TradeEnquiriesClient from './TradeEnquiriesClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Enquiries | Atlas Trade',
  robots: { index: false, follow: false },
}

/* The enquiry tracker: what you've asked, who's answered, what's still open.
   Status is buyer-maintained (replies go straight to the buyer's inbox). */
export default async function TradeEnquiriesPage() {
  const { user, account } = await getTradeContext()
  if (!user) redirect('/for-trade')
  if (!account) redirect('/for-trade/apply')

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <TradeNav active="enquiries" orgName={account.org_name} />
      <TradeEnquiriesClient />
    </div>
  )
}
