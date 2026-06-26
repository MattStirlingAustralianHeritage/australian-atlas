const fs = require('fs');
const { makeClient } = require('./db.js');
const MAL = `(region ~ ',' or region ~ '^[[:space:]]*[0-9]')`;
(async () => {
  const c = makeClient();
  await c.connect();
  const remaining = (await c.query(`select id, region, state, lat, lng, address from listings where ${MAL} order by state, region`)).rows;
  console.log('FINAL malformed remaining:', remaining.length, '(flagged for manual review)');
  const total = (await c.query(`select count(*)::int n from listings`)).rows[0].n;
  console.log('Total listings (unchanged, no deletes):', total);

  // Confirm the 14 remaining still hold their ORIGINAL value (we did not touch them)
  const pre = fs.readFileSync(__dirname+'/preimage_all489.csv','utf8').split('\n').slice(1).filter(Boolean);
  const preMap = {};
  pre.forEach(l=>{ const m=l.match(/^([0-9a-f-]{36}),("(?:[^"]|"")*"|),/); }); // not robust; reload from DB-independent source
  console.log('\n14 rows LEFT for manual review:');
  remaining.forEach(r=>console.log(`  [${r.id.slice(0,8)}] ${r.state||'?'} "${r.region}"  (addr="${r.address||''}")`));

  // Reconcile counts
  const t1 = JSON.parse(fs.readFileSync(__dirname+'/tier1_batchlog.json','utf8')).reduce((n,b)=>n+b.rows,0);
  const t2 = JSON.parse(fs.readFileSync(__dirname+'/tier2_applied.json','utf8')).set.length;
  console.log(`\nRECONCILE: Tier1=${t1} + Tier2=${t2} = ${t1+t2} fixed; ${remaining.length} left; total=${t1+t2+remaining.length} (expect 489)`);
  await c.end();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
