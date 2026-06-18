import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const RX = /(choc|cacao|cocoa|truffle|praline|bonbon|ganache|couverture)/i

console.log('=== LISTINGS that look chocolate-related (name/desc/sub_type) ===')
// Pull a wide net then filter in JS (can't regex server-side easily across cols)
const { data: listings, error } = await sb
  .from('listings')
  .select('id,name,slug,vertical,sub_type,sub_types,status,description,search_keywords,embedding,needs_embedding,created_at,quality_score,verticals')
  .or('name.ilike.%choc%,sub_type.ilike.%choc%,description.ilike.%choc%,sub_type.ilike.%cacao%,name.ilike.%cacao%')
  .limit(200)
if (error) { console.error('listings err', error.message); }
console.log(`matched ${listings?.length || 0} chocolate-ish listings`)
for (const l of (listings || [])) {
  const kw = Array.isArray(l.search_keywords) ? l.search_keywords : []
  console.log(`\n[${l.status}] ${l.name}  (vertical=${l.vertical}, sub_type=${l.sub_type})`)
  console.log(`   slug=${l.slug} created=${(l.created_at||'').slice(0,10)} quality=${l.quality_score}`)
  console.log(`   embedding=${l.embedding ? 'YES' : 'NULL'} needs_embedding=${l.needs_embedding}`)
  console.log(`   sub_types=${JSON.stringify(l.sub_types)} verticals=${JSON.stringify(l.verticals)}`)
  console.log(`   search_keywords(${kw.length})=${JSON.stringify(kw)}`)
  console.log(`   description=${(l.description || '(none)').slice(0, 160)}`)
}

console.log('\n\n=== LISTING_CANDIDATES that look chocolate-related ===')
const { data: cands } = await sb
  .from('listing_candidates')
  .select('id,name,vertical,sub_type,status,description,source,created_at')
  .or('name.ilike.%choc%,sub_type.ilike.%choc%,description.ilike.%choc%')
  .limit(200)
console.log(`matched ${cands?.length || 0} chocolate-ish candidates`)
for (const c of (cands || [])) {
  console.log(`[${c.status}] ${c.name} (v=${c.vertical}, sub_type=${c.sub_type}, src=${c.source}) created=${(c.created_at||'').slice(0,10)}`)
}

console.log('\n\n=== RPC search_listings_hybrid: "Belgium style chocolates" (lexical-only, no embedding) ===')
const { data: rpc1, error: e1 } = await sb.rpc('search_listings_hybrid', {
  query_embedding: null,
  query_text: 'Belgium style chocolates',
  match_count: 12,
})
if (e1) console.error('rpc err', e1.message)
console.log(`returned ${rpc1?.length || 0}`)
for (const r of (rpc1 || [])) console.log(`  ${r.name} (${r.vertical}/${r.sub_type}) fused=${r.fused_score?.toFixed(4)}`)

console.log('\n=== RPC: "chocolate" (lexical-only) ===')
const { data: rpc2 } = await sb.rpc('search_listings_hybrid', { query_embedding: null, query_text: 'chocolate', match_count: 12 })
console.log(`returned ${rpc2?.length || 0}`)
for (const r of (rpc2 || [])) console.log(`  ${r.name} (${r.vertical}/${r.sub_type})`)

console.log('\n=== RPC: "chocolatier" (lexical-only) ===')
const { data: rpc3 } = await sb.rpc('search_listings_hybrid', { query_embedding: null, query_text: 'chocolatier', match_count: 12 })
console.log(`returned ${rpc3?.length || 0}`)
for (const r of (rpc3 || [])) console.log(`  ${r.name} (${r.vertical}/${r.sub_type})`)

console.log('\n=== embedding coverage across ALL active listings ===')
const { count: totalActive } = await sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active')
const { count: missingEmb } = await sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active').is('embedding', null)
const { count: needsEmb } = await sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('needs_embedding', true)
console.log(`active=${totalActive} missing_embedding=${missingEmb} needs_embedding=${needsEmb}`)
