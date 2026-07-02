import { redirect } from 'next/navigation'
import { getTradeContext } from '@/lib/trade/server-auth'
import { publicTradeAccount } from '@/lib/trade/account'
import TradeNav from '@/components/trade/TradeNav'
import TradeSettingsClient from './TradeSettingsClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Settings | Atlas Trade',
  robots: { index: false, follow: false },
}

/* Co-brand settings: how your organisation appears beside the Atlas
   attribution on shared itineraries (never instead of it — AUP). */
export default async function TradeSettingsPage() {
  const { user, account } = await getTradeContext()
  if (!user) redirect('/for-trade')
  if (!account) redirect('/for-trade/apply')

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <TradeNav active="settings" orgName={account.org_name} />
      <TradeSettingsClient account={publicTradeAccount(account)} />
    </div>
  )
}
