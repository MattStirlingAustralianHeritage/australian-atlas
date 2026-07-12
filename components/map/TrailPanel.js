'use client'
// ============================================================
// TrailPanel — the trail under construction, living ON the map.
//
// Desktop: right-hand rail. Mobile: full-height sheet (mode='sheet').
//
// The panel reads as an itinerary, not a form: the trail's name
// is the headline, the stops are a drawn route (TrailTimeline)
// with drag-to-reorder, concierge moments appear inline on the
// line as dashed ghost stops, and everything secondary — more
// ideas, structure actions, visibility — stays quiet until the
// reader reaches for it.
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { getVerticalBrandColour } from '@/lib/verticalUrl'
import { groupStopsByDay } from '@/lib/trail/days'
import TrailWizard from './TrailWizard'
import TrailStopSearch from './TrailStopSearch'
import TrailTimeline from './TrailTimeline'

const SAGE = '#5f8a7e'
const GOLD = '#C4973B'
const INK = 'var(--color-ink)'

// Gold section-dateline kicker — the small-caps label that threads every
// Atlas surface. Mirrors globals.css .section-dateline.
function Kicker({ children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <span style={{ width: 22, height: 1, background: GOLD, opacity: 0.8, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: GOLD, fontFamily: 'var(--font-sans)' }}>
        {children}
      </span>
    </span>
  )
}

function fmtDuration(totalMin, t) {
  if (!totalMin) return null
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  if (h === 0) return t('trailMinutes', { count: m })
  return m === 0 ? t('trailHours', { count: h }) : t('trailHoursMinutes', { hours: h, minutes: m })
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <button onClick={onSelect} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 13, color: INK, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.listing.name}
        </span>
        <span style={{ display: 'block', fontSize: 9.5, color: s.reason === 'matchesTaste' ? SAGE : 'var(--color-muted)', marginTop: 1, fontWeight: s.reason === 'matchesTaste' ? 600 : 400 }}>
          {reasonLabel}
        </span>
      </button>
      <button onClick={onAdd} aria-label={`${t('trailAddStop')} — ${s.listing.name}`} style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        border: `1px solid ${SAGE}`, background: 'rgba(95,138,126,0.08)', color: SAGE,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  )
}

export default function TrailPanel({ trail, mode = 'panel', onClose, onSelectListing }) {
  const t = useTranslations('map')
  const locale = useLocale()
  const [showWizard, setShowWizard] = useState(false)
  const [templates, setTemplates] = useState(null)
  const [templateLoading, setTemplateLoading] = useState(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [ideasOpen, setIdeasOpen] = useState(false)
  const [dismissedGhosts, setDismissedGhosts] = useState(() => new Set())

  const {
    stops, name, setName, visibility, setVisibility, transportMode, setTransportMode,
    route, suggestions, concierge, addStop, removeStop, undoRemove, reorderStops,
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
  const dayCount = daysAssigned ? new Set(stops.map(s => s.day)).size : 0
  const duration = fmtDuration(route.totalMin, t)

  // Concierge moments → inline dashed ghost stops on the timeline.
  const ghosts = useMemo(() => {
    const kickers = { coffee: t('conciergeMorning'), lunch: t('conciergeMidday'), stay: t('conciergeNight') }
    const prompts = { coffee: t('conciergeCoffeePrompt'), lunch: t('conciergeLunchPrompt'), stay: t('conciergeStayPrompt') }
    return (concierge?.slots || [])
      .filter(s => !s.filled && s.candidate && !dismissedGhosts.has(s.role))
      .map(s => ({
        role: s.role,
        kicker: kickers[s.role],
        prompt: prompts[s.role],
        listing: s.candidate.listing,
        distanceKm: s.candidate.distanceKm,
        insertIndex: s.insertIndex ?? stops.length,
      }))
  }, [concierge, dismissedGhosts, stops.length, t])

  // The ideas list stays out of the ghosts' way: no duplicates.
  const ghostIds = useMemo(() => new Set(ghosts.map(g => String(g.listing.id))), [ghosts])
  const ideas = suggestions.filter(s => !ghostIds.has(String(s.listing.id)))
  const shownIdeas = ideasOpen ? ideas : ideas.slice(0, 3)

  const isSheet = mode === 'sheet'

  return (
    <div className="trail-panel-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── Header — the trail's own name is the masthead ── */}
      <div style={{ padding: isSheet ? '2px 18px 12px' : '14px 18px 12px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Kicker>{editingTrail ? t('trailKickerEditing') : t('trailKicker')}</Kicker>
          <button onClick={onClose} aria-label={t('trailClosePanel')} style={{
            width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--color-border)',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('trailTitlePlaceholder')}
          aria-label={t('trailTitlePlaceholder')}
          className="trail-title-input"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '4px 0 5px',
            border: 'none', borderBottom: '1px solid transparent',
            fontSize: 21, lineHeight: 1.15, letterSpacing: '-0.015em',
            fontFamily: 'var(--font-serif)', color: INK,
            outline: 'none', background: 'transparent', marginTop: 6,
          }}
        />
        {stops.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', letterSpacing: '0.01em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t('trailStopsCount', { count: stops.length })}
              {route.totalKm > 0 && <> · {route.approx ? '≈ ' : ''}{route.totalKm} km{duration ? ` · ${duration}` : ''}</>}
              {dayCount > 1 && <> · {t('trailDaysCount', { count: dayCount })}</>}
            </span>
            <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 999, overflow: 'hidden', flexShrink: 0 }}>
              {[{ key: 'drive', label: t('trailModeDrive') }, { key: 'walk', label: t('trailModeWalk') }].map(m => (
                <button key={m.key} onClick={() => setTransportMode(m.key === 'walk' ? 'transit' : 'drive')} style={{
                  padding: '3px 11px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
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
          <div style={{ margin: '12px 16px 0', padding: '11px 13px', background: 'rgba(95,138,126,0.09)', border: '1px solid rgba(95,138,126,0.3)', borderRadius: 9 }}>
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
          <div style={{ padding: '18px 18px 20px' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: INK, lineHeight: 1.35, marginBottom: 6 }}>
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
                <Kicker>{t('trailTemplatesTitle')}</Kicker>
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
                        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>}
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

        {/* ── The route ── */}
        {stops.length > 0 && (
          <div style={{ padding: '12px 16px 6px' }}>
            <TrailTimeline
              stops={stops}
              route={route}
              dayGroups={dayGroups}
              showDays={daysAssigned && dayGroups.length > 1}
              ghosts={ghosts}
              tailConnects={!atCapacity}
              onReorder={reorderStops}
              onRemove={removeStop}
              onSelect={onSelectListing}
              onGhostAdd={(listing, insertIndex) => addStop(listing, insertIndex)}
              onGhostDismiss={(role) => setDismissedGhosts(prev => new Set(prev).add(role))}
            />

            {/* Add a place — the next stop's slot, waiting */}
            {!atCapacity && (
              <div style={{ display: 'flex', alignItems: 'stretch', marginTop: -2 }}>
                <div style={{ width: 30, position: 'relative', flexShrink: 0, alignSelf: 'stretch', minHeight: 34 }}>
                  <span aria-hidden style={{
                    position: 'absolute', left: 14, width: 2, top: 0, bottom: '50%',
                    background: 'repeating-linear-gradient(180deg, rgba(90,74,56,0.28) 0 4px, transparent 4px 9px)',
                  }} />
                  <span style={{ position: 'absolute', left: 15, top: '50%', transform: 'translate(-50%, -50%)' }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', boxSizing: 'border-box', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      border: `1.5px dashed ${addOpen ? SAGE : 'rgba(90,74,56,0.4)'}`, background: 'var(--color-cream, #FBF9F4)',
                      color: addOpen ? SAGE : 'var(--color-muted)',
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </span>
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: '4px 0 4px 9px' }}>
                  {addOpen ? (
                    <TrailStopSearch
                      autoFocus
                      onAdd={(r) => { addStop(r); setAddOpen(false) }}
                      inTrailIds={new Set(stops.map(s => String(s.id)))}
                      atCapacity={atCapacity}
                    />
                  ) : (
                    <button onClick={() => setAddOpen(true)} style={{
                      background: 'none', border: 'none', padding: '5px 0', cursor: 'pointer',
                      fontSize: 11.5, color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', fontWeight: 500,
                    }}>
                      {t('trailAddPlace')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {lastRemoved && (
              <button onClick={undoRemove} style={{
                width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '7px 10px', borderRadius: 7,
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

            {/* Structure — quiet text actions, one line */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 14px', marginTop: 10, paddingTop: 9, borderTop: '1px solid rgba(28,26,23,0.06)' }}>
              {optimiseSavingsKm > 0 && (
                <button onClick={optimiseOrder} className="trail-textlink" style={{
                  padding: '4px 0', border: 'none', background: 'none', cursor: 'pointer',
                  color: SAGE, fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}>
                  {t('trailOptimise', { km: optimiseSavingsKm })}
                </button>
              )}
              {stops.length >= 4 && !daysAssigned && (
                <button onClick={splitIntoDays} className="trail-textlink" style={{
                  padding: '4px 0', border: 'none', background: 'none', cursor: 'pointer',
                  color: 'var(--color-ink)', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}>
                  {t('trailSplitDays')}
                </button>
              )}
              {daysAssigned && (
                <button onClick={mergeDays} className="trail-textlink" style={{
                  padding: '4px 0', border: 'none', background: 'none', cursor: 'pointer',
                  color: 'var(--color-muted)', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}>
                  {t('trailMergeDays')}
                </button>
              )}
              <button onClick={clearAll} className="trail-textlink" style={{
                padding: '4px 0', border: 'none', background: 'none', cursor: 'pointer',
                color: 'var(--color-muted)', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                marginLeft: 'auto',
              }}>
                {t('trailStartOver')}
              </button>
            </div>
          </div>
        )}

        {/* ── Worth a detour — capped, expandable ── */}
        {stops.length > 0 && ideas.length > 0 && (
          <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <Kicker>{t('trailSuggestionsTitle')}</Kicker>
              {taste && (
                <span style={{ fontSize: 9, color: SAGE, fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
                  {t('trailSuggestionsTasteNote')}
                </span>
              )}
            </div>
            <div style={{ marginTop: 4 }}>
              {shownIdeas.map(s => (
                <SuggestionRow
                  key={s.listing.id}
                  s={s}
                  onAdd={() => addStop(s.listing)}
                  onSelect={() => onSelectListing?.({ ...s.listing, latitude: s.listing.lat, longitude: s.listing.lng })}
                />
              ))}
            </div>
            {ideas.length > 3 && (
              <button onClick={() => setIdeasOpen(o => !o)} className="trail-textlink" style={{
                marginTop: 2, padding: '4px 0', border: 'none', background: 'none', cursor: 'pointer',
                color: 'var(--color-muted)', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
              }}>
                {ideasOpen ? t('trailIdeasLess') : t('trailIdeasMore', { count: ideas.length - 3 })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Save bar ── */}
      {stops.length > 0 && (
        <div style={{ padding: '10px 16px 13px', borderTop: '1px solid var(--color-border)', flexShrink: 0, background: 'rgba(251,249,244,0.98)' }}>
          {saveError && (
            <div style={{ fontSize: 11, color: 'var(--color-accent)', marginBottom: 7 }}>{t('trailSaveError')}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
              {t('trailVisibility')}
            </span>
            <div role="radiogroup" aria-label={t('trailVisibility')} style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 999, overflow: 'hidden' }}>
              {[
                { key: 'private', label: t('trailVisPrivate') },
                { key: 'link', label: t('trailVisLink') },
                { key: 'public', label: t('trailVisPublic') },
              ].map(v => (
                <button key={v.key} role="radio" aria-checked={visibility === v.key} onClick={() => setVisibility(v.key)} style={{
                  padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 9.5, fontWeight: 600,
                  fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                  background: visibility === v.key ? 'var(--color-ink)' : 'transparent',
                  color: visibility === v.key ? 'var(--color-cream)' : 'var(--color-muted)',
                  transition: 'all 0.15s',
                }}>{v.label}</button>
              ))}
            </div>
          </div>
          <button
            onClick={saveTrail}
            disabled={!canSave || saving}
            style={{
              width: '100%', padding: '11px 0', minHeight: 44, borderRadius: 8, border: 'none',
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
          {!canSave && (
            <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 6, lineHeight: 1.4 }}>
              {stops.length < 2 ? t('trailNeedTwoStops') : t('trailNeedName')}
            </div>
          )}
        </div>
      )}

      <style>{`
        /* The global 44px touch floor turns 26px coins into ovals — the panel
           owns its own control sizes (drag handles and inline marks are
           precision targets, the primary actions stay full-size below). */
        .trail-panel-root button { min-height: unset; }
        .trail-title-input::placeholder { color: rgba(28,26,23,0.32); }
        .trail-title-input:focus { border-bottom-color: rgba(95,138,126,0.5) !important; }
        .trail-stop-row .trail-remove { opacity: 0; transition: opacity 0.15s; }
        .trail-stop-row:hover .trail-remove, .trail-stop-row:focus-within .trail-remove { opacity: 1; }
        .trail-remove:hover { background: rgba(28,26,23,0.06); }
        .trail-coin:focus-visible { outline: 2px solid #5f8a7e; outline-offset: 2px; }
        .trail-textlink:hover { text-decoration: underline; }
        .trail-ghost-dismiss:hover { opacity: 1 !important; }
        @media (hover: none) {
          .trail-stop-row .trail-remove { opacity: 0.75; }
        }
      `}</style>
    </div>
  )
}
