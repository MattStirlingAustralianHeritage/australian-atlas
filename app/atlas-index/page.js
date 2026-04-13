import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import IndexClient from './IndexClient'

export const dynamic = 'force-dynamic' // uses getSupabaseAdmin (no-store fetch)

// ── Data fetching ────────────────────────────────────────────

const getAllListings = cache(async function getAllListings() {
  const sb = getSupabaseAdmin()
  const PAGE_SIZE = 1000
  let all = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, slug, vertical, suburb, state, region')
      .eq('status', 'active')
      .order('name', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('Atlas index fetch error:', error)
      break
    }

    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
})

// ── Metadata ────────────────────────────────────────────────

export async function generateMetadata() {
  const listings = await getAllListings()
  const count = listings.length.toLocaleString()
  return {
    title: 'Atlas Index — Every Independent Place in Australia',
    description: `Browse all ${count} independent Australian places alphabetically. The complete A-Z directory of the Australian Atlas network.`,
    openGraph: {
      title: 'Atlas Index — Every Independent Place in Australia',
      description: `Browse all ${count} independent Australian places alphabetically.`,
    },
  }
}

// ── Page ─────────────────────────────────────────────────────

export default async function AtlasIndexPage() {
  const listings = await getAllListings()
  return <IndexClient listings={listings} totalCount={listings.length} />
}
