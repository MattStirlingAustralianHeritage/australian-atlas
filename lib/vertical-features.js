// One name for this feature network-wide — the operator-facing perk is called
// "Producer's Picks" on every vertical, regardless of venue type. Per-vertical
// picksLabel still exists so a future vertical could rename, but today they all
// resolve here so the name never drifts between surfaces.
export const PRODUCER_PICKS_LABEL = "Producer's Picks"

export const VERTICAL_FEATURES = {
  sba: {
    label: 'Small Batch Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: true,
    hasBookingLink: true,
    hasOpeningHours: true,
    hasOnlineShop: true,
    hasDrinksMenu: false,
    hasAmenities: false,
    eventsLabel: 'Tasting Events',
    hoursLabel: 'Opening Hours',
  },
  collection: {
    label: 'Culture Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: false,
    hasBookingLink: true,
    hasOpeningHours: true,
    hasOnlineShop: false,
    hasDrinksMenu: false,
    hasAmenities: false,
    eventsLabel: 'Exhibitions',
    hoursLabel: 'Opening Hours',
  },
  craft: {
    label: 'Craft Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: false,
    hasBookingLink: true,
    hasOpeningHours: true,
    hasOnlineShop: true,
    hasDrinksMenu: false,
    hasAmenities: false,
    eventsLabel: 'Workshops',
    hoursLabel: 'Opening Hours',
  },
  fine_grounds: {
    label: 'Fine Grounds Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: true,
    hasBookingLink: false,
    hasOpeningHours: true,
    hasOnlineShop: false,
    hasDrinksMenu: true,
    hasAmenities: false,
    eventsLabel: 'Events',
    hoursLabel: 'Opening Hours',
  },
  rest: {
    label: 'Rest Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: true,
    hasBookingLink: true,
    hasOpeningHours: false,
    hasOnlineShop: false,
    hasDrinksMenu: false,
    hasAmenities: true,
    eventsLabel: 'Events',
    hoursLabel: 'Check-in / Check-out',
  },
  field: {
    label: 'Field Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: false,
    hasBookingLink: false,
    hasOpeningHours: true,
    hasOnlineShop: false,
    hasDrinksMenu: false,
    hasAmenities: false,
    eventsLabel: 'Events',
    hoursLabel: 'Opening Hours',
  },
  corner: {
    label: 'Corner Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: false,
    hasBookingLink: false,
    hasOpeningHours: true,
    hasOnlineShop: true,
    hasDrinksMenu: false,
    hasAmenities: false,
    eventsLabel: 'Events',
    hoursLabel: 'Opening Hours',
  },
  found: {
    label: 'Found Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: false,
    hasBookingLink: false,
    hasOpeningHours: true,
    hasOnlineShop: false,
    hasDrinksMenu: false,
    hasAmenities: false,
    eventsLabel: 'Events',
    hoursLabel: 'Opening Hours',
  },
  table: {
    label: 'Table Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: false,
    hasBookingLink: true,
    hasOpeningHours: true,
    hasOnlineShop: true,
    hasDrinksMenu: false,
    hasAmenities: false,
    eventsLabel: 'Events',
    hoursLabel: 'Opening Hours',
  },
  way: {
    label: 'Way Atlas',
    picksLabel: PRODUCER_PICKS_LABEL,
    hasPicks: false,
    hasBookingLink: true,
    hasOpeningHours: false,
    hasOnlineShop: false,
    hasDrinksMenu: false,
    hasAmenities: false,
    eventsLabel: 'Departures',
    hoursLabel: 'Opening Hours',
  },
}

export function getVerticalFeatures(vertical) {
  return VERTICAL_FEATURES[vertical] || VERTICAL_FEATURES.sba
}

export function getStandardFeatures(vertical) {
  const vf = getVerticalFeatures(vertical)
  const features = ['Full listing management', 'Photo gallery', 'Website & social links', 'Listing Insights']
  if (vf.hasPicks && vf.picksLabel) features.push(vf.picksLabel)
  if (vf.hasOnlineShop) features.push('Online shop link')
  return features
}
