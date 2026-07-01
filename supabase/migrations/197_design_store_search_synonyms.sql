-- Search recall for the new 'design_store' Corner category.
--
-- Adds a (vertical='corner', sub_type='design_store') row to
-- listing_category_synonyms (created in migration 165). search_listings_hybrid
-- folds these terms into the lexical full-text document for every design_store
-- listing, so related-term queries ("concept store", "interiors", "furniture",
-- "lighting", "homewares", "mid-century") surface design stores even when the
-- listing text doesn't contain the exact phrase. Search-only, never rendered
-- publicly. Idempotent — re-applying just retunes terms.
--
-- No corner_meta / Corner shops CHECK constraint exists for shop_type/category
-- (both free-text), so no category-constraint migration is needed for this
-- category — only this search-recall row.

insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('corner', 'design_store', 'design store design shop concept store interiors interior design homewares furniture lighting objects ceramics textiles homeware decor decoration designer studio showroom mid-century modernist scandinavian gift store curated retail')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

notify pgrst, 'reload schema';
