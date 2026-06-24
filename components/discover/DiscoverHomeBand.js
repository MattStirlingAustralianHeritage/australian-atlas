'use client'

import DiscoverDeck from './DiscoverDeck'

/**
 * DiscoverHomeBand — the live, swipeable Discover taster on the homepage (§5).
 * Not a "Discover →" link: a stranger can flick a real card in place and they
 * are in the feature. Reuses the §1 card, §2 feed and §3 wall verbatim; works
 * identically for anonymous and logged-in users.
 */
export default function DiscoverHomeBand() {
  return (
    <section
      aria-label="Discover independent places"
      style={{
        padding: 'clamp(1.75rem, 4vw, 3rem) 1.5rem',
        background: 'linear-gradient(180deg, #FFFFFF 0%, #FBF9F5 100%)',
        borderTop: '0.5px solid var(--color-border)',
        borderBottom: '0.5px solid var(--color-border)',
      }}
    >
      <div style={{ maxWidth: '380px', margin: '0 auto' }}>
        <DiscoverDeck variant="band" />
      </div>
    </section>
  )
}
