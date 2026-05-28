-- Plan-a-Stay v2: RLS hardening for public trip reads.
-- Public /trip/[slug] page will read via anon client; this policy ensures
-- anon can only ever SELECT rows explicitly marked public.
-- Inserts remain server-side via service-role (which bypasses RLS).

ALTER TABLE plan_a_stay_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon reads public trips" ON plan_a_stay_trips;

CREATE POLICY "anon reads public trips"
  ON plan_a_stay_trips
  FOR SELECT
  TO anon
  USING (is_public = true);
