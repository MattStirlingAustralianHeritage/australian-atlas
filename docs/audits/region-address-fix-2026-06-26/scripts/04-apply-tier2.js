const fs = require('fs');
const { makeClient } = require('./db.js');
const MAL = `(region ~ ',' or region ~ '^[[:space:]]*[0-9]')`;

// Explicit, auditable per-row decisions (keyed by id 8-char prefix).
// Source = locality explicitly named in the human-entered address (geocode-independent),
// except Katherine which uses a tight 0.37km sibling (geocode verified at Katherine).
const SET = {
  '6502f1b7':'Muswellbrook', '768dcf7f':'Bargo', 'fb1eef55':'Coonabarabran', '2acf579c':'Yamba',
  'd53de57d':'Vacy', '1662115f':'The Oaks', 'f2b2e684':'Ballina', 'bddab12d':'Dungog',
  'c8ce63cf':'Slacks Creek', 'b1c3617a':'Wellington Point', 'b671ada0':'Miami', '965d5d93':'Samford',
  '15769adf':'Daintree', 'c7888cba':'Currumbin', '8b7da7d0':'Southport', 'fd814973':'Amity',
  'c5cec9f2':'Broadbeach', '2f80cca3':'Mudgeeraba', '3aa4f078':'Nelia', 'f06377d2':'Palm Grove',
  '138f9c9c':'Waikerie', '36cc2f7e':'Caloote', 'f54356c7':'Barossa Valley', '99aa2753':'Arkaroola Village',
  '206b528b':'Stone Hut', '0948fc61':'Adelaide Hills', '3aa5f695':'Binalong Bay', '144b6a55':'St Helens',
  '47f5124f':'Goulds', '13eb39ec':'Broome', '6582e779':'Falmouth', '2407a04a':'Katherine',
};
// 14 deliberately LEFT for manual review (no explicit locality / broken geocode):
const LEAVE = ['0014b4b8','f57db8af','8dd344f5','43aabcdc','22f475e1','9390f68d','94edd075',
  '719f2a2e','ba2a705a','65ce8738','76e9558b','87bd88a7','e5b034bd','8a8cba2c'];

(async () => {
  const c = makeClient();
  await c.connect();
  // resolve full ids for the 46 Tier-2 rows
  const t2 = (await c.query(`select id, region from listings where ${MAL}`)).rows;
  const byPrefix = {}; t2.forEach(r => byPrefix[r.id.slice(0,8)] = r);
  // sanity: every SET/LEAVE key must exist; SET+LEAVE must cover all 46
  const keys = [...Object.keys(SET), ...LEAVE];
  const missing = keys.filter(k => !byPrefix[k]);
  const uncovered = t2.filter(r => !keys.includes(r.id.slice(0,8)));
  if (missing.length) throw new Error('Decision keys not found in DB: '+missing.join(','));
  if (uncovered.length) throw new Error('Tier-2 rows not covered by a decision: '+uncovered.map(r=>r.id.slice(0,8)).join(','));
  if (Object.keys(SET).length + LEAVE.length !== 46) throw new Error('Decisions != 46');
  // sanity: no SET value is itself malformed-looking
  const badVal = Object.entries(SET).filter(([k,v]) => /,/.test(v) || /^\s*\d/.test(v));
  if (badVal.length) throw new Error('SET value looks malformed: '+JSON.stringify(badVal));
  console.log('Decisions validated: SET=%d, LEAVE=%d, total=46', Object.keys(SET).length, LEAVE.length);

  let applied = 0; const log=[];
  try {
    await c.query('begin');
    const before = (await c.query(`select count(*)::int n from listings where ${MAL}`)).rows[0].n;
    if (before !== 46) throw new Error('Pre-condition: expected 46 malformed, found '+before);
    for (const [pfx, val] of Object.entries(SET)) {
      const full = byPrefix[pfx].id;
      const r = await c.query(
        `update public.listings set region=$1 where id=$2 and ${MAL} returning region`, [val, full]);
      if (r.rowCount !== 1) throw new Error(`Row ${pfx}: expected 1 update, got ${r.rowCount}`);
      applied++; log.push({id:pfx, old:byPrefix[pfx].region, new:val});
    }
    if (applied !== 32) throw new Error('Applied '+applied+' != 32');
    const after = (await c.query(`select count(*)::int n from listings where ${MAL}`)).rows[0].n;
    if (after !== 14) throw new Error('Post-condition: expected 14 malformed remaining, found '+after);
    await c.query('commit');
    console.log('COMMIT OK. Tier-2 set %d rows. Malformed remaining (flagged for manual): %d', applied, after);
    fs.writeFileSync(__dirname+'/tier2_applied.json', JSON.stringify({set:log, left:LEAVE},null,2));
  } catch(e) {
    await c.query('rollback').catch(()=>{});
    console.error('ROLLED BACK —', e.message); process.exit(1);
  } finally { await c.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
