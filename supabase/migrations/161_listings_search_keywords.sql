-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 161: Search keywords (operator-authored search-only terms)
-- ============================================================
--
-- A paid, claimed operator may add up to 15 short keywords to their listing —
-- styles, products, techniques, materials people might search ("witbier",
-- "wheat beer", "barrel-aged"). The terms are SEARCH-ONLY: they feed the
-- listing's embedding (and the lexical document, see migration 162) so the place
-- is more findable, but they NEVER render on the public page.
--
-- Additive + fully reversible. The column is NOT NULL DEFAULT '{}', so every
-- existing row gets an empty array immediately and produces embedding input text
-- byte-identical to today (lib/embeddings/sourceText.js only appends a line when
-- the array is non-empty) — the ~6,500 existing embeddings are unaffected.
--
-- MASTER-ONLY / SYNC-SAFE: search_keywords is never written to a vertical source
-- DB and is never set by the inbound sync field maps (lib/sync/fieldMaps.js), so
-- an inbound sync can't clobber it — the same "safe by omission" contract as
-- listings.hours and listings.operator_highlights. No vertical-DB DDL required.
--
-- ── ROLLBACK (full) ─────────────────────────────────────────
--   alter table listings drop constraint if exists listings_search_keywords_max15;
--   alter table listings drop column if exists search_keywords;
--   (dropping the column also drops the constraint; both listed for clarity.)
-- ============================================================

alter table listings
  add column if not exists search_keywords text[] not null default '{}';

comment on column listings.search_keywords is
  'Operator-authored search-only keywords (max 15). Feed the embedding + lexical search document; never rendered publicly. Master-only, never synced. See lib/search-keywords/ and lib/embeddings/sourceText.js.';

-- Hard cap of 15, enforced at the database. Added as a named, idempotent-guarded
-- constraint so the migration is safely re-runnable.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listings_search_keywords_max15'
  ) then
    alter table listings
      add constraint listings_search_keywords_max15
      check (cardinality(search_keywords) <= 15);
  end if;
end $$;

-- PostgREST: pick up the new column immediately.
notify pgrst, 'reload schema';
