const fs = require('fs');
const { makeClient } = require('./db.js');
(async () => {
  const c = makeClient();
  await c.connect();

  // helper to read profile health + regionWeights
  const snap = async (label) => {
    const r = await c.query(`
      select profile_id,
        vector_dims(taste_vector) as dim,
        sqrt( (taste_vector <#> taste_vector) * -1 )::float8 as l2norm,
        source_count,
        category_shares->'regionWeights' as region_weights,
        updated_at
      from taste_profiles order by profile_id`);
    console.log('\n=== taste_profiles '+label+' ===');
    r.rows.forEach(x=>{
      console.log(` ${x.profile_id} dim=${x.dim} l2norm=${Number(x.l2norm).toFixed(6)} sources=${x.source_count}`);
      console.log(`   regionWeights=${JSON.stringify(x.region_weights)}`);
    });
    return r.rows;
  };

  const before = await snap('BEFORE repair');

  console.log('\nRunning repair_all_taste_profiles() ...');
  const rep = await c.query('select public.repair_all_taste_profiles() as n');
  console.log('repair_all_taste_profiles returned:', rep.rows[0].n, 'profile(s) recomputed');

  const after = await snap('AFTER repair');

  // Verify health
  let ok = true;
  for (const p of after) {
    if (Number(p.dim) !== 1024) { ok=false; console.error('FAIL dim != 1024 for', p.profile_id); }
    if (Math.abs(Number(p.l2norm) - 1.0) > 1e-4) { ok=false; console.error('FAIL l2norm != 1.0 for', p.profile_id, p.l2norm); }
  }
  // check regionWeights values contain no address-like strings
  for (const p of after) {
    const rw = p.region_weights || {};
    const bad = Object.keys(rw).filter(k => /,/.test(k) || /^\s*\d/.test(k));
    if (bad.length) { console.warn('  NOTE: regionWeights still has address-like keys for', p.profile_id, bad); }
  }
  console.log('\nVECTOR HEALTH:', ok ? 'PASS (all 1024-dim, L2 norm 1.0)' : 'FAIL');
  fs.writeFileSync(__dirname+'/taste_before_after.json', JSON.stringify({before, after},null,2));
  if (!ok) process.exit(1);
  await c.end();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
