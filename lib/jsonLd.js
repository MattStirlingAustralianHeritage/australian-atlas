/**
 * JSON-LD Structured Data for Australian Atlas
 *
 * Generates schema.org markup for listings, trails, regions, and the site itself.
 * These are rendered as <script type="application/ld+json"> in page components.
 */

import { getListingRegion } from '@/lib/regions'

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
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Australian Atlas',
    url: SITE_URL,
    description: "The complete guide to independent Australia. Nine atlases covering craft producers, boutique stays, makers, galleries, natural places, specialty coffee, independent shops and food producers.",
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

export function listingJsonLd(listing) {
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
      ...(listing.address ? { streetAddress: listing.address } : {}),
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

  if (listing.hero_image_url) {
    ld.image = listing.hero_image_url
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

  // Add isPartOf to reference the vertical
  ld.isPartOf = {
    '@type': 'WebSite',
    name: verticalName,
  }

  return ld
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
