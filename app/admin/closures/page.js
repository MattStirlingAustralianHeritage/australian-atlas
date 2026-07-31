import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { fetchClosureSignals, countClosureSignals } from '@/lib/closures/queue'
import ClosuresClient from './ClosuresClient'

// Auth handled by middleware (all /admin/* routes).
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Closures — Admin' }

export default async function ClosuresPage() {
  const sb = getSupabaseAdmin()

  let rows = []
  let counts = { open: 0, resolved: 0 }
  let tableMissing = false
  let loadError = null
  try {
    const res = await fetchClosureSignals(sb, { view: 'open' })
    rows = res.rows
    tableMissing = res.tableMissing
    if (!tableMissing) counts = await countClosureSignals(sb)
  } catch (err) {
    loadError = err.message
  }

  return (
    <ClosuresClient
      initialRows={rows}
      initialCounts={counts}
      tableMissing={tableMissing}
      loadError={loadError}
    />
  )
}
