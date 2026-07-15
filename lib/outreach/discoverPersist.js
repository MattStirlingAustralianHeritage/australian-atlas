// ============================================================
// Discovery persistence
// ------------------------------------------------------------
// Records the outcome of a website email-discovery pass onto
// operator_outreach. Shared by the admin Discover route (interactive chunks)
// and the autopilot cron (background sweeps) so the bookkeeping rules stay
// identical: never clobber a manually-entered email, and always record the
// no-result outcome (dead / no_email / blocked) so a site is scanned once,
// not on every pass.
// ============================================================

/**
 * @param {object} p
 * @param {object} p.sb          service-role Supabase client
 * @param {Array}  p.listings    [{ id, name, website }] — the requested set
 * @param {Array}  p.discovered  results of discoverEmailsBatch (may be partial
 *                               if the soft deadline fired)
 * @returns {{ results, statusCounts, foundCount }}
 */
export async function persistDiscoveries({ sb, listings, discovered }) {
  const emailByListing = new Map(discovered.map((d) => [d.id, d]))

  // Existing outreach rows for these listings (there's no unique constraint on
  // listing_id, so we read-then-write to avoid duplicates).
  const ids = listings.map((l) => l.id)
  const { data: existingRows } = await sb
    .from('operator_outreach')
    .select('id, listing_id, contact_email, status')
    .in('listing_id', ids)
  const existingByListing = new Map((existingRows || []).map((r) => [r.listing_id, r]))

  const now = new Date().toISOString()
  const results = []
  const toInsert = []
  const statusCounts = { found: 0, no_email: 0, dead: 0, blocked: 0 }

  for (const listing of listings) {
    const d = emailByListing.get(listing.id)
    const existing = existingByListing.get(listing.id)

    // Not scanned this run (soft deadline hit before we reached it) — report as
    // pending and record nothing, so it's retried on the next pass.
    if (!d) {
      results.push({ listing_id: listing.id, name: listing.name, website: listing.website || null, email: null, status: 'pending', candidates: [], source: null, saved: false })
      continue
    }

    const email = d.email || null
    const status = d.status || (email ? 'found' : 'no_email')
    statusCounts[status] = (statusCounts[status] || 0) + 1
    let saved = false

    if (email) {
      if (existing) {
        // Only write if we don't already have a (possibly hand-entered)
        // email — never clobber a manually-set address.
        if (!existing.contact_email) {
          const { error } = await sb
            .from('operator_outreach')
            .update({ contact_email: email, email_source: 'website', discovered_at: now, updated_at: now })
            .eq('id', existing.id)
          saved = !error
        }
      } else {
        toInsert.push({
          listing_id: listing.id,
          contact_email: email,
          email_source: 'website',
          status: 'not_contacted',
          discovered_at: now,
          created_at: now,
          updated_at: now,
        })
        saved = true
      }
    } else {
      // No email found. Record the outcome (dead / no_email / blocked) so a
      // repeat pass skips this site instead of re-scanning it fruitlessly.
      // Never touch a row that already holds an email; the status lives in
      // email_source (only meaningful while contact_email is null).
      if (existing) {
        if (!existing.contact_email) {
          await sb
            .from('operator_outreach')
            .update({ email_source: status, discovered_at: now, updated_at: now })
            .eq('id', existing.id)
        }
      } else {
        toInsert.push({
          listing_id: listing.id,
          contact_email: null,
          email_source: status,
          status: 'not_contacted',
          discovered_at: now,
          created_at: now,
          updated_at: now,
        })
      }
    }

    results.push({
      listing_id: listing.id,
      name: listing.name,
      website: listing.website || null,
      email,
      status,
      candidates: d.candidates || [],
      source: d.source || null,
      saved,
    })
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await sb.from('operator_outreach').insert(toInsert)
    if (insErr) console.error('[outreach/discoverPersist] insert error:', insErr.message)
  }

  return { results, statusCounts, foundCount: results.filter((r) => r.email).length }
}
