// Human-readable sub-type labels per vertical. Shared by the map popups
// (components/MapClient.js) and the place-page nearby list
// (components/NearbyExplorer.js) so a venue's category reads identically on
// the pin and in the list. Unknown / unmapped sub_types fall back to a
// title-cased version of the raw key.

export const SUB_TYPE_LABELS = {
  sba: {
    winery: 'Winery', brewery: 'Brewery', distillery: 'Distillery',
    cidery: 'Cidery', meadery: 'Meadery', cellar_door: 'Cellar Door',
    sour_brewery: 'Sour Brewery', non_alcoholic: 'Non-Alcoholic',
  },
  collection: {
    museum: 'Museum', gallery: 'Gallery', heritage_site: 'Heritage Site',
    botanical_garden: 'Botanical Garden', cultural_centre: 'Cultural Centre',
  },
  craft: {
    ceramics_clay: 'Ceramics & Clay', visual_art: 'Visual Art',
    jewellery_metalwork: 'Jewellery & Metalwork', textile_fibre: 'Textile & Fibre',
    wood_furniture: 'Wood & Furniture', glass: 'Glass', printmaking: 'Printmaking',
    leathermaker: 'Leatherwork', shoemaker: 'Shoemaking', clothing: 'Clothing',
    fragrance_candles: 'Fragrance & Candles',
  },
  fine_grounds: {
    roaster: 'Roaster', cafe: 'Cafe',
  },
  rest: {
    boutique_hotel: 'Boutique Hotel', guesthouse: 'Guesthouse', bnb: 'B&B',
    farm_stay: 'Farm Stay', glamping: 'Glamping', cottage: 'Cottage',
    self_contained: 'Self Contained',
  },
  field: {
    swimming_hole: 'Swimming Hole', waterfall: 'Waterfall', lookout: 'Lookout',
    gorge: 'Gorge', coastal_walk: 'Coastal Walk', hot_spring: 'Hot Spring',
    cave: 'Cave', national_park: 'National Park',
    wildlife_zoo: 'Wildlife & Zoo', bush_walk: 'Bush Walk',
    botanic_garden: 'Botanic Garden', nature_reserve: 'Nature Reserve',
  },
  corner: {
    bookshop: 'Bookshop', records: 'Records', homewares: 'Homewares',
    stationery: 'Stationery', jewellery: 'Jewellery', toys: 'Toys',
    general: 'General', clothing: 'Clothing', food_drink: 'Food & Drink',
    plants: 'Plants',
  },
  found: {
    vintage_clothing: 'Vintage Clothing', vintage_furniture: 'Vintage Furniture',
    vintage_store: 'Vintage Store', antiques: 'Antiques', op_shop: 'Op Shop',
    books_ephemera: 'Books & Ephemera', art_objects: 'Art & Objects', market: 'Market',
  },
  table: {
    restaurant: 'Restaurant', bakery: 'Bakery', market: 'Market',
    farm_gate: 'Farm Gate', artisan_producer: 'Artisan Producer',
    specialty_retail: 'Specialty Retail', destination: 'Destination',
    cooking_school: 'Cooking School', providore: 'Providore', food_trail: 'Food Trail',
  },
}

const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

/**
 * Curated label for a vertical's sub_type, or a title-cased fallback for
 * unmapped keys. Returns null when no sub_type is supplied.
 */
export function subTypeLabel(vertical, subType) {
  if (!subType) return null
  return (SUB_TYPE_LABELS[vertical] || {})[subType] || titleCase(subType)
}
