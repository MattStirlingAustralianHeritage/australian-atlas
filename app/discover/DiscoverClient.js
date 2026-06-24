'use client'

import DiscoverDeck from '@/components/discover/DiscoverDeck'

// The /discover surface is now an in-flow page below the global nav (no
// full-bleed overlay). All the mechanic lives in the shared DiscoverDeck so
// the homepage band reuses it verbatim.
export default function DiscoverClient() {
  return <DiscoverDeck variant="fullscreen" />
}
