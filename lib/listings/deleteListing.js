// ============================================================
// Hard-delete a listing everywhere it lives
// ------------------------------------------------------------
// The one implementation of "remove this listing", shared by the admin
// listing editor's DELETE route and the operator-facing removal link in
// outreach email. Deleting from master alone is not enough — the nightly
// vertical → master sync would re-insert the row — so the source row in the
// vertical's own DB goes first, then the master row.
//
// Callers are responsible for authorisation and for any pre-delete
// bookkeeping that must survive the delete (e.g. outreach suppressions:
// operator_outreach cascades away with the listing, so a do-not-contact
// record has to be written BEFORE calling this).
//
// Note: migration 256's trigger blocks deleting a listing with a live claim —
// that error propagates to the caller, which should check first.
// ============================================================

import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'

/**
 * @param {object} listing  Master row — needs { id, vertical, source_id }
 * @param {object} [sb]     service-role Supabase client (master DB)
 * @returns {{ verticalDeleteError: string|null }}  master delete errors throw
 */
export async function deleteListingEverywhere(listing, sb = null) {
  const master = sb || getSupabaseAdmin()
  let verticalDeleteError = null

  // Delete from the vertical source DB first (best effort — a missing source
  // row must not strand the master delete).
  if (listing.source_id && listing.vertical) {
    try {
      const config = VERTICAL_CONFIG[listing.vertical]
      if (config?.url) {
        const verticalClient = getVerticalClient(listing.vertical)
        let table = config.table

        // Fine Grounds has two tables (roasters + cafes) — check entity_type
        // to target the correct one, falling back to trying both if unknown
        if (listing.vertical === 'fine_grounds') {
          const { data: metaRow } = await master
            .from('fine_grounds_meta')
            .select('entity_type')
            .eq('listing_id', listing.id)
            .maybeSingle()

          if (metaRow?.entity_type === 'cafe') {
            table = 'cafes'
          } else if (metaRow?.entity_type === 'roaster') {
            table = 'roasters'
          } else {
            // Unknown entity_type — try both tables
            await verticalClient.from('roasters').delete().eq('id', listing.source_id)
            await verticalClient.from('cafes').delete().eq('id', listing.source_id)
            table = null // skip the single delete below
          }
        }

        if (table) {
          await verticalClient.from(table).delete().eq('id', listing.source_id)
        }
      }
    } catch (syncErr) {
      verticalDeleteError = syncErr.message
      // Continue — still delete from master
    }
  }

  const { error: deleteError } = await master
    .from('listings')
    .delete()
    .eq('id', listing.id)

  if (deleteError) throw deleteError

  return { verticalDeleteError }
}
