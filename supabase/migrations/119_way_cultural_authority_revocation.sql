-- ============================================================
-- 119_way_cultural_authority_revocation.sql
--
-- Phase 1 addendum: close the cultural-authority gate hole on
-- direct column updates.
--
-- Migration 118 (cultural authority publication gate) prevents
-- a cultural_tour listing from being PROMOTED to status='active'
-- without verification. It does NOT cover the case where
-- cultural_authority_verified is flipped from true→false on a
-- listing that is already active. In that scenario, without
-- intervention, the listing would remain on public surfaces
-- with revoked authority — exactly the outcome the gate exists
-- to prevent.
--
-- This migration adds the symmetric guard. When way_meta.
-- cultural_authority_verified transitions true→false on a
-- cultural_tour listing whose portal listings.status is 'active',
-- the trigger flips listings.status to 'inactive'. The listing
-- disappears from every public surface immediately, no admin
-- action required.
--
-- Recovery path: if authority is re-verified (via the review
-- queue), an admin reactivates the listing manually. The
-- automatic flip is one-way — auto-deactivation, not auto-
-- reactivation — because reactivation is an editorial decision
-- that warrants human review.
--
-- The audit trail is preserved by the existing
-- cultural_authority_review row that triggered the revocation
-- (review_status='rejected'). listings.updated_at captures the
-- timing.
-- ============================================================

create or replace function way_meta_cultural_authority_revocation()
returns trigger as $$
begin
  -- Only fire on transitions from verified to unverified.
  if coalesce(old.cultural_authority_verified, false) <> true then
    return new;
  end if;
  if coalesce(new.cultural_authority_verified, false) <> false then
    return new;
  end if;

  -- Only applies to cultural_tour listings — Gate 4 doesn't
  -- govern other Way primary_types. Check NEW so a reclassify-
  -- away-from-cultural_tour update doesn't fire the revocation.
  if new.primary_type <> 'cultural_tour' then
    return new;
  end if;

  -- Flip listings.status from 'active' → 'inactive'. If the
  -- listing was already inactive (draft, archived, etc.), no
  -- change needed — the gate is about removing from public
  -- surfaces, and a non-active listing is already absent.
  update listings
     set status     = 'inactive',
         updated_at = now()
   where id     = new.listing_id
     and status = 'active';

  return new;
end;
$$ language plpgsql;

drop trigger if exists way_meta_cultural_authority_revocation_trg on way_meta;
create trigger way_meta_cultural_authority_revocation_trg
  after update of cultural_authority_verified
  on way_meta
  for each row execute function way_meta_cultural_authority_revocation();
