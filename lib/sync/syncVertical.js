import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '../supabase/clients.js'
import * as maps from './fieldMaps.js'
import { validateListingRow, buildQuarantinePayload } from './pushToVertical.js'

// Extension table name per vertical
const EXTENSION_TABLES = {
  sba: 'sba_meta',
  collection: 'collection_meta',
  craft: 'craft_meta',
  fine_grounds: 'fine_grounds_meta',
  rest: 'rest_meta',
  field: 'field_meta',
  corner: 'corner_meta',
  found: 'found_meta',
  table: 'table_meta',
  way: 'way_meta',
}

// Field map functions per vertical
const FIELD_MAPS = {
  sba:        { listing: maps.mapSbaListing,        meta: maps.mapSbaMeta },
  collection: { listing: maps.mapCollectionListing,  meta: maps.mapCollectionMeta },
  craft:      { listing: maps.mapCraftListing,       meta: maps.mapCraftMeta },
  rest:       { listing: maps.mapRestListing,        meta: maps.mapRestMeta },
  field:      { listing: maps.mapFieldListing,       meta: maps.mapFieldMeta },
  corner:     { listing: maps.mapCornerListing,      meta: maps.mapCornerMeta },
  found:      { listing: maps.mapFoundListing,       meta: maps.mapFoundMeta },
  table:      { listing: maps.mapTableListing,       meta: maps.mapTableMeta },
  way:        { listing: maps.mapWayListing,         meta: maps.mapWayMeta },
}

// Rows per bulk upsert. ~7k listings × 2 sequential round trips per row
// blew the /api/cron/sync 300s budget; 500-row chunks bring a full network
// sync down to ~30 round trips per vertical stage.
const CHUNK_SIZE = 500

// Rows per .range() page when reading a whole table. PostgREST silently
// truncates any single select to the project's max-rows setting (1000 on
// some vertical instances — craft has ~2,300 venues but a bare select('*')
// returned 1,000), so every full-table read must paginate.
const FETCH_PAGE_SIZE = 1000

// Ids per deactivation UPDATE. The .in() filter is serialized into the
// request query string; a thousand-uuid list overflows URL limits and the
// whole update fails, so deactivate in bounded batches.
const DEACTIVATE_CHUNK_SIZE = 200

/**
 * Fetch every row of a query, paging past PostgREST's max-rows cap.
 *
 * buildQuery must return a FRESH query each call (builders are mutated by
 * .order/.range) with select + filters already applied. Pages are ordered
 * by id so concurrent writes can't shuffle rows between pages.
 *
 * @param {() => object} buildQuery
 * @returns {Promise<{ rows: object[]|null, error: object|null }>}
 */
async function fetchAllRows(buildQuery) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery()
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)
    if (error) return { rows: null, error }
    if (!data || data.length === 0) break
    rows.push(...data)
    // Advance by rows actually received and stop only on an empty page —
    // a project max-rows below FETCH_PAGE_SIZE returns short pages before
    // the end, so a short page does NOT mean the table is exhausted.
    from += data.length
  }
  return { rows, error: null }
}

/**
 * Mark listings inactive in DEACTIVATE_CHUNK_SIZE batches, logging failures
 * instead of swallowing them.
 *
 * @returns {Promise<number>} Rows actually deactivated.
 */
async function deactivateListings(master, vertical, ids) {
  let deactivated = 0
  for (let i = 0; i < ids.length; i += DEACTIVATE_CHUNK_SIZE) {
    const batch = ids.slice(i, i + DEACTIVATE_CHUNK_SIZE)
    const { error } = await master
      .from('listings')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .in('id', batch)
    if (error) {
      console.error(`[sync] ${vertical} deactivate failed for ${batch.length} rows:`, error.message)
    } else {
      deactivated += batch.length
    }
  }
  return deactivated
}

/**
 * Write a row to listings_quarantine idempotently.
 *
 * listings_quarantine is a worklist (one row per broken source awaiting
 * admin fix + promotion), NOT an append-only audit log. A plain .insert()
 * appended a fresh row every sync run, so a source that fails validation
 * on every pass accumulates duplicates without bound — one mis-validated
 * venue (Lord Howe Island Brewery, a real 159°E coordinate the old
 * mainland-only longitude box rejected) reached 239 identical rows and
 * dominated the daily Quarantine Report.
 *
 * Keyed on (vertical, source_id): delete any prior quarantine rows for the
 * same source before inserting, so re-runs replace rather than append.
 * buildQuarantinePayload strips nulls, so source_id is only present for
 * real source rows; the rare null-source row falls back to a plain insert.
 *
 * @param {object} master - Supabase admin client for the portal DB.
 * @param {object} qPayload - Output of buildQuarantinePayload (includes
 *   vertical + source_id when known).
 * @returns {Promise<{ error: object|null }>}
 */
async function quarantineUpsert(master, qPayload) {
  if (qPayload.vertical && qPayload.source_id != null) {
    await master
      .from('listings_quarantine')
      .delete()
      .match({ vertical: qPayload.vertical, source_id: qPayload.source_id })
  }
  return master.from('listings_quarantine').insert(qPayload)
}

/**
 * Drop undefined-valued keys from a payload. A single-object upsert loses
 * them at JSON.stringify time anyway, but supabase-js computes the bulk
 * `columns=` param from Object.keys — an undefined-valued key would be
 * named in `columns` yet absent from the serialized row, and PostgREST
 * fills such gaps with NULL. Exported for the dry-run comparison harness.
 */
export function stripUndefined(payload) {
  const out = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

/**
 * Partition entries into groups whose payloads share an identical key set.
 *
 * Mappers emit heterogeneous shapes (subTypeFields() returns {} when the
 * source row has no type; cafe metas only carry roaster_master_id when the
 * roaster resolves). supabase-js sends one `columns=` list — the union of
 * every row's keys — per bulk upsert, and PostgREST sets any column a row
 * is missing to NULL. On conflict-update that would wipe values a per-row
 * upsert leaves untouched, so rows may only share a request with rows of
 * the same shape. Exported for the dry-run comparison harness.
 *
 * @param {Array} entries
 * @param {(entry: any) => object} getPayload
 * @returns {Array<Array>} Groups in first-seen order.
 */
export function groupByKeySignature(entries, getPayload) {
  const groups = new Map()
  for (const entry of entries) {
    const signature = Object.keys(getPayload(entry)).sort().join(',')
    if (!groups.has(signature)) groups.set(signature, [])
    groups.get(signature).push(entry)
  }
  return [...groups.values()]
}

/**
 * Batch-write quarantine rows: one delete per chunk of source_ids (the
 * replace-not-append contract of quarantineUpsert, batched), then one
 * insert per payload shape. buildQuarantinePayload strips nulls so
 * migration-099 column defaults fire — key-signature grouping keeps that
 * true in bulk (a columns-union insert would write explicit NULLs).
 * Failed batches retry per-row via quarantineUpsert; rows without a
 * source_id use the per-row path directly, as before.
 *
 * @param {Array<{ qPayload: object, reason: string, name: string }>} items
 * @returns {Promise<{ quarantined: number, errors: number, quarantineReasons: Record<string, number> }>}
 */
async function quarantineBatch({ master, vertical, items, logErrors }) {
  let quarantined = 0
  let errors = 0
  const quarantineReasons = {}

  const tally = (reason) => { quarantineReasons[reason] = (quarantineReasons[reason] || 0) + 1 }

  const perRow = async (rows) => {
    for (const it of rows) {
      const { error: qErr } = await quarantineUpsert(master, it.qPayload)
      if (qErr) {
        if (logErrors) console.error(`[sync] ${vertical} quarantine insert error for ${it.name}:`, qErr.message)
        errors++
      } else {
        quarantined++
        tally(it.reason)
      }
    }
  }

  const keyed = items.filter((it) => it.qPayload.vertical && it.qPayload.source_id != null)
  const unkeyed = items.filter((it) => !(it.qPayload.vertical && it.qPayload.source_id != null))

  for (let i = 0; i < keyed.length; i += CHUNK_SIZE) {
    const chunk = keyed.slice(i, i + CHUNK_SIZE)

    const { error: delErr } = await master
      .from('listings_quarantine')
      .delete()
      .eq('vertical', vertical)
      .in('source_id', chunk.map((it) => it.qPayload.source_id))

    if (delErr) {
      console.error(`[sync] ${vertical} bulk quarantine delete failed for ${chunk.length} rows, retrying per-row:`, delErr.message)
      await perRow(chunk)
      continue
    }

    for (const group of groupByKeySignature(chunk, (it) => it.qPayload)) {
      const { error: insErr } = await master
        .from('listings_quarantine')
        .insert(group.map((it) => it.qPayload))

      if (insErr) {
        console.error(`[sync] ${vertical} bulk quarantine insert failed for ${group.length} rows, retrying per-row:`, insErr.message)
        await perRow(group)
        continue
      }
      for (const it of group) {
        quarantined++
        tally(it.reason)
      }
    }
  }

  await perRow(unkeyed)

  return { quarantined, errors, quarantineReasons }
}

/**
 * Original per-row write path: listing upsert → meta upsert, one row.
 * Used as the fallback when a bulk chunk fails, so one bad row costs only
 * its own slot and error reporting keeps per-row granularity.
 *
 * @returns {Promise<{ synced: number, errors: number }>} 1/0 or 0/1.
 */
async function upsertRowFallback({
  master, vertical, extensionTable, item,
  mapMeta, augmentMetaRow, logErrors, countMetaErrors,
}) {
  const { row, listingData } = item
  try {
    const { data: upserted, error: upsertError } = await master
      .from('listings')
      .upsert({
        vertical,
        ...listingData,
        synced_at: new Date().toISOString(),
      }, {
        onConflict: 'vertical,source_id',
      })
      .select('id')
      .single()

    if (upsertError) {
      if (logErrors) console.error(`[sync] ${vertical} upsert error for ${listingData.name}:`, upsertError.message)
      return { synced: 0, errors: 1 }
    }

    const metaData = mapMeta(row)
    if (augmentMetaRow) await augmentMetaRow(row, metaData)

    const { error: metaError } = await master
      .from(extensionTable)
      .upsert({
        listing_id: upserted.id,
        ...metaData,
      }, {
        onConflict: 'listing_id',
      })

    if (metaError && countMetaErrors) {
      if (logErrors) console.error(`[sync] ${vertical} meta upsert error for ${listingData.name}:`, metaError.message)
      return { synced: 0, errors: 1 }
    }

    return { synced: 1, errors: 0 }
  } catch (err) {
    if (logErrors) console.error(`[sync] ${vertical} unexpected error:`, err.message)
    return { synced: 0, errors: 1 }
  }
}

/**
 * Bulk-write one chunk of validated rows: one listings upsert per payload
 * shape, map returned source_id → id, then one meta upsert per meta shape.
 * Any failed bulk request retries its rows through upsertRowFallback.
 *
 * @returns {Promise<{ synced: number, errors: number }>}
 */
async function upsertChunk({
  master, vertical, extensionTable, chunk,
  mapMeta, augmentMetaChunk, augmentMetaRow, logErrors, countMetaErrors,
}) {
  let synced = 0
  let errors = 0
  const syncedAt = new Date().toISOString()

  const entries = chunk.map((item) => ({
    item,
    payload: stripUndefined({ vertical, ...item.listingData, synced_at: syncedAt }),
  }))

  const fallback = async (items) => {
    for (const item of items) {
      const res = await upsertRowFallback({
        master, vertical, extensionTable, item,
        mapMeta, augmentMetaRow, logErrors, countMetaErrors,
      })
      synced += res.synced
      errors += res.errors
    }
  }

  for (const group of groupByKeySignature(entries, (e) => e.payload)) {
    const { data: upserted, error: upsertError } = await master
      .from('listings')
      .upsert(group.map((e) => e.payload), { onConflict: 'vertical,source_id' })
      .select('id, source_id')

    if (upsertError) {
      console.error(`[sync] ${vertical} bulk upsert failed for ${group.length} rows, retrying per-row:`, upsertError.message)
      await fallback(group.map((e) => e.item))
      continue
    }

    const idBySourceId = new Map((upserted || []).map((r) => [String(r.source_id), r.id]))

    const metaEntries = []
    const unmatched = []
    for (const e of group) {
      const listingId = idBySourceId.get(String(e.item.listingData.source_id))
      if (!listingId) {
        unmatched.push(e.item)
        continue
      }
      try {
        e.listingId = listingId
        e.metaData = mapMeta(e.item.row)
        metaEntries.push(e)
      } catch (err) {
        if (logErrors) console.error(`[sync] ${vertical} unexpected error:`, err.message)
        errors++
      }
    }

    // The upsert echoes every written row, so this only fires if PostgREST
    // returned a short representation; per-row retry self-heals.
    if (unmatched.length > 0) await fallback(unmatched)

    if (augmentMetaChunk && metaEntries.length > 0) {
      try {
        await augmentMetaChunk(metaEntries)
      } catch (err) {
        console.error(`[sync] ${vertical} meta augment failed, continuing without:`, err.message)
      }
    }

    for (const e of metaEntries) {
      e.metaPayload = stripUndefined({ listing_id: e.listingId, ...e.metaData })
    }

    for (const metaGroup of groupByKeySignature(metaEntries, (e) => e.metaPayload)) {
      const { error: metaError } = await master
        .from(extensionTable)
        .upsert(metaGroup.map((e) => e.metaPayload), { onConflict: 'listing_id' })

      if (!metaError) {
        synced += metaGroup.length
        continue
      }

      console.error(`[sync] ${vertical} bulk meta upsert failed for ${metaGroup.length} rows, retrying per-row:`, metaError.message)
      for (const e of metaGroup) {
        const { error: rowMetaError } = await master
          .from(extensionTable)
          .upsert(e.metaPayload, { onConflict: 'listing_id' })

        if (rowMetaError && countMetaErrors) {
          if (logErrors) console.error(`[sync] ${vertical} meta upsert error for ${e.item.listingData.name}:`, rowMetaError.message)
          errors++
        } else {
          synced++
        }
      }
    }
  }

  return { synced, errors }
}

/**
 * Sync one source table's rows into listings + the vertical's meta table.
 * Validation, quarantine routing, and counting are unchanged from the old
 * per-row loop; only the writes are batched (CHUNK_SIZE rows per request).
 *
 * countMetaErrors mirrors a historical asymmetry: syncVertical counted a
 * failed meta upsert as an error, syncFineGrounds ignored it and counted
 * the row as synced. Preserved so run-over-run counts stay comparable.
 *
 * @returns {Promise<{
 *   synced: number,
 *   quarantined: number,
 *   quarantineReasons: Record<string, number>,
 *   errors: number,
 *   syncedSourceIds: string[]
 * }>}
 */
async function syncSourceRows({
  master, vertical, extensionTable, rows, mapListing, mapMeta,
  augmentMetaChunk = null, augmentMetaRow = null,
  logErrors = true, countMetaErrors = true,
}) {
  let synced = 0
  let errors = 0
  const syncedSourceIds = []
  const items = []
  const quarantineItems = []

  // Ownership claim guard. The PORTAL is the authority on commercial state:
  // grantClaim establishes listings.is_claimed = true <=> one active
  // listing_claims row (migration 140). The vertical's claimed flag lags that
  // truth (portal-originated claims never existed there), so deriving
  // is_claimed from the source row un-claims every portal-claimed listing on
  // the next sync — which locked every operator out of their dashboard.
  // Force is_claimed=true for rows whose listing holds a live claim; if the
  // guard read fails, drop is_claimed from the payload entirely (upsert then
  // leaves the master value untouched) rather than risk trampling it.
  const ownedSourceIds = await (async () => {
    const { data, error } = await master
      .from('listing_claims')
      .select('status, listings!inner(source_id, vertical)')
      .in('status', ['active', 'past_due'])
      .eq('listings.vertical', vertical)
    if (error) {
      console.error(`[sync] ${vertical} claim-guard read failed — is_claimed withheld from this run:`, error.message)
      return null
    }
    return new Set((data || []).map((r) => String(r.listings?.source_id)).filter((s) => s && s !== 'null'))
  })()

  for (const row of rows) {
    try {
      const listingData = mapListing(row)
      if (ownedSourceIds === null) {
        delete listingData.is_claimed
      } else if (ownedSourceIds.has(String(listingData.source_id))) {
        listingData.is_claimed = true
      }
      syncedSourceIds.push(listingData.source_id)

      // Validate before write. Invalid rows go to listings_quarantine
      // with a stable failure_reason instead of listings.
      const fullRow = { vertical, ...listingData }
      const validation = validateListingRow(fullRow)
      if (!validation.ok) {
        quarantineItems.push({
          qPayload: buildQuarantinePayload(fullRow, validation.reason),
          reason: validation.reason,
          name: listingData.name,
        })
        continue
      }

      items.push({ row, listingData })
    } catch (err) {
      if (logErrors) console.error(`[sync] ${vertical} unexpected error:`, err.message)
      errors++
    }
  }

  const { quarantined, quarantineReasons, errors: quarantineErrors } =
    await quarantineBatch({ master, vertical, items: quarantineItems, logErrors })
  errors += quarantineErrors

  const totalChunks = Math.ceil(items.length / CHUNK_SIZE)
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const t0 = Date.now()
    const res = await upsertChunk({
      master, vertical, extensionTable, chunk: items.slice(i, i + CHUNK_SIZE),
      mapMeta, augmentMetaChunk, augmentMetaRow, logErrors, countMetaErrors,
    })
    synced += res.synced
    errors += res.errors
    console.log(`[sync] ${vertical} chunk ${i / CHUNK_SIZE + 1}/${totalChunks}: ${res.synced} synced, ${res.errors} errors in ${Date.now() - t0}ms`)
  }

  return { synced, quarantined, quarantineReasons, errors, syncedSourceIds }
}

/**
 * Sync a single standard vertical (single source table) to the master DB.
 * Each row is validated via validateListingRow before write; invalid rows
 * are routed to listings_quarantine with a failure_reason instead of being
 * written to listings. See docs/architecture/regions.md Sync Behaviour §5.
 *
 * @param {string} vertical - Vertical key (e.g. 'rest', 'sba').
 * @returns {Promise<{
 *   vertical: string,
 *   synced: number,
 *   quarantined: number,
 *   quarantineReasons: Record<string, number>,
 *   deactivated: number,
 *   errors: number,
 *   error?: string
 * }>}
 */
export async function syncVertical(vertical) {
  const config = VERTICAL_CONFIG[vertical]
  const master = getSupabaseAdmin()
  const source = getVerticalClient(vertical)
  const { listing: mapListing, meta: mapMeta } = FIELD_MAPS[vertical]
  const extensionTable = EXTENSION_TABLES[vertical]

  console.log(`[sync] Starting ${vertical}...`)

  // 1. Fetch all listings from source (paginated — see fetchAllRows)
  const { rows, error: fetchError } = await fetchAllRows(() => {
    let query = source.from(config.table).select('*')

    // SBA and Collection share the same Supabase instance + venues table.
    // Filter by the `type` column so each vertical only gets its own rows.
    if (config.typeFilter && config.typeFilter.length > 0) {
      query = query.in('type', config.typeFilter)
    }
    return query
  })

  if (fetchError) {
    console.error(`[sync] ${vertical} fetch error:`, fetchError.message)
    return { vertical, synced: 0, deactivated: 0, error: fetchError.message }
  }

  if (!rows || rows.length === 0) {
    console.warn(`[sync] ${vertical} returned 0 rows — possible issue`)
    return { vertical, synced: 0, deactivated: 0, error: 'zero_rows' }
  }

  console.log(`[sync] ${vertical}: fetched ${rows.length} rows`)

  // 2. Validate, quarantine, and bulk-upsert listings + extensions
  const { synced, quarantined, quarantineReasons, errors, syncedSourceIds } =
    await syncSourceRows({ master, vertical, extensionTable, rows, mapListing, mapMeta })

  // 3. Deactivate listings that no longer exist in source. The portal DB
  // is also behind a PostgREST max-rows cap, so this read must paginate
  // too — a truncated `existing` list silently skips deactivations.
  const { rows: existing, error: existingError } = await fetchAllRows(() =>
    master
      .from('listings')
      .select('id, source_id')
      .eq('vertical', vertical)
      .eq('status', 'active')
  )

  let deactivated = 0
  if (existingError) {
    console.error(`[sync] ${vertical} active-listings fetch error, skipping deactivation:`, existingError.message)
  } else if (existing) {
    const syncedSet = new Set(syncedSourceIds)
    const toDeactivate = existing.filter(l => !syncedSet.has(l.source_id))
    if (toDeactivate.length > 0) {
      deactivated = await deactivateListings(master, vertical, toDeactivate.map(l => l.id))
    }
  }

  console.log(`[sync] ${vertical} complete: ${synced} synced, ${quarantined} quarantined, ${deactivated} deactivated, ${errors} errors`)
  if (quarantined > 0) {
    const reasonsStr = Object.entries(quarantineReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => `${r}=${n}`)
      .join(', ')
    console.log(`[sync] ${vertical} quarantine reasons: ${reasonsStr}`)
  }
  return { vertical, synced, quarantined, quarantineReasons, deactivated, errors }
}

/**
 * Sync Fine Grounds — special case: two source tables (roasters + cafes).
 * Each row is validated via validateListingRow before write; invalid rows
 * are routed to listings_quarantine with a failure_reason instead of being
 * written to listings. See docs/architecture/regions.md Sync Behaviour §5.
 *
 * @returns {Promise<{
 *   vertical: 'fine_grounds',
 *   synced: number,
 *   quarantined: number,
 *   quarantineReasons: Record<string, number>,
 *   deactivated: number,
 *   errors: number
 * }>}
 */
export async function syncFineGrounds() {
  const vertical = 'fine_grounds'
  const master = getSupabaseAdmin()
  const source = getVerticalClient(vertical)
  const extensionTable = EXTENSION_TABLES[vertical]

  console.log(`[sync] Starting fine_grounds (roasters + cafes)...`)

  let totalSynced = 0
  let totalDeactivated = 0
  let totalErrors = 0
  let totalQuarantined = 0
  const totalQuarantineReasons = {}
  const allSyncedSourceIds = []

  const accumulate = (res) => {
    totalSynced += res.synced
    totalErrors += res.errors
    totalQuarantined += res.quarantined
    for (const [reason, n] of Object.entries(res.quarantineReasons)) {
      totalQuarantineReasons[reason] = (totalQuarantineReasons[reason] || 0) + n
    }
    allSyncedSourceIds.push(...res.syncedSourceIds)
  }

  // Sync roasters first — cafe metas resolve roaster_master_id against
  // the just-written roaster listings.
  const { rows: roasters, error: rError } = await fetchAllRows(() => source.from('roasters').select('*'))
  if (rError) {
    console.error(`[sync] fine_grounds roasters fetch error:`, rError.message)
  } else if (roasters) {
    accumulate(await syncSourceRows({
      master, vertical, extensionTable, rows: roasters,
      mapListing: maps.mapFineGroundsRoasterListing,
      mapMeta: maps.mapFineGroundsRoasterMeta,
      logErrors: false,
      countMetaErrors: false,
    }))
  }

  // Sync cafes
  const { rows: cafes, error: cError } = await fetchAllRows(() => source.from('cafes').select('*'))
  if (cError) {
    console.error(`[sync] fine_grounds cafes fetch error:`, cError.message)
  } else if (cafes) {
    accumulate(await syncSourceRows({
      master, vertical, extensionTable, rows: cafes,
      mapListing: maps.mapFineGroundsCafeListing,
      mapMeta: maps.mapFineGroundsCafeMeta,
      logErrors: false,
      countMetaErrors: false,
      // Resolve roaster_master_id for linked roasters — one lookup per
      // chunk instead of one per cafe. Unresolved links omit the key so
      // the meta upsert leaves any existing value untouched.
      augmentMetaChunk: async (entries) => {
        const wanted = [...new Set(
          entries
            .filter((e) => e.item.row.primary_roaster_id)
            .map((e) => `roaster_${e.item.row.primary_roaster_id}`)
        )]
        if (wanted.length === 0) return
        const { data: roasterListings } = await master
          .from('listings')
          .select('id, source_id')
          .eq('vertical', 'fine_grounds')
          .in('source_id', wanted)
        const roasterIdBySourceId = new Map((roasterListings || []).map((r) => [r.source_id, r.id]))
        for (const e of entries) {
          if (!e.item.row.primary_roaster_id) continue
          const roasterId = roasterIdBySourceId.get(`roaster_${e.item.row.primary_roaster_id}`)
          if (roasterId) e.metaData.roaster_master_id = roasterId
        }
      },
      augmentMetaRow: async (row, metaData) => {
        if (!row.primary_roaster_id) return
        const { data: roasterListing } = await master
          .from('listings')
          .select('id')
          .eq('vertical', 'fine_grounds')
          .eq('source_id', `roaster_${row.primary_roaster_id}`)
          .single()
        if (roasterListing) metaData.roaster_master_id = roasterListing.id
      },
    }))
  }

  // Deactivate removed listings (paginated read — see syncVertical step 3)
  const { rows: existing, error: existingError } = await fetchAllRows(() =>
    master
      .from('listings')
      .select('id, source_id')
      .eq('vertical', vertical)
      .eq('status', 'active')
  )

  if (existingError) {
    console.error(`[sync] fine_grounds active-listings fetch error, skipping deactivation:`, existingError.message)
  } else if (existing) {
    const syncedSet = new Set(allSyncedSourceIds)
    const toDeactivate = existing.filter(l => !syncedSet.has(l.source_id))
    if (toDeactivate.length > 0) {
      totalDeactivated = await deactivateListings(master, vertical, toDeactivate.map(l => l.id))
    }
  }

  console.log(`[sync] fine_grounds complete: ${totalSynced} synced, ${totalQuarantined} quarantined, ${totalDeactivated} deactivated, ${totalErrors} errors`)
  if (totalQuarantined > 0) {
    const reasonsStr = Object.entries(totalQuarantineReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => `${r}=${n}`)
      .join(', ')
    console.log(`[sync] fine_grounds quarantine reasons: ${reasonsStr}`)
  }
  return {
    vertical,
    synced: totalSynced,
    quarantined: totalQuarantined,
    quarantineReasons: totalQuarantineReasons,
    deactivated: totalDeactivated,
    errors: totalErrors,
  }
}
