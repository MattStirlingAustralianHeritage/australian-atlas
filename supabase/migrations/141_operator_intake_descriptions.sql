-- 141: operator-fed structured intake → voice-generated description → admin-approved publish.
--
-- The published venue description (`listings.description`) moves through three
-- states, only the last of which is public:
--
--   1. operator_facts              — structured raw input the operator submits.
--                                    Operator-writable (RLS, owner-scoped).
--   2. operator_description_drafts — voice-applied, source-bound generated text.
--                                    Versioned. Service-role-write-only (RLS read-
--                                    only for the owner) so an operator can never
--                                    self-approve or edit published text.
--   3. listings.description        — live. Set ONLY by the admin approval route
--                                    (service role) when a draft is approved.
--
-- Ownership is the canonical listing_claims link (claimed_by + status='active'),
-- the same authority app/api/dashboard/picks/route.js uses. Mirrors the
-- listing_claims security posture (migration 140): authenticated users read their
-- own rows; all privileged writes go through the service role, which bypasses RLS.

-- ── Ownership helper ──────────────────────────────────────────────────────────
-- True when the calling auth user actively owns the listing. SECURITY DEFINER so
-- the listing_claims lookup is not itself re-filtered by RLS; it still keys off
-- the CALLER's auth.uid() (a session GUC, unaffected by the definer), so it only
-- ever reports ownership for the caller themselves.
CREATE OR REPLACE FUNCTION operator_owns_listing(p_listing_id UUID)
  RETURNS BOOLEAN
  LANGUAGE SQL
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM listing_claims lc
    WHERE lc.listing_id = p_listing_id
      AND lc.claimed_by = auth.uid()
      AND lc.status = 'active'
  )
$$;

-- ── 1. operator_facts — structured raw input ─────────────────────────────────
-- One living row per listing. Discrete fields (never a free prose box). The
-- operator edits these directly; every edit re-opens the generate → review loop.
CREATE TABLE IF NOT EXISTS operator_facts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id               UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  submitted_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- the operator (auth.uid())
  -- One specific sentence, dated and located (e.g. "A 1923 brick warehouse on
  -- Gertrude Street, Fitzroy.").
  building_description      TEXT,
  what_you_book             TEXT,
  design_fitting_detail    TEXT,
  where_it_sits            TEXT,
  established_year         INT CHECK (established_year IS NULL OR established_year BETWEEN 1500 AND 2100),
  products_operators_named TEXT[] NOT NULL DEFAULT '{}',
  -- Surfaced as a first-class field in the form: a change of ownership is the
  -- single most common source of stale, wrong, or fabricated editorial copy, so
  -- the operator is asked to state it explicitly.
  ownership_transition_note TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_facts_submitted_by ON operator_facts (submitted_by);

-- ── 2. operator_description_drafts — versioned generated drafts ───────────────
-- One row per generation event. generated_text is immutable provenance; the
-- final published copy (admin may edit before approving) is approved_text.
CREATE TABLE IF NOT EXISTS operator_description_drafts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id            UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  facts_id              UUID REFERENCES operator_facts(id) ON DELETE SET NULL,
  version               INT NOT NULL,                       -- per-listing, increments each regeneration
  generated_text        TEXT NOT NULL,
  approved_text         TEXT,                               -- final published text; set on approve
  source_facts          JSONB NOT NULL DEFAULT '{}'::jsonb, -- frozen snapshot of the fact values used
  model                 TEXT,                               -- e.g. 'claude-haiku-4-5-20251001'
  source_binding_passed BOOLEAN NOT NULL DEFAULT FALSE,     -- every checkable claim traced to a submitted fact
  source_binding_report JSONB,                              -- { passed, failed_claims:[...] }
  banned_phrase_passed  BOOLEAN NOT NULL DEFAULT FALSE,
  status                TEXT NOT NULL DEFAULT 'pending_review'
                          CHECK (status IN ('pending_review', 'approved', 'rejected', 'superseded')),
  -- Bounded operator affordance: flag an error or request changes. NEVER a path
  -- to write published text — these are signals the admin reads, nothing more.
  operator_action       TEXT CHECK (operator_action IN ('flagged_error', 'requested_changes')),
  operator_note         TEXT,
  admin_note            TEXT,                               -- reject reason / edit note
  reviewed_by           TEXT,                               -- admin identifier (admin auth is password-based)
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- entered the review queue
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- text produced
  approved_at           TIMESTAMPTZ,                        -- admin approved → published
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, version)
);

CREATE INDEX IF NOT EXISTS idx_oi_drafts_listing       ON operator_description_drafts (listing_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_oi_drafts_status        ON operator_description_drafts (status);
-- Admin queue: pending drafts awaiting review.
CREATE INDEX IF NOT EXISTS idx_oi_drafts_pending       ON operator_description_drafts (submitted_at) WHERE status = 'pending_review';

-- ── RLS ──────────────────────────────────────────────────────────────────────

-- operator_facts: the owner may read and write ONLY their own listing's facts.
ALTER TABLE operator_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads own facts"   ON operator_facts;
DROP POLICY IF EXISTS "owner inserts own facts" ON operator_facts;
DROP POLICY IF EXISTS "owner updates own facts" ON operator_facts;

CREATE POLICY "owner reads own facts"
  ON operator_facts FOR SELECT TO authenticated
  USING (operator_owns_listing(listing_id));

CREATE POLICY "owner inserts own facts"
  ON operator_facts FOR INSERT TO authenticated
  WITH CHECK (operator_owns_listing(listing_id) AND submitted_by = auth.uid());

CREATE POLICY "owner updates own facts"
  ON operator_facts FOR UPDATE TO authenticated
  USING (operator_owns_listing(listing_id))
  WITH CHECK (operator_owns_listing(listing_id) AND submitted_by = auth.uid());
-- No DELETE policy: operators cannot delete facts; the service role can.

-- operator_description_drafts: the owner may READ their drafts (to see status and
-- flag/request changes via the service-role-backed route). All writes — create,
-- regenerate, approve, reject, publish — go through the service role, which
-- bypasses RLS. No write policy is defined, so an operator can never set
-- approved_text, flip status to 'approved', or otherwise reach published text.
ALTER TABLE operator_description_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads own drafts" ON operator_description_drafts;

CREATE POLICY "owner reads own drafts"
  ON operator_description_drafts FOR SELECT TO authenticated
  USING (operator_owns_listing(listing_id));
