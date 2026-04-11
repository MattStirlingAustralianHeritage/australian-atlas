import { NextResponse } from 'next/server'
import { syncVertical, syncFineGrounds } from '../../../../lib/sync/syncVertical.js'
import { syncArticles } from '../../../../lib/sync/syncArticles.js'
import { generateEmbeddings } from '../../../../lib/sync/syncEmbeddings.js'
import { updateRegionCounts } from '../../../../lib/sync/updateRegionCounts.js'
import { sendSyncAlert } from '../../../../lib/sync/alerts.js'
import { getSupabaseAdmin } from '../../../../lib/supabase/clients.js'

// Standard verticals (single source table)
const STANDARD_VERTICALS = [
  'sba', 'collection', 'craft', 'rest',
  'field', 'corner', 'found', 'table',
]

// Verticals exempt from website requirement (natural places, heritage sites, discovery platforms)
const WEBSITE_EXEMPT_VERTICALS = ['field', 'collection', 'fine_grounds']

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

  // 6. Post-sync website enforcement
  // Hide newly synced listings without a website (for non-exempt verticals)
  // Also reinstate listings that gained a website via sync
  let hiddenCount = 0
  let reinstatedCount = 0
  try {
    const master = getSupabaseAdmin()

    // Hide active listings with no website in non-exempt verticals
    for (const vertical of [...STANDARD_VERTICALS, 'fine_grounds']) {
      if (WEBSITE_EXEMPT_VERTICALS.includes(vertical)) continue

      const { data: toHide } = await master
        .from('listings')
        .select('id')
        .eq('vertical', vertical)
        .eq('status', 'active')
        .or('website.is.null,website.eq.')

      if (toHide && toHide.length > 0) {
        const { error } = await master
          .from('listings')
          .update({
            status: 'inactive',
            hidden_reason: 'no_website',
            updated_at: new Date().toISOString(),
          })
          .in('id', toHide.map(l => l.id))

        if (!error) {
          hiddenCount += toHide.length
          console.log(`[cron] ${vertical}: hid ${toHide.length} listings (no website)`)
        }
      }
    }

    // Reinstate listings that now have a website (were hidden for no_website)
    const { data: toReinstate } = await master
      .from('listings')
      .select('id, vertical')
      .eq('status', 'inactive')
      .eq('hidden_reason', 'no_website')
      .not('website', 'is', null)
      .neq('website', '')

    if (toReinstate && toReinstate.length > 0) {
      const { error } = await master
        .from('listings')
        .update({
          status: 'active',
          hidden_reason: null,
          updated_at: new Date().toISOString(),
        })
        .in('id', toReinstate.map(l => l.id))

      if (!error) {
        reinstatedCount = toReinstate.length
        console.log(`[cron] Reinstated ${reinstatedCount} listings (website added)`)
      }
    }

    if (hiddenCount > 0 || reinstatedCount > 0) {
      console.log(`[cron] Website enforcement: ${hiddenCount} hidden, ${reinstatedCount} reinstated`)
    }
  } catch (err) {
    console.error('[cron] Website enforcement error:', err.message)
  }

  // 7. Send alert if any failures
  try {
    await sendSyncAlert(results)
  } catch (err) {
    console.error('[cron] Alert send error:', err.message)
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  const totalSynced = results.reduce((sum, r) => sum + (r.synced || 0), 0)
  const totalDeactivated = results.reduce((sum, r) => sum + (r.deactivated || 0), 0)
  const totalErrors = results.filter(r => r.error).length

  console.log(`[cron] Sync complete in ${duration}s: ${totalSynced} listings synced, ${totalDeactivated} deactivated, ${totalErrors} vertical errors, ${articleResult.synced} articles synced, ${hiddenCount} hidden (no website), ${reinstatedCount} reinstated`)

  return NextResponse.json({
    ok: true,
    duration: `${duration}s`,
    listings: { synced: totalSynced, deactivated: totalDeactivated },
    articles: { synced: articleResult.synced },
    websiteEnforcement: { hidden: hiddenCount, reinstated: reinstatedCount },
    verticals: results,
    errors: totalErrors,
  })
}
