import { redirect } from 'next/navigation'
import { getTradeContext } from '@/lib/trade/server-auth'
import { publicTradeAccount } from '@/lib/trade/account'
import TradeNav from '@/components/trade/TradeNav'
import TradeBuilderClient from './TradeBuilderClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Itinerary builder | Atlas Trade',
  robots: { index: false, follow: false },
}

/* The builder is gated behind a trade beta account. No account = no entry:
   - signed out → /for-trade (understand it first)
   - signed in without a trade account → /for-trade/apply (accept the terms) */
export default async function TradeBuilderPage() {
  const { user, account } = await getTradeContext()
  if (!user) redirect('/for-trade')
  if (!account) redirect('/for-trade/apply')

  return (
    <>
      <TradeNav active="builder" orgName={account.org_name} />
      <TradeBuilderClient account={publicTradeAccount(account)} />
    </>
  )
}
