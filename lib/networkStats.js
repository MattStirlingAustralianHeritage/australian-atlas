import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getPublicVerticals } from '@/lib/verticalUrl'
import { excludeTestListings } from '@/lib/listings/publicFilter'

// ============================================================
// Shared network stats — single source for the headline numbers
// quoted on /about, /operators and /press. Always live counts;
// no hardcoded totals anywhere in page copy.
// ============================================================

/** Number of public atlases (Way included once WAY_ATLAS_PUBLIC promotes it). */
export function getAtlasCount() {
  return getPublicVerticals().length
}

/**
 * Live headline counts. Zeros on failure so callers can hide a stat
 * rather than show a stale or invented number.
 * @returns {Promise<{listings: number, claimed: number, regions: number, atlasCount: number}>}
 */
export async function getNetworkStats() {
  const atlasCount = getAtlasCount()
  try {
    const sb = getSupabaseAdmin()
    const [{ count: listings }, { count: claimed }, { count: regions }] = await Promise.all([
      excludeTestListings(sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active')),
      excludeTestListings(sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('is_claimed', true)),
      sb.from('regions').select('*', { count: 'exact', head: true }),
    ])
    return { listings: listings || 0, claimed: claimed || 0, regions: regions || 0, atlasCount }
  } catch {
    return { listings: 0, claimed: 0, regions: 0, atlasCount }
  }
}
