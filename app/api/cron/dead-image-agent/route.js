import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

/**
 * GET /api/cron/dead-image-agent
 *
 * Automated hero image health checker. Runs weekly (Tuesday 3am AEST).
 *
 * HEAD-checks every active listing with a hero_image_url.
 *   - Dead (404/410/403/connection failure): nulls hero_image_url,
 *     flags staleness_flags.hero_image_status = 'dead'
 *   - Alive (2xx/3xx): flags hero_image_status = 'verified',
 *     sets hero_image_verified_at = now()
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300

const BATCH_SIZE = 100
const DELAY_MS = 300

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun('dead-image')

  const counts = {
    images_checked: 0,
    dead: 0,
    verified: 0,
    errors: 0,
  }

  const deadListings = []

  try {
    // ── Pass 1: Check existing hero images ────────────────────
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: batch, error: fetchError } = await sb
        .from('listings')
        .select('id, name, vertical, hero_image_url, staleness_flags')
        .eq('status', 'active')
        .not('hero_image_url', 'is', null)
        .order('id')
        .range(offset, offset + BATCH_SIZE - 1)

      if (fetchError) {
        console.error('[dead-image-agent] Fetch error:', fetchError.message)
        counts.errors++
        break
      }

      if (!batch || batch.length === 0) {
        hasMore = false
        break
      }

      for (const listing of batch) {
        counts.images_checked++
        const result = await checkImageUrl(listing.hero_image_url)
        const now = new Date().toISOString()
        const flags = { ...(listing.staleness_flags || {}) }

        if (result.ok) {
          // ── Image is alive ──────────────────────────────────
          flags.hero_image_status = 'verified'

          const { error: updateError } = await sb
            .from('listings')
            .update({
              staleness_flags: flags,
              hero_image_verified_at: now,
            })
            .eq('id', listing.id)

          if (updateError) {
            console.error(`[dead-image-agent] Update error for "${listing.name}":`, updateError.message)
            counts.errors++
          } else {
            counts.verified++
          }
        } else if (
          result.status === 404 ||
          result.status === 410 ||
          result.status === 403 ||
          result.status === 0
        ) {
          // ── Image is dead ───────────────────────────────────
          flags.hero_image_status = 'dead'

          const { error: updateError } = await sb
            .from('listings')
            .update({
              hero_image_url: null,
              staleness_flags: flags,
            })
            .eq('id', listing.id)

          if (updateError) {
            console.error(`[dead-image-agent] Update error for "${listing.name}":`, updateError.message)
            counts.errors++
          } else {
            counts.dead++
            deadListings.push({ name: listing.name, vertical: listing.vertical, status: result.status })
            console.log(`[dead-image-agent] DEAD: "${listing.name}" (${listing.vertical}) — status ${result.status || 'connection failure'}`)
          }
        } else {
          // ── Transient error (5xx, etc.) — skip ──────────────
          console.log(`[dead-image-agent] SKIP: "${listing.name}" — status ${result.status} (transient)`)
        }

        await delay(DELAY_MS)
      }

      if (batch.length < BATCH_SIZE) {
        hasMore = false
      } else {
        offset += batch.length
      }
    }

    // ── Log run completion ──────────────────────────────────────
    await completeRun(runId, {
      summary: {
        images_checked: counts.images_checked,
        dead: counts.dead,
        verified: counts.verified,
        errors: counts.errors,
      },
    })

    // ── Send email only if dead images found ────────────────────
    if (counts.dead > 0) {
      await sendAgentEmail({
        subject: `Dead Image Agent — ${counts.dead} broken hero images found`,
        html: buildEmailHtml(counts, deadListings),
      })
    }

    console.log(
      `[dead-image-agent] Done — checked: ${counts.images_checked}, dead: ${counts.dead}, verified: ${counts.verified}, errors: ${counts.errors}`
    )

    return NextResponse.json({
      success: true,
      ...counts,
    })
  } catch (err) {
    console.error('[dead-image-agent] Fatal error:', err.message)

    await completeRun(runId, {
      status: 'error',
      error: err.message,
      summary: counts,
    })

    return NextResponse.json(
      { error: 'Dead image agent failed', detail: err.message },
      { status: 500 }
    )
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * HEAD request to check if an image URL is still reachable.
 */
async function checkImageUrl(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (image-check)' },
    })
    clearTimeout(timeout)
    return { ok: res.status >= 200 && res.status < 400, status: res.status }
  } catch (err) {
    clearTimeout(timeout)
    return { ok: false, status: 0, error: err.message }
  }
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
function buildEmailHtml(counts, deadListings) {
  const VERT_NAMES = {
    sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
    fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
    corner: 'Corner', found: 'Found', table: 'Table',
  }

  let deadSection = ''
  if (deadListings.length > 0) {
    const rows = deadListings
      .map(l => `<tr>
        <td style="padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px;">${l.name}</td>
        <td style="padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; color: #666;">${VERT_NAMES[l.vertical] || l.vertical}</td>
        <td style="padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; color: #999; text-align: right;">${l.status || 'timeout'}</td>
      </tr>`)
      .join('')

    deadSection = `
      <h3 style="margin: 20px 0 8px; font-size: 15px; color: #dc2626;">Broken Hero Images</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <th style="text-align: left; font-size: 11px; color: #999; padding: 4px 0; border-bottom: 1px solid #ddd;">Listing</th>
          <th style="text-align: left; font-size: 11px; color: #999; padding: 4px 0; border-bottom: 1px solid #ddd;">Vertical</th>
          <th style="text-align: right; font-size: 11px; color: #999; padding: 4px 0; border-bottom: 1px solid #ddd;">Status</th>
        </tr>
        ${rows}
      </table>
    `
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">Dead Image Agent Run Complete</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Images checked</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${counts.images_checked}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Dead / removed</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: ${counts.dead > 0 ? '#dc2626' : '#16a34a'};">${counts.dead}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Verified OK</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: #16a34a;">${counts.verified}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Errors</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${counts.errors > 0 ? '#f59e0b' : '#666'};">${counts.errors}</td>
        </tr>
      </table>
      ${deadSection}
      <div style="margin-top: 20px;">
        <a href="https://australianatlas.com.au/admin/dead-images" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
          Review in Admin
        </a>
      </div>
      <p style="margin-top: 16px; font-size: 12px; color: #999;">Automated by Australian Atlas Dead Image Agent</p>
    </div>
  `.trim()
}
