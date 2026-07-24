// Shared helpers for the Mount Lofty Estate group removal scripts.
// Reads .env.local (repo root) manually; never prints secret values.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO = resolve(HERE, '..', '..') // scripts/mount-lofty -> repo root

export const DOMAINS = [
  'mtloftyhouse.com.au',
  'sequoialodge.com.au',
  'gatekeepersdayspa.com.au',
  'hardysverandah.com.au',
  'marthahardys.com.au',
]

export function loadEnv(path = resolve(REPO, '.env.local')) {
  const raw = readFileSync(path, 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[t.slice(0, eq).trim()] = v
  }
  return env
}

export function masterClient(env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

export function restClient(env) {
  return createClient(env.REST_SUPABASE_URL, env.REST_SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

// Portal DB direct connection. The aws-0 pooler host in DATABASE_URL is stale;
// rewrite to the working aws-1 host (see memory: migration-runner-pooler).
export async function pgConnect(env) {
  const url = env.DATABASE_URL.replace(
    /@aws-0-[^.]+\.pooler\.supabase\.com:\d+/,
    '@aws-1-ap-northeast-1.pooler.supabase.com:5432',
  )
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  return client
}
