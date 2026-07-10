-- Search recall for the new 'pick_your_own' Table category.
--
-- Adds a (vertical='table', sub_type='pick_your_own') row to listing_category_synonyms
-- (created in migration 165). search_listings_hybrid folds these terms into the
-- lexical full-text document for every pick-your-own listing, so related-term
-- queries ("fruit picking", "strawberry picking", "u-pick", "orchard", "berry
-- farm") surface these farms even when the listing text doesn't contain the exact
-- phrase. Experience-focused terms — kept distinct from Table's 'farm_gate' (a
-- buy-direct stall where you don't harvest) and 'market'.
-- Search-only, never rendered publicly. Idempotent — re-applying just retunes terms.

insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('table', 'pick_your_own', 'pick your own pick-your-own pyo u-pick upick u pick self pick self-pick pick and pay you pick harvest your own farm picking fruit picking berry picking strawberry picking strawberries cherry picking cherries apple picking apples blueberry picking blueberries raspberry raspberries blackberry mulberry stone fruit stonefruit peaches nectarines plums apricots figs orchard orchards fruit farm berry farm strawberry farm pick your own farm open orchard in season seasonal picking family farm day out kids activity punnet basket paddock to plate')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

-- No schema change; search_listings_hybrid reads the table at query time. Reload
-- the PostgREST cache anyway for consistency with the category-vocab migrations.
notify pgrst, 'reload schema';
