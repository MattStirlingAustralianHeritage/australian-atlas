import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

export const maxDuration = 300

const AGENT_NAME = 'backlink-builder'
const DELAY_MS = 1000

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Fetch a Wikipedia article summary by title search.
 * Returns { title, url, extract, externalLinks } or null.
 */
async function searchWikipedia(searchTerm) {
  try {
    // Search for matching articles
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&srnamespace=0&srlimit=3&format=json`
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'AustralianAtlasBot/1.0 (matt@australianatlas.com.au)' },
    })

    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const results = searchData.query?.search || []

    if (results.length === 0) return null

    // Get the best match's page info
    const pageTitle = results[0].title
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
    const summaryRes = await fetch(summaryUrl, {
      headers: { 'User-Agent': 'AustralianAtlasBot/1.0 (matt@australianatlas.com.au)' },
    })

    if (!summaryRes.ok) return null
    const summary = await summaryRes.json()

    // Check external links for this page
    const extLinksUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extlinks&ellimit=500&format=json`
    const extRes = await fetch(extLinksUrl, {
      headers: { 'User-Agent': 'AustralianAtlasBot/1.0 (matt@australianatlas.com.au)' },
    })

    let externalLinks = []
    if (extRes.ok) {
      const extData = await extRes.json()
      const pages = extData.query?.pages || {}
      const pageKey = Object.keys(pages)[0]
      externalLinks = (pages[pageKey]?.extlinks || []).map(l => l['*'] || l.url || '')
    }

    return {
      title: summary.title,
      url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`,
      extract: summary.extract || '',
      externalLinks,
    }
  } catch (err) {
    console.error(`[backlink-builder] Wikipedia search failed for "${searchTerm}": ${err.message}`)
    return null
  }
}


// ─── GET handler ────────────────────────────────────────────────

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun(AGENT_NAME)

  const counts = {
    wikipedia_searched: 0,
    wikipedia_found: 0,
    wikipedia_already_cited: 0,
    heritage_searched: 0,
    heritage_found: 0,
    errors: 0,
  }

  const newWikipediaOpps = []
  const newHeritageLinks = []

  try {
    // ════════════════════════════════════════════════════════════
    // Part A — Wikipedia Opportunity Finder
    // ════════════════════════════════════════════════════════════

    console.log('[backlink-builder] Part A: Searching Wikipedia opportunities...')

    // Find high-value listings that might have Wikipedia articles
    // Heritage significance, high quality, or established (pre-1970)
    const { data: wikiCandidates } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, suburb, state, quality_score')
      .eq('status', 'active')
      .or('quality_score.gte.60,editors_pick.eq.true,is_featured.eq.true')
      .order('quality_score', { ascending: false, nullsFirst: false })
      .limit(30)

    // Check which listings already have wikipedia opportunities
    const { data: existingWikiOpps } = await sb
      .from('wikipedia_opportunities')
      .select('listing_id')

    const existingWikiListingIds = new Set((existingWikiOpps || []).map(o => o.listing_id))

    const candidatesFiltered = (wikiCandidates || []).filter(l => !existingWikiListingIds.has(l.id))

    for (const listing of candidatesFiltered.slice(0, 15)) {
      counts.wikipedia_searched++

      // Try multiple search variations
      const searchVariations = [
        listing.name,
        listing.suburb ? `${listing.name} ${listing.suburb}` : null,
        listing.state ? `${listing.name} ${listing.state}` : null,
      ].filter(Boolean)

      let wikiResult = null

      for (const searchTerm of searchVariations) {
        wikiResult = await searchWikipedia(searchTerm)
        if (wikiResult) break
        await delay(500)
      }

      if (!wikiResult) {
        await delay(DELAY_MS)
        continue
      }

      // Check if Australian Atlas is already cited
      const isCited = wikiResult.externalLinks.some(
        link => link.includes('australianatlas.com.au')
      )

      if (isCited) {
        counts.wikipedia_already_cited++
        console.log(`[backlink-builder] Already cited: ${listing.name} → ${wikiResult.title}`)
        await delay(DELAY_MS)
        continue
      }

      // Verify the Wikipedia article is actually about this place (check extract)
      const extractLower = wikiResult.extract.toLowerCase()
      const nameWords = listing.name.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      const nameMatch = nameWords.some(w => extractLower.includes(w))
      const locationMatch = (listing.suburb && extractLower.includes(listing.suburb.toLowerCase())) ||
        (listing.state && extractLower.includes(listing.state.toLowerCase())) ||
        extractLower.includes('australia')

      if (!nameMatch && !locationMatch) {
        console.log(`[backlink-builder] Wikipedia match too weak for "${listing.name}" → "${wikiResult.title}"`)
        await delay(DELAY_MS)
        continue
      }

      // Generate citation
      const suggestedCitation = `* [https://www.australianatlas.com.au/place/${listing.slug} ${listing.name} on Australian Atlas]`

      const { error: insertErr } = await sb.from('wikipedia_opportunities').insert({
        listing_id: listing.id,
        wikipedia_url: wikiResult.url,
        article_title: wikiResult.title,
        suggested_citation: suggestedCitation,
        status: 'pending',
      })

      if (insertErr) {
        counts.errors++
        console.error(`[backlink-builder] Insert error: ${insertErr.message}`)
      } else {
        counts.wikipedia_found++
        newWikipediaOpps.push({
          listingName: listing.name,
          articleTitle: wikiResult.title,
          wikiUrl: wikiResult.url,
        })
        console.log(`[backlink-builder] Wikipedia opportunity: ${listing.name} → ${wikiResult.title}`)
      }

      await delay(DELAY_MS)
    }

    // ════════════════════════════════════════════════════════════
    // Part B — Heritage Cross-link Finder
    // ════════════════════════════════════════════════════════════

    console.log('[backlink-builder] Part B: Searching Heritage crosslinks...')

    // Fetch published Heritage articles (via portal client if available, otherwise skip)
    let heritageArticles = []

    try {
      // Try fetching from the same DB first (articles table may contain heritage content)
      const { data: articles } = await sb
        .from('articles')
        .select('id, title, slug, body, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(50)

      heritageArticles = articles || []
    } catch (err) {
      console.log('[backlink-builder] Could not fetch Heritage articles:', err.message)
    }

    // Check which crosslinks already exist
    const { data: existingCrosslinks } = await sb
      .from('heritage_crosslinks')
      .select('heritage_article_id, listing_id')

    const existingCrosslinkPairs = new Set(
      (existingCrosslinks || []).map(c => `${c.heritage_article_id}:${c.listing_id}`)
    )

    // Fetch all listing names for trigram matching
    const { data: allListings } = await sb
      .from('listings')
      .select('id, name, slug, suburb, state, region')
      .eq('status', 'active')

    const listingsMap = allListings || []

    for (const article of heritageArticles) {
      counts.heritage_searched++

      if (!article.body) continue

      // Extract proper nouns and place names from article body
      const bodyLower = article.body.toLowerCase()

      for (const listing of listingsMap) {
        // Check if listing name appears in article body (case-insensitive)
        const nameLower = listing.name.toLowerCase()
        if (nameLower.length < 4) continue

        // Simple string match — more reliable than trigram in JS
        if (!bodyLower.includes(nameLower)) continue

        // Skip if already linked
        const pairKey = `${article.id}:${listing.id}`
        if (existingCrosslinkPairs.has(pairKey)) continue

        // Calculate a simple confidence score based on match quality
        const nameExact = article.body.includes(listing.name) // exact case match
        const suburbMatch = listing.suburb && bodyLower.includes(listing.suburb.toLowerCase())
        const regionMatch = listing.region && bodyLower.includes(listing.region.toLowerCase())

        let confidence = 0.5
        if (nameExact) confidence += 0.2
        if (suburbMatch) confidence += 0.15
        if (regionMatch) confidence += 0.1

        if (confidence < 0.75) continue

        const articleUrl = `https://australianheritage.au/articles/${article.slug}`

        const { error: insertErr } = await sb.from('heritage_crosslinks').insert({
          heritage_article_id: article.id,
          heritage_article_title: article.title,
          heritage_article_url: articleUrl,
          listing_id: listing.id,
          confidence,
          status: 'pending',
        })

        if (insertErr) {
          counts.errors++
        } else {
          counts.heritage_found++
          newHeritageLinks.push({
            articleTitle: article.title,
            listingName: listing.name,
            confidence: confidence.toFixed(2),
          })
          existingCrosslinkPairs.add(pairKey)
        }
      }
    }

    // ════════════════════════════════════════════════════════════
    // Part C — Run summary and email
    // ════════════════════════════════════════════════════════════

    // Get running totals
    const { count: pendingWiki } = await sb
      .from('wikipedia_opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    const { count: submittedWiki } = await sb
      .from('wikipedia_opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted')

    const { count: pendingCross } = await sb
      .from('heritage_crosslinks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    const totalNew = counts.wikipedia_found + counts.heritage_found

    await sendAgentEmail({
      subject: totalNew > 0
        ? `Backlink Builder — ${counts.wikipedia_found} Wikipedia opportunities, ${counts.heritage_found} Heritage crosslinks found`
        : `Backlink Builder — No new opportunities this month — ${(pendingWiki || 0) + (pendingCross || 0)} still pending in queue`,
      html: buildEmailHtml(counts, newWikipediaOpps, newHeritageLinks, pendingWiki || 0, submittedWiki || 0, pendingCross || 0),
    })

    await completeRun(runId, {
      status: counts.errors > 0 ? 'partial' : 'success',
      summary: counts,
    })

    return NextResponse.json({ ok: true, ...counts })
  } catch (err) {
    console.error(`[backlink-builder] Fatal error: ${err.message}`)
    await completeRun(runId, { status: 'error', error: err.message, summary: counts })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


// ─── Email HTML ──────────────────────────────────────────────────

function buildEmailHtml(counts, wikiOpps, heritageLinks, pendingWiki, submittedWiki, pendingCross) {
  const wikiRows = wikiOpps.map(o => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#2d2a24">${esc(o.listingName)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px">
        <a href="${esc(o.wikiUrl)}" style="color:#1a0dab;text-decoration:none">${esc(o.articleTitle)}</a>
      </td>
    </tr>
  `).join('')

  const heritageRows = heritageLinks.map(l => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#2d2a24">${esc(l.articleTitle)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#2d2a24">${esc(l.listingName)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#8a7a5a;text-align:center">${l.confidence}</td>
    </tr>
  `).join('')

  return `
    <div style="background:#2d2a24;padding:24px 32px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:22px;color:#d4a843">
        Backlink Builder Agent
      </h1>
      <p style="margin:6px 0 0;font-family:sans-serif;font-size:13px;color:#8a7a5a">
        Monthly report — ${new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
      </p>
    </div>

    <div style="padding:24px 32px;background:#faf8f4;border:1px solid #e8e4da;border-top:none;border-radius:0 0 8px 8px">
      <!-- Wikipedia section -->
      <h2 style="font-family:sans-serif;font-size:14px;font-weight:600;color:#2d2a24;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #e8e4da">
        Wikipedia Opportunities
      </h2>

      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div style="text-align:center;padding:12px 20px;background:#fff;border-radius:6px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:28px;color:#4a7c59">${counts.wikipedia_found}</div>
          <div style="font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">New This Month</div>
        </div>
        <div style="text-align:center;padding:12px 20px;background:#fff;border-radius:6px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:28px;color:#C49A3C">${pendingWiki}</div>
          <div style="font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">Pending</div>
        </div>
        <div style="text-align:center;padding:12px 20px;background:#fff;border-radius:6px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:28px;color:#2d2a24">${submittedWiki}</div>
          <div style="font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">Submitted</div>
        </div>
      </div>

      ${wikiRows ? `
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <thead>
            <tr style="background:#f0ece4">
              <th style="padding:6px 12px;text-align:left;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Atlas Listing</th>
              <th style="padding:6px 12px;text-align:left;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Wikipedia Article</th>
            </tr>
          </thead>
          <tbody>${wikiRows}</tbody>
        </table>
      ` : '<p style="font-family:sans-serif;font-size:13px;color:#8a7a5a;margin-bottom:24px">No new Wikipedia opportunities found this month.</p>'}

      <div style="text-align:center;margin-bottom:24px">
        <a href="https://australianatlas.com.au/admin/wikipedia-queue" style="display:inline-block;padding:8px 20px;background:#2d2a24;color:#d4a843;font-family:sans-serif;font-size:12px;font-weight:500;text-decoration:none;border-radius:6px">
          Review Wikipedia Queue
        </a>
      </div>

      <!-- Heritage section -->
      <h2 style="font-family:sans-serif;font-size:14px;font-weight:600;color:#2d2a24;margin:24px 0 12px;padding-top:16px;border-top:1px solid #e8e4da;padding-bottom:8px;border-bottom:1px solid #e8e4da">
        Heritage Crosslinks
      </h2>

      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div style="text-align:center;padding:12px 20px;background:#fff;border-radius:6px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:28px;color:#4a7c59">${counts.heritage_found}</div>
          <div style="font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">New Crosslinks</div>
        </div>
        <div style="text-align:center;padding:12px 20px;background:#fff;border-radius:6px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:28px;color:#C49A3C">${pendingCross}</div>
          <div style="font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">Pending</div>
        </div>
      </div>

      ${heritageRows ? `
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <thead>
            <tr style="background:#f0ece4">
              <th style="padding:6px 12px;text-align:left;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Heritage Article</th>
              <th style="padding:6px 12px;text-align:left;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Atlas Listing</th>
              <th style="padding:6px 12px;text-align:center;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Confidence</th>
            </tr>
          </thead>
          <tbody>${heritageRows}</tbody>
        </table>
      ` : '<p style="font-family:sans-serif;font-size:13px;color:#8a7a5a;margin-bottom:24px">No new Heritage crosslinks found this month.</p>'}

      <div style="text-align:center;margin-bottom:16px">
        <a href="https://australianatlas.com.au/admin/heritage-crosslinks" style="display:inline-block;padding:8px 20px;background:#2d2a24;color:#d4a843;font-family:sans-serif;font-size:12px;font-weight:500;text-decoration:none;border-radius:6px">
          Review Heritage Crosslinks
        </a>
      </div>

      <p style="font-family:sans-serif;font-size:11px;color:#8a7a5a;margin-top:20px;border-top:1px solid #e8e4da;padding-top:12px;text-align:center">
        Searched ${counts.wikipedia_searched} listings on Wikipedia · ${counts.heritage_searched} Heritage articles scanned${counts.errors > 0 ? ` · ${counts.errors} errors` : ''}
      </p>
    </div>
  `
}
