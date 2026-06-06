-- Migration 149: query-embedding cache. The front door now embeds every query;
-- this avoids re-calling Voyage for repeated/identical queries (cost + latency).
-- query_hash = sha256(lower(trim(query)) + ':' + model).

create table if not exists query_embedding_cache (
  query_hash text primary key,
  model      text not null,
  embedding  vector(1024),
  created_at timestamptz not null default now()
);

create index if not exists idx_query_embedding_cache_created on query_embedding_cache (created_at desc);
