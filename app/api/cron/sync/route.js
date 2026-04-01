import { NextResponse } from 'next/server'
import { syncVertical, syncFineGrounds } from '../../../../lib/sync/syncVertical.js'
import { syncArticles } from '../../../../lib/sync/syncArticles.js'
import { generateEmbeddings } from '../../../../lib/sync/syncEmbeddings.js'
import { updateRegionCounts } from '../../../../lib/sync/updateRegionCounts.js'
import { sendSyncAlert } from '../../../../lib/sync/alerts.js'

// Standard verticals (single source table)
const STANDARD_VERTICALS = [
  'sba', 'collection', 'craft', 'rest',
  'field', 'corner', 'found', 'table',
]

export async function GET(request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron] Starting full sync...')
  const startTime = Date.now()
  const results = []

  // 1. Sync all standard verticals
  for (const vertical of STANDARD_VERTICALS) {
    try {
      const result = await syncVertical(vertical)
      results.push(result)
    } catch (err) {
      console.error(`[cron] ${vertical} sync crashed:`, err.message)
      results.push({ vertical, synced: 0, deactivated: 0, error: err.message })
    }
  }

  // 2. Sync Fine Grounds (special: two tables)
  try {
    const fgResult = await syncFineGrounds()
    results.push(fgResult)
  } catch (err) {
    console.error('[cron] fine_grounds sync crashed:', err.message)
    results.push({ vertical: 'fine_grounds', synced: 0, deactivated: 0, error: err.message })
  }

  // 3. Sync articles from CMS
  let articleResult = { synced: 0, error: null }
  try {
    articleResult = await syncArticles()
  } catch (err) {
    console.error('[cron] Article sync crashed:', err.message)
    articleResult = { synced: 0, error: err.message }
  }

  // 4. Generate embeddings for new listings/articles
  try {
    await generateEmbeddings()
  } catch (err) {
    console.error('[cron] Embedding generation error:', err.message)
  }

  // 5. Update region listing counts
  try {
    await updateRegionCounts()
  } catch (err) {
    console.error('[cron] Region count update error:', err.message)
  }

  // 6. Send alert if any failures
  try {
    await sendSyncAlert(results)
  } catch (err) {
    console.error('[cron] Alert send error:', err.message)
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  const totalSynced = results.reduce((sum, r) => sum + (r.synced || 0), 0)
  const totalDeactivated = results.reduce((sum, r) => sum + (r.deactivated || 0), 0)
  const totalErrors = results.filter(r => r.error).length

  console.log(`[cron] Sync complete in ${duration}s: ${totalSynced} listings synced, ${totalDeactivated} deactivated, ${totalErrors} vertical errors, ${articleResult.synced} articles synced`)

  return NextResponse.json({
    ok: true,
    duration: `${duration}s`,
    listings: { synced: totalSynced, deactivated: totalDeactivated },
    articles: { synced: articleResult.synced },
    verticals: results,
    errors: totalErrors,
  })
}
