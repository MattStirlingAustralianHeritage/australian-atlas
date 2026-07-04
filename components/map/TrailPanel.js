'use client'
// ============================================================
// TrailPanel — the trail under construction, living ON the map.
//
// Desktop: right-hand rail mirroring the discovery panel.
// Mobile: full-height sheet (mode='sheet').
//
// Empty state offers three doors: build by hand (tap pins),
// answer three questions (TrailWizard → Plan-a-Stay engine), or
// start from a curated trail. Once stops exist: ordered list
// with leg distances, day structure, taste-ranked suggestions,
// and save/share.
// ============================================================

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'
import { SUB_TYPE_LABELS } from '@/lib/subTypeLabels'
import { localizeSubcategory } from '@/lib/i18n/listingLabels'
import { groupStopsByDay } from '@/lib/trail/days'
import TrailWizard from './TrailWizard'

const SAGE = '#5f8a7e'
const INK = 'var(--color-ink)'

function fmtDuration(totalMin, t) {
  if (!totalMin) return null
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  if (h === 0) return t('trailMinutes', { count: m })
  return m === 0 ? t('trailHours', { count: h }) : t('trailHoursMinutes', { hours: h, minutes: m })
}

function LegChip({ leg, approx, t }) {
  if (!leg) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0 1px 30px' }}>
      <span style={{ width: 1, height: 14, background: 'var(--color-border)' }} />
      <span style={{ fontSize: 9.5, color: 'var(--color-muted)', letterSpacing: '0.03em', fontFamily: 'var(--font-sans)' }}>
        {approx ? '≈ ' : ''}{leg.km} km · {leg.min} {t('trailMinShort')}
      </span>
    </div>
  )
}

function StopRow({ stop, index, count, onRemove, onMoveUp, onMoveDown, onSelect }) {
  const t = useTranslations('map')
  const locale = useLocale()
  const color = getVerticalBrandColour(stop.vertical) || SAGE
  const subTypes = SUB_TYPE_LABELS[stop.vertical] || {}
  const enSub = subTypes[stop.sub_type]
  const catLabel = enSub ? localizeSubcategory(stop.sub_type, enSub, locale) : getVerticalBadge(stop.vertical)
  return (
    <div className="trail-stop-row" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 2px 7px 0' }}>
      <button
        onClick={onSelect}
        aria-label={stop.name}
        style={{
          width: 23, height: 23, borderRadius: '50%', flexShrink: 0, border: '1.5px solid #FBF9F4',
          background: INK, color: 'var(--color-cream)', fontSize: 10.5, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          fontFamily: 'var(--font-sans)', boxShadow: `0 0 0 1.5px ${color}`,
        }}
      >{index + 1}</button>
      <button onClick={onSelect} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 13.5, color: INK, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stop.name}
        </span>
        <span style={{ display: 'block', fontSize: 10, color: 'var(--color-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[catLabel, stop.region].filter(Boolean).join(' · ')}
        </span>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <button onClick={onMoveUp} disabled={index === 0} aria-label={t('trailMoveUp')} style={{
          width: 24, height: 24, border: 'none', background: 'none', cursor: index === 0 ? 'default' : 'pointer',
          color: index === 0 ? 'var(--color-border)' : 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
        <button onClick={onMoveDown} disabled={index === count - 1} aria-label={t('trailMoveDown')} style={{
          width: 24, height: 24, border: 'none', background: 'none', cursor: index === count - 1 ? 'default' : 'pointer',
          color: index === count - 1 ? 'var(--color-border)' : 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <button onClick={onRemove} aria-label={t('trailRemoveStop')} style={{
          width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  )
}

function SuggestionRow({ s, onAdd, onSelect }) {
  const t = useTranslations('map')
  const color = getVerticalBrandColour(s.listing.vertical) || SAGE
  const reasonLabel = {
    addsCoffee: t('trailReasonCoffee'),
    addsLunch: t('trailReasonLunch'),
    addsStay: t('trailReasonStay'),
    matchesTaste: t('trailReasonTaste'),
    newKind: t('trailReasonNewKind'),
    nearRoute: s.distanceKm < 1 ? t('trailReasonOnRoute') : t('trailReasonNearRoute', { km: s.distanceKm < 10 ? s.distanceKm : Math.round(s.distanceKm) }),
  }[s.reason]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <button onClick={onSelect} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 13, color: INK, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.listing.name}
        </span>
        <span style={{ display: 'block', fontSize: 9.5, color: s.reason === 'matchesTaste' ? SAGE : 'var(--color-muted)', marginTop: 1, fontWeight: s.reason === 'matchesTaste' ? 600 : 400 }}>
          {reasonLabel}
        </span>
      </button>
      <button onClick={onAdd} aria-label={t('trailAddStop')} style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        border: `1px solid ${SAGE}`, background: 'rgba(95,138,126,0.08)', color: SAGE,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
  )
}

export default function TrailPanel({ trail, mode = 'panel', onClose, onSelectListing, returnTo }) {
  const t = useTranslations('map')
  const [showWizard, setShowWizard] = useState(false)
  const [templates, setTemplates] = useState(null)
  const [templateLoading, setTemplateLoading] = useState(null)
  const [shareCopied, setShareCopied] = useState(false)

  const {
    stops, name, setName, visibility, setVisibility, transportMode, setTransportMode,
    route, suggestions, addStop, removeStop, undoRemove, reorderStops,
    optimiseOrder, optimiseSavingsKm, splitIntoDays, mergeDays, daysAssigned,
    seedStops, clearAll, lastRemoved, canSave, saving, saveError, saveTrail,
    savedTrail, editingTrail, atCapacity, taste,
  } = trail

  // Curated starting points — fetched once the empty state is on screen.
  useEffect(() => {
    if (stops.length > 0 || templates !== null) return
    let cancelled = false
    fetch('/api/trails?type=editorial&limit=4')
      .then(r => r.ok ? r.json() : { trails: [] })
      .then(({ trails }) => { if (!cancelled) setTemplates(trails || []) })
      .catch(() => { if (!cancelled) setTemplates([]) })
    return () => { cancelled = true }
  }, [stops.length, templates])

  async function loadTemplate(tpl) {
    setTemplateLoading(tpl.slug)
    try {
      const res = await fetch(`/api/trails/${tpl.slug}`)
      if (!res.ok) throw new Error()
      const { trail: full } = await res.json()
      const tStops = (full.stops || [])
        .filter(s => s.venue_lat && s.venue_lng)
        .map(s => ({
          id: s.listing_id || s.id, name: s.venue_name, vertical: s.vertical,
          latitude: s.venue_lat, longitude: s.venue_lng,
          slug: s.listing_slug, image_url: s.venue_image_url, region: s.listing_region,
          day: s.day_number ?? null,
        }))
      seedStops(tStops, { name: name.trim() ? '' : full.title, keepName: !!name.trim() })
    } catch { /* template unavailable — leave the empty state up */ } finally {
      setTemplateLoading(null)
    }
  }

  const shareUrl = savedTrail?.short_code && savedTrail.visibility !== 'private'
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${savedTrail.short_code}`
    : null
  const viewUrl = savedTrail
    ? (savedTrail.visibility === 'public' ? `/trails/${savedTrail.slug}` : shareUrl ? `/t/${savedTrail.short_code}` : null)
    : null

  const dayGroups = daysAssigned ? groupStopsByDay(stops) : [{ day: null, startIndex: 0, stops }]
  const duration = fmtDuration(route.totalMin, t)

  const sectionLabel = (label) => (
    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-sans)' }}>
      {label}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── Header ── */}
      <div style={{ padding: mode === 'sheet' ? '4px 16px 12px' : '13px 15px 12px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={SAGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
              <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" />
              <path d="M9 19h6.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H15" />
            </svg>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15.5, color: INK, whiteSpace: 'nowrap' }}>
              {editingTrail ? t('trailEditingTitle') : t('trailPanelTitle')}
            </span>
          </div>
          <button onClick={onClose} aria-label={t('trailClosePanel')} style={{
            width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--color-border)',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('trailNamePlaceholder')}
          aria-label={t('trailNamePlaceholder')}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 11px',
            border: `1px solid ${name.trim() ? 'rgba(95,138,126,0.45)' : 'var(--color-border)'}`,
            borderRadius: 8, fontSize: 13.5, fontFamily: 'var(--font-serif)', color: INK,
            outline: 'none', background: '#fff',
          }}
        />
        {stops.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 10.5, color: 'var(--color-muted)', fontFamily: 'var(--font-sans)' }}>
              {t('trailStopsCount', { count: stops.length })}
              {route.totalKm > 0 && <> · {route.approx ? '≈ ' : ''}{route.totalKm} km{duration ? ` · ${duration}` : ''}</>}
            </span>
            <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
              {[{ key: 'drive', label: t('trailModeDrive') }, { key: 'walk', label: t('trailModeWalk') }].map(m => (
                <button key={m.key} onClick={() => setTransportMode(m.key === 'walk' ? 'transit' : 'drive')} style={{
                  padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  background: (m.key === 'drive') === (transportMode === 'drive') ? SAGE : 'transparent',
                  color: (m.key === 'drive') === (transportMode === 'drive') ? '#fff' : 'var(--color-muted)',
                }}>{m.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, overscrollBehavior: 'contain' }}>
        {/* ── Saved confirmation ── */}
        {savedTrail && (
          <div style={{ margin: '12px 15px 0', padding: '11px 13px', background: 'rgba(95,138,126,0.09)', border: '1px solid rgba(95,138,126,0.3)', borderRadius: 9 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, color: INK, marginBottom: 3 }}>
              {savedTrail.copied ? t('trailSavedCopy') : t('trailSaved')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5 }}>
              {savedTrail.visibility === 'private' ? t('trailSavedPrivateHint') : t('trailSavedShareHint')}
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
              {viewUrl && (
                <a href={viewUrl} style={{ padding: '7px 13px', background: INK, color: 'var(--color-cream)', textDecoration: 'none', fontSize: 10.5, fontWeight: 600, borderRadius: 6, fontFamily: 'var(--font-sans)' }}>
                  {t('trailViewSaved')} →
                </a>
              )}
              {shareUrl && (
                <button onClick={() => {
                  navigator.clipboard?.writeText(shareUrl).then(() => {
                    setShareCopied(true)
                    setTimeout(() => setShareCopied(false), 2200)
                  }).catch(() => {})
                }} style={{ padding: '7px 13px', background: '#fff', border: `1px solid ${SAGE}`, color: SAGE, fontSize: 10.5, fontWeight: 600, borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  {shareCopied ? t('trailLinkCopied') : t('trailCopyLink')}
                </button>
              )}
              <a href="/account/trails" style={{ padding: '7px 13px', color: 'var(--color-muted)', textDecoration: 'none', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                {t('trailMyTrails')}
              </a>
            </div>
          </div>
        )}

        {/* ── Empty state: three doors ── */}
        {stops.length === 0 && !showWizard && (
          <div style={{ padding: '16px 15px 20px' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16.5, color: INK, lineHeight: 1.35, marginBottom: 6 }}>
              {t('trailEmptyTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.55, marginBottom: 16 }}>
              {t('trailEmptyBody')}
            </div>
            <button onClick={() => setShowWizard(true)} style={{
              width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 9, cursor: 'pointer',
              border: 'none', background: SAGE, color: '#fff', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" />
              </svg>
              <span>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>{t('trailWizardCta')}</span>
                <span style={{ display: 'block', fontSize: 10.5, opacity: 0.85, marginTop: 2, fontFamily: 'var(--font-sans)' }}>{t('trailWizardCtaHint')}</span>
              </span>
            </button>
            <div style={{
              padding: '12px 14px', borderRadius: 9, border: '1px dashed var(--color-border)',
              fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.55, marginBottom: 16,
              display: 'flex', gap: 9, alignItems: 'flex-start',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SAGE} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              <span>{t('trailEmptyHandHint')}</span>
            </div>
            {templates?.length > 0 && (
              <>
                {sectionLabel(t('trailTemplatesTitle'))}
                <div style={{ marginTop: 7 }}>
                  {templates.map(tpl => (
                    <button key={tpl.slug} onClick={() => loadTemplate(tpl)} disabled={!!templateLoading} style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                      padding: '9px 2px', background: 'none', border: 'none', borderBottom: '1px solid rgba(28,26,23,0.06)',
                      cursor: 'pointer',
                    }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 13, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.title}</span>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--color-muted)', marginTop: 1 }}>
                          {[tpl.region, tpl.stop_count ? t('trailStopsCount', { count: tpl.stop_count }) : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {templateLoading === tpl.slug
                        ? <span className="map-spinner" />
                        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Wizard ── */}
        {stops.length === 0 && showWizard && (
          <TrailWizard
            onSeed={(newStops, tripName) => {
              setShowWizard(false)
              seedStops(newStops, { name: tripName })
            }}
            onClose={() => setShowWizard(false)}
          />
        )}

        {/* ── Stops ── */}
        {stops.length > 0 && (
          <div style={{ padding: '10px 15px 6px' }}>
            {dayGroups.map(group => (
              <div key={group.day ?? 'all'}>
                {group.day != null && dayGroups.length > 1 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 4px',
                  }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: SAGE, fontFamily: 'var(--font-sans)' }}>
                      {t('trailDayLabel', { day: group.day })}
                    </span>
                    <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  </div>
                )}
                {group.stops.map((s, gi) => {
                  const i = group.startIndex + gi
                  return (
                    <div key={s.id}>
                      {gi > 0 && <LegChip leg={route.legs[i - 1]} approx={route.approx} t={t} />}
                      <StopRow
                        stop={s}
                        index={i}
                        count={stops.length}
                        onRemove={() => removeStop(s.id)}
                        onMoveUp={() => reorderStops(i, i - 1)}
                        onMoveDown={() => reorderStops(i, i + 1)}
                        onSelect={() => onSelectListing?.(s)}
                      />
                    </div>
                  )
                })}
              </div>
            ))}

            {lastRemoved && (
              <button onClick={undoRemove} style={{
                width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '7px 10px', borderRadius: 7,
                border: '1px dashed var(--color-border)', background: 'transparent', cursor: 'pointer',
                fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', textAlign: 'left',
              }}>
                ↩ {t('trailUndoRemove', { name: lastRemoved.stop.name })}
              </button>
            )}
            {atCapacity && (
              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--color-accent)', lineHeight: 1.5 }}>
                {t('trailAtCapacity')}
              </div>
            )}

            {/* Structure actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
              {optimiseSavingsKm > 0 && (
                <button onClick={optimiseOrder} style={{
                  padding: '6px 12px', borderRadius: 15, border: `1px solid ${SAGE}`, cursor: 'pointer',
                  background: 'rgba(95,138,126,0.07)', color: SAGE, fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}>
                  {t('trailOptimise', { km: optimiseSavingsKm })}
                </button>
              )}
              {stops.length >= 4 && !daysAssigned && (
                <button onClick={splitIntoDays} style={{
                  padding: '6px 12px', borderRadius: 15, border: '1px solid var(--color-border)', cursor: 'pointer',
                  background: '#fff', color: 'var(--color-ink)', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}>
                  {t('trailSplitDays')}
                </button>
              )}
              {daysAssigned && (
                <button onClick={mergeDays} style={{
                  padding: '6px 12px', borderRadius: 15, border: '1px solid var(--color-border)', cursor: 'pointer',
                  background: '#fff', color: 'var(--color-muted)', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}>
                  {t('trailMergeDays')}
                </button>
              )}
              <button onClick={clearAll} style={{
                padding: '6px 12px', borderRadius: 15, border: 'none', cursor: 'pointer',
                background: 'transparent', color: 'var(--color-muted)', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
              }}>
                {t('trailStartOver')}
              </button>
            </div>
          </div>
        )}

        {/* ── Suggestions ── */}
        {stops.length > 0 && suggestions.length > 0 && (
          <div style={{ padding: '12px 15px 16px', borderTop: '1px solid var(--color-border)', marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              {sectionLabel(t('trailSuggestionsTitle'))}
              {taste && (
                <span style={{ fontSize: 9, color: SAGE, fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
                  {t('trailSuggestionsTasteNote')}
                </span>
              )}
            </div>
            <div style={{ marginTop: 4 }}>
              {suggestions.map(s => (
                <SuggestionRow
                  key={s.listing.id}
                  s={s}
                  onAdd={() => addStop(s.listing)}
                  onSelect={() => onSelectListing?.({ ...s.listing, latitude: s.listing.lat, longitude: s.listing.lng })}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Save bar ── */}
      {stops.length > 0 && (
        <div style={{ padding: '11px 15px 13px', borderTop: '1px solid var(--color-border)', flexShrink: 0, background: 'rgba(251,249,244,0.98)' }}>
          {saveError && (
            <div style={{ fontSize: 11, color: 'var(--color-accent)', marginBottom: 7 }}>{t('trailSaveError')}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={visibility}
              onChange={e => setVisibility(e.target.value)}
              aria-label={t('trailVisibility')}
              style={{
                padding: '9px 8px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff',
                fontSize: 11, color: INK, fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none', maxWidth: 128,
              }}
            >
              <option value="private">{t('trailVisPrivate')}</option>
              <option value="link">{t('trailVisLink')}</option>
              <option value="public">{t('trailVisPublic')}</option>
            </select>
            <button
              onClick={saveTrail}
              disabled={!canSave || saving}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                cursor: canSave && !saving ? 'pointer' : 'default',
                background: canSave ? INK : 'var(--color-border)',
                color: canSave ? 'var(--color-cream)' : 'var(--color-muted)',
                fontSize: 11.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {saving && <span style={{
                width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff',
                animation: 'map-spin 0.7s linear infinite',
              }} />}
              {saving ? t('trailSaving') : editingTrail ? t('trailSaveChanges') : t('trailSave')}
            </button>
          </div>
          {!canSave && (
            <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 6, lineHeight: 1.4 }}>
              {stops.length < 2 ? t('trailNeedTwoStops') : t('trailNeedName')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
