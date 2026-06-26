const fs = require('fs'); const { makeClient } = require('./db.js'); const DIR=__dirname;
const parseCsvLine = (line) => { const out=[];let cur='',q=false; for(let i=0;i<line.length;i++){const ch=line[i]; if(ch=='"'){ if(q&&line[i+1]=='"'){cur+='"';i++;} else q=!q; } else if(ch==','&&!q){out.push(cur);cur='';} else cur+=ch;} out.push(cur); return out; };
(async () => {
  const c = makeClient(); await c.connect();
  const pre = fs.readFileSync(DIR+'/preimage_all489.csv','utf8').split('\n').slice(1).filter(Boolean).map(parseCsvLine).map(f=>({id:f[0], old:f[1]}));
  // stage membership
  const t1 = new Set(Object.values(JSON.parse(fs.readFileSync(DIR+'/tier1_plan.json'))).flat());
  const t2 = new Set(JSON.parse(fs.readFileSync(DIR+'/tier2_applied.json')).set.map(x=>x.id)); // 8-char
  const fl = JSON.parse(fs.readFileSync(DIR+'/flagged14_applied.json'));
  const t3set = new Set(fl.filter(x=>x.new!==null).map(x=>x.id)); const t3null = new Set(fl.filter(x=>x.new===null).map(x=>x.id));
  const ids = pre.map(p=>p.id);
  const cur = {}; (await c.query(`select id,region from listings where id=any($1::uuid[])`,[ids])).rows.forEach(r=>cur[r.id]=r.region);
  const esc=s=>s==null?'':'"'+String(s).replace(/"/g,'""')+'"';
  const tally={};
  const rows = pre.map(p=>{
    const pfx=p.id.slice(0,8); let disp;
    if (t1.has(p.id)) disp='tier1-live-spatial';
    else if (t2.has(pfx)) disp='tier2-address-locality';
    else if (t3set.has(pfx)) disp='tier3-best-judgment';
    else if (t3null.has(pfx)) disp='tier3-null-undeterminable';
    else disp='UNKNOWN';
    tally[disp]=(tally[disp]||0)+1;
    return [p.id, esc(p.old), esc(cur[p.id]), disp].join(',');
  });
  fs.writeFileSync(DIR+'/changes_final.csv','id,old_region,new_region,disposition\n'+rows.join('\n')+'\n');
  console.log('Final change log written. Tally:'); console.table(tally);
  const tot=Object.values(tally).reduce((a,b)=>a+b,0); console.log('Total rows:',tot);
  await c.end();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
