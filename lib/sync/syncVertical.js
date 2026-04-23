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

  // 1. Fetch all listings from source
  let query = source.from(config.table).select('*')

  // SBA and Collection share the same Supabase instance + venues table.
  // Filter by the `type` column so each vertical only gets its own rows.
  if (config.typeFilter && config.typeFilter.length > 0) {
    query = query.in('type', config.typeFilter)
  }

  const { data: rows, error: fetchError } = await query

  if (fetchError) {
    console.error(`[sync] ${vertical} fetch error:`, fetchError.message)
    return { vertical, synced: 0, deactivated: 0, error: fetchError.message }
  }

  if (!rows || rows.length === 0) {
    console.warn(`[sync] ${vertical} returned 0 rows — possible issue`)
    return { vertical, synced: 0, deactivated: 0, error: 'zero_rows' }
  }

  console.log(`[sync] ${vertical}: fetched ${rows.length} rows`)

  let synced = 0
  let errors = 0
  let quarantined = 0
  const quarantineReasons = {}
  const syncedSourceIds = []

  // 2. Upsert each listing + extension
  for (const row of rows) {
    try {
      const listingData = mapListing(row)
      syncedSourceIds.push(listingData.source_id)

      // Validate before write. Invalid rows go to listings_quarantine
      // with a stable failure_reason instead of listings.
      const fullRow = { vertical, ...listingData }
      const validation = validateListingRow(fullRow)
      if (!validation.ok) {
        const qPayload = buildQuarantinePayload(fullRow, validation.reason)
        const { error: qErr } = await master
          .from('listings_quarantine')
          .insert(qPayload)
        if (qErr) {
          console.error(`[sync] ${vertical} quarantine insert error for ${listingData.name}:`, qErr.message)
          errors++
          continue
        }
        quarantined++
        quarantineReasons[validation.reason] = (quarantineReasons[validation.reason] || 0) + 1
        continue
      }

      // Upsert core listing
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
        console.error(`[sync] ${vertical} upsert error for ${listingData.name}:`, upsertError.message)
        errors++
        continue
      }

      // Upsert extension table
      const metaData = mapMeta(row)
      const { error: metaError } = await master
        .from(extensionTable)
        .upsert({
          listing_id: upserted.id,
          ...metaData,
        }, {
          onConflict: 'listing_id',
        })

      if (metaError) {
        console.error(`[sync] ${vertical} meta upsert error for ${listingData.name}:`, metaError.message)
        errors++
        continue
      }

      synced++
    } catch (err) {
      console.error(`[sync] ${vertical} unexpected error:`, err.message)
      errors++
    }
  }

  // 3. Deactivate listings that no longer exist in source
  const { data: existing } = await master
    .from('listings')
    .select('id, source_id')
    .eq('vertical', vertical)
    .eq('status', 'active')

  let deactivated = 0
  if (existing) {
    const toDeactivate = existing.filter(l => !syncedSourceIds.includes(l.source_id))
    if (toDeactivate.length > 0) {
      const { error: deactivateError } = await master
        .from('listings')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .in('id', toDeactivate.map(l => l.id))

      if (!deactivateError) deactivated = toDeactivate.length
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
  const config = VERTICAL_CONFIG[vertical]
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

  // Sync roasters
  const { data: roasters, error: rError } = await source.from('roasters').select('*')
  if (rError) {
    console.error(`[sync] fine_grounds roasters fetch error:`, rError.message)
  } else if (roasters) {
    for (const row of roasters) {
      try {
        const listingData = maps.mapFineGroundsRoasterListing(row)
        allSyncedSourceIds.push(listingData.source_id)

        const fullRow = { vertical, ...listingData }
        const validation = validateListingRow(fullRow)
        if (!validation.ok) {
          const qPayload = buildQuarantinePayload(fullRow, validation.reason)
          const { error: qErr } = await master
            .from('listings_quarantine')
            .insert(qPayload)
          if (qErr) { totalErrors++; continue }
          totalQuarantined++
          totalQuarantineReasons[validation.reason] = (totalQuarantineReasons[validation.reason] || 0) + 1
          continue
        }

        const { data: upserted, error } = await master
          .from('listings')
          .upsert({ vertical, ...listingData, synced_at: new Date().toISOString() },
            { onConflict: 'vertical,source_id' })
          .select('id').single()

        if (error) { totalErrors++; continue }

        const metaData = maps.mapFineGroundsRoasterMeta(row)
        await master.from(extensionTable).upsert(
          { listing_id: upserted.id, ...metaData },
          { onConflict: 'listing_id' }
        )
        totalSynced++
      } catch { totalErrors++ }
    }
  }

  // Sync cafes
  const { data: cafes, error: cError } = await source.from('cafes').select('*')
  if (cError) {
    console.error(`[sync] fine_grounds cafes fetch error:`, cError.message)
  } else if (cafes) {
    for (const row of cafes) {
      try {
        const listingData = maps.mapFineGroundsCafeListing(row)
        allSyncedSourceIds.push(listingData.source_id)

        const fullRow = { vertical, ...listingData }
        const validation = validateListingRow(fullRow)
        if (!validation.ok) {
          const qPayload = buildQuarantinePayload(fullRow, validation.reason)
          const { error: qErr } = await master
            .from('listings_quarantine')
            .insert(qPayload)
          if (qErr) { totalErrors++; continue }
          totalQuarantined++
          totalQuarantineReasons[validation.reason] = (totalQuarantineReasons[validation.reason] || 0) + 1
          continue
        }

        const { data: upserted, error } = await master
          .from('listings')
          .upsert({ vertical, ...listingData, synced_at: new Date().toISOString() },
            { onConflict: 'vertical,source_id' })
          .select('id').single()

        if (error) { totalErrors++; continue }

        const metaData = maps.mapFineGroundsCafeMeta(row)
        // Try to resolve roaster_master_id for linked roasters
        if (row.primary_roaster_id) {
          const { data: roasterListing } = await master
            .from('listings')
            .select('id')
            .eq('vertical', 'fine_grounds')
            .eq('source_id', `roaster_${row.primary_roaster_id}`)
            .single()
          if (roasterListing) metaData.roaster_master_id = roasterListing.id
        }

        await master.from(extensionTable).upsert(
          { listing_id: upserted.id, ...metaData },
          { onConflict: 'listing_id' }
        )
        totalSynced++
      } catch { totalErrors++ }
    }
  }

  // Deactivate removed listings
  const { data: existing } = await master
    .from('listings')
    .select('id, source_id')
    .eq('vertical', vertical)
    .eq('status', 'active')

  if (existing) {
    const toDeactivate = existing.filter(l => !allSyncedSourceIds.includes(l.source_id))
    if (toDeactivate.length > 0) {
      await master
        .from('listings')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .in('id', toDeactivate.map(l => l.id))
      totalDeactivated = toDeactivate.length
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
