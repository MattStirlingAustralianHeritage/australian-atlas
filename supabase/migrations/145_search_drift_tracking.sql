-- Migration 145: embedding drift tracking
-- Adds needs_embedding + embedding_updated_at and a BEFORE UPDATE trigger that
-- flags a listing for re-embedding when any embedding-source field changes.
-- Replaces the old "embedding IS NULL only" selection so edited listings
-- re-embed (the stale vector keeps serving search until refreshed).
-- (BEFORE UPDATE, not AFTER: we set NEW.needs_embedding on the same row.)

alter table listings add column if not exists needs_embedding boolean not null default false;
alter table listings add column if not exists embedding_updated_at timestamptz;

create index if not exists idx_listings_needs_embedding
  on listings (needs_embedding) where needs_embedding = true;

create or replace function mark_listing_needs_embedding()
returns trigger as $$
begin
  if (new.name               is distinct from old.name
   or new.description        is distinct from old.description
   or new.sub_type           is distinct from old.sub_type
   or new.region_override_id is distinct from old.region_override_id
   or new.region_computed_id is distinct from old.region_computed_id
   or new.presence_type      is distinct from old.presence_type
   or new.visitable          is distinct from old.visitable) then
    new.needs_embedding := true;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists listings_needs_embedding on listings;
create trigger listings_needs_embedding
  before update on listings
  for each row execute function mark_listing_needs_embedding();
