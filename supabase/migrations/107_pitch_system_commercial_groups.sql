-- ============================================================
-- 107_pitch_system_commercial_groups.sql
--
-- Commercial-group disqualifier source for Phase 1 candidate
-- identification per docs/pitch-system-design.md (Hard
-- disqualifiers).
--
-- MATCHING SCOPE — STRUCTURED FIELDS ONLY (editorial decision
-- 2026-04-30):
--   The disqualifier matches against:
--     - listing.name (exact, case-insensitive match against
--       group_name or any element of the brands array)
--     - listing.website domain (host portion of the URL —
--       e.g. crystalbrookcollection.com)
--     - any future explicit commercial_group_id FK on listings
--   It does NOT substring-match against listing.description,
--   hero_intro, or any other free-text field. Descriptions
--   legitimately reference adjacent venues (e.g. "next door to
--   the Hilton") without that being a signal of ownership.
--   Free-text matching produces false positives by construction
--   and is out of scope.
--
-- Source: Atlas Network Independence Criteria, "Known Group
-- Operators (Auto-Reject)" section, snapshot 2026-04-30.
--
-- Future updates: edit this seed list directly via SQL; consumers
-- read at query time. The design intentionally keeps this list
-- editable without code changes.
-- ============================================================

create table if not exists commercial_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  category text,
  brands text[] not null default '{}'::text[],
  added_at timestamptz not null default now(),
  source text not null default '01-independence-criteria.md (snapshot 2026-04-30)'
);

create unique index if not exists commercial_groups_name_idx on commercial_groups (group_name);

-- ─── Seeds (snapshot 2026-04-30) ──────────────────────────────────────

insert into commercial_groups (group_name, category, brands) values
  -- Hotel & Accommodation Groups
  ('EVT', 'hotel_accommodation', array['Ode Hotels', 'EVT Stays', 'QT Hotels']),
  ('TFE Hotels', 'hotel_accommodation', array['Collection by TFE', 'Adina', 'Vibe', 'Travelodge', 'Rendezvous']),
  ('Accor', 'hotel_accommodation', array['Sofitel', 'Pullman', 'MGallery', 'Novotel', 'Mercure', 'ibis']),
  ('IHG', 'hotel_accommodation', array['InterContinental', 'Crowne Plaza', 'Holiday Inn', 'Kimpton', 'voco']),
  ('Marriott', 'hotel_accommodation', array['W Hotels', 'Westin', 'Sheraton', 'Ritz-Carlton']),
  ('Minor Hotels', 'hotel_accommodation', array['Avani', 'Oaks', 'NH', 'Tivoli']),
  ('Crystalbrook Collection', 'hotel_accommodation', '{}'::text[]),
  ('Ovolo Hotels', 'hotel_accommodation', '{}'::text[]),
  ('Lancemore Group', 'hotel_accommodation', '{}'::text[]),
  ('8Hotels', 'hotel_accommodation', '{}'::text[]),
  ('Veriu Hotels', 'hotel_accommodation', '{}'::text[]),
  ('Spicers Retreats', 'hotel_accommodation', array['worldsapart.club']),
  ('NRMA Parks and Resorts', 'hotel_accommodation', array['Pumphouse Point']),
  ('Epochal Hotels', 'hotel_accommodation', array['Q Station']),
  ('Ink Hotel Management', 'hotel_accommodation', '{}'::text[]),
  -- Pub & Venue Groups
  ('Australian Venue Co', 'pub_venue', array['AVC']),
  ('Solotel', 'pub_venue', '{}'::text[]),
  ('Merivale', 'pub_venue', '{}'::text[]),
  ('ALH Group', 'pub_venue', array['Endeavour Group']),
  ('Redcape Hotel Group', 'pub_venue', '{}'::text[]),
  -- Other Groups
  ('Red Star Hotel Group', 'other', array['Cremorne Point Manor']),
  ('The Boathouse Group', 'other', '{}'::text[]),
  ('Sydney Lodges', 'other', '{}'::text[]),
  ('Emerald City Hotels', 'other', '{}'::text[])
on conflict (group_name) do nothing;
