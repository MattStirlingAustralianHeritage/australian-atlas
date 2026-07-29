// Listing activity log — who did what to a listing, and when.
//
// The write side of migration 260. Every operator-facing save path calls this
// so /admin/activity can answer "what are people actually doing?" — photos
// added, hours fixed, hero swapped, description submitted — instead of us
// staring at a listings.updated_at that the sync cron also touches.
//
// CONTRACT: logging is FAIL-SOFT and must never surface to the operator. A
// logging failure is an admin-visibility problem, not a reason to fail a save
// the operator already completed. Every error is swallowed with a warn; a
// missing table (42P01, before migration 260 is applied) is silent.
//
// Callers pass a master-portal service-role client (getSupabaseAdmin()).

const MISSING_TABLE = '42P01'
const MISSING_COLUMN = '42703'

/** Verbs the feed knows how to label and filter. Free text is still accepted. */
export const ACTIVITY_ACTIONS = {
  // Photography
  HERO_ADDED: 'hero_image_added',
  HERO_REPLACED: 'hero_image_replaced',
  HERO_REMOVED: 'hero_image_removed',
  PHOTOS_ADDED: 'photos_added',
  PHOTOS_REMOVED: 'photos_removed',
  PHOTOS_REORDERED: 'photos_reordered',
  VIDEO_ADDED: 'video_added',
  VIDEO_REMOVED: 'video_removed',
  // The facts
  HOURS_UPDATED: 'hours_updated',
  PHONE_UPDATED: 'phone_updated',
  WEBSITE_UPDATED: 'website_updated',
  // Words
  DESCRIPTION_SUBMITTED: 'description_submitted',
  DESCRIPTION_GENERATED: 'description_generated',
  DESCRIPTION_REWRITE_REQUESTED: 'description_rewrite_requested',
  FACTS_UPDATED: 'facts_updated',
  HIGHLIGHTS_UPDATED: 'highlights_updated',
  KEYWORDS_UPDATED: 'search_keywords_updated',
  // Trade
  TRADE_READINESS_UPDATED: 'trade_readiness_updated',
  TRADE_PROFILE_UPDATED: 'trade_profile_updated',
  // Their own curation — picks and events
  PICK_ADDED: 'pick_added',
  PICK_REMOVED: 'pick_removed',
  EVENT_CREATED: 'event_created',
  EVENT_UPDATED: 'event_updated',
  EVENT_DELETED: 'event_deleted',
  // Lifecycle (mirrors claim_audit_log, kept here for one unified feed)
  LISTING_CLAIMED: 'listing_claimed',
  // Approved by an admin, but the claimed address hasn't answered yet, so no
  // ownership exists. The resting state between approval and first sign-in.
  CLAIM_AWAITING_VERIFICATION: 'claim_awaiting_verification',
}

/**
 * Human label for a verb. Unknown verbs degrade to a de-snaked sentence so a
 * new surface can start logging before the feed is taught about it.
 */
export function actionLabel(action) {
  const known = {
    hero_image_added: 'Added a main photo',
    hero_image_replaced: 'Changed the main photo',
    hero_image_removed: 'Removed the main photo',
    photos_added: 'Added photos',
    photos_removed: 'Removed photos',
    photos_reordered: 'Reordered photos',
    video_added: 'Added a video',
    video_removed: 'Removed the video',
    hours_updated: 'Updated opening hours',
    phone_updated: 'Updated phone',
    website_updated: 'Updated website',
    description_submitted: 'Submitted a description',
    description_generated: 'Generated a description',
    description_rewrite_requested: 'Requested a rewrite',
    description_error_flagged: 'Flagged an error',
    facts_updated: 'Updated their venue facts',
    pick_added: 'Added a Producer’s Pick',
    pick_removed: 'Removed a Producer’s Pick',
    event_created: 'Created an event',
    event_updated: 'Updated an event',
    event_deleted: 'Deleted an event',
    highlights_updated: 'Updated highlights',
    search_keywords_updated: 'Updated search keywords',
    trade_readiness_updated: 'Updated trade readiness',
    trade_profile_updated: 'Updated trade profile',
    listing_claimed: 'Claimed the listing',
    claim_awaiting_verification: 'Claim approved — awaiting email verification',
    admin_edit: 'Admin edit',
  }[action]
  if (known) return known
  const words = String(action || 'activity').replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Coarse grouping used by the feed's filter chips and the summary strip.
 * Keep in sync with ACTIVITY_GROUP_ORDER in app/admin/activity/ActivityFeed.js.
 */
export function actionGroup(action) {
  if (/^(hero_image|photos|video)/.test(action)) return 'media'
  if (/^(hours|phone|website)/.test(action)) return 'facts'
  if (/^(description|facts|highlights|search_keywords)/.test(action)) return 'words'
  if (/^trade_/.test(action)) return 'trade'
  if (/^(pick|event)_/.test(action)) return 'curation'
  if (/^listing_/.test(action)) return 'lifecycle'
  if (action === 'admin_edit') return 'admin'
  return 'other'
}

/**
 * Write one or more activity events.
 *
 * @param {object} sb        master-portal service-role client
 * @param {object} listing   { id, name, slug, vertical } — snapshotted onto each row
 * @param {object} actor     { id, email, role } — role is 'operator' | 'admin' | 'system'
 * @param {Array<{action: string, summary: string, field?: string, details?: object}>} events
 * @returns {Promise<number>} events written (0 on any failure — never throws)
 */
export async function logListingActivity(sb, listing, actor, events) {
  const list = (Array.isArray(events) ? events : [events]).filter(e => e && e.action && e.summary)
  if (!sb || list.length === 0) return 0

  const role = actor?.role === 'admin' || actor?.role === 'system' ? actor.role : 'operator'
  const rows = list.map(e => ({
    listing_id: listing?.id ?? null,
    listing_name: listing?.name ?? null,
    listing_slug: listing?.slug ?? null,
    vertical: listing?.vertical ?? null,
    actor_id: actor?.id ?? null,
    actor_email: actor?.email ?? null,
    actor_role: role,
    action: e.action,
    field: e.field ?? null,
    summary: e.summary,
    details: e.details ?? {},
  }))

  try {
    const { error } = await sb.from('listing_activity').insert(rows)
    if (error) {
      // Migration 260 not applied yet — stay silent, the save itself is fine.
      if (error.code === MISSING_TABLE || error.code === MISSING_COLUMN) return 0
      console.warn('[activity] log failed:', error.message)
      return 0
    }
    return rows.length
  } catch (err) {
    console.warn('[activity] log threw:', err.message)
    return 0
  }
}

/**
 * Collector for routes that touch several fields in one request (the operator
 * dashboard PATCH saves the whole form at once). Accumulate as you go, flush
 * once — one insert instead of one per field.
 */
export function activityCollector() {
  const events = []
  return {
    add(action, summary, extra = {}) {
      if (action && summary) events.push({ action, summary, ...extra })
    },
    get events() {
      return events
    },
    async flush(sb, listing, actor) {
      return logListingActivity(sb, listing, actor, events)
    },
  }
}
