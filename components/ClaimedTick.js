// ============================================================
// ClaimedTick — the small gold seal that marks an operator-claimed listing.
//
// Same device as the homepage day rail's `.day-claimed-chip`: a gold disc
// carrying an ink tick, labelled "Owner-managed". Claiming is free, so this
// is the one mark a venue earns without paying — it says the people who run
// the place keep it current, and nothing about editorial or paid placement.
//
// Hand-drawn SVG rather than the lucide glyph the day rail uses, so the seal
// is safe inside server-rendered cards; the label is a prop for the same
// reason (no translation hook inside a component both worlds share).
// ============================================================

export default function ClaimedTick({ size = 20, label = 'Owner-managed' }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
      >
        <circle cx="10" cy="10" r="9" fill="var(--color-gold, #C4973B)" />
        {/* Hairline rim so the seal still separates from a pale photograph */}
        <circle cx="10" cy="10" r="9" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
        <path
          d="M6.2 10.3 L8.8 12.8 L13.8 7.5"
          stroke="#1C1A17"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
