-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 164: Operator image moderation (hero + gallery)
-- ============================================================
--
-- Operators upload images to a listing: a single hero photo (stored in the
-- public `listing-images` Supabase Storage bucket, referenced from
-- listings.hero_image_url) and, on paid listings, a photo gallery (a master-only
-- storage manifest at listings/gallery/{id}/manifest.json — NOT a DB column).
-- Before a NEW operator upload is eligible for public display — on the portal
-- AND on the synced vertical sites — it is triaged by a fast Haiku-class vision
-- model (see lib/moderation/imageModeration.js). Display and vertical sync are
-- gated on the verdict: an image shows ONLY when it is not flagged or held
-- (see lib/image-utils.isHeroDisplayable + lib/sync hero gate + lib/listing-gallery).
--
-- The HERO verdict is recorded on the image_moderation_* columns below. The
-- GALLERY verdict is per-image and lives in the manifest; this migration adds a
-- single roll-up column (gallery_moderation_status) so Candidate Review can find
-- a listing with a gallery image needing review with a normal query.
--
-- Decision model (bias toward holding, fail closed):
--   'pending' — default; not yet checked (no public exposure of a *new* upload
--               until a verdict lands, but see grandfathering below).
--   'clean'   — model is confident the image is acceptable → eligible to display.
--   'flagged' — model flagged it (explicit / offensive / watermarked_stock /
--               low_quality) → NEVER displayed, NEVER synced.
--   'held'    — API error / parse failure / low confidence / unverifiable source
--               → NEVER displayed, NEVER synced (fail closed). Surfaces in
--               Candidate Review for a human decision.
--
-- GRANDFATHERING: every row that already has a public hero image is set to
-- 'clean' here, so the ~thousands of existing live heroes keep displaying with
-- zero regression. Only NEW uploads (and explicit re-checks) are gated. The
-- enrichment/sync pipeline writes auto-discovered heroes too; those are left at
-- their existing status ('clean' for existing rows, 'pending' for brand-new
-- rows) and the public gate only HIDES the explicit 'flagged'/'held' states, so
-- legitimate auto-discovered images are never withheld.
--
-- Additive + fully reversible. MASTER-ONLY / SYNC-SAFE: these columns are never
-- written to a vertical source DB and never set by the inbound sync field maps
-- (lib/sync/fieldMaps.js), so an inbound sync can't clobber them — the same
-- "safe by omission" contract as listings.hours / operator_highlights /
-- search_keywords. No vertical-DB DDL required.
--
-- ── ROLLBACK (full) ─────────────────────────────────────────
--   drop index if exists idx_listings_image_moderation_flagged;
--   drop index if exists idx_listings_gallery_moderation_flagged;
--   alter table listings drop constraint if exists listings_image_moderation_status_chk;
--   alter table listings drop constraint if exists listings_gallery_moderation_status_chk;
--   alter table listings drop column if exists image_moderation_status;
--   alter table listings drop column if exists image_moderation_category;
--   alter table listings drop column if exists image_moderation_reason;
--   alter table listings drop column if exists image_moderation_confidence;
--   alter table listings drop column if exists image_moderation_checked_at;
--   alter table listings drop column if exists gallery_moderation_status;
-- ============================================================

alter table listings
  add column if not exists image_moderation_status text not null default 'pending';

alter table listings
  add column if not exists image_moderation_category text;

alter table listings
  add column if not exists image_moderation_reason text;

alter table listings
  add column if not exists image_moderation_confidence numeric;

alter table listings
  add column if not exists image_moderation_checked_at timestamptz;

-- Gallery roll-up: worst per-image status across the listing's gallery manifest
-- ('flagged' > 'held' > 'clean'). NULL = no gallery / nothing to review. The
-- per-image verdicts live in the manifest; this is only the queryable marker.
alter table listings
  add column if not exists gallery_moderation_status text;

-- Constrain both status columns to their legal values (named so it's idempotent + reversible).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listings_image_moderation_status_chk'
  ) then
    alter table listings
      add constraint listings_image_moderation_status_chk
      check (image_moderation_status in ('pending', 'clean', 'flagged', 'held'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'listings_gallery_moderation_status_chk'
  ) then
    alter table listings
      add constraint listings_gallery_moderation_status_chk
      check (gallery_moderation_status is null or gallery_moderation_status in ('pending', 'clean', 'flagged', 'held'));
  end if;
end $$;

-- ── GRANDFATHER existing live hero images ───────────────────
-- Anything that already has a non-empty hero image is trusted as 'clean' so it
-- keeps displaying. Gate applies only to NEW uploads from here on. Idempotent:
-- re-running only re-affirms 'clean' for rows that still carry a hero and were
-- never explicitly flagged/held by a reviewer.
update listings
set
  image_moderation_status = 'clean',
  image_moderation_reason = coalesce(image_moderation_reason, 'grandfathered: live hero image pre-dates moderation'),
  image_moderation_checked_at = coalesce(image_moderation_checked_at, now())
where hero_image_url is not null
  and length(btrim(hero_image_url)) > 0
  and image_moderation_status = 'pending';

-- Partial indexes for the admin Candidate Review "images awaiting review" queue
-- (one per surface; the queue query ORs the two).
create index if not exists idx_listings_image_moderation_flagged
  on listings (image_moderation_checked_at desc)
  where image_moderation_status in ('flagged', 'held');

create index if not exists idx_listings_gallery_moderation_flagged
  on listings (updated_at desc)
  where gallery_moderation_status in ('flagged', 'held');

comment on column listings.image_moderation_status is
  'Hero-image moderation verdict for the image in hero_image_url: pending|clean|flagged|held. Public display + vertical sync gate on this (only non-flagged/held shows). Grandfathered to clean for pre-existing heroes (migration 164). Master-only, never synced. See lib/moderation/imageModeration.js + lib/image-utils.isHeroDisplayable.';
comment on column listings.image_moderation_category is
  'Best-fit moderation category from the classifier: explicit|offensive|watermarked_stock|low_quality|clean (or an error/source tag for held).';
comment on column listings.image_moderation_reason is
  'One-line human-readable reason for the moderation verdict (shown in Candidate Review).';
comment on column listings.image_moderation_confidence is
  'Classifier confidence 0..1 for the verdict (null when held on error/parse failure).';
comment on column listings.image_moderation_checked_at is
  'When the hero image was last moderated.';
comment on column listings.gallery_moderation_status is
  'Roll-up of the listing gallery''s per-image moderation (worst of flagged>held>clean), or NULL for no gallery. Per-image verdicts live in the storage manifest (lib/listing-gallery.js). Lets Candidate Review query for galleries needing review. Master-only, never synced.';

notify pgrst, 'reload schema';
