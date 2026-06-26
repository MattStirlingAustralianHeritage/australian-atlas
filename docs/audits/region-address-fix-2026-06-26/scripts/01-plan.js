const fs = require('fs');
const { makeClient } = require('./db.js');
const MAL = `(region ~ ',' or region ~ '^[[:space:]]*[0-9]')`;
const OUT = __dirname;

(async () => {
  const c = makeClient();
  await c.connect();

  // Full pre-image snapshot of all 489 + tier-1 derived region (live smallest-wins)
  const res = await c.query(`
    with mal as (
      select id, region, suburb, state, lat, lng, address, region_computed_id, region_override_id
      from listings where ${MAL}
    )
    select m.*,
      sp.name as live_region, sp.id as live_region_id
    from mal m
    left join lateral (
      select rg.id, rg.name from regions rg
      where rg.status='live' and rg.polygon is not null
        and ST_Contains(rg.polygon, ST_SetSRID(ST_MakePoint(m.lng,m.lat),4326))
      order by ST_Area(rg.polygon::geography) asc, rg.id asc
      limit 1
    ) sp on true
    order by m.state, sp.name nulls last, m.region`);

  const all = res.rows;
  const tier1 = all.filter(r => r.live_region);
  const tier2 = all.filter(r => !r.live_region);
  console.log(`TOTAL malformed: ${all.length}  | Tier1 (live region): ${tier1.length}  | Tier2 (no live region): ${tier2.length}`);

  // sanity: tier1 new value must NOT itself look like an address
  const badTargets = tier1.filter(r => /,/.test(r.live_region) || /^\s*\d/.test(r.live_region));
  console.log('Tier1 targets that themselves look address-like:', badTargets.length);

  // sanity: would any tier1 row's new region == old region? (no-op)
  const noop = tier1.filter(r => r.region === r.live_region);
  console.log('Tier1 rows where new==old (no-op):', noop.length);

  // Write full pre-image snapshot CSV (all 489)
  const esc = s => s==null ? '' : '"'+String(s).replace(/"/g,'""')+'"';
  const header = 'id,old_region,new_region,tier,live_region_id,state,suburb,lat,lng,address,region_computed_id,region_override_id\n';
  const lines = all.map(r => [
    r.id, esc(r.region), esc(r.live_region||''), r.live_region?'1':'2',
    r.live_region_id||'', esc(r.state), esc(r.suburb), r.lat, r.lng, esc(r.address),
    r.region_computed_id||'', r.region_override_id||''
  ].join(',')).join('\n');
  fs.writeFileSync(OUT+'/preimage_all489.csv', header+lines+'\n');
  console.log('Wrote preimage_all489.csv');

  // Write rollback SQL (restore old region by id) for all 489
  const rb = all.map(r =>
    `update public.listings set region = ${r.region==null?'null':"'"+r.region.replace(/'/g,"''")+"'"} where id = '${r.id}';`
  ).join('\n');
  fs.writeFileSync(OUT+'/rollback_region.sql', '-- Rollback: restore original region text for all 489 rows\nbegin;\n'+rb+'\ncommit;\n');
  console.log('Wrote rollback_region.sql');

  // Write tier1 apply plan as JSON (id -> new_region, grouped by region)
  const byRegion = {};
  for (const r of tier1) (byRegion[r.live_region] ||= []).push(r.id);
  fs.writeFileSync(OUT+'/tier1_plan.json', JSON.stringify(byRegion, null, 0));
  const batchSummary = Object.entries(byRegion).map(([reg,ids])=>({region:reg,rows:ids.length})).sort((a,b)=>b.rows-a.rows);
  console.log(`Tier1 distinct target regions: ${Object.keys(byRegion).length}, total rows: ${tier1.reduce((n,_)=>n,0)||tier1.length}`);
  console.log('Top target regions:'); console.table(batchSummary.slice(0,15));
  const sumRows = Object.values(byRegion).reduce((n,a)=>n+a.length,0);
  console.log('SUM of batch rows (must equal Tier1 count '+tier1.length+'):', sumRows);

  await c.end();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
