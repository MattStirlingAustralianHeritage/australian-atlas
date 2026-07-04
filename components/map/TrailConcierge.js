'use client'
// ============================================================
// TrailConcierge — the quiet guide at the top of the trail.
//
// A day out has a rhythm: a coffee to start, a proper lunch near
// the middle, somewhere to stay if you're going overnight. This
// reads the trail-so-far and, for each open moment, offers the one
// best real place to fill it — added at the right point in the run.
// Filled moments show as a calm ticked row so the day's shape is
// always visible. Never nags: when the rhythm's there, it steps back.
// ============================================================

import { useTranslations, useLocale } from 'next-intl'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'
import { SUB_TYPE_LABELS } from '@/lib/subTypeLabels'
import { localizeSubcategory } from '@/lib/i18n/listingLabels'

const GOLD = '#C4973B'
const SAGE = '#5f8a7e'
const INK = 'var(--color-ink)'

// A small hand-drawn glyph per moment — sunrise, midday sun, moon.
function MomentIcon({ role, color }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (role === 'coffee') return (
    <svg {...common}><path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" /><path d="M6 2v2M10 2v2M14 2v2" /></svg>
  )
  if (role === 'lunch') return (
    <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  )
  return ( // stay — moon
    <svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
  )
}

function labels(role, t) {
  return {
    coffee: { kicker: t('conciergeMorning'), prompt: t('conciergeCoffeePrompt') },
    lunch:  { kicker: t('conciergeMidday'),  prompt: t('conciergeLunchPrompt') },
    stay:   { kicker: t('conciergeNight'),   prompt: t('conciergeStayPrompt') },
  }[role]
}

function OpenSlot({ slot, onAdd, onSelect }) {
  const t = useTranslations('map')
  const locale = useLocale()
  const l = slot.candidate.listing
  const color = getVerticalBrandColour(l.vertical) || SAGE
  const subTypes = SUB_TYPE_LABELS[l.vertical] || {}
  const enSub = subTypes[l.sub_type]
  const catLabel = enSub ? localizeSubcategory(l.sub_type, enSub, locale) : getVerticalBadge(l.vertical)
  const { kicker, prompt } = labels(slot.role, t)
  const km = slot.candidate.distanceKm
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid rgba(196,151,59,0.16)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <MomentIcon role={slot.role} color={GOLD} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: GOLD, fontFamily: 'var(--font-sans)' }}>
          {kicker}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--color-muted)', fontFamily: 'var(--font-sans)' }}>· {prompt}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <button onClick={() => onSelect?.(l)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 14, color: INK, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {l.name}
          </span>
          <span style={{ display: 'block', fontSize: 10, color: 'var(--color-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[catLabel, l.region].filter(Boolean).join(' · ')}{km != null ? ` · ${km < 1 ? '<1' : (km < 10 ? km : Math.round(km))} km` : ''}
          </span>
        </button>
        <button
          onClick={() => onAdd(slot.candidate.listing, slot.insertIndex)}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
            border: 'none', background: SAGE, color: '#fff',
            fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)', letterSpacing: '0.02em',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          {t('conciergeAdd')}
        </button>
      </div>
    </div>
  )
}

export default function TrailConcierge({ concierge, onAdd, onSelect }) {
  const t = useTranslations('map')
  const slots = concierge?.slots || []
  if (!slots.length) return null

  const open = slots.filter(s => !s.filled && s.candidate)
  const filled = slots.filter(s => s.filled)
  // Roles whose moment is open but with nothing suitable nearby — noted quietly
  // so the concierge stays honest rather than inventing a place.
  const emptyNearby = slots.filter(s => !s.filled && !s.candidate)

  // Nothing to offer and nothing done yet → stay silent (hand-built two-stop
  // hops don't need a lecture).
  if (!open.length && !filled.length) return null

  return (
    <div style={{
      margin: '12px 15px 4px', padding: '11px 14px 12px', borderRadius: 12,
      background: 'linear-gradient(180deg, rgba(196,151,59,0.07), rgba(231,220,198,0.35))',
      border: '1px solid rgba(196,151,59,0.28)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: 22, height: 1, background: GOLD, opacity: 0.8, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: GOLD, fontFamily: 'var(--font-sans)' }}>
          {t('conciergeTitle')}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: INK, lineHeight: 1.3, margin: '5px 0 2px' }}>
        {open.length ? t('conciergeHeadingOpen') : t('conciergeHeadingDone')}
      </div>

      {open.map(slot => (
        <OpenSlot key={slot.role} slot={slot} onAdd={onAdd} onSelect={onSelect} />
      ))}

      {/* The day's rhythm at a glance — ticks for what's covered, a faint
          note for a moment we couldn't fill nearby. */}
      {(filled.length > 0 || emptyNearby.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: open.length ? 10 : 6, paddingTop: open.length ? 9 : 0, borderTop: open.length ? '1px solid rgba(196,151,59,0.16)' : 'none' }}>
          {filled.map(s => (
            <span key={s.role} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: SAGE, fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              {labels(s.role, t).kicker}
            </span>
          ))}
          {emptyNearby.map(s => (
            <span key={s.role} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', opacity: 0.75 }}>
              {labels(s.role, t).kicker} — {t('conciergeNoneNearby')}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
