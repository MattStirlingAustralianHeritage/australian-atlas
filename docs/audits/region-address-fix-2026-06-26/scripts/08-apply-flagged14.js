const fs = require('fs');
const { makeClient } = require('./db.js');
const MAL = `(region ~ ',' or region ~ '^[[:space:]]*[0-9]')`;

// Best-judgment dispositions for the 14 previously-flagged rows.
// SET: locality/region identifiable from the text or an unambiguous geocode (AU geography).
const SET = {
  'ba2a705a':'Brisbane',            // "26 Gray Street, New Farm" — New Farm is inner Brisbane
  '719f2a2e':'Tallebudgera Valley', // region text "allebudgera Valley" (typo); geocode consistent
  'f57db8af':'Glen Davis',          // "1800 Glen Davis Rd" — Glen Davis locality, Capertee Valley
  '22f475e1':'Seal Rocks',          // "40 Seal Rocks Rd" — Seal Rocks coastal locality
  '9390f68d':'Bombah Point',        // "969 Bombah Point Rd" — Myall Lakes locality
  '8dd344f5':'Kempsey',             // "2 Euroka Ave" — geocode at Kempsey NSW
  '94edd075':'Gold Coast',          // "1 Seaworld Dr" — Sea World, Main Beach, Gold Coast
  '8a8cba2c':'Young',               // "88 William St" — geocode at Young NSW
  'e5b034bd':'Hunter Valley',       // "175 Swan St" — Swan St Morpeth, Hunter region
  '87bd88a7':'East Coast',          // "14228 Tasman Hwy" — east-coast Tasmania (sibling convention)
  '0014b4b8':'Canberra District',   // "Lime Kiln Road, ACT" — state=ACT (geocode broken)
  '65ce8738':'Gold Coast',          // "4 Elizabeth St" — geocode at Coomera, north Gold Coast
};
// NULL: genuinely undeterminable — no identifiable region (address preserved in `address` col).
const NULLIFY = {
  '43aabcdc':'32 Bean Ln — Hartley/Lithgow area, no matching live or free-text region',
  '76e9558b':'60 Smith St — Redlands bayside (Victoria Point), no matching region',
};

(async () => {
  const c = makeClient();
  await c.connect();
  const t = (await c.query(`select id, region, lat, lng from listings where ${MAL}`)).rows;
  const byPfx = {}; t.forEach(r => byPfx[r.id.slice(0,8)] = r);
  const keys = [...Object.keys(SET), ...Object.keys(NULLIFY)];
  if (keys.length !== 14) throw new Error('decisions != 14');
  const missing = keys.filter(k=>!byPfx[k]); if (missing.length) throw new Error('missing: '+missing);
  const uncov = t.filter(r=>!keys.includes(r.id.slice(0,8))); if (uncov.length) throw new Error('uncovered: '+uncov.map(r=>r.id.slice(0,8)));
  const badVal = Object.values(SET).filter(v=>/,/.test(v)||/^\s*\d/.test(v)); if (badVal.length) throw new Error('bad SET val: '+badVal);

  const log=[];
  try {
    await c.query('begin');
    if ((await c.query(`select count(*)::int n from listings where ${MAL}`)).rows[0].n !== 14)
      throw new Error('expected 14 malformed pre');
    for (const [pfx,val] of Object.entries(SET)) {
      const r = await c.query(`update public.listings set region=$1 where id=$2 and ${MAL} returning id`, [val, byPfx[pfx].id]);
      if (r.rowCount!==1) throw new Error(pfx+': '+r.rowCount); log.push({id:pfx, old:byPfx[pfx].region, new:val});
    }
    for (const [pfx,reason] of Object.entries(NULLIFY)) {
      const r = await c.query(`update public.listings set region=null where id=$1 and ${MAL} returning id`, [byPfx[pfx].id]);
      if (r.rowCount!==1) throw new Error(pfx+': '+r.rowCount); log.push({id:pfx, old:byPfx[pfx].region, new:null, reason});
    }
    const after = (await c.query(`select count(*)::int n from listings where ${MAL}`)).rows[0].n;
    if (after !== 0) throw new Error('expected 0 malformed remaining, got '+after);
    await c.query('commit');
    console.log('COMMIT OK. 14 resolved (12 set, 2 null). Malformed remaining:', after);
    fs.writeFileSync(__dirname+'/flagged14_applied.json', JSON.stringify(log,null,2));
  } catch(e) { await c.query('rollback').catch(()=>{}); console.error('ROLLED BACK —', e.message); process.exit(1); }
  finally { await c.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
