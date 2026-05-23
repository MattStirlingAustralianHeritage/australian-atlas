-- ============================================================
-- 133_approve_way_candidate_rpc.sql
--
-- Atomic write function for Way Atlas candidate approval.
-- Wraps listings INSERT/UPDATE and way_meta UPSERT in a single
-- transaction so both succeed or both roll back. This eliminates
-- the partial-write failure mode that produced stranded Way
-- listings (listings row present, way_meta empty).
--
-- Called from app/api/admin/candidates/[id]/route.js POST handler
-- via supabase.rpc('approve_way_candidate', { ... }) when the
-- candidate's vertical is 'way'.
--
-- INSERT path (p_existing_listing_id IS NULL):
--   Inserts a new listings row, then inserts a way_meta row
--   referencing the new listing's id.
--
-- UPDATE path (p_existing_listing_id IS NOT NULL):
--   Updates the existing listings row, then upserts way_meta
--   with replace-semantics (ON CONFLICT DO UPDATE on all 15
--   editorial columns). Replace-semantics is non-negotiable:
--   the 4A panel's clearing useEffects ensure stale values are
--   absent from the payload, and this function trusts the
--   payload as authoritative. Merge-semantics would leave
--   orphaned data (e.g. aboriginal_community persisting after
--   operator_type changes from aboriginal_owned_led to
--   independent).
--
-- Non-Way verticals never call this function. Their existing
-- approval flow is unchanged.
-- ============================================================

create or replace function approve_way_candidate(
  p_listing     jsonb,
  p_way_meta    jsonb,
  p_existing_listing_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_listing_id uuid;
begin

  -- ── Listings INSERT or UPDATE ─────────────────────────────
  if p_existing_listing_id is null then
    -- INSERT path: new listing
    insert into listings (
      vertical, source_id, name, slug, description,
      region_override_id, state, lat, lng, website,
      phone, address, suburb, hero_image_url,
      sub_type, sub_type_secondary, sub_types,
      status, is_claimed, is_featured,
      data_source, needs_review,
      address_on_request, visitable, presence_type
    ) values (
      p_listing->>'vertical',
      p_listing->>'source_id',
      p_listing->>'name',
      p_listing->>'slug',
      p_listing->>'description',
      (p_listing->>'region_override_id')::uuid,
      p_listing->>'state',
      (p_listing->>'lat')::double precision,
      (p_listing->>'lng')::double precision,
      p_listing->>'website',
      p_listing->>'phone',
      p_listing->>'address',
      p_listing->>'suburb',
      null,  -- hero_image_url: always null; owner uploads on claim
      p_listing->>'sub_type',
      p_listing->>'sub_type_secondary',
      array(select jsonb_array_elements_text(
        coalesce(p_listing->'sub_types', '[]'::jsonb)
      ))::text[],
      coalesce(p_listing->>'status', 'active'),
      coalesce((p_listing->>'is_claimed')::boolean, false),
      coalesce((p_listing->>'is_featured')::boolean, false),
      coalesce(p_listing->>'data_source', 'manually_curated'),
      coalesce((p_listing->>'needs_review')::boolean, false),
      coalesce((p_listing->>'address_on_request')::boolean, false),
      coalesce((p_listing->>'visitable')::boolean, true),
      coalesce(p_listing->>'presence_type', 'permanent')
    )
    returning id into v_listing_id;

  else
    -- UPDATE path: existing listing
    v_listing_id := p_existing_listing_id;

    update listings set
      source_id          = p_listing->>'source_id',
      name               = p_listing->>'name',
      slug               = p_listing->>'slug',
      description        = p_listing->>'description',
      region_override_id = (p_listing->>'region_override_id')::uuid,
      state              = p_listing->>'state',
      lat                = (p_listing->>'lat')::double precision,
      lng                = (p_listing->>'lng')::double precision,
      website            = p_listing->>'website',
      phone              = p_listing->>'phone',
      address            = p_listing->>'address',
      suburb             = p_listing->>'suburb',
      sub_type           = p_listing->>'sub_type',
      sub_type_secondary = p_listing->>'sub_type_secondary',
      sub_types          = array(select jsonb_array_elements_text(
                             coalesce(p_listing->'sub_types', '[]'::jsonb)
                           ))::text[],
      status             = coalesce(p_listing->>'status', 'active'),
      data_source        = p_listing->>'data_source',
      needs_review       = coalesce((p_listing->>'needs_review')::boolean, false),
      address_on_request = coalesce((p_listing->>'address_on_request')::boolean, false),
      visitable          = coalesce((p_listing->>'visitable')::boolean, true),
      presence_type      = coalesce(p_listing->>'presence_type', 'permanent')
    where id = v_listing_id;
  end if;

  -- ── way_meta UPSERT (replace-semantics) ───────────────────
  -- All 15 editorial columns written from the payload every time.
  -- The 4A panel's clearing useEffects guarantee stale values are
  -- absent from wayClassification before submission. This UPSERT
  -- trusts the payload as authoritative — no merge, no selective
  -- column skipping. On re-approval, every column is overwritten.
  insert into way_meta (
    listing_id,
    primary_type,
    operator_type,
    operator_legal_name,
    aboriginal_community,
    secondary_types,
    accreditations,
    operating_region_ids,
    primary_region_id,
    departure_point_name,
    established_year,
    presence_type,
    operating_season_months,
    multiple_departure_points,
    cultural_authority_verified,
    cultural_authority_notes
  ) values (
    v_listing_id,
    p_way_meta->>'primary_type',
    p_way_meta->>'operator_type',
    p_way_meta->>'operator_legal_name',
    p_way_meta->>'aboriginal_community',
    array(select jsonb_array_elements_text(
      coalesce(p_way_meta->'secondary_types', '[]'::jsonb)
    ))::text[],
    array(select jsonb_array_elements_text(
      coalesce(p_way_meta->'accreditations', '[]'::jsonb)
    ))::text[],
    array(select (jsonb_array_elements_text(
      coalesce(p_way_meta->'operating_region_ids', '[]'::jsonb)
    ))::uuid)::uuid[],
    (p_way_meta->>'primary_region_id')::uuid,
    p_way_meta->>'departure_point_name',
    (p_way_meta->>'established_year')::integer,
    p_way_meta->>'presence_type',
    array(select (jsonb_array_elements_text(
      coalesce(p_way_meta->'operating_season_months', '[]'::jsonb)
    ))::integer)::integer[],
    coalesce((p_way_meta->>'multiple_departure_points')::boolean, false),
    coalesce((p_way_meta->>'cultural_authority_verified')::boolean, false),
    p_way_meta->>'cultural_authority_notes'
  )
  on conflict (listing_id) do update set
    -- Replace-semantics: every column written from EXCLUDED (the new
    -- payload). Prevents orphaned editorial classifications on
    -- re-approvals (e.g. operator_type changing from aboriginal_owned_led
    -- to independent must clear aboriginal_community).
    primary_type               = excluded.primary_type,
    operator_type              = excluded.operator_type,
    operator_legal_name        = excluded.operator_legal_name,
    aboriginal_community       = excluded.aboriginal_community,
    secondary_types            = excluded.secondary_types,
    accreditations             = excluded.accreditations,
    operating_region_ids       = excluded.operating_region_ids,
    primary_region_id          = excluded.primary_region_id,
    departure_point_name       = excluded.departure_point_name,
    established_year           = excluded.established_year,
    presence_type              = excluded.presence_type,
    operating_season_months    = excluded.operating_season_months,
    multiple_departure_points  = excluded.multiple_departure_points,
    cultural_authority_verified = excluded.cultural_authority_verified,
    cultural_authority_notes   = excluded.cultural_authority_notes;

  return jsonb_build_object('listing_id', v_listing_id, 'success', true);

exception when others then
  raise;  -- transaction auto-rolls back; surface error to caller
end;
$$;
