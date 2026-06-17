// Dev verification for the legal-upload-safeguards migrations (166-169) + the
// lib/legal/documents.js helper. Runs an in-process pglite Postgres — no Docker,
// no prod, no network.
//
//   npm i --no-save @electric-sql/pglite   # one-off, not a runtime dep
//   node docs/legal-upload-safeguards/verify.mjs
//
// Exits non-zero if any assertion fails. See README.md for the captured log.
import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'

const mig = (f) => fs.readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8')

const UPLOAD_TERMS_EXACT = 'INTERIM TERMS. By uploading, you confirm you own this image or have permission to use it; that it infringes no copyright or moral rights; that it is not defamatory; and that anyone identifiable in it has consented. You grant the Atlas a licence to display and reproduce it across the Atlas network, and you agree to cover us for any loss arising from a breach of these confirmations. We may remove any content at our discretion.'

let pass = 0, fail = 0
const ok = (cond, label) => { (cond ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}`))) }

// Minimal supabase-js shim over pglite for the chain the helper uses.
function shimFor(db) {
  return {
    from(table) {
      const s = { table, cols: '*', filters: [] }
      const runSelect = async () => {
        let sql = `select ${s.cols} from ${s.table}`; const p = []; const w = []
        for (const [c, op, v] of s.filters) {
          if (op === '=') { p.push(v); w.push(`${c} = $${p.length}`) }
          else if (op === 'in') { const ph = v.map((x) => { p.push(x); return `$${p.length}` }).join(','); w.push(`${c} in (${ph})`) }
        }
        if (w.length) sql += ' where ' + w.join(' and ')
        try { const r = await db.query(sql, p); return { data: r.rows, error: null } } catch (e) { return { data: null, error: { message: e.message } } }
      }
      const b = {
        select(c) { s.cols = c; return b },
        eq(c, v) { s.filters.push([c, '=', v]); return b },
        in(c, v) { s.filters.push([c, 'in', v]); return b },
        then(res, rej) { runSelect().then(res, rej) },
        async insert(rows) {
          const arr = Array.isArray(rows) ? rows : [rows]
          try {
            for (const r of arr) { const k = Object.keys(r); await db.query(`insert into ${s.table} (${k.join(',')}) values (${k.map((_, i) => `$${i + 1}`).join(',')})`, k.map((x) => r[x])) }
            return { data: null, error: null }
          } catch (e) { return { data: null, error: { message: e.message } } }
        },
      }
      return b
    },
  }
}

const db = new PGlite()

await db.exec(`
  create table profiles (id uuid primary key default gen_random_uuid(), email text);
  create table listings (id uuid primary key default gen_random_uuid(), slug text, name text, hero_image_url text);
  create table claims_review (id uuid primary key default gen_random_uuid(), listing_id uuid references listings(id), claimant_email text, status text);
`)

console.log('── Apply migrations 166-169 ──')
for (const f of ['166_legal_documents.sql', '167_legal_acceptances.sql', '168_asset_provenance.sql', '169_infringement_reports.sql']) {
  try { await db.exec(mig(f)); console.log(`  applied ${f}`) } catch (e) { fail++; console.log(`  FAIL applying ${f}: ${e.message}`) }
}

console.log('\n── Schema ──')
for (const t of ['legal_documents', 'legal_acceptances', 'asset_provenance', 'infringement_reports']) {
  ok((await db.query(`select to_regclass('public.${t}') t`)).rows[0].t === t, `table ${t} exists`)
}
const defs = (await db.query(`select pg_get_constraintdef(oid) def from pg_constraint where contype='c' and conrelid in ('legal_documents'::regclass,'asset_provenance'::regclass,'infringement_reports'::regclass)`)).rows.map((r) => r.def).join(' | ')
ok(/operator_agreement.*upload_terms.*terms_of_service.*privacy_policy/s.test(defs), 'doc_type CHECK (4 values)')
ok(/hero.*gallery/s.test(defs), 'asset_kind CHECK')
ok(/active.*flagged.*removed/s.test(defs), 'takedown_status CHECK')
ok(/received.*under_review.*actioned.*rejected/s.test(defs), 'report status CHECK')
ok(/upload_warranty_accepted = true/.test(defs), 'provenance enforces warranty=true')
const inames = (await db.query(`select indexname from pg_indexes where schemaname='public'`)).rows.map((r) => r.indexname)
for (const i of ['legal_documents_one_current_per_type', 'legal_acceptances_operator_document_idx', 'asset_provenance_storage_path_uniq', 'infringement_reports_active_idx']) ok(inames.includes(i), `index ${i}`)
for (const r of (await db.query(`select relname, relrowsecurity from pg_class where relname in ('legal_documents','legal_acceptances','asset_provenance','infringement_reports')`)).rows) ok(r.relrowsecurity, `RLS on ${r.relname}`)

console.log('\n── Seeds ──')
const ld = (await db.query(`select doc_type, version, body_md, is_current, content_hash from legal_documents order by doc_type`)).rows
const up = ld.find((r) => r.doc_type === 'upload_terms'); const oa = ld.find((r) => r.doc_type === 'operator_agreement')
ok(up?.body_md === UPLOAD_TERMS_EXACT, 'upload_terms verbatim')
ok(oa?.body_md === 'INTERIM OPERATOR AGREEMENT. ' + UPLOAD_TERMS_EXACT, 'operator_agreement = prefix + verbatim')
ok((await db.query(`select bool_and(content_hash = encode(sha256(convert_to(body_md,'UTF8')),'hex')) g from legal_documents`)).rows[0].g, 'content_hash = sha256(body_md)')
ok(ld.length === 2, 'only 2 supplied doc_types seeded')

console.log('\n── Data-layer + invariants ──')
const L = (await db.query(`insert into listings (slug,name) values ('x','X') returning id`)).rows[0].id
const P = (await db.query(`insert into profiles (email) values ('o@e.com') returning id`)).rows[0].id
ok(!!(await db.query(`insert into asset_provenance (listing_id,asset_kind,storage_path,uploaded_by,upload_warranty_accepted,upload_warranty_accepted_at) values ($1,'hero','listings/a.jpg',$2,true,now()) returning id`, [L, P])).rows[0].id, 'provenance write (warranty=true)')
try { await db.query(`insert into asset_provenance (listing_id,asset_kind,storage_path,uploaded_by,upload_warranty_accepted) values ($1,'hero','listings/b.jpg',$2,false)`, [L, P]); ok(false, 'warranty=false rejected') } catch { ok(true, 'CHECK rejects warranty=false') }
const R = (await db.query(`insert into infringement_reports (listing_slug,reporter_name,reporter_email,rights_basis,description,good_faith_statement) values ('x','J','j@e.com','owner','mine',true) returning status`)).rows[0]
ok(R.status === 'received', 'report defaults to received')

console.log('\n── Real helper (lib/legal/documents.js) ──')
const helper = await import(new URL('../../lib/legal/documents.js', import.meta.url).href)
const sb = shimFor(db)
const docs = await helper.getCurrentLegalDocuments(sb, helper.CLAIM_REQUIRED_DOC_TYPES)
ok(!!(docs.operator_agreement && docs.upload_terms), 'helper fetches both current docs')
const C = (await db.query(`insert into claims_review (listing_id,claimant_email,status) values ($1,'h@e.com','pending') returning id`, [L])).rows[0].id
const rec = await helper.recordLegalAcceptances(sb, { documents: [docs.operator_agreement, docs.upload_terms], claimId: C, subjectEmail: 'h@e.com', ipAddress: '198.51.100.9', userAgent: 'UA' })
ok(rec.written === 2 && !rec.error, 'helper records 2 acceptances')
ok((await db.query(`select bool_and(operator_id is null and claim_id=$1) g from legal_acceptances where claim_id=$1`, [C])).rows[0].g, 'acceptances pre-account + tied to claim')

console.log(`\n════════ RESULT: ${pass} passed, ${fail} failed ════════`)
process.exit(fail ? 1 : 0)
