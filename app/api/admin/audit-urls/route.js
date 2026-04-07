import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// ============================================================
// URL Audit & Fix endpoint
// Scans master DB and all vertical DBs for malformed website URLs.
// GET: report only (dry run)
// POST: fix all malformed URLs
// ============================================================

function normaliseUrl(url) {
  if (!url || typeof url !== 'string') return url
  let u = url.trim()
  if (!u) return u
  // Strip common malformed prefixes
  u = u.replace(/^https?\/\//, 'https://')  // http// → https://
  u = u.replace(/^https?:\/(?=[^/])/, 'https://') // https:/x → https://x
  // Add protocol if missing
  if (u && !u.startsWith('http://') && !u.startsWith('https://')) {
    u = `https://${u}`
  }
  // Upgrade http to https
  if (u.startsWith('http://')) {
    u = u.replace(/^http:\/\//, 'https://')
  }
  return u
}

function isMalformed(url) {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  // Missing protocol or malformed protocol
  if (!trimmed.startsWith('https://')) return true
  return false
}

// Vertical table + website column config
const VERTICAL_TABLES = {
  sba:          { table: 'venues',     col: 'website' },
  collection:   { table: 'venues',     col: 'website' },
  craft:        { table: 'venues',     col: 'website' },
  fine_grounds: { tables: [{ table: 'roasters', col: 'website' }, { table: 'cafes', col: 'website' }] },
  rest:         { table: 'properties', col: 'website' },
  field:        { table: 'places',     col: 'website' },
  corner:       { table: 'shops',      col: 'website_url' },
  found:        { table: 'shops',      col: 'website' },
  table:        { table: 'listings',   col: 'website_url' },
}

async function auditTable(client, table, col, label) {
  const { data, error } = await client
    .from(table)
    .select(`id, slug, ${col}`)
    .not(col, 'is', null)
    .neq(col, '')

  if (error) return { label, error: error.message, malformed: [], fixed: 0 }

  const malformed = (data || []).filter(row => isMalformed(row[col]))
  return {
    label,
    total: (data || []).length,
    malformed: malformed.map(r => ({ id: r.id, slug: r.slug, url: r[col], fixed: normaliseUrl(r[col]) })),
  }
}

async function fixTable(client, table, col, label) {
  const audit = await auditTable(client, table, col, label)
  if (audit.error) return audit

  let fixed = 0
  for (const row of audit.malformed) {
    const { error } = await client
      .from(table)
      .update({ [col]: row.fixed })
      .eq('id', row.id)
    if (!error) fixed++
  }

  return { ...audit, fixed }
}

export async function GET(request) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_auth')?.value !== 'admin_authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = {}

  // 1. Master DB
  const master = getSupabaseAdmin()
  results.master = await auditTable(master, 'listings', 'website', 'Master DB — listings')

  // 2. Each vertical
  for (const [vertical, config] of Object.entries(VERTICAL_TABLES)) {
    try {
      const client = getVerticalClient(vertical)
      if (config.tables) {
        // Fine Grounds has multiple tables
        for (const t of config.tables) {
          results[`${vertical}_${t.table}`] = await auditTable(client, t.table, t.col, `${vertical} — ${t.table}`)
        }
      } else {
        results[vertical] = await auditTable(client, config.table, config.col, `${vertical} — ${config.table}`)
      }
    } catch (err) {
      results[vertical] = { label: vertical, error: err.message }
    }
  }

  // Summary
  let totalMalformed = 0
  for (const r of Object.values(results)) {
    totalMalformed += (r.malformed || []).length
  }

  return NextResponse.json({ totalMalformed, results })
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_auth')?.value !== 'admin_authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = {}

  // 1. Master DB
  const master = getSupabaseAdmin()
  results.master = await fixTable(master, 'listings', 'website', 'Master DB — listings')

  // 2. Each vertical
  for (const [vertical, config] of Object.entries(VERTICAL_TABLES)) {
    try {
      const client = getVerticalClient(vertical)
      if (config.tables) {
        for (const t of config.tables) {
          results[`${vertical}_${t.table}`] = await fixTable(client, t.table, t.col, `${vertical} — ${t.table}`)
        }
      } else {
        results[vertical] = await fixTable(client, config.table, config.col, `${vertical} — ${config.table}`)
      }
    } catch (err) {
      results[vertical] = { label: vertical, error: err.message }
    }
  }

  let totalFixed = 0
  let totalMalformed = 0
  for (const r of Object.values(results)) {
    totalFixed += (r.fixed || 0)
    totalMalformed += (r.malformed || []).length
  }

  return NextResponse.json({ totalMalformed, totalFixed, results })
}
