# Seed Files

Structured seed data for expanding the Australian Atlas listing corpus.

## Pipeline

```
1. Create seed file → seeds/<vertical>-<region>.json
2. Validate         → node scripts/seed-validate.mjs seeds/<file>.json --strict
3. Dry run import   → node --env-file=.env.local scripts/seed-import.mjs seeds/<file>.json
4. Import           → node --env-file=.env.local scripts/seed-import.mjs seeds/<file>.json --import
```

## File Format

Each seed file is a JSON object with a `venues` array:

```json
{
  "seed_meta": {
    "vertical": "field",
    "region": "Blue Mountains",
    "state": "NSW",
    "author": "matt",
    "date": "2026-04-03",
    "sources": ["Google Places API", "National Parks NSW", "manual research"]
  },
  "venues": [
    {
      "name": "Venue Name",
      "slug": "venue-name",
      "vertical": "field",
      "source_id": "field_venue-name",
      "state": "NSW",
      "region": "Blue Mountains",
      "lat": -33.7167,
      "lng": 150.3167,
      "description": "Human-written description.",
      "website": "https://verified-url.com",
      "phone": "02 1234 5678",
      "address": "123 Main St, Katoomba NSW 2780",
      "hero_image_url": null,
      "data_source": "google_places",
      "needs_review": false,
      "verification_sources": ["Google Places", "Official tourism site"],
      "meta": {
        "feature_type": "lookout",
        "entry_fee": "free",
        "difficulty": "easy"
      }
    }
  ]
}
```

## Data Integrity Rules

1. **Website URLs**: Only from Google Places, operator-submitted, or manually verified. Never AI-generated.
2. **Descriptions**: If AI-assisted, set `data_source: "ai_generated"` and the disclaimer shows automatically.
3. **Coordinates**: Must be within Australia (-44 to -10 lat, 112 to 154 lng).
4. **Verification**: Each venue should have at least 2 verification sources in strict mode.
5. **Phone numbers**: Australian format only (02/03/04/07/08 + 8 digits, or 13/1300/1800).
6. **Null over fake**: Leave fields null rather than guessing. A null website is better than a wrong one.

## Valid Meta Fields

See `scripts/seed-validate.mjs` for the full enum list per vertical. Key ones:

- **field**: feature_type, entry_fee, difficulty
- **corner**: shop_type
- **found**: shop_type
- **table**: food_type
- **fine_grounds**: entity_type, food_offering
- **sba**: producer_type
- **collection**: institution_type
- **craft**: discipline
- **rest**: accommodation_type, setting

## Audit

Run the contact audit after any import:
```
node --env-file=.env.local scripts/audit-contacts.mjs --vertical=<vertical>
```
