const fs = require('fs');
const { makeClient } = require('./db.js');
const MAL = `(region ~ ',' or region ~ '^[[:space:]]*[0-9]')`;
const STATE = /\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT|New South Wales|Victoria|Queensland|South Australia|Western Australia|Tasmania|Northern Territory|Australian Capital Territory)\b/i;
const STREET = /\b(Road|Rd|Street|St|Ave|Avenue|Hwy|Highway|Lane|Ln|Drive|Dr|Cres|Crescent|Court|Ct|Blvd|Boulevard|Pde|Parade|Way|Close|Cl|Terrace|Tce|Place|Pl|Esplanade|Driveway|Track|Circuit|Cct)\b\.?$/i;

function parseLocality(addr) {
  if (!addr) return null;
  let s = addr.replace(/\bAustralia\b/ig,'').replace(/\b\d{4}\b/g,'').trim().replace(/,\s*$/,'');
  // split on commas
  let parts = s.split(',').map(p=>p.trim()).filter(Boolean);
  if (!parts.length) return null;
  // strip trailing state-only part to expose locality
  // find the part that ends with a state token -> locality is the words before the state in that part, OR the previous part
  for (let i=parts.length-1; i>=0; i--) {
    let p = parts[i];
    const m = p.match(STATE);
    if (m) {
      // remove the state token (and anything after) from this part
      let loc = p.replace(STATE, '').replace(/\s+/g,' ').trim().replace(/[,\-]+$/,'').trim();
      if (loc && !/^\d/.test(loc) && !STREET.test(loc) && loc.split(/\s+/).length<=4) return loc;
      // else locality might be the previous comma part
      if (i-1>=0) {
        let prev = parts[i-1].trim();
        if (prev && !/^\d/.test(prev) && !STREET.test(prev)) return prev;
      }
      return null;
    }
  }
  // no state token: take last comma part if it looks like a locality
  let last = parts[parts.length-1];
  if (last && !/^\d/.test(last) && !STREET.test(last) && last.split(/\s+/).length<=4) return last;
  return null;
}

(async () => {
  const c = makeClient();
  await c.connect();
  const rows = (await c.query(`
    with mal as (select id, region, suburb, state, lat, lng, address from listings where ${MAL})
    select m.*, nn.region nearest_region, round(nn.km::numeric,2) nearest_km
    from mal m
    left join lateral (
      select s.region, ST_Distance(ST_SetSRID(ST_MakePoint(m.lng,m.lat),4326)::geography,
             ST_SetSRID(ST_MakePoint(s.lng,s.lat),4326)::geography)/1000 km
      from listings s where s.id<>m.id and s.lat is not null and s.region is not null and s.region<>''
        and not (s.region ~ ',' or s.region ~ '^[[:space:]]*[0-9]')
      order by ST_SetSRID(ST_MakePoint(m.lng,m.lat),4326)<->ST_SetSRID(ST_MakePoint(s.lng,s.lat),4326) limit 1) nn on true
    order by m.state, m.region`)).rows;

  const out = rows.map(r => {
    // prefer address; if empty, try region text (strip state) as a fallback source
    let src = r.address && r.address.trim() ? r.address : r.region;
    let loc = parseLocality(src);
    // suburb column as strong override if present
    if (r.suburb && r.suburb.trim()) loc = r.suburb.trim();
    return { id:r.id.slice(0,8), state:r.state, region:r.region, address:r.address||'', suburb:r.suburb||'',
             parsed:loc||'', nearest:r.nearest_region, km:r.nearest_km };
  });
  fs.writeFileSync(__dirname+'/tier2_parsed.json', JSON.stringify(rows.map((r,i)=>({...out[i], full_id:r.id})),null,2));
  console.log('TIER-2 parsed localities (46):');
  out.forEach(o=>{
    const flag = o.parsed ? '' : '  <-- NO LOCALITY';
    console.log(`[${o.id}] ${o.state||'?'} parsed="${o.parsed}"  | addr="${o.address}" suburb="${o.suburb}" | near="${o.nearest}"@${o.km}km${flag}`);
  });
  const noloc = out.filter(o=>!o.parsed);
  console.log(`\nParsed a locality for ${out.length-noloc.length}/46; ${noloc.length} have NO locality.`);
  await c.end();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
