#!/usr/bin/env node
/**
 * Phase 1: Set up full-text search on the listings table.
 * Creates a GIN index and an RPC function for search.
 *
 * Usage: node --env-file=.env.local scripts/setup-fts.mjs
 */

import pg from 'pg'

// Supabase direct connection (pooler on port 6543)
const ref = 'nyhkcmvhwbydsqsyvizs'
const password = process.env.SUPABASE_DB_PASSWORD

if (!password) {
  // Fall back to using supabase-js to create the function via a workaround
  console.log('No SUPABASE_DB_PASSWORD env var — using Supabase REST API approach')
  console.log('Please set SUPABASE_DB_PASSWORD in .env.local and rerun')
  console.log('You can find it in Supabase Dashboard → Settings → Database → Connection string')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: `postgresql://postgres.${ref}:${password}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
})

async function run() {
  const client = await pool.connect()
  try {
    console.log('Connected to Supabase Postgres')

    // 1. Create GIN index for full-text search
    console.log('\n1. Creating FTS GIN index...')
    await client.query(`
      CREATE INDEX IF NOT EXISTS listings_fts_idx
      ON listings
      USING gin(
        to_tsvector('english',
          coalesce(name, '') || ' ' ||
          coalesce(description, '') || ' ' ||
          coalesce(region, '') || ' ' ||
          coalesce(state, '') || ' ' ||
          coalesce(address, '') || ' ' ||
          coalesce(vertical, '')
        )
      );
    `)
    console.log('   GIN index created.')

    // 2. Create search RPC function
    console.log('\n2. Creating search_listings RPC function...')
    await client.query(`
      CREATE OR REPLACE FUNCTION search_listings(
        query text DEFAULT NULL,
        vertical_filter text DEFAULT NULL,
        state_filter text DEFAULT NULL,
        result_limit int DEFAULT 50,
        result_offset int DEFAULT 0
      )
      RETURNS TABLE(
        id uuid,
        vertical text,
        name text,
        slug text,
        description text,
        region text,
        state text,
        lat float8,
        lng float8,
        website text,
        phone text,
        address text,
        hero_image_url text,
        is_claimed boolean,
        is_featured boolean,
        is_market boolean,
        status text,
        created_at timestamptz,
        updated_at timestamptz,
        synced_at timestamptz,
        rank real
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          l.id, l.vertical, l.name, l.slug, l.description,
          l.region, l.state, l.lat, l.lng, l.website,
          l.phone, l.address, l.hero_image_url,
          l.is_claimed, l.is_featured, l.is_market,
          l.status, l.created_at, l.updated_at, l.synced_at,
          CASE
            WHEN query IS NULL OR query = '' THEN 0.0::real
            ELSE ts_rank(
              to_tsvector('english',
                coalesce(l.name, '') || ' ' ||
                coalesce(l.description, '') || ' ' ||
                coalesce(l.region, '') || ' ' ||
                coalesce(l.state, '') || ' ' ||
                coalesce(l.address, '') || ' ' ||
                coalesce(l.vertical, '')
              ),
              websearch_to_tsquery('english', query)
            )
          END AS rank
        FROM listings l
        WHERE l.status = 'active'
        AND (
          query IS NULL OR query = '' OR
          to_tsvector('english',
            coalesce(l.name, '') || ' ' ||
            coalesce(l.description, '') || ' ' ||
            coalesce(l.region, '') || ' ' ||
            coalesce(l.state, '') || ' ' ||
            coalesce(l.address, '') || ' ' ||
            coalesce(l.vertical, '')
          ) @@ websearch_to_tsquery('english', query)
        )
        AND (vertical_filter IS NULL OR l.vertical = vertical_filter)
        AND (state_filter IS NULL OR l.state = state_filter)
        ORDER BY
          CASE WHEN query IS NULL OR query = '' THEN 0 ELSE 1 END DESC,
          rank DESC,
          l.is_featured DESC,
          l.name ASC
        LIMIT result_limit
        OFFSET result_offset;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `)
    console.log('   search_listings function created.')

    // 3. Create a count function for pagination
    console.log('\n3. Creating search_listings_count function...')
    await client.query(`
      CREATE OR REPLACE FUNCTION search_listings_count(
        query text DEFAULT NULL,
        vertical_filter text DEFAULT NULL,
        state_filter text DEFAULT NULL
      )
      RETURNS bigint AS $$
      DECLARE
        total bigint;
      BEGIN
        SELECT count(*) INTO total
        FROM listings l
        WHERE l.status = 'active'
        AND (
          query IS NULL OR query = '' OR
          to_tsvector('english',
            coalesce(l.name, '') || ' ' ||
            coalesce(l.description, '') || ' ' ||
            coalesce(l.region, '') || ' ' ||
            coalesce(l.state, '') || ' ' ||
            coalesce(l.address, '') || ' ' ||
            coalesce(l.vertical, '')
          ) @@ websearch_to_tsquery('english', query)
        )
        AND (vertical_filter IS NULL OR l.vertical = vertical_filter)
        AND (state_filter IS NULL OR l.state = state_filter);

        RETURN total;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `)
    console.log('   search_listings_count function created.')

    // 4. Test the search function
    console.log('\n4. Testing search...')

    const tests = [
      { label: '"brewery"', query: 'brewery' },
      { label: '"breweries"', query: 'breweries' },
      { label: '"natural wine barossa"', query: 'natural wine barossa' },
      { label: '"boutique stays"', query: 'boutique stays' },
      { label: '"swimming holes"', query: 'swimming holes' },
      { label: 'empty query', query: '' },
    ]

    for (const t of tests) {
      const { rows } = await client.query(
        `SELECT count(*) as total FROM search_listings($1, NULL, NULL, 1000, 0)`,
        [t.query || null]
      )
      const count = rows[0].total
      console.log(`   ${t.label}: ${count} results`)
    }

    console.log('\n=== Phase 1 FTS setup complete ===')
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
