-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 008: Row Level Security policies
-- ============================================================

-- Enable RLS on all tables
alter table listings enable row level security;
alter table sba_meta enable row level security;
alter table collection_meta enable row level security;
alter table craft_meta enable row level security;
alter table fine_grounds_meta enable row level security;
alter table rest_meta enable row level security;
alter table field_meta enable row level security;
alter table corner_meta enable row level security;
alter table found_meta enable row level security;
alter table table_meta enable row level security;
alter table regions enable row level security;
alter table trips enable row level security;
alter table articles enable row level security;

-- Public read access for active listings
create policy "Public can read active listings"
  on listings for select
  using (status = 'active');

-- Public read access for all extension tables (via listing join)
create policy "Public can read sba_meta" on sba_meta for select using (true);
create policy "Public can read collection_meta" on collection_meta for select using (true);
create policy "Public can read craft_meta" on craft_meta for select using (true);
create policy "Public can read fine_grounds_meta" on fine_grounds_meta for select using (true);
create policy "Public can read rest_meta" on rest_meta for select using (true);
create policy "Public can read field_meta" on field_meta for select using (true);
create policy "Public can read corner_meta" on corner_meta for select using (true);
create policy "Public can read found_meta" on found_meta for select using (true);
create policy "Public can read table_meta" on table_meta for select using (true);

-- Public read for live regions
create policy "Public can read live regions"
  on regions for select
  using (status = 'live' or true);  -- allow all reads for now; tighten when review workflow is active

-- Public read/create for trips (anonymous)
create policy "Public can read trips"
  on trips for select using (true);
create policy "Public can create trips"
  on trips for insert with check (true);

-- Public read for published articles
create policy "Public can read published articles"
  on articles for select
  using (status = 'published');

-- Service role has full access (bypasses RLS automatically)
-- These policies ensure the sync cron (using service role key) can write freely
create policy "Service role full access listings"
  on listings for all using (true) with check (true);
create policy "Service role full access regions"
  on regions for all using (true) with check (true);
create policy "Service role full access articles"
  on articles for all using (true) with check (true);
