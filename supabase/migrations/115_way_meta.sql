-- ============================================================
-- 115_way_meta.sql
--
-- Way Atlas extension table on the portal master DB. Mirrors the
-- per-vertical _meta pattern from 003_extension_tables.sql. Holds
-- the Way-specific fields that don't fit the generic listings
-- shape — operator vocabulary, operating regions, named contact,
-- accreditations, cultural authority verification state.
--
-- Per Way Atlas Specification Section IV and the architectural
-- clarifications (May 2026):
--   • mapWayListing() writes the listings row with core fields
--     (lat/lng, name, slug, description, hero_image_url, etc.).
--     departure_point_lat/lng → lat/lng so the spatial trigger
--     computes region_computed_id correctly.
--   • mapWayMeta() writes this row with the Way-specific fields.
--   • operating_region_ids is exposed via this table, NOT
--     collapsed into listings.region_computed_id. Portal regional
--     pages query way_meta.operating_region_ids to surface an
--     operator on every region they run experiences in, with
--     editorial framing distinguishing "based in" from "runs
--     experiences here" (Spec Section V).
--   • Cultural authority verification state lives here. Gate 4
--     fires only for primary_type = 'cultural_tour' (Spec
--     Section VI).
-- ============================================================

create table way_meta (
  listing_id                       uuid primary key references listings(id) on delete cascade,

  -- Vocabulary fields. Same enumerations as the Way project's
  -- operators table — kept in sync via mapWayMeta().
  primary_type                     text not null check (primary_type in (
                                     'guided_walk_multiday','guided_walk_day','cultural_tour',
                                     'scenic_flight','helicopter_tour',
                                     'sailing_charter','sea_kayak_tour','dive_operator',
                                     'fishing_guide','photography_expedition',
                                     'specialist_natural_history','foraging_bushfood',
                                     'heritage_tour','workshop_intensive',
                                     'river_canoe_tour','horseback_expedition',
                                     'four_wheel_drive_expedition'
                                   )),
  secondary_types                  text[] not null default '{}'::text[],
  operator_type                    text not null check (operator_type in (
                                     'independent',
                                     'aboriginal_community','aboriginal_owned_led','aboriginal_partnership',
                                     'concessionaire','trust','public_heritage',
                                     'cultural_content_non_indigenous'
                                   )),

  operator_legal_name              text,
  aboriginal_community             text,                    -- Where applicable, the community/nation.

  -- Presence & seasonality.
  presence_type                    text check (presence_type in (
                                     'permanent','by_appointment','markets','online','mobile',
                                     'seasonal','year_round','weather_dependent','charter_only','tide_dependent'
                                   )),
  operating_season_months          integer[],

  -- Spatial. primary_region_id is editorial; operating_region_ids
  -- is the array of regions where the operator runs experiences.
  primary_region_id                uuid references regions(id) on delete set null,
  operating_region_ids             uuid[] not null default '{}'::uuid[],
  departure_point_name             text,
  multiple_departure_points        boolean not null default false,

  -- Contact & booking.
  contact_email                    text,
  contact_name                     text,
  booking_url                      text,

  -- Metadata.
  established_year                 integer check (established_year is null or established_year between 1800 and 2100),
  accreditations                   text[] not null default '{}'::text[],
  claim_status                     text check (claim_status in ('unclaimed','pending','claimed','paid')),

  -- Cultural authority verification state. Set by the review
  -- queue (116_cultural_authority_review.sql) on resolution.
  cultural_authority_verified      boolean not null default false,
  cultural_authority_source        text,                    -- Free text: e.g. "palawa Enterprises Charter", "Karrkad Kanjdji Trust statement".
  cultural_authority_verified_at   timestamptz,
  cultural_authority_verified_by   uuid references auth.users(id) on delete set null,
  cultural_authority_notes         text
);

-- Indices for common access patterns.
create index way_meta_primary_type_idx        on way_meta (primary_type);
create index way_meta_operator_type_idx       on way_meta (operator_type);
create index way_meta_primary_region_idx      on way_meta (primary_region_id);
create index way_meta_claim_status_idx        on way_meta (claim_status);
create index way_meta_cultural_verified_idx   on way_meta (cultural_authority_verified)
                                               where primary_type = 'cultural_tour';

-- GIN indices for array containment.
create index way_meta_operating_regions_gin   on way_meta using gin (operating_region_ids);
create index way_meta_secondary_types_gin     on way_meta using gin (secondary_types);
create index way_meta_accreditations_gin      on way_meta using gin (accreditations);
