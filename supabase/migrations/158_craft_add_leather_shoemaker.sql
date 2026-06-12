-- 158_craft_add_leather_shoemaker.sql
-- Add two new Craft Atlas disciplines: leathermaker, shoemaker.
--
-- craft_meta.discipline is CHECK-constrained. The constraint was defined inline
-- in 003_extension_tables.sql (`discipline text check (discipline in (...))`),
-- which Postgres auto-names `craft_meta_discipline_check`. A CHECK can't be
-- extended in place, so drop and recreate it with the full 9-value allowlist.
-- Idempotent: DROP ... IF EXISTS, and re-adding the same constraint name is safe
-- to re-run.

alter table craft_meta drop constraint if exists craft_meta_discipline_check;

alter table craft_meta add constraint craft_meta_discipline_check
  check (discipline in (
    'ceramics_clay','visual_art','jewellery_metalwork',
    'textile_fibre','wood_furniture','glass','printmaking',
    'leathermaker','shoemaker'
  ));
