import { redirect } from 'next/navigation'
import { getTradeContext } from '@/lib/trade/server-auth'
import { publicTradeAccount } from '@/lib/trade/account'
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

  return <TradeBuilderClient account={publicTradeAccount(account)} />
}
