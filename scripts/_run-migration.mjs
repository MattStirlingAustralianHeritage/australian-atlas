#!/usr/bin/env node
/**
 * Run migration 014_admin_analytics.sql against the Australian Atlas master DB.
 *
 * Usage:
 *   DB_PASSWORD=<your-supabase-db-password> node scripts/_run-migration.mjs
 *
 * The DB password is the one you set when creating the Supabase project.
 * You can find/reset it in the Supabase Dashboard under:
 *   Settings > Database > Connection string > Password
 *
 * If you don't have the password, paste the SQL from
 *   supabase/migrations/014_admin_analytics.sql
 * into the Supabase Dashboard SQL Editor at:
 *   https://supabase.com/dashboard/project/nyhkcmvhwbydsqsyvizs/sql/new
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'nyhkcmvhwbydsqsyvizs';

const password = process.env.DB_PASSWORD;
if (!password) {
  console.error('ERROR: DB_PASSWORD environment variable is required.');
  console.error('');
  console.error('Run with:');
  console.error('  DB_PASSWORD=<your-password> node scripts/_run-migration.mjs');
  console.error('');
  console.error('Or run the SQL manually in the Supabase Dashboard SQL Editor:');
  console.error(`  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
  process.exit(1);
}

const connectionString = `postgresql://postgres.${PROJECT_REF}:${password}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '014_admin_analytics.sql');
const sql = readFileSync(sqlPath, 'utf-8');

async function run() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    console.log('Connecting to Supabase Postgres...');
    await client.connect();
    console.log('Connected. Running migration 014_admin_analytics.sql...');
    await client.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
