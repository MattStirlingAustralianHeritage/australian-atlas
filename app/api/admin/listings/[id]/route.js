import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { updateListing } from '@/lib/admin/updateListing'

const EXTENSION_TABLES = {
  sba: 'sba_meta', collection: 'collection_meta', craft: 'craft_meta',
  fine_grounds: 'fine_grounds_meta', rest: 'rest_meta', field: 'field_meta',
  corner: 'corner_meta', found: 'found_meta', table: 'table_meta',
}

// Maps vertical → the meta key that holds its subcategory.
// When this key is saved to the meta table, we also sync it to listings.sub_types[0].
// The trigger on listings keeps sub_type in sync with sub_types[1] automatically.
const META_CATEGORY_KEY = {
  sba: 'producer_type',
  collection: 'institution_type',
  craft: 'discipline',
  fine_grounds: 'entity_type',
  rest: 'accommodation_type',
  field: 'feature_type',
  corner: 'shop_type',
  found: 'shop_type',
  table: 'food_type',
}

export async function PATCH(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })

  try {
    const body = await request.json()

    // Extract meta fields and sub_types — save them BEFORE the main update
    // so that updateListing reads fresh meta for the vertical sync
    const { _meta, _sub_types, ...listingFields } = body
    let metaResult = null

    if (_meta && Object.keys(_meta).length > 0) {
      // We need the vertical to know which meta table to target
      const sb = getSupabaseAdmin()
      const { data: row } = await sb.from('listings').select('vertical').eq('id', id).single()
      const metaTable = row ? EXTENSION_TABLES[row.vertical] : null

      if (metaTable) {
        const { data: metaData, error: metaError } = await sb.from(metaTable).upsert(
          { listing_id: id, ..._meta },
          { onConflict: 'listing_id' }
        ).select('listing_id, entity_type, subcategory, tags, features, extra').single()

        if (metaError) {
          console.warn('[admin/listings/PATCH] Meta save failed:', metaError.message)
          metaResult = { success: false, error: metaError.message }
        } else {
          metaResult = { success: true, meta: metaData }
        }

        // ── Sync category meta field → listings.sub_types ──
        // The primary subcategory (sub_types[0]) comes from the vertical-specific
        // category field (e.g. rest.accommodation_type).
        // Secondary subcategories (sub_types[1+]) can be set via _sub_types in the payload.
        // The DB trigger keeps sub_type in sync with sub_types[1] automatically.
        const categoryKey = META_CATEGORY_KEY[row.vertical]
        if (categoryKey && categoryKey in _meta) {
          const primarySubType = _meta[categoryKey] || null

          // If the client sent _sub_types (full ordered array), use it directly
          // Otherwise, build the array: new primary + existing secondaries
          if (Array.isArray(_sub_types)) {
            listingFields.sub_types = _sub_types.filter(Boolean)
          } else if (primarySubType) {
            // Preserve existing secondary subcategories if any
            const { data: currentRow } = await sb.from('listings').select('sub_types').eq('id', id).single()
            const existingArray = currentRow?.sub_types || []
            const secondaries = existingArray.slice(1)
            listingFields.sub_types = [primarySubType, ...secondaries]
          } else {
            listingFields.sub_types = []
          }
          // sub_type kept in sync: primary = sub_types[0]
          console.log(`[admin/listings/PATCH] Syncing ${row.vertical}.${categoryKey} → sub_types: [${listingFields.sub_types.join(', ')}]`)
        }

        // Handle explicit _sub_types without category change (reordering secondaries)
        if (Array.isArray(_sub_types) && !(categoryKey && categoryKey in _meta)) {
          listingFields.sub_types = _sub_types.filter(Boolean)
          console.log(`[admin/listings/PATCH] Explicit sub_types update: [${listingFields.sub_types.join(', ')}]`)
        }
      }
    }

    // Handle _sub_types sent without _meta (e.g., direct API call or reordering only)
    if (Array.isArray(_sub_types) && !('sub_types' in listingFields)) {
      listingFields.sub_types = _sub_types.filter(Boolean)
    }

    // Now run the main update (reads fresh meta for vertical sync)
    const result = await updateListing(id, listingFields, { action: 'listing-editor' })

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    // Bust the ISR cache for this listing's public page
    if (result.listing?.slug) {
      try {
        revalidatePath(`/place/${result.listing.slug}`)
      } catch (e) {
        console.warn('[admin/listings/PATCH] revalidatePath failed:', e.message)
      }
    }

    return NextResponse.json({
      listing: result.listing,
      verticalSync: result.verticalSync,
      metaSync: metaResult,
    })
  } catch (err) {
    console.error('[admin/listings/PATCH] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 500 })
  }
}

// ─── DELETE handler ──────────────────────────────────────────

export async function DELETE(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })

  try {
    const sb = getSupabaseAdmin()

    // Fetch the listing first to get vertical + source_id + slug for cache busting
    const { data: listing, error: fetchError } = await sb
      .from('listings')
      .select('id, vertical, source_id, name, slug')
      .eq('id', id)
      .single()

    if (fetchError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Delete from the vertical DB if source_id exists
    if (listing.source_id && listing.vertical) {
      try {
        const config = VERTICAL_CONFIG[listing.vertical]
        if (config?.url) {
          const verticalClient = getVerticalClient(listing.vertical)
          let table = config.table

          // Fine Grounds has two tables (roasters + cafes) — check entity_type
          // to target the correct one, falling back to trying both if unknown
          if (listing.vertical === 'fine_grounds') {
            const { data: metaRow } = await sb
              .from('fine_grounds_meta')
              .select('entity_type')
              .eq('listing_id', id)
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
        console.warn('[admin/listings/DELETE] Vertical delete warning:', syncErr.message)
        // Continue — still delete from master
      }
    }

    // Delete from master DB
    const { error: deleteError } = await sb
      .from('listings')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError

    // Bust the ISR cache so the public page returns 404 immediately
    if (listing.slug) {
      try { revalidatePath(`/place/${listing.slug}`) } catch {}
    }

    return NextResponse.json({ success: true, deleted_id: id })
  } catch (err) {
    console.error('[admin/listings/DELETE] Error:', err.message)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
