// Non-destructive BEFORE-state probe for the `trips` table RLS lockdown.
// Reads only — no rows created. Run: node --env-file=.env.local scripts/probe-trips-rls-before.mjs
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PAT = process.env['CLAUD-CODE-MIGRATIONS']
const ref = (URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
console.log('project_ref =', ref, '(expect nyhkcmvhwbydsqsyvizs)')

// --- Management API helper (PAT) ------------------------------------------
async function mgmt(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`mgmt ${r.status}: ${txt}`)
  return JSON.parse(txt)
}

// --- 1. RLS status + policies on trips ------------------------------------
const rls = await mgmt(`select relname, relrowsecurity, relforcerowsecurity
  from pg_class where oid = 'public.trips'::regclass;`)
console.log('\n[RLS status]', JSON.stringify(rls))

const pols = await mgmt(`select polname,
  case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
              when 'd' then 'DELETE' when '*' then 'ALL' end as cmd,
  (select array_agg(rolname) from pg_roles where oid = any(polroles)) as roles,
  pg_get_expr(polqual, polrelid)      as using_expr,
  pg_get_expr(polwithcheck, polrelid) as withcheck_expr
  from pg_policy where polrelid = 'public.trips'::regclass order by polname;`)
console.log('\n[Policies on trips]')
for (const p of pols) console.log('  -', JSON.stringify(p))

// --- 2. Schema + NOT NULL (to craft a non-destructive insert probe) -------
const cols = await mgmt(`select column_name, data_type, is_nullable, column_default
  from information_schema.columns where table_schema='public' and table_name='trips'
  order by ordinal_position;`)
console.log('\n[Columns]')
for (const c of cols) console.log('  -', c.column_name, c.data_type, c.is_nullable === 'NO' ? 'NOT NULL' : 'null', c.column_default ? `default ${c.column_default}` : '')

const cnt = await mgmt(`select count(*)::int as n from public.trips;`)
console.log('\n[Row count] trips =', cnt[0].n)

// --- 3. Anon-key probes (the browser-shipped key) -------------------------
console.log('\n--- ANON KEY PROBES (BEFORE) ---')
// 3a. anon SELECT
const selR = await fetch(`${URL}/rest/v1/trips?select=*&limit=1`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
})
console.log('anon SELECT  -> HTTP', selR.status, '| sample:', (await selR.text()).slice(0, 120))

// 3b. anon INSERT — empty body. If RLS allows, we hit a NOT NULL/data error
// (23502/PGRST/etc) WITHOUT creating a row. If RLS blocks, we get 42501.
const insR = await fetch(`${URL}/rest/v1/trips`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({}),
})
const insBody = await insR.text()
console.log('anon INSERT{} -> HTTP', insR.status, '| body:', insBody.slice(0, 240))
console.log('\nInterpretation: HTTP 4xx with code 42501 = RLS already blocks anon INSERT.')
console.log('Any other error (NOT NULL 23502 / PGRST / 201) = anon INSERT currently PERMITTED (the vuln).')
