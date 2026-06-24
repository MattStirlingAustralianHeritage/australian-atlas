/**
 * Renders the trade-readiness enrichment for a stop — ONLY when the operator has
 * opted in (stop.trade_ready). A non-trade stop renders nothing here, showing
 * standard listing info only. Shared by the builder and the published itinerary.
 *
 * These fields NEVER render on public consumer listing pages — this component is
 * imported only inside the gated builder and the trade-scoped itinerary route.
 */
export default function TradeFields({ trade, compact = false }) {
  if (!trade) return null
  const bits = []
  if (trade.contact_before_booking) bits.push('Contact operator before booking')
  if (trade.rates_available) bits.push('Trade rates available')
  if (trade.group && trade.group_size_max) bits.push(`Groups up to ${trade.group_size_max}`)
  else if (trade.group) bits.push('Welcomes groups')
  if (trade.bespoke) bits.push('Welcomes bespoke trade')
  if (bits.length === 0) bits.push('Trade-ready')

  return (
    <div style={{
      marginTop: compact ? 6 : 10,
      padding: compact ? '6px 10px' : '10px 12px',
      background: 'rgba(196,151,59,0.08)',
      border: '1px solid rgba(196,151,59,0.35)',
      borderRadius: 8,
    }}>
      <span style={{
        fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-gold)',
      }}>
        Trade-ready operator
      </span>
      <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
        {bits.map((b, i) => (
          <li key={i} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 400, color: 'var(--color-ink)',
          }}>
            <span style={{ color: 'var(--color-gold)' }}>&#10003;</span>{b}
          </li>
        ))}
      </ul>
    </div>
  )
}
