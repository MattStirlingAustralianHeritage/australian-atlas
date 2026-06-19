import { NextResponse } from 'next/server'
import { generateEmbeddings } from '../../../../lib/sync/syncEmbeddings.js'

// Dedicated embedding drain — runs hourly so the never-embedded + stale-vector
// backlog isn't starved by the 6-hourly full sync (which runs vertical/article
// sync + website enforcement first). Voyage is free-tier (3 RPM); the paced
// drainer needs the full window, so raise the function timeout.
export const maxDuration = 300

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const t0 = Date.now()
  try {
    const result = await generateEmbeddings({ maxListings: 8000, maxArticles: 200 })
    return NextResponse.json({ ok: true, ...result, ms: Date.now() - t0 })
  } catch (err) {
    console.error('[cron/embeddings] failed:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
