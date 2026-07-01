-- Search recall for the new 'specialty_retail' Corner category.
--
-- Adds a (vertical='corner', sub_type='specialty_retail') row to
-- listing_category_synonyms (created in migration 165). search_listings_hybrid
-- folds these terms into the lexical full-text document for every corner
-- specialty_retail listing. Keyed by (vertical, sub_type), so this is distinct
-- from the existing ('table','specialty_retail') food-specialty row.
--
-- No corner_meta / Corner shops CHECK constraint exists (shop_type / category
-- are free-text), so no category-constraint migration is needed for this
-- category — only this search-recall row. Idempotent.

insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('corner', 'specialty_retail', 'specialty retail specialty shop specialist store niche shop concept store curated independent retailer emporium perfumery perfumer art supplies stationery hobby craft supplies kitchenware map shop games shop specialist boutique')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

notify pgrst, 'reload schema';
