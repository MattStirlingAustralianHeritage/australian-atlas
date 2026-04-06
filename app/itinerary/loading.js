/**
 * Route-level loading state for /itinerary.
 * This is a Server Component — it renders as static HTML
 * before ANY client JS loads. Provides a visible loading state
 * even if the page module fails to load/hydrate.
 */

export default function ItineraryLoading() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9998,
      background: '#F8F6F1',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    }}>
      <div style={{
        fontSize: 9,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: '#6B6760',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        fontWeight: 600,
      }}>
        Australian Atlas
      </div>
      <h2 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontWeight: 400,
        fontSize: 22,
        color: '#1C1A17',
      }}>
        Building your trail...
      </h2>
      <p style={{
        fontSize: 12,
        color: '#6B6760',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        letterSpacing: '0.02em',
      }}>
        Building from verified venues only
      </p>
      {/* Progress bar shimmer */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'rgba(28,26,23,0.12)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: '40%',
          background: 'linear-gradient(90deg, #4a7166, #5f8a7e)',
          animation: 'itinLoadShimmer 1.5s ease-in-out infinite alternate',
        }} />
      </div>
      <style>{`
        @keyframes itinLoadShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  )
}
