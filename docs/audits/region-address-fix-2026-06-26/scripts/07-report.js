const fs = require('fs');
const { makeClient } = require('./db.js');
const DIR=__dirname;
(async () => {
  const c = makeClient();
  await c.connect();
  // load preimage (authoritative OLD values + ids)
  const pre = JSON.parse('['+fs.readFileSync(DIR+'/preimage_all489.csv','utf8').split('\n').slice(1).filter(Boolean).map(line=>{
    // robust CSV parse for our known columns
    const out=[]; let cur='',q=false;
    for(const ch of line){ if(ch=='"'){ if(q && line[line.indexOf(ch)+1]) {} q=!q; cur+=ch;} else if(ch==',' && !q){out.push(cur);cur='';} else cur+=ch; }
    out.push(cur);
    const unq=s=>s.replace(/^"|"$/g,'').replace(/""/g,'"');
    return JSON.stringify({id:out[0], old:unq(out[1]), tier:out[3]});
  }).join(',')+']');
  const ids = pre.map(p=>p.id);
  const cur = (await c.query(`select id, region from listings where id = any($1::uuid[])`, [ids])).rows;
  const curMap={}; cur.forEach(r=>curMap[r.id]=r.region);
  const esc=s=>s==null?'':'"'+String(s).replace(/"/g,'""')+'"';
  let changed=0,left=0;
  const rows = pre.map(p=>{
    const now=curMap[p.id];
    const disp = (now===p.old)?'LEFT(manual)':(p.tier==='1'?'tier1-spatial':'tier2-address');
    if(now===p.old) left++; else changed++;
    return [p.id, esc(p.old), esc(now), disp].join(',');
  });
  fs.writeFileSync(DIR+'/changes_final.csv','id,old_region,new_region,disposition\n'+rows.join('\n')+'\n');
  console.log(`changes_final.csv written: changed=${changed}, left=${left}`);
  await c.end();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
