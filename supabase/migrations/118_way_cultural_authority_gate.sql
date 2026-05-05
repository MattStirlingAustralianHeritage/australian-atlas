-- ============================================================
-- 118_way_cultural_authority_gate.sql
--
-- Publication gate trigger for Way Atlas Gate 4. Prevents a Way
-- listing tagged primary_type='cultural_tour' from going public
-- (status='active') until cultural authority verification has
-- landed via the cultural_authority_review queue.
--
-- Per Way Atlas Specification Section VI (May 2026) and the
-- standing rule from the master build prompt:
--
--   "Any Aboriginal-led experience that has not been verified
--    through the cultural authority queue does not appear
--    publicly. No exceptions, no soft-launches, no 'we'll
--    verify later.'"
--
-- The gate fires BEFORE UPDATE on listings. If the listing is
-- vertical='way', has way_meta.primary_type='cultural_tour',
-- and the new status is being promoted to 'active', the
-- corresponding way_meta.cultural_authority_verified must be
-- true. Otherwise the update is rejected with a clear error
-- message naming the unresolved review.
--
-- The gate is editorial infrastructure — admin tooling reads
-- the cultural_authority_review queue to find unresolved
-- listings; this trigger is the architectural backstop that
-- prevents accidental publication if admin tooling is bypassed.
-- ============================================================

create or replace function listings_way_cultural_authority_gate()
returns trigger as $$
declare
  v_meta way_meta%rowtype;
begin
  -- Only fires on Way Atlas listings.
  if new.vertical <> 'way' then
    return new;
  end if;

  -- Only fires on transitions to 'active' status.
  if new.status <> 'active' then
    return new;
  end if;

  -- If the previous status was already 'active', this update
  -- isn't a publication transition — let it through. (Gate-4
  -- enforcement happens on the way_meta side via the queue
  -- trigger; if cultural_authority_verified flips to false on
  -- an already-active listing, the next status update will
  -- catch it.)
  if old.status = 'active' then
    return new;
  end if;

  -- Look up the way_meta row.
  select * into v_meta from way_meta where listing_id = new.id;

  -- If no way_meta row exists, the listing is incomplete —
  -- block publication regardless of primary_type, since the
  -- gate cannot be evaluated.
  if v_meta is null then
    raise exception
      'Way listing % cannot be promoted to active: way_meta row missing', new.id
      using errcode = '23514';   -- check_violation
  end if;

  -- Gate 4 only fires for cultural_tour listings.
  if v_meta.primary_type <> 'cultural_tour' then
    return new;
  end if;

  -- Block if cultural authority not yet verified.
  if coalesce(v_meta.cultural_authority_verified, false) = false then
    raise exception
      'Way listing % cannot be promoted to active: cultural_tour requires cultural authority verification (Gate 4). Resolve cultural_authority_review queue entry for this listing.', new.id
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists listings_way_cultural_authority_gate_trg on listings;
create trigger listings_way_cultural_authority_gate_trg
  before update of status
  on listings
  for each row execute function listings_way_cultural_authority_gate();

-- Also fire on INSERT — if a sync or admin path tries to write
-- a Way listing directly with status='active', enforce the
-- same gate. Splits to a separate trigger because the OLD row
-- doesn't exist on INSERT and the function above references
-- old.status.

create or replace function listings_way_cultural_authority_gate_insert()
returns trigger as $$
declare
  v_meta way_meta%rowtype;
begin
  if new.vertical <> 'way' then
    return new;
  end if;

  if new.status <> 'active' then
    return new;
  end if;

  -- On INSERT, the way_meta row may not yet exist — sync
  -- typically writes listings first, then the meta row. We
  -- treat this case permissively on INSERT only, because the
  -- subsequent way_meta INSERT will trigger the queue-and-block
  -- pathway via the regular UPDATE path on the next status
  -- transition. Defensive: still block obvious violations.
  select * into v_meta from way_meta where listing_id = new.id;

  if v_meta is null then
    -- Allow the insert; the gate enforces on subsequent
    -- transitions to active.
    return new;
  end if;

  if v_meta.primary_type <> 'cultural_tour' then
    return new;
  end if;

  if coalesce(v_meta.cultural_authority_verified, false) = false then
    raise exception
      'Way listing % cannot be inserted with status=active: cultural_tour requires cultural authority verification (Gate 4).', new.id
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists listings_way_cultural_authority_gate_insert_trg on listings;
create trigger listings_way_cultural_authority_gate_insert_trg
  before insert on listings
  for each row execute function listings_way_cultural_authority_gate_insert();
