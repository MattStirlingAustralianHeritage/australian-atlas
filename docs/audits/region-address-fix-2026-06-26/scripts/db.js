const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readPassword() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const txt = fs.readFileSync(envPath, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*SUPABASE_DB_PASSWORD\s*=\s*(.*)\s*$/);
    if (m) {
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  throw new Error('SUPABASE_DB_PASSWORD not found in .env.local');
}

function makeClient() {
  return new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.nyhkcmvhwbydsqsyvizs',
    database: 'postgres',
    password: readPassword(),
    ssl: { rejectUnauthorized: false },
    application_name: 'region-address-fix',
  });
}

module.exports = { makeClient };
