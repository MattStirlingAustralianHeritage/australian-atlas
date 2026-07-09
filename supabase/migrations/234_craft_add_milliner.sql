-- 234_craft_add_milliner.sql
-- Add a new Craft Atlas discipline: milliner (label "Millinery") — makers of
-- hats and headwear: bespoke milliners (race-day / couture) and traditional
-- hatmakers (felt / straw / Akubra-country makers). Distinct from 'clothing'
-- (garments) and 'textile_fibre' (weaving / fibre art).
--
-- craft_meta.discipline CHECK was last widened to 12 values in
-- 231_craft_add_knifemaker. A CHECK can't be extended in place, so drop and
-- recreate with the full 13-value allowlist. Idempotent.

alter table craft_meta drop constraint if exists craft_meta_discipline_check;

alter table craft_meta add constraint craft_meta_discipline_check
  check (discipline in (
    'ceramics_clay','visual_art','jewellery_metalwork',
    'textile_fibre','wood_furniture','glass','printmaking',
    'leathermaker','shoemaker','clothing','fragrance_candles','knifemaker',
    'milliner'
  ));

-- Search recall synonym bag (mirrors every craft discipline in
-- 165_search_or_recall_category_synonyms.sql). Idempotent.
insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('craft', 'milliner', 'milliner millinery hat hats hatmaker hat maker headwear bespoke hat felt hat straw hat fascinator race day hat akubra bush hat blocked hat couture hat cap maker')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

notify pgrst, 'reload schema';
