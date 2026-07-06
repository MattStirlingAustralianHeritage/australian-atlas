/**
 * JSON-LD Structured Data for Australian Atlas
 *
 * Generates schema.org markup for listings, trails, regions, and the site itself.
 * These are rendered as <script type="application/ld+json"> in page components.
 */

import { getListingRegion } from '@/lib/regions'
import { isHeroDisplayable } from '@/lib/image-utils'

const SITE_URL = 'https://australianatlas.com.au'

const VERTICAL_SCHEMA_TYPES = {
  sba: 'LocalBusiness',
  collection: 'Museum',
  craft: 'LocalBusiness',
  fine_grounds: 'CafeOrCoffeeShop',
  rest: 'LodgingBusiness',
  field: 'Place',
  corner: 'Store',
  found: 'Store',
  table: 'Restaurant',
}

const VERTICAL_NAMES = {
  sba: 'Small Batch Atlas',
  collection: 'Culture Atlas',
  craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas',
  rest: 'Rest Atlas',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
  way: 'Way Atlas',
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Australian Atlas',
    url: SITE_URL,
    description: "The curated guide to the best of independent Australia — specialty coffee, makers, distillers, galleries, boutique stays, and the natural places in between. Thousands of independent places, every one verified and mapped.",
  }
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Australian Atlas',
    url: SITE_URL,
    logo: `${SITE_URL}/favicon-512.png`,
    sameAs: [],
  }
}

/**
 * @param {object} listing
 * @param {object} [extras] - { offers?: Array<{title,details,url,valid_to}> }
 *   Live operator offers (migration 208) are emitted as schema.org makesOffer.
 */
export function listingJsonLd(listing, extras) {
  const schemaType = VERTICAL_SCHEMA_TYPES[listing.vertical] || 'LocalBusiness'
  const verticalName = VERTICAL_NAMES[listing.vertical] || 'Australian Atlas'
  const url = `${SITE_URL}/place/${listing.slug}`

  const ld = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: listing.name,
    url,
  }

  if (listing.description) {
    ld.description = listing.description.slice(0, 300)
  }

  if (listing.website) {
    ld.sameAs = [listing.website]
  }

  if (listing.phone) {
    ld.telephone = listing.phone
  }

  const region = getListingRegion(listing)
  if (listing.address || region || listing.state) {
    ld.address = {
      '@type': 'PostalAddress',
      // Respect address-on-request: never emit the street into machine-readable LD.
      ...(listing.address && !listing.address_on_request ? { streetAddress: listing.address } : {}),
      ...(region ? { addressLocality: region.name } : {}),
      ...(listing.state ? { addressRegion: listing.state } : {}),
      addressCountry: 'AU',
    }
  }

  if (listing.lat && listing.lng) {
    ld.geo = {
      '@type': 'GeoCoordinates',
      latitude: listing.lat,
      longitude: listing.lng,
    }
  }

  // Moderation gate (same as the visible hero): don't emit a flagged/held image
  // into structured data. Fail-open on an absent column, so callers that didn't
  // select image_moderation_status are unaffected.
  if (listing.hero_image_url && isHeroDisplayable(listing)) {
    ld.image = listing.hero_image_url
  }

  // Operator photo library (paid perk). Callers pass only clean-moderated,
  // host-approved URLs; emitted as a schema.org image array (hero first).
  const galleryImages = Array.isArray(extras?.galleryImages)
    ? extras.galleryImages.filter(u => typeof u === 'string' && u && u !== ld.image)
    : []
  if (galleryImages.length > 0) {
    ld.image = [...(ld.image ? [ld.image] : []), ...galleryImages]
  }

  // Opening hours structured data
  if (listing.hours && typeof listing.hours === 'object') {
    const DAY_NAMES = {
      monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
      thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
    }
    const specs = Object.entries(listing.hours)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([day, value]) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: DAY_NAMES[day],
        opens: value.open,
        closes: value.close,
      }))
    if (specs.length > 0) {
      ld.openingHoursSpecification = specs
    }
  }

  // Live operator offers (migration 208) → schema.org makesOffer. Only real,
  // unexpired offers are passed in by the caller; emit nothing otherwise.
  const offers = Array.isArray(extras?.offers) ? extras.offers.filter(o => o && o.title) : []
  if (offers.length > 0) {
    ld.makesOffer = offers.map(o => ({
      '@type': 'Offer',
      name: o.title,
      ...(o.details ? { description: String(o.details).slice(0, 300) } : {}),
      ...(o.url ? { url: o.url } : {}),
      ...(o.valid_to ? { availabilityEnds: o.valid_to } : {}),
    }))
  }

  // Add isPartOf to reference the vertical
  ld.isPartOf = {
    '@type': 'WebSite',
    name: verticalName,
  }

  return ld
}

/**
 * schema.org FAQPage from operator-authored, published Q&A (migration 209).
 * Rendered as a separate LD script on /place/[slug]. Returns null when empty so
 * the caller can skip the tag. This is what lets AI assistants answer visitor
 * questions about the venue in the operator's own words.
 */
export function faqPageJsonLd(qna) {
  const items = (Array.isArray(qna) ? qna : [])
    .filter(q => q && q.question && q.answer)
    .slice(0, 8)
  if (items.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(q => ({
      '@type': 'Question',
      name: String(q.question).slice(0, 300),
      acceptedAnswer: { '@type': 'Answer', text: String(q.answer).slice(0, 1000) },
    })),
  }
}

export function trailJsonLd(trail, stops) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: trail.title,
    description: trail.description || '',
    url: `${SITE_URL}/trails/${trail.slug}`,
    numberOfItems: stops?.length || 0,
    touristType: 'Independent traveller',
  }
}

export function regionJsonLd(region) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: region.name,
    description: region.description || `Discover independent places in ${region.name}`,
    url: `${SITE_URL}/regions/${region.slug}`,
    ...(region.state ? {
      containedInPlace: {
        '@type': 'AdministrativeArea',
        name: region.state,
        addressCountry: 'AU',
      },
    } : {}),
  }
}

// ItemList of a region's standout places — gives /regions/[slug] a crawlable
// list entity alongside the Place node.
export function regionItemListJsonLd(region, listings, { limit = 12 } = {}) {
  const items = (listings || []).filter(l => l.slug).slice(0, limit)
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Independent places in ${region.name}`,
    url: `${SITE_URL}/regions/${region.slug}`,
    numberOfItems: items.length,
    itemListElement: items.map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: l.name,
      url: `${SITE_URL}/place/${l.slug}`,
    })),
  }
}

export function collectionJsonLd(collection, listings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: collection.title,
    description: collection.description || '',
    url: `${SITE_URL}/collections/${collection.slug}`,
    numberOfItems: listings?.length || collection.listing_ids?.length || 0,
    itemListElement: (listings || []).map((listing, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: listing.name,
      url: listing.url || `${SITE_URL}/place/${listing.slug}`,
    })),
  }
}

export function articleJsonLd(article) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt || '',
    url: `${SITE_URL}/journal/${article.slug}`,
    datePublished: article.published_at || undefined,
    author: {
      '@type': 'Organization',
      name: article.author || 'Australian Atlas',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Australian Atlas',
      url: SITE_URL,
    },
    ...(article.hero_image_url ? { image: article.hero_image_url } : {}),
  }
}

export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url ? `${SITE_URL}${item.url}` : undefined,
    })),
  }
}
