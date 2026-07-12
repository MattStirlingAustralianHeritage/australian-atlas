'use client'
import { useTranslations, useLocale } from 'next-intl'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'
import { SUB_TYPE_LABELS } from '@/lib/subTypeLabels'
import { localizeSubcategory } from '@/lib/i18n/listingLabels'

const GOLD = '#c8943a'

// One gazetteer row. The Atlas is a largely photo-less dataset (heroes are an
// operator perk), so rows are typographic by default — vertical colour rail,
// serif name, set-small meta — and a thumbnail appears only when a listing
// actually has an approved image (meta from /api/map/cards).
function PanelRow({ l, meta, active, visited, onHover, onSelect, inTrail, onToggleTrail }) {
  const t = useTranslations('map')
  const locale = useLocale()
  const color = getVerticalBrandColour(l.vertical) || '#5f8a7e'
  const subTypes = SUB_TYPE_LABELS[l.vertical] || {}
  // Localize the subcategory portion of the meta line on /ko (English is
  // byte-identical): Korean label when the sub_type is known, else the curated
  // English label; fall back to the vertical badge when there's no sub_type.
  const enSubLabel = subTypes[l.sub_type]
  const categoryLabel = enSubLabel
    ? localizeSubcategory(l.sub_type, enSubLabel, locale)
    : getVerticalBadge(l.vertical)
  const metaLine = [
    categoryLabel,
    [meta?.suburb || l.region, l.state].filter(Boolean).join(', '),
  ].filter(Boolean).join(' · ')

  // The row is a div-with-button-role (not a <button>) so the trail toggle
  // can be a real button inside it without nesting interactive elements.
  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => onHover(l.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(l.id)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(l)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(l) } }}
      aria-pressed={active}
      className="map-panel-row"
      style={{
        display: 'flex', alignItems: 'stretch', gap: 0, width: '100%', textAlign: 'left',
        background: active ? 'rgba(95,138,126,0.10)' : 'transparent',
        borderBottom: '1px solid rgba(28,26,23,0.07)',
        padding: 0, cursor: 'pointer',
      }}
    >
      <span style={{ width: 3, flexShrink: 0, background: (l.is_featured || l.is_claimed) ? GOLD : color, opacity: active ? 1 : 0.75 }} />
      <span style={{ flex: 1, minWidth: 0, padding: '10px 12px 11px' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontFamily: 'var(--font-serif)', fontSize: 14.5, lineHeight: 1.25, color: visited ? 'var(--color-muted)' : 'var(--color-ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{l.name}</span>
          {l.is_claimed && (
            <span title={t('claimedByOwner')} style={{ flexShrink: 0, alignSelf: 'center', display: 'inline-flex' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-label={t('claimedByOwner')} role="img"><path d="M20 6 9 17l-5-5"/></svg>
            </span>
          )}
          {l.is_featured && <span title={t('featured')} style={{ color: GOLD, fontSize: 10, flexShrink: 0 }}>★</span>}
          {meta?.editors_pick && !l.is_featured && (
            <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>{t('pick')}</span>
          )}
        </span>
        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--color-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {metaLine}
        </span>
        {l.description && (
          <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: '#5a544b', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {l.description}
          </span>
        )}
      </span>
      {meta?.image && (
        <span style={{ width: 62, alignSelf: 'center', flexShrink: 0, marginRight: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={meta.image} alt="" loading="lazy" decoding="async"
            style={{ width: 62, height: 50, objectFit: 'cover', borderRadius: 5, display: 'block' }} />
        </span>
      )}
      {onToggleTrail && (
        <span style={{ alignSelf: 'center', flexShrink: 0, marginRight: 10, marginLeft: meta?.image ? 0 : 2 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleTrail(l) }}
            aria-label={inTrail ? t('trailRemoveStop') : t('trailAddStop')}
            title={inTrail ? t('trailRemoveStop') : t('trailAddStop')}
            style={{
              width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
              border: `1px solid ${inTrail ? '#5f8a7e' : 'rgba(28,26,23,0.16)'}`,
              background: inTrail ? '#5f8a7e' : 'rgba(255,255,255,0.9)',
              color: inTrail ? '#fff' : 'var(--color-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            {inTrail
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>}
          </button>
        </span>
      )}
    </div>
  )
}

/**
 * The gazetteer — a viewport-synced index of what's on the map.
 *
 * mode 'panel': the desktop left rail (fills its absolute container).
 * mode 'sheet': content of the mobile full-height list sheet.
 */
export default function DiscoveryPanel({
  mode = 'panel',
  items,
  totalInView,
  totalAll,
  loading,
  cardMeta,
  selectedId,
  visitedIds,
  filterQuery = '',
  onFilterQuery,
  filterBusy = false,
  onHover,
  onSelect,
  onClose,
  trailIds = null,
  onToggleTrail = null,
  trailAtCapacity = false,
}) {
  const t = useTranslations('map')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: mode === 'sheet' ? '4px 16px 10px' : '12px 15px 10px',
        borderBottom: '1px solid var(--color-border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div role="status">
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15.5, color: 'var(--color-ink)' }}>
              {loading ? t('readingAtlas') : filterBusy ? t('searchingAtlas') : t('placesInView', { count: totalInView })}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--color-muted)', marginTop: 1 }}>
              {loading || filterBusy ? '' : t('ofTotalAcrossAustralia', { total: totalAll })}
            </div>
          </div>
          {mode === 'sheet' && (
            <button onClick={onClose} aria-label={t('closeList')} style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--color-border)',
              background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {/* Smart filter — matches keep colour on the map, the rest grey out.
            Desktop renders this as a floating bar over the map instead (see
            MapClient's MapFilterBar), so the in-panel field is sheet-only. */}
        {onFilterQuery && mode === 'sheet' && (
          <div style={{ position: 'relative', marginTop: 9 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
            </span>
            <input
              type="text"
              inputMode="search"
              value={filterQuery}
              onChange={e => onFilterQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') onFilterQuery('') }}
              placeholder={t('filterPlaceholderShort')}
              aria-label={t('filterAriaLabel')}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '7px 30px 7px 27px',
                background: '#fff', border: `1px solid ${filterQuery ? '#5f8a7e' : 'var(--color-border)'}`,
                borderRadius: 7, fontSize: 12, color: 'var(--color-ink)', outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
            />
            {filterBusy ? (
              <span aria-label={t('searching')} title={t('smartSearchRunning')} style={{
                position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
                width: 13, height: 13, borderRadius: '50%',
                border: '2px solid rgba(95,138,126,0.28)', borderTopColor: '#5f8a7e',
                animation: 'dp-spin 0.7s linear infinite',
              }} />
            ) : filterQuery ? (
              <button onClick={() => onFilterQuery('')} aria-label={t('clearFilter')} style={{
                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            ) : null}
          </div>
        )}
        {onFilterQuery && mode === 'sheet' && filterQuery && (
          <div style={{ fontSize: 9.5, color: 'var(--color-muted)', marginTop: 5, letterSpacing: '0.02em' }}>
            {filterBusy ? t('searchingMeaning') : t('matchesStayInColour')}
          </div>
        )}
        <style>{`@keyframes dp-spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, overscrollBehavior: 'contain' }}>
        {/* While the semantic pass is still in flight, don't flash a
            "nothing matches" state — the results may be about to arrive. */}
        {!loading && items.length === 0 && !filterBusy && (
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-ink)', marginBottom: 6 }}>
              {filterQuery ? t('nothingMatchesQuery', { query: filterQuery }) : t('nothingInView')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.5 }}>
              {filterQuery ? t('nothingMatchesHint') : t('nothingInViewHint')}
            </div>
            {filterQuery && onFilterQuery && (
              <button onClick={() => onFilterQuery('')} style={{
                marginTop: 12, padding: '7px 16px', background: '#5f8a7e', color: '#fff', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-sans)',
              }}>
                {t('clearFilter')}
              </button>
            )}
          </div>
        )}
        {items.map(l => {
          const inTrail = !!trailIds?.has(String(l.id))
          return (
            <PanelRow
              key={l.id}
              l={l}
              meta={cardMeta[l.id]}
              active={selectedId === l.id}
              visited={visitedIds?.has(l.id)}
              onHover={onHover}
              onSelect={onSelect}
              inTrail={inTrail}
              onToggleTrail={onToggleTrail && (inTrail || !trailAtCapacity) ? onToggleTrail : null}
            />
          )
        })}
        {!loading && totalInView > items.length && (
          <div style={{ padding: '12px 15px 18px', fontSize: 10.5, color: 'var(--color-muted)', textAlign: 'center' }}>
            {t('showingFirst', { count: items.length })}
          </div>
        )}
      </div>
    </div>
  )
}
