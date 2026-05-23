# Component 4F: way_meta Schema Verification

**Date verified:** 2026-05-23
**Method:** PostgREST OpenAPI endpoint (service role key, production)
**Script:** `scripts/verify-way-meta-schema.mjs` (disposable)

## Production Schema: way_meta

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| listing_id | uuid | NO | - |
| primary_type | text | NO | - |
| secondary_types | text[] | NO | - |
| operator_type | text | NO | - |
| operator_legal_name | text | YES | - |
| aboriginal_community | text | YES | - |
| presence_type | text | YES | - |
| operating_season_months | integer[] | YES | - |
| primary_region_id | uuid | YES | - |
| operating_region_ids | uuid[] | NO | - |
| departure_point_name | text | YES | - |
| multiple_departure_points | boolean | NO | false |
| contact_email | text | YES | - |
| contact_name | text | YES | - |
| booking_url | text | YES | - |
| established_year | integer | YES | - |
| accreditations | text[] | NO | - |
| claim_status | text | YES | - |
| cultural_authority_verified | boolean | NO | false |
| cultural_authority_source | text | YES | - |
| cultural_authority_verified_at | timestamptz | YES | - |
| cultural_authority_verified_by | uuid | YES | - |
| cultural_authority_notes | text | YES | - |

23 columns total. Matches migration 115 source exactly.

## Verification Checks

### 1. cultural_authority_notes

- **Present:** Yes
- **Type:** text, nullable, no CHECK constraint
- **Expected:** TEXT, nullable, no CHECK
- **Status:** Matches. No new migration required.
- **Usage:** Migration 116 writes to this column in trigger functions (`cultural_authority_notes = new.review_notes`). No subsequent migration (117-119) alters or drops it.

### 2. operator_legal_name

- **Present:** Yes
- **Type:** text, nullable
- **Note:** The Component 4A wayClassification payload originally used the key `operator_name`, which does not correspond to any column. Corrected to `operator_legal_name` in commit `5b2d3ab`.

### 3. operator_name (negative check)

- **Present:** No (does not exist in production)
- **Confirms:** The 4A payload key correction was necessary. Without it, 4C's INSERT would silently NULL the operator_legal_name column.

## Migration References

- **115_way_meta.sql** — Creates the way_meta table with all 23 columns
- **116_cultural_authority_review.sql** — Creates cultural authority review system; writes to cultural_authority_notes via triggers
- **118_way_cultural_authority_gate.sql** — No ALTER/DROP on way_meta columns
- **119_way_cultural_authority_revocation.sql** — No ALTER/DROP on way_meta columns

## Conclusion

No new migration required. Production schema matches migration source. The only corrective action was the payload key rename (operator_name to operator_legal_name), addressed in a separate commit.
