'use client'

import { getVerticalBadge, VERTICAL_MUTED, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import { dayColor, formatDistance, formatDuration, formatSubType, SLOTS } from './engineShared'

/**
 * DaySection — one day of the itinerary as a guided progression.
 *
 * The day walks its arc (breakfast → activity → lunch → activity → dinner →
 * overnight). Chosen slots render as locked-in stops with drive-time legs;
 * the active slot asks one gentle question and offers a trio of choices;
 * everything still to come sits quietly underneath.
 */

function SlotIcon({ icon, size = 15, color = 'currentColor' }) {
  const s = { width: size, height: size, flexShrink: 0 }
  switch (icon) {
    case 'coffee':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round">
          <path d="M4 8h12v6a4 4 0 01-4 4H8a4 4 0 01-4-4V8zM16 9h2a2 2 0 010 4h-2M7 4.5v1M10 4.5v1M13 4.5v1" />
        </svg>
      )
    case 'compass':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5l-2 5-5 2 2-5z" />
        </svg>
      )
    case 'plate':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4.5" />
        </svg>
      )
    case 'wine':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3h8l-.6 6a3.4 3.4 0 01-6.8 0L8 3zM12 12.5V20M8.5 20h7" />
        </svg>
      )
    case 'moon':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
        </svg>
      )
    case 'bed':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-8M3 14h18v4M3 11h8v3M21 18v-4a2 2 0 00-2-2h-8" />
          <circle cx="6.5" cy="8.5" r="1.5" />
        </svg>
      )
    default:
      return null
  }
}

function slotEyebrow(slotKey) {
  return SLOTS[slotKey]?.label || slotKey
}

export default function DaySection({
  day,
  dayCount,
  arc,
  choices,
  route,
  activeSlotKey,
  offers,
  offersLoading,
  onChoose,
  onSkip,
  onRefresh,
  onReopen,
  onUndoSkip,
  onHover,
}) {
  const color = dayColor(day)
  const chosenStops = arc.map((k) => choices[k]).filter((v) => v && v !== 'skipped')

  return (
    <section className="ie-day">
      {/* Day header */}
      <div className="ie-day-head">
        <span className="ie-day-dot" style={{ background: color }} />
        <h2 className="ie-day-title">{dayCount <= 1 ? 'Your day' : `Day ${day + 1}`}</h2>
        <span className="ie-day-meta">
          {chosenStops.length === 0
            ? ''
            : [
                `${chosenStops.length} ${chosenStops.length === 1 ? 'stop' : 'stops'}`,
                route && chosenStops.length > 1 ? formatDistance(route.distance_km) : null,
                route && chosenStops.length > 1 ? `${formatDuration(route.duration_min)} driving` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        </span>
      </div>

      {(() => {
        let chosenIdx = 0
        return arc.map((slotKey) => {
          const slot = SLOTS[slotKey]
          const val = choices[slotKey]

          // ── Chosen ──
          if (val && val !== 'skipped') {
            chosenIdx++
            const leg = chosenIdx > 1 ? route?.legs?.[chosenIdx - 2] : null
            return (
              <div key={slotKey} className="ie-chosen-wrap">
                {chosenIdx > 1 && (
                  <div className="ie-leg">
                    <span className="ie-leg-line" />
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h14a2 2 0 012 2v6a2 2 0 01-2 2M7 21v-2M17 21v-2" />
                    </svg>
                    {leg ? <span>{formatDistance(leg.distance_km)} · {formatDuration(leg.duration_min)}</span> : <span>—</span>}
                  </div>
                )}
                <div className="ie-stop" onMouseEnter={() => onHover?.(val.id)} onMouseLeave={() => onHover?.(null)}>
                  <span className="ie-stop-num" style={{ background: color }}>
                    {slotKey === 'sleep' ? '★' : chosenIdx}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: VERTICAL_MUTED[val.vertical] || 'var(--color-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <SlotIcon icon={slot.icon} size={11} />
                      {slotEyebrow(slotKey)} · {getVerticalBadge(val.vertical)}
                    </p>
                    <a href={`/place/${val.slug}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-display)', fontSize: 18, lineHeight: 1.2, color: 'var(--color-ink)', textDecoration: 'none' }}>
                      {val.name}
                    </a>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', marginTop: 2 }}>
                      {[formatSubType(val.sub_type), val.suburb || val.region].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                    <button className="ie-icon-btn" title="Choose something else" onClick={() => onReopen(slotKey)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.5 9A9 9 0 005.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 013.5 15" /></svg>
                    </button>
                    <button className="ie-icon-btn" title="Remove" onClick={() => onReopen(slotKey, { skip: true })}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          // ── Skipped ──
          if (val === 'skipped') {
            return (
              <div key={slotKey} className="ie-slot-skipped">
                <SlotIcon icon={slot.icon} size={12} />
                <span>{slot.label} — skipped</span>
                <button onClick={() => onUndoSkip(slotKey)}>Undo</button>
              </div>
            )
          }

          // ── Active chooser ──
          if (slotKey === activeSlotKey) {
            return (
              <div key={slotKey} className="ie-chooser">
                <div className="ie-chooser-head">
                  <span className="ie-chooser-icon" style={{ color }}>
                    <SlotIcon icon={slot.icon} size={16} />
                  </span>
                  <h3 className="ie-chooser-q">{slot.question}</h3>
                </div>

                {offersLoading && (
                  <div className="ie-choice-grid">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="ie-choice-card" style={{ pointerEvents: 'none' }}>
                        <div className="ie-sugg-media" style={{ background: '#ece8e0' }} />
                        <div className="ie-sugg-body">
                          <div style={{ height: 9, width: '45%', background: '#ece8e0', borderRadius: 4, marginBottom: 8 }} />
                          <div style={{ height: 14, width: '85%', background: '#ece8e0', borderRadius: 4, marginBottom: 6 }} />
                          <div style={{ height: 9, width: '60%', background: '#ece8e0', borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!offersLoading && (!offers || offers.length === 0) && (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--color-muted)', lineHeight: 1.6, padding: '6px 2px 2px' }}>
                    We couldn’t find anything nearby for this one — skip it, or pick straight from the map.
                  </p>
                )}

                {!offersLoading && offers && offers.length > 0 && (
                  <div className="ie-choice-grid">
                    {offers.map((s) => {
                      const token = VERTICAL_CARD_TOKENS[s.vertical] || VERTICAL_CARD_TOKENS.portal
                      const metaLine = [formatSubType(s.sub_type), s.suburb || s.region, formatDistance(s.distance_km)]
                        .filter(Boolean)
                        .join(' · ')
                      return (
                        <div
                          key={s.id}
                          className="ie-choice-card"
                          onMouseEnter={() => onHover?.(s.id)}
                          onMouseLeave={() => onHover?.(null)}
                        >
                          <a href={`/place/${s.slug}`} target="_blank" rel="noreferrer" className="ie-sugg-media" style={{ '--tc-bg': token.bg }}>
                            {s.hero_image_url ? (
                              <img src={s.hero_image_url} alt={s.name} loading="lazy" />
                            ) : (
                              <span className="ie-sugg-media-initial">{(s.name || '?').trim().charAt(0)}</span>
                            )}
                            {(s.editors_pick || s.is_featured) && (
                              <span className="ie-sugg-flag">{s.editors_pick ? 'Atlas Select' : 'Featured'}</span>
                            )}
                          </a>
                          <div className="ie-sugg-body">
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: VERTICAL_MUTED[s.vertical] || 'var(--color-muted)', marginBottom: 3 }}>
                              {getVerticalBadge(s.vertical)}
                            </p>
                            <a href={`/place/${s.slug}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.22, color: 'var(--color-ink)', textDecoration: 'none' }}>
                              {s.name}
                            </a>
                            {metaLine && (
                              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', marginTop: 3 }}>{metaLine}</p>
                            )}
                            {s.description && <p className="ie-sugg-desc">{s.description}</p>}
                            <div style={{ marginTop: 'auto', paddingTop: 10 }}>
                              <button className="ie-add-btn" style={{ width: '100%' }} onClick={() => onChoose(s)}>
                                Choose
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="ie-chooser-foot">
                  <button className="ie-ghost-btn" onClick={onRefresh}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.5 9A9 9 0 005.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 013.5 15" /></svg>
                    Show me different ones
                  </button>
                  <button className="ie-ghost-btn" onClick={onSkip}>
                    Skip this one →
                  </button>
                </div>
              </div>
            )
          }

          // ── Upcoming ──
          return (
            <div key={slotKey} className="ie-slot-upcoming">
              <SlotIcon icon={slot.icon} size={12} />
              <span>{slot.label}</span>
            </div>
          )
        })
      })()}
    </section>
  )
}
