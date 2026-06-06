-- Migration 151: HNSW vector index on the now-populated embedding columns.
-- Applied AFTER the backfill so the graph builds on real data. HNSW gives
-- near-exact recall and scales as the network grows; at this corpus size recall
-- matters more than build speed. Query-time ef_search is set in the hybrid RPC.

drop index if exists listings_embedding_idx;
create index listings_embedding_idx
  on listings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

drop index if exists articles_embedding_idx;
create index articles_embedding_idx
  on articles using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
