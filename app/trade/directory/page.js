import { redirect } from 'next/navigation'
import { getTradeContext } from '@/lib/trade/server-auth'
import { publicTradeAccount } from '@/lib/trade/account'
import TradeNav from '@/components/trade/TradeNav'
import TradeDirectoryClient from './TradeDirectoryClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Product directory | Atlas Trade',
  robots: { index: false, follow: false },
}

/* The structured complement to the NL builder: browse and filter the curated
   network the way a product manager works — by region, state, group size,
   coach access and trade terms — then shortlist and hand off to the builder. */
export default async function TradeDirectoryPage() {
  const { user, account } = await getTradeContext()
  if (!user) redirect('/for-trade')
  if (!account) redirect('/for-trade/apply')

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <TradeNav active="directory" orgName={account.org_name} />
      <TradeDirectoryClient account={publicTradeAccount(account)} />
    </div>
  )
}
