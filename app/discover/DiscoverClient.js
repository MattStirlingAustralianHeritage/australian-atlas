'use client'

import DiscoverDeck from '@/components/discover/DiscoverDeck'

// The /discover surface is now an in-flow page below the global nav (no
// full-bleed overlay). All the mechanic lives in the shared DiscoverDeck so
// the homepage band reuses it verbatim. The masthead gives the floating deck
// an editorial frame — without it the card hovered in unexplained space.
export default function DiscoverClient() {
  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="page-masthead max-w-2xl" style={{ paddingBottom: 0 }}>
          <p className="section-dateline">Discover</p>
          <h1 className="masthead-title">One place at a time</h1>
          <p className="masthead-sub">
            Flick through independent Australia. Pick what you like — the more you pick, the more it&apos;s to your taste.
          </p>
        </div>
      </div>
      <DiscoverDeck variant="fullscreen" />
    </>
  )
}
