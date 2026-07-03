-- 218_craft_add_fragrance_candles.sql
-- Add a new Craft Atlas discipline: fragrance_candles (label "Fragrance & Candles").
--
-- craft_meta.discipline is CHECK-constrained. The constraint was defined inline
-- in 003_extension_tables.sql, widened to 9 values in
-- 158_craft_add_leather_shoemaker.sql, then to 10 in 216_craft_add_clothing.sql.
-- A CHECK can't be extended in place, so drop and recreate it with the full
-- 11-value allowlist. Idempotent: DROP ... IF EXISTS, and re-adding the same
-- constraint name is safe to re-run.

alter table craft_meta drop constraint if exists craft_meta_discipline_check;

alter table craft_meta add constraint craft_meta_discipline_check
  check (discipline in (
    'ceramics_clay','visual_art','jewellery_metalwork',
    'textile_fibre','wood_furniture','glass','printmaking',
    'leathermaker','shoemaker','clothing','fragrance_candles'
  ));

-- Search recall: give the new craft discipline a synonym bag, mirroring every
-- other craft discipline in 165_search_or_recall_category_synonyms.sql. Folded
-- into the lexical search document by search_listings_hybrid; never rendered.
-- Idempotent seed (ON CONFLICT) so re-runs and term-bag tuning are safe.
insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('craft', 'fragrance_candles', 'fragrance candles candle candlemaker chandler chandlery hand poured soy beeswax scented candle perfume perfumer perfumery scent aroma aromatherapy essential oils incense diffuser room spray apothecary botanical')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

-- Reload PostgREST schema cache so the new constraint/route is picked up.
notify pgrst, 'reload schema';
