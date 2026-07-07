-- Search recall for the new 'wine_bar' Table category.
--
-- Adds a (vertical='table', sub_type='wine_bar') row to listing_category_synonyms
-- (created in migration 165). search_listings_hybrid folds these terms into the
-- lexical full-text document for every wine_bar listing, so related-term queries
-- ("natural wine", "by the glass", "enoteca", "orange wine", "wine list")
-- surface wine bars even when the listing text doesn't contain the exact phrase.
-- Venue-focused terms only (no "bottle shop" / "cellar door") to keep the
-- category distinct from retail bottle shops and winery cellar doors.
-- Search-only, never rendered publicly. Idempotent — re-applying just retunes terms.

insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('table', 'wine_bar', 'wine bar wine bars natural wine low intervention low-intervention minimal intervention biodynamic wine organic wine orange wine skin contact pet nat pet-nat by the glass wines by the glass glass pour wine list cellar list sommelier somm enoteca vino vermouth aperitivo aperitif wine room wine flight tasting flight grower wine small plates snacks drink wine')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

-- No schema change; search_listings_hybrid reads the table at query time. Reload
-- the PostgREST cache anyway for consistency with the category-vocab migrations.
notify pgrst, 'reload schema';
