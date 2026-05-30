import { revalidatePath } from 'next/cache'

// Bust the ISR cache for the public place pages of the given listing ids.
// A producer pick affects BOTH venues' pages: the curator's "Producer Picks"
// (outgoing) and the picked venue's "Picked by" (incoming), so create/delete
// must revalidate both slugs. Best-effort — never throws into the request.
export async function revalidatePlacePages(sb, listingIds) {
  const ids = [...new Set((listingIds || []).filter(Boolean))]
  if (!ids.length) return
  try {
    const { data } = await sb.from('listings').select('slug').in('id', ids)
    for (const row of data || []) {
      if (row?.slug) revalidatePath(`/place/${row.slug}`)
    }
  } catch { /* best-effort cache busting */ }
}
