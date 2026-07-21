/**
 * Atlas Trade — product fact sheet ("the one-pager the trade actually asks for").
 *
 * Assembles a trade-canonical fact sheet for one venue: identity + story,
 * logistics, trade-readiness flags, extended profile, and a checklist scored
 * against what Australian trade buyers require before contracting a supplier
 * (per the Tourism Australia / ATEC rate-agreement canon: capacity, group
 * conditions, notice, seasonality, dietary, languages, insurance, a named
 * trade contact).
 *
 * GATED SURFACE ONLY: the assembled sheet includes the trade-only contact
 * channel, so it must never render outside a trade-account-gated page/route.
 */
import { getVerticalUrl, getVerticalLabel } from '@/lib/verticalUrl'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { isPublicListing } from '@/lib/listings/publicFilter'
import { getTradeEnrichment } from './enrich'
import { getTradeProfile, tradeProfileView } from './profile'

const SHEET_SELECT =
  'id, name, slug, vertical, sub_type, region, state, suburb, street_address, postcode, ' +
  'description, hero_image_url, website, phone, hours, lat, lng, founded_year, ' +
  'is_owner_operator, status, needs_review'

/**
 * Load the fact sheet for a listing by slug (or id). Returns null when the
 * venue isn't public or isn't trade-ready — fact sheets exist only for venues
 * whose operators opted in (the trade_buildable_listings predicate).
 */
export async function loadFactSheet(sb, { slug = null, id = null }) {
  if (!slug && !id) return null

  let q = sb.from('listings').select(SHEET_SELECT)
  q = slug ? q.eq('slug', slug) : q.eq('id', id)
  const { data: listing, error } = await q.maybeSingle()
  if (error) {
    console.error('[trade/factsheet] listing load failed:', error.message)
    return null
  }
  if (!listing || listing.status !== 'active' || !isPublicListing(listing)) return null

  const enrichment = await getTradeEnrichment(sb, [listing.id])
  const trade = enrichment.get(listing.id) || null
  if (!trade) return null // Fact sheets are a trade-ready surface.

  const profile = tradeProfileView(await getTradeProfile(sb, listing.id))

  // Claim contact as the fallback channel when no dedicated trade contact set.
  let claimEmail = null
  const { data: claims } = await sb
    .from('listing_claims')
    .select('claimant_email')
    .eq('listing_id', listing.id)
    .in('status', LIVE_CLAIM_STATUSES)
    .order('status', { ascending: true })
    .limit(1)
  claimEmail = claims?.[0]?.claimant_email || null

  const sheet = {
    id: listing.id,
    name: listing.name,
    slug: listing.slug,
    vertical: listing.vertical,
    vertical_label: getVerticalLabel(listing.vertical),
    sub_type: listing.sub_type ? String(listing.sub_type).replace(/_/g, ' ') : null,
    region: listing.region,
    state: listing.state,
    suburb: listing.suburb,
    address: [listing.street_address, listing.suburb, listing.state, listing.postcode]
      .filter(Boolean)
      .join(', ') || null,
    description: listing.description,
    hero_image_url: listing.hero_image_url,
    website: listing.website,
    phone: listing.phone,
    hours: listing.hours,
    lat: listing.lat,
    lng: listing.lng,
    founded_year: listing.founded_year,
    is_owner_operator: !!listing.is_owner_operator,
    url: getVerticalUrl(listing.vertical, listing.slug),
    trade,
    profile,
    contact: {
      // Gated-surface only. Dedicated trade contact first, claim email second.
      name: profile?.contact_name || null,
      email: profile?.contact_email || claimEmail,
      phone: profile?.contact_phone || listing.phone || null,
    },
    checklist: buildChecklist(trade, profile),
  }
  return sheet
}

/**
 * The trade-readiness checklist — the canonical items an Australian trade
 * buyer looks for before contracting (TA/ATEC rate-agreement canon), scored
 * against what this operator has provided. Rendered on the fact sheet and its
 * PDF so a buyer sees at a glance what's stated vs. what to confirm.
 */
export function buildChecklist(trade, profile) {
  const items = [
    { key: 'welcome', label: 'Welcomes trade business', done: true }, // implied by trade-readiness
    { key: 'engagement', label: 'Bespoke / group engagement stated', done: !!(trade?.bespoke || trade?.group) },
    { key: 'capacity', label: 'Group capacity stated', done: trade?.group ? trade?.group_size_max != null || !!profile?.capacity_notes : !!profile?.capacity_notes },
    { key: 'rates', label: 'Trade rates offered', done: !!trade?.rates_available },
    { key: 'notice', label: 'Minimum booking notice stated', done: profile?.notice_days != null },
    { key: 'seasonal', label: 'Seasonal closures stated', done: !!profile?.seasonal_notes },
    { key: 'dietary', label: 'Dietary handling stated', done: !!profile?.dietary_notes },
    { key: 'languages', label: 'Languages stated', done: (profile?.languages || []).length > 0 },
    { key: 'coach', label: 'Coach access stated', done: profile?.coach_access === true },
    { key: 'insurance', label: 'Public liability insurance confirmed', done: !!profile?.insurance_confirmed },
    { key: 'famil', label: 'Open to famils', done: !!profile?.famil_open },
    { key: 'contact', label: 'Dedicated trade contact', done: !!(profile?.contact_email || profile?.contact_name) },
  ]
  const done = items.filter((i) => i.done).length
  return { items, done, total: items.length }
}
