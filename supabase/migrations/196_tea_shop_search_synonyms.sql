-- Search recall for the new 'tea_shop' Table category.
--
-- Adds a (vertical='table', sub_type='tea_shop') row to listing_category_synonyms
-- (created in migration 165). search_listings_hybrid folds these terms into the
-- lexical full-text document for every tea_shop listing, so related-term queries
-- ("tea house", "loose leaf", "matcha", "chai", "oolong", "tisane", "high tea")
-- surface tea shops even when the listing text doesn't contain the exact phrase.
-- Search-only, never rendered publicly. Idempotent — re-applying just retunes terms.

insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('table', 'tea_shop', 'tea shop tea house teahouse tea room tearoom tea merchant tea specialist loose leaf loose-leaf leaf tea tea blend blended tea single estate single-estate teaware teapot high tea afternoon tea chai matcha oolong pu-erh puerh green tea black tea white tea herbal tea tisane infusion brew chado steep')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

-- No schema change; search_listings_hybrid reads the table at query time. Reload
-- the PostgREST cache anyway for consistency with the category-vocab migrations.
notify pgrst, 'reload schema';
