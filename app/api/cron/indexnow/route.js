import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/cron/indexnow
 *
 * Daily IndexNow submission: pushes URLs whose content changed in the
 * last 25 hours (listings, regions, trails, events, journal articles)
 * to api.indexnow.org so Bing, Naver, Seznam and Yandex re-crawl them
 * promptly. Naver matters for the /ko audience. Google ignores
 * IndexNow; it discovers changes via the sitemap's lastmod instead.
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 60

const SITE_URL = 'https://www.australianatlas.com.au'
const HOST = 'www.australianatlas.com.au'
const INDEXNOW_KEY = '627c7df05f5c308b1257339cc7b7d3ec'
const MAX_URLS = 10000

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

  const [listings, regions, trails, events, articles] = await Promise.all([
    sb
      .from('listings')
      .select('slug')
      .eq('status', 'active')
      .not('slug', 'ilike', 'admin%')
      .or('needs_review.is.null,needs_review.eq.false')
      .gte('updated_at', since)
      .limit(MAX_URLS)
      .then((r) => r.data || []),
    sb
      .from('regions')
      .select('slug')
      .eq('status', 'live')
      .gte('updated_at', since)
      .then((r) => r.data || []),
    sb
      .from('trails')
      .select('slug')
      .not('slug', 'is', null)
      .eq('visibility', 'public')
      .gte('updated_at', since)
      .then((r) => r.data || []),
    sb
      .from('events')
      .select('slug')
      .gte('event_date', new Date().toISOString())
      .gte('updated_at', since)
      .then((r) => r.data || []),
    sb
      .from('articles')
      .select('slug')
      .eq('status', 'published')
      .gte('updated_at', since)
      .then((r) => r.data || []),
  ])

  const urlList = [
    ...listings.map((l) => `${SITE_URL}/place/${l.slug}`),
    ...regions.map((r) => `${SITE_URL}/regions/${r.slug}`),
    ...trails.map((t) => `${SITE_URL}/trails/${t.slug}`),
    ...events.map((e) => `${SITE_URL}/events/${e.slug}`),
    ...articles.map((a) => `${SITE_URL}/journal/${a.slug}`),
  ].slice(0, MAX_URLS)

  if (urlList.length === 0) {
    return NextResponse.json({ submitted: 0, note: 'nothing changed in window' })
  }

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
  })

  return NextResponse.json({
    submitted: urlList.length,
    indexnowStatus: res.status,
    breakdown: {
      listings: listings.length,
      regions: regions.length,
      trails: trails.length,
      events: events.length,
      articles: articles.length,
    },
  })
}
