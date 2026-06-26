const fs = require('fs');
const { makeClient } = require('./db.js');
const MAL_PRED = `(region ~ ',' or region ~ '^[[:space:]]*[0-9]')`;
const plan = JSON.parse(fs.readFileSync(__dirname+'/tier1_plan.json','utf8'));

(async () => {
  const c = makeClient();
  await c.connect();
  const expectedTotal = Object.values(plan).reduce((n,a)=>n+a.length,0);
  console.log('Expected Tier1 updates:', expectedTotal);

  let applied = 0;
  const batchLog = [];
  try {
    await c.query('begin');
    // Guard: confirm malformed count before
    const before = await c.query(`select count(*)::int n from listings where ${MAL_PRED}`);
    if (before.rows[0].n !== 489) throw new Error('Pre-condition: expected 489 malformed, found '+before.rows[0].n);

    for (const [region, ids] of Object.entries(plan)) {
      // Guarded batch: only update rows that are STILL malformed (idempotency guard)
      const r = await c.query(
        `update public.listings set region = $1
         where id = any($2::uuid[]) and ${MAL_PRED}
         returning id`, [region, ids]);
      if (r.rowCount !== ids.length) {
        throw new Error(`Batch "${region}": expected ${ids.length} updated, got ${r.rowCount} — ABORTING`);
      }
      applied += r.rowCount;
      batchLog.push({region, rows: r.rowCount});
    }
    if (applied !== expectedTotal) throw new Error(`Total applied ${applied} != expected ${expectedTotal}`);

    // Post-condition checks BEFORE commit
    const after = await c.query(`select count(*)::int n from listings where ${MAL_PRED}`);
    if (after.rows[0].n !== 46) throw new Error('Post-condition: expected 46 malformed remaining, found '+after.rows[0].n);

    // None of the updated ids should still be malformed
    const allIds = Object.values(plan).flat();
    const stillBad = await c.query(`select count(*)::int n from listings where id = any($1::uuid[]) and ${MAL_PRED}`, [allIds]);
    if (stillBad.rows[0].n !== 0) throw new Error('Post-condition: '+stillBad.rows[0].n+' updated rows still malformed');

    await c.query('commit');
    console.log('COMMIT OK. Batches:', batchLog.length, '| rows updated:', applied);
    console.log('Malformed remaining (Tier2):', after.rows[0].n);
    fs.writeFileSync(__dirname+'/tier1_batchlog.json', JSON.stringify(batchLog,null,2));
  } catch (e) {
    await c.query('rollback').catch(()=>{});
    console.error('ROLLED BACK —', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
