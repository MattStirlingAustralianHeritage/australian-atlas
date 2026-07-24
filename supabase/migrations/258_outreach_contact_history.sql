-- 258: outreach contact history protection — contact history must survive
-- listing deletion.
--
-- Incident: operator_outreach.listing_id was ON DELETE CASCADE (mig 061), so
-- deleting a listing silently destroyed its outreach rows. Demonstrated
-- 2026-07-24 by the Gallery Cosmosis takedown: campaign auto_2026-07-23_42a57f
-- says sent=100 but only 99 rows survived — the deleted listing took its send
-- record (and the owner-complaint context in notes) with it. Because the
-- sendEngine's email_already_contacted guard reads operator_outreach, a
-- re-ingested venue could legitimately have been re-emailed; only the
-- bounce/unsubscribe-driven outreach_suppressions row still guarded it.
--
-- Design (mirrors outreach_suppressions.listing_id, already SET NULL):
--   * listing_id becomes nullable, FK action CASCADE → SET NULL. The funnel
--     row IS the contact history — send bookkeeping, engagement stamps,
--     message ids (late bounce webhooks still resolve), campaign ids and
--     notes all survive verbatim, and the already-contacted guard keeps
--     working with no code change.
--   * A BEFORE DELETE trigger on listings stamps rows that were actually
--     contacted with the doomed listing's name/vertical and a deletion
--     timestamp (the FK action then detaches them), and prunes rows that
--     were never touched — discovery-only rows have no history value and
--     would otherwise pollute the autopilot's work pools as orphans.
--   * A BEFORE DELETE guard on operator_outreach refuses to delete contacted
--     rows directly (scripts, ad-hoc SQL), following the protect_article_body
--     precedent. Deliberate erasure (e.g. a privacy request) escapes with:
--       SET LOCAL atlas.allow_outreach_history_delete = 'on';
-- All idempotent — safe to re-run.

-- 1. Denormalized context stamped at deletion time --------------
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS listing_name text;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS listing_vertical text;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS listing_deleted_at timestamptz;

-- 2. listing_id nullable, FK CASCADE → SET NULL -----------------
ALTER TABLE operator_outreach ALTER COLUMN listing_id DROP NOT NULL;

DO $$
DECLARE
  fk record;
BEGIN
  SELECT conname, confdeltype INTO fk
  FROM pg_constraint
  WHERE conrelid = 'operator_outreach'::regclass
    AND contype = 'f'
    AND confrelid = 'listings'::regclass;
  IF fk.conname IS NOT NULL AND fk.confdeltype <> 'n' THEN
    EXECUTE format('ALTER TABLE operator_outreach DROP CONSTRAINT %I', fk.conname);
    ALTER TABLE operator_outreach
      ADD CONSTRAINT operator_outreach_listing_id_fkey
      FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Helper: does this funnel row carry contact history worth keeping?
-- Anything with a send attempt, a funnel status beyond not_contacted, a
-- contact timestamp, or human notes. Discovery-only rows (email harvested,
-- never used) do not count — the send guard never counted them either.
CREATE OR REPLACE FUNCTION outreach_row_has_history(r operator_outreach)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT r.send_status IS NOT NULL
      OR r.followup_sent_at IS NOT NULL
      OR r.status IS DISTINCT FROM 'not_contacted'
      OR r.last_contacted_at IS NOT NULL
      OR r.notes IS NOT NULL
$$;

-- 3. Stamp + prune when a listing is deleted --------------------
CREATE OR REPLACE FUNCTION preserve_outreach_on_listing_delete()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Never-contacted rows carry no history — drop them so they don't linger
  -- as detached orphans in the discovery/send pools.
  DELETE FROM operator_outreach o
  WHERE o.listing_id = OLD.id
    AND NOT outreach_row_has_history(o);

  -- Contacted rows: capture the listing context the FK is about to sever.
  UPDATE operator_outreach o
  SET listing_name = OLD.name,
      listing_vertical = OLD.vertical,
      listing_deleted_at = now(),
      updated_at = now()
  WHERE o.listing_id = OLD.id;

  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS trg_preserve_outreach_on_listing_delete ON listings;
CREATE TRIGGER trg_preserve_outreach_on_listing_delete
  BEFORE DELETE ON listings
  FOR EACH ROW EXECUTE FUNCTION preserve_outreach_on_listing_delete();

-- 4. Contacted rows cannot be deleted directly ------------------
CREATE OR REPLACE FUNCTION protect_outreach_contact_history()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF outreach_row_has_history(OLD)
     AND coalesce(current_setting('atlas.allow_outreach_history_delete', true), '') <> 'on' THEN
    RAISE EXCEPTION 'operator_outreach row % is contact history (email %) — it must survive; for deliberate erasure SET LOCAL atlas.allow_outreach_history_delete = ''on''',
      OLD.id, coalesce(OLD.contact_email, '(none)');
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS trg_protect_outreach_contact_history ON operator_outreach;
CREATE TRIGGER trg_protect_outreach_contact_history
  BEFORE DELETE ON operator_outreach
  FOR EACH ROW EXECUTE FUNCTION protect_outreach_contact_history();
