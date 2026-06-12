'use client'

import { getVerticalBadge, VERTICAL_ACCENTS } from '@/lib/verticalUrl'

const VERTICAL_COLORS = VERTICAL_ACCENTS

/**
 * SuggestRail — the recommendation layer of the builder.
 *
 * With stops on the trail: horizontally-scrolling card rows per suggestion
 * group ("Along your route", "Add a coffee stop", "In the same spirit").
 * Hovering a card rings its pin on the map; clicking adds it.
 *
 * With no stops: "strong places to start" for the current viewport, plus
 * curated editorial trails offered as one-click starting templates.
 */
export default function SuggestRail({
  groups, loading, hasStops, stopIds,
  onAdd, onHover,
  templates, templateLoading, onUseTemplate,
}) {
  const visibleGroups = (groups || [])
    .map(g => ({ ...g, items: g.items.filter(it => !stopIds.has(String(it.id))) }))
    .filter(g => g.items.length > 0)

  const showTemplates = !hasStops && templates?.length > 0

  if (!visibleGroups.length && !showTemplates && !loading) return null

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 4 }}>
      {loading && !visibleGroups.length && (
        <div style={{ padding: '12px 20px 4px', fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
          Finding suggestions…
        </div>
      )}

      {visibleGroups.map(group => (
        <div key={group.key} style={{ padding: '12px 0 4px' }}>
          <div style={{ padding: '0 20px', marginBottom: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
              {group.title}
            </div>
            {group.reason && (
              <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 1 }}>
                {group.reason}
              </div>
            )}
          </div>

          <div className="suggest-row" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 20px 10px', scrollSnapType: 'x proximity' }}>
            {group.items.map(item => (
              <SuggestCard
                key={item.id}
                item={item}
                onAdd={() => onAdd(item)}
                onHover={onHover}
              />
            ))}
          </div>
        </div>
      ))}

      {showTemplates && (
        <div style={{ padding: '12px 0 8px' }}>
          <div style={{ padding: '0 20px', marginBottom: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
              Or start from a curated trail
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 1 }}>
              Loads the stops — make it your own from there
            </div>
          </div>
          <div className="suggest-row" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 20px 10px' }}>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => onUseTemplate(t)}
                disabled={!!templateLoading}
                style={{
                  flexShrink: 0, width: 168, textAlign: 'left', cursor: templateLoading ? 'wait' : 'pointer',
                  background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6,
                  padding: '10px 12px', fontFamily: 'var(--font-body)',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.35, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {t.title}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>
                  {[t.stop_count ? `${t.stop_count} stops` : null, t.region].filter(Boolean).join(' · ')}
                </div>
                <div style={{ marginTop: 7, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5F8A7E' }}>
                  {templateLoading === t.slug ? 'Loading…' : 'Use as start →'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .suggest-row::-webkit-scrollbar { height: 6px; }
        .suggest-row::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
        .suggest-row::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  )
}

function SuggestCard({ item, onAdd, onHover }) {
  const color = VERTICAL_COLORS[item.vertical] || '#5F8A7E'
  return (
    <button
      onClick={onAdd}
      onMouseEnter={() => onHover?.(item.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(item.id)}
      onBlur={() => onHover?.(null)}
      title={`Add ${item.name} to your trail`}
      style={{
        flexShrink: 0, width: 156, textAlign: 'left', cursor: 'pointer',
        background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6,
        padding: 0, overflow: 'hidden', fontFamily: 'var(--font-body)', scrollSnapAlign: 'start',
      }}
    >
      {/* Thumbnail or colour block */}
      <div style={{
        height: 56, background: item.image_url ? `url(${JSON.stringify(item.image_url)}) center/cover` : `linear-gradient(135deg, ${color}22, ${color}55)`,
        position: 'relative',
      }}>
        <span style={{
          position: 'absolute', top: 6, left: 6,
          fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          background: 'rgba(255,255,255,0.92)', color, padding: '2px 6px', borderRadius: 2,
        }}>
          {getVerticalBadge(item.vertical)}
        </span>
        {item.distance_km != null && (
          <span style={{
            position: 'absolute', bottom: 6, right: 6,
            fontSize: 9, fontWeight: 600,
            background: 'rgba(26,22,20,0.72)', color: '#fff', padding: '2px 6px', borderRadius: 2,
          }}>
            {item.distance_km < 1 ? '<1' : Math.round(item.distance_km)} km away
          </span>
        )}
      </div>
      <div style={{ padding: '8px 10px 9px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.3, marginBottom: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[item.region, item.state].filter(Boolean).join(', ') || ' '}
        </div>
        <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#5F8A7E' }}>
          + Add to trail
        </div>
      </div>
    </button>
  )
}
