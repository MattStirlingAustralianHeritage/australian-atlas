#!/usr/bin/env node
/**
 * Seed Validator — validates a seed JSON file before import.
 *
 * Checks every venue for:
 *   - Required fields present and non-empty
 *   - Valid vertical key
 *   - Valid state abbreviation
 *   - Coordinates within Australian bounds
 *   - No duplicate source_ids
 *   - Website URL format (if provided)
 *   - Meta fields match vertical schema constraints
 *   - Flags fields that look AI-generated (generic descriptions)
 *
 * Usage:
 *   node scripts/seed-validate.mjs seeds/field-expansion.json
 *   node scripts/seed-validate.mjs seeds/corner-expansion.json --strict
 */

import { readFileSync } from 'fs'

const VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']
const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

// Australian geographic bounds (generous)
const AU_BOUNDS = { minLat: -44.0, maxLat: -10.0, minLng: 112.0, maxLng: 154.0 }

// Valid meta field enum values per vertical
const META_ENUMS = {
  field: {
    feature_type: ['swimming_hole', 'waterfall', 'lookout', 'gorge', 'coastal_walk', 'hot_spring', 'cave', 'national_park'],
    entry_fee: ['free', 'paid', 'national_parks_pass'],
    difficulty: ['easy', 'moderate', 'hard'],
  },
  corner: {
    shop_type: ['bookshop', 'records', 'homewares', 'stationery', 'jewellery', 'toys', 'general', 'clothing', 'food_drink', 'plants', 'other'],
  },
  found: {
    shop_type: ['vintage_clothing', 'vintage_furniture', 'antiques', 'op_shop', 'books_ephemera', 'art_objects', 'market'],
  },
  table: {
    food_type: ['restaurant', 'bakery', 'market', 'farm_gate', 'artisan_producer', 'specialty_retail', 'destination', 'cooking_school', 'providore', 'food_trail'],
  },
  fine_grounds: {
    entity_type: ['roaster', 'cafe'],
    food_offering: ['none', 'light', 'full'],
  },
  sba: {
    producer_type: ['brewery', 'winery', 'distillery', 'cidery', 'meadery', 'cellar_door', 'sour_brewery', 'non_alcoholic'],
  },
  collection: {
    institution_type: ['museum', 'gallery', 'heritage_site', 'botanical_garden', 'cultural_centre', 'sculpture_park'],
  },
  craft: {
    discipline: ['ceramics_clay', 'visual_art', 'jewellery_metalwork', 'textile_fibre', 'wood_furniture', 'glass', 'printmaking'],
  },
  rest: {
    accommodation_type: ['boutique_hotel', 'farm_stay', 'glamping', 'self_contained', 'bnb', 'guesthouse', 'cottage'],
    setting: ['coastal', 'bush', 'mountain', 'valley', 'farmland', 'desert', 'urban'],
  },
}

// Patterns that suggest AI-generated content
const GENERIC_PATTERNS = [
  /nestled in the heart of/i,
  /a hidden gem/i,
  /something for everyone/i,
  /a must-visit destination/i,
  /offers a unique/i,
  /whether you're looking for/i,
  /the perfect place to/i,
  /a wide range of/i,
  /experience the best of/i,
  /a true testament/i,
  /boasts an impressive/i,
]

function validate(filePath, strict = false) {
  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (err) {
    console.error(`Cannot read file: ${filePath}`)
    process.exit(1)
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch (err) {
    console.error(`Invalid JSON: ${err.message}`)
    process.exit(1)
  }

  const venues = data.venues || data.listings || data
  if (!Array.isArray(venues)) {
    console.error('Expected a JSON array or object with "venues" or "listings" key')
    process.exit(1)
  }

  console.log(`\nValidating ${venues.length} venues from ${filePath}\n`)

  const errors = []
  const warnings = []
  const seenIds = new Set()
  const seenNames = new Map() // name -> index for duplicate detection
  const stateCounts = {}
  STATES.forEach(s => { stateCounts[s] = 0 })

  venues.forEach((venue, i) => {
    const prefix = `[${i}] "${venue.name || 'unnamed'}"`

    // Required fields
    if (!venue.name || !venue.name.trim()) errors.push(`${prefix}: missing name`)
    if (!venue.slug || !venue.slug.trim()) errors.push(`${prefix}: missing slug`)
    if (!venue.vertical) errors.push(`${prefix}: missing vertical`)
    if (!venue.state) errors.push(`${prefix}: missing state`)
    if (!venue.source_id && !venue.name) errors.push(`${prefix}: missing source_id`)

    // Vertical must be valid
    if (venue.vertical && !VERTICALS.includes(venue.vertical)) {
      errors.push(`${prefix}: invalid vertical "${venue.vertical}"`)
    }

    // State must be valid
    if (venue.state && !STATES.includes(venue.state)) {
      errors.push(`${prefix}: invalid state "${venue.state}"`)
    } else if (venue.state) {
      stateCounts[venue.state]++
    }

    // Coordinates
    if (venue.lat == null || venue.lng == null) {
      if (strict) errors.push(`${prefix}: missing coordinates`)
      else warnings.push(`${prefix}: missing coordinates (will not appear on map)`)
    } else {
      if (venue.lat < AU_BOUNDS.minLat || venue.lat > AU_BOUNDS.maxLat ||
          venue.lng < AU_BOUNDS.minLng || venue.lng > AU_BOUNDS.maxLng) {
        errors.push(`${prefix}: coordinates (${venue.lat}, ${venue.lng}) outside Australia`)
      }
    }

    // Duplicate detection
    const id = venue.source_id || `${venue.vertical}_${venue.slug}`
    if (seenIds.has(id)) {
      errors.push(`${prefix}: duplicate source_id "${id}"`)
    }
    seenIds.add(id)

    if (venue.name) {
      const normName = venue.name.toLowerCase().trim()
      if (seenNames.has(normName)) {
        warnings.push(`${prefix}: possible duplicate name (also at index ${seenNames.get(normName)})`)
      }
      seenNames.set(normName, i)
    }

    // Website URL format + data source check
    if (venue.website) {
      try {
        const parsed = new URL(venue.website)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push(`${prefix}: website URL must be http/https, got "${parsed.protocol}"`)
        }
        // Warn if URL looks like a social media page (not a direct business site)
        const socialDomains = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com']
        if (socialDomains.some(d => parsed.hostname.includes(d))) {
          warnings.push(`${prefix}: website is a social media page (${parsed.hostname}) — prefer direct business URL`)
        }
      } catch {
        errors.push(`${prefix}: invalid website URL "${venue.website}"`)
      }
      // If data_source is ai_generated, website should be null
      if (venue.data_source === 'ai_generated') {
        errors.push(`${prefix}: website URL present but data_source is "ai_generated" — URLs must never be AI-generated`)
      }
    }

    // Data source validation
    if (venue.data_source) {
      const validSources = ['ai_generated', 'google_places', 'operator_verified', 'manually_curated']
      if (!validSources.includes(venue.data_source)) {
        errors.push(`${prefix}: invalid data_source "${venue.data_source}" (valid: ${validSources.join(', ')})`)
      }
    }

    // Phone number format (Australian)
    if (venue.phone) {
      const cleaned = venue.phone.replace(/[\s\-\(\)\.]/g, '')
      const auPatterns = [
        /^(?:\+?61|0)[2-478]\d{8}$/,
        /^(?:\+?61|0)4\d{8}$/,
        /^13\d{4}$/,
        /^1[38]00\d{6}$/,
      ]
      if (!auPatterns.some(p => p.test(cleaned))) {
        warnings.push(`${prefix}: phone "${venue.phone}" may not be valid Australian format`)
      }
    }

    // Description quality
    if (venue.description) {
      if (venue.description.length < 20) {
        warnings.push(`${prefix}: very short description (${venue.description.length} chars)`)
      }
      for (const pattern of GENERIC_PATTERNS) {
        if (pattern.test(venue.description)) {
          warnings.push(`${prefix}: description may be AI-generated (matches "${pattern.source}")`)
          break
        }
      }
    } else if (strict) {
      warnings.push(`${prefix}: no description`)
    }

    // Meta field validation
    if (venue.meta && venue.vertical) {
      const enums = META_ENUMS[venue.vertical]
      if (enums) {
        for (const [field, validValues] of Object.entries(enums)) {
          if (venue.meta[field] && !validValues.includes(venue.meta[field])) {
            errors.push(`${prefix}: invalid meta.${field} "${venue.meta[field]}" (valid: ${validValues.join(', ')})`)
          }
        }
      }
    }

    // Verification sources
    if (venue.verification_sources) {
      if (!Array.isArray(venue.verification_sources) || venue.verification_sources.length < 2) {
        if (strict) errors.push(`${prefix}: needs at least 2 verification sources`)
        else warnings.push(`${prefix}: fewer than 2 verification sources`)
      }
    } else if (strict) {
      errors.push(`${prefix}: missing verification_sources`)
    }
  })

  // Geographic distribution check
  const totalVenues = venues.length
  for (const [state, count] of Object.entries(stateCounts)) {
    if (count / totalVenues > 0.4 && totalVenues > 10) {
      warnings.push(`Geographic concentration: ${Math.round(count / totalVenues * 100)}% of venues are in ${state}`)
    }
  }

  // Report
  console.log('── VALIDATION RESULTS ──')
  if (errors.length === 0 && warnings.length === 0) {
    console.log('  All venues passed validation.')
  }

  if (errors.length > 0) {
    console.log(`\n  ERRORS (${errors.length}) — must fix before import:`)
    errors.forEach(e => console.log(`    \x1b[31m\u2718\x1b[0m ${e}`))
  }

  if (warnings.length > 0) {
    console.log(`\n  WARNINGS (${warnings.length}) — review recommended:`)
    warnings.forEach(w => console.log(`    \x1b[33m\u26A0\x1b[0m ${w}`))
  }

  // Summary
  console.log('\n── SUMMARY ──')
  console.log(`  Total venues:  ${totalVenues}`)
  console.log(`  Errors:        ${errors.length}`)
  console.log(`  Warnings:      ${warnings.length}`)
  console.log(`  States:        ${Object.entries(stateCounts).filter(([, c]) => c > 0).map(([s, c]) => `${s}(${c})`).join(' ')}`)

  if (errors.length > 0) {
    console.log('\n  \x1b[31mFAILED — fix errors before importing.\x1b[0m\n')
    process.exit(1)
  } else {
    console.log('\n  \x1b[32mPASSED — ready for import.\x1b[0m\n')
  }
}

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/seed-validate.mjs <seed-file.json> [--strict]')
  process.exit(1)
}

validate(filePath, process.argv.includes('--strict'))
