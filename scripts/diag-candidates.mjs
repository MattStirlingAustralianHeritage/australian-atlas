import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const VERTS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table', 'way']

console.log('=== listing_candidates: counts by vertical × status ===')
const statuses = ['pending', 'rejected', 'converted', 'approved', 'published', 'skipped']
const header = ['vertical'.padEnd(14), ...statuses.map(s => s.slice(0, 9).padEnd(10)), 'TOTAL']
console.log(header.join(''))
for (const v of VERTS) {
  const row = [v.padEnd(14)]
  let total = 0
  for (const s of statuses) {
    const { count } = await sb.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('vertical', v).eq('status', s)
    row.push(String(count || 0).padEnd(10))
    total += (count || 0)
  }
  // grand total (any status)
  const { count: all } = await sb.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('vertical', v)
  row.push(String(all || 0))
  console.log(row.join(''))
}

console.log('\n=== distinct status values actually present ===')
const { data: allRows } = await sb.from('listing_candidates').select('status').limit(10000)
const statusCounts = {}
for (const r of (allRows || [])) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1
console.log(statusCounts)

console.log('\n=== most recent created_at per vertical (has the cron inserted lately?) ===')
for (const v of VERTS) {
  const { data } = await sb.from('listing_candidates').select('created_at, status, source').eq('vertical', v).order('created_at', { ascending: false }).limit(1)
  const r = data?.[0]
  console.log(`${v.padEnd(14)} last_created=${r?.created_at || 'NEVER'}  status=${r?.status || '-'}  source=${r?.source || '-'}`)
}

console.log('\n=== candidates created in the last 10 days, by day (all verticals) ===')
const since = new Date(Date.now() - 10 * 86400000).toISOString()
const { data: recent } = await sb.from('listing_candidates').select('created_at, vertical, source, status').gte('created_at', since).order('created_at', { ascending: false }).limit(2000)
const byDay = {}
for (const r of (recent || [])) {
  const day = (r.created_at || '').slice(0, 10)
  byDay[day] = byDay[day] || { total: 0, verts: {} }
  byDay[day].total++
  byDay[day].verts[r.vertical] = (byDay[day].verts[r.vertical] || 0) + 1
}
for (const day of Object.keys(byDay).sort().reverse()) {
  console.log(`${day}: ${byDay[day].total}  ${JSON.stringify(byDay[day].verts)}`)
}

console.log('\n=== source breakdown for pending candidates ===')
const { data: pendRows } = await sb.from('listing_candidates').select('source, vertical').eq('status', 'pending').limit(2000)
const srcCounts = {}
for (const r of (pendRows || [])) srcCounts[r.source || 'null'] = (srcCounts[r.source || 'null'] || 0) + 1
console.log(srcCounts)

console.log('\n=== sample of 3 Way pending (where did 332 come from?) ===')
const { data: waySample } = await sb.from('listing_candidates').select('name, source, source_detail, created_at, status').eq('vertical', 'way').eq('status', 'pending').limit(3)
console.log(JSON.stringify(waySample, null, 2))
