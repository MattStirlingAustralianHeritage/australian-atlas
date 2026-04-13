import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

/**
 * GET /api/cron/staleness-agent
 *
 * Automated URL staleness checker — verifies listing websites are still
 * reachable via HEAD requests. Flags dead URLs after consecutive failures,
 * clears flags when URLs recover, and tracks verification timestamps.
 *
 * Targets: active listings where website is present AND either never verified
 * or last verified more than 90 days ago.
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300 // 5 minutes (Vercel function timeout)

const BATCH_SIZE = 50
const DELAY_MS = 500     // 500ms between requests — ~2 req/s
const TIMEOUT_MS = 10000 // 10 second HEAD request timeout
const FAILURE_THRESHOLD = 2 // consecutive failures before flagging dead

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun('staleness')

  const counts = {
    listings_checked: 0,
    flagged: 0,
    cleared: 0,
    errors: 0,
  }

  try {
    // ── Fetch stale listings in batches ───────────────────────
    // last_verified_at IS NULL OR last_verified_at < now() - 90 days
    // AND website IS NOT NULL
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: batch, error: fetchError } = await sb
        .from('listings')
        .select('id, name, website, staleness_flags, last_verified_at, status')
        .eq('status', 'active')
        .not('website', 'is', null)
        .or(`last_verified_at.is.null,last_verified_at.lt.${cutoff}`)
        .order('last_verified_at', { ascending: true, nullsFirst: true })
        .range(offset, offset + BATCH_SIZE - 1)

      if (fetchError) {
        console.error('[staleness-agent] Fetch error:', fetchError.message)
        counts.errors++
        break
      }

      if (!batch || batch.length === 0) {
        hasMore = false
        break
      }

      // ── Process each listing in the batch ──────────────────
      for (const listing of batch) {
        counts.listings_checked++

        const result = await checkUrl(listing.website)
        const now = new Date().toISOString()
        const flags = { ...(listing.staleness_flags || {}) }

        if (result.ok) {
          // ── Success (2xx or 3xx) ─────────────────────────────
          delete flags.url_dead
          delete flags.url_dead_at
          delete flags.url_status
          flags.consecutive_failures = 0

          const wasFlagged = listing.staleness_flags?.url_dead === true
          if (wasFlagged) counts.cleared++

          const { error: updateError } = await sb
            .from('listings')
            .update({
              last_verified_at: now,
              staleness_flags: cleanFlags(flags),
            })
            .eq('id', listing.id)

          if (updateError) {
            console.error(`[staleness-agent] Update error for "${listing.name}":`, updateError.message)
            counts.errors++
          }
        } else if (result.status === 404 || result.status === 410 || result.connectionFailure) {
          // ── Failure: 404, 410, or connection error ───────────
          const prevFailures = flags.consecutive_failures || 0
          const newFailures = prevFailures + 1
          flags.consecutive_failures = newFailures

          if (newFailures >= FAILURE_THRESHOLD) {
            flags.url_dead = true
            flags.url_dead_at = now
            flags.url_status = result.status || 0
          }

          const updates = {
            staleness_flags: flags,
          }

          // Only downgrade status and mark flagged when threshold is reached
          if (newFailures >= FAILURE_THRESHOLD) {
            updates.status = 'unverified'
            counts.flagged++
            console.log(`[staleness-agent] FLAGGED: "${listing.name}" — ${result.status || 'connection failure'} (${newFailures} consecutive)`)
          } else {
            console.log(`[staleness-agent] WARN: "${listing.name}" — ${result.status || result.error} (failure ${newFailures}/${FAILURE_THRESHOLD})`)
          }

          const { error: updateError } = await sb
            .from('listings')
            .update(updates)
            .eq('id', listing.id)

          if (updateError) {
            console.error(`[staleness-agent] Update error for "${listing.name}":`, updateError.message)
            counts.errors++
          }
        } else {
          // ── Other errors (5xx, timeout, etc.) — log but don't flag
          console.log(`[staleness-agent] SKIP: "${listing.name}" — ${result.status || result.error} (transient, not flagging)`)
        }

        // Rate limit between requests
        await delay(DELAY_MS)
      }

      // Move to next batch
      if (batch.length < BATCH_SIZE) {
        hasMore = false
      } else {
        offset += batch.length
      }
    }

    // ── Log run completion ──────────────────────────────────────
    await completeRun(runId, {
      summary: {
        listings_checked: counts.listings_checked,
        flagged: counts.flagged,
        cleared: counts.cleared,
        errors: counts.errors,
      },
    })

    // ── Send summary email ──────────────────────────────────────
    await sendAgentEmail({
      subject: `Staleness Agent — ${new Date().toLocaleDateString('en-AU')}`,
      html: buildEmailHtml(counts),
    })

    console.log(
      `[staleness-agent] Done — checked: ${counts.listings_checked}, flagged: ${counts.flagged}, cleared: ${counts.cleared}, errors: ${counts.errors}`
    )

    return NextResponse.json({
      success: true,
      ...counts,
    })

  } catch (err) {
    console.error('[staleness-agent] Fatal error:', err.message)

    await completeRun(runId, {
      status: 'error',
      error: err.message,
      summary: counts,
    })

    return NextResponse.json(
      { error: 'Staleness agent failed', detail: err.message },
      { status: 500 }
    )
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * HEAD request with timeout. Returns { ok, status, error, connectionFailure }.
 */
async function checkUrl(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (staleness-check)' },
    })
    clearTimeout(timeout)

    // 2xx and 3xx are both considered alive (redirects followed automatically)
    const ok = res.status >= 200 && res.status < 400
    return { ok, status: res.status, connectionFailure: false }
  } catch (err) {
    clearTimeout(timeout)
    return {
      ok: false,
      status: 0,
      error: err.name === 'AbortError' ? 'timeout' : (err.code || err.message),
      connectionFailure: true,
    }
  }
}

/**
 * Remove empty/zeroed flags object to keep column clean.
 */
function cleanFlags(flags) {
  const cleaned = { ...flags }

  // Remove consecutive_failures if reset to 0 and no other meaningful flags
  if (cleaned.consecutive_failures === 0) delete cleaned.consecutive_failures

  // If nothing left, return null instead of empty object
  const keys = Object.keys(cleaned)
  if (keys.length === 0) return null
  // Only consecutive_failures at 0 is not meaningful
  return cleaned
}

/**
 * Simple delay helper.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Build the HTML body for the summary email.
 */
function buildEmailHtml(counts) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">Staleness Agent Run Complete</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Listings checked</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${counts.listings_checked}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Flagged as dead</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: ${counts.flagged > 0 ? '#dc2626' : '#16a34a'};">${counts.flagged}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Cleared (recovered)</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: ${counts.cleared > 0 ? '#16a34a' : '#666'};">${counts.cleared}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Errors</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${counts.errors > 0 ? '#f59e0b' : '#666'};">${counts.errors}</td>
        </tr>
      </table>
      <div style="margin-top: 20px;">
        <a href="https://australianatlas.com.au/admin/staleness" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
          Review in Admin
        </a>
      </div>
      <p style="margin-top: 16px; font-size: 12px; color: #999;">Automated by Australian Atlas Staleness Agent</p>
    </div>
  `.trim()
}
