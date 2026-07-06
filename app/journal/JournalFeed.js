'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { dateLocale } from '@/lib/i18n/config'
import { VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'

const INITIAL_COUNT = 13 // lead + two secondary + ten grid rows
const LOAD_MORE_COUNT = 12

// ── Editorial front page — hierarchy from size, hairlines, and whitespace,
//    never card boxes. Lead story → two-up secondaries → ruled grid. ──

export default function JournalFeed({ articles, verticals, tags, verticalLabels, verticalColors }) {
  const t = useTranslations('journal')
  const locale = useLocale()
  const [activeVerticals, setActiveVerticals] = useState(new Set())
  const [activeTag, setActiveTag] = useState(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)

  // Filter articles
  const filtered = useMemo(() => {
    let result = articles
    if (activeVerticals.size > 0) {
      result = result.filter(a => {
        const verts = Array.isArray(a.verticals) && a.verticals.length > 0 ? a.verticals : [a.vertical]
        return verts.some(v => activeVerticals.has(v))
      })
    }
    if (activeTag) {
      result = result.filter(a => (a.tags || []).includes(activeTag))
    }
    return result
  }, [articles, activeVerticals, activeTag])

  const isFiltering = activeVerticals.size > 0 || activeTag !== null
  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  // Front-page hierarchy only on the unfiltered view; filters get a flat grid.
  const lead = !isFiltering ? visible[0] : null
  const secondary = !isFiltering ? visible.slice(1, 3) : []
  const grid = !isFiltering ? visible.slice(3) : visible

  function toggleVertical(key) {
    setActiveVerticals(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
    setVisibleCount(INITIAL_COUNT)
  }

  function selectTag(tag) {
    setActiveTag(prev => prev === tag ? null : tag)
    setVisibleCount(INITIAL_COUNT)
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Masthead — left-anchored like every other index page, gold dateline. */}
      <div className="px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="page-masthead max-w-2xl">
          <p className="section-dateline">{t('kicker')}</p>
          <h1 className="masthead-title">{t('title')}</h1>
          <p className="masthead-sub">{t('sub')}</p>
        </div>
      </div>

      {/* Filter row — quiet hairline band, no card chrome */}
      <div className="px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="jf-filters">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="jf-filter-label">{t('filter')}</span>
            {verticals.map(v => {
              const isActive = activeVerticals.has(v.key)
              return (
                <button
                  key={v.key}
                  onClick={() => toggleVertical(v.key)}
                  className="jf-pill"
                  style={{
                    border: isActive ? `1px solid ${v.color}` : '1px solid var(--color-border)',
                    background: isActive ? v.color : 'transparent',
                    color: isActive ? '#fff' : 'var(--color-muted)',
                  }}
                >
                  {v.label}
                </button>
              )
            })}
            {activeVerticals.size > 0 && (
              <button
                onClick={() => { setActiveVerticals(new Set()); setVisibleCount(INITIAL_COUNT) }}
                className="jf-clear"
              >
                {t('clear')}
              </button>
            )}
          </div>

          {tags.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              <span className="jf-filter-label">{t('tags')}</span>
              {tags.slice(0, 20).map(tag => (
                <button
                  key={tag}
                  onClick={() => selectTag(tag)}
                  className="jf-pill jf-pill-sm"
                  style={{
                    border: activeTag === tag ? '1px solid var(--color-ink)' : '1px solid var(--color-border)',
                    background: activeTag === tag ? 'var(--color-ink)' : 'transparent',
                    color: activeTag === tag ? '#fff' : 'var(--color-muted)',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Front page */}
      <div className="px-4 sm:px-6 pb-20 max-w-7xl mx-auto">
        {visible.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            color: 'var(--color-muted)',
            fontFamily: 'var(--font-body)', fontSize: 14,
          }}>
            {t('empty')}
          </div>
        ) : (
          <>
            {lead && (
              <LeadStory
                article={lead}
                verticalLabels={verticalLabels}
                verticalColors={verticalColors}
                locale={locale}
                featuredLabel={t('featured')}
              />
            )}

            {secondary.length > 0 && (
              <div className="jf-secondary">
                {secondary.map(article => (
                  <StoryCard
                    key={article.id}
                    article={article}
                    verticalLabels={verticalLabels}
                    verticalColors={verticalColors}
                    locale={locale}
                    size="lg"
                  />
                ))}
              </div>
            )}

            {grid.length > 0 && (
              <div className="jf-grid" style={{ borderTop: lead || secondary.length ? '1px solid var(--color-border)' : 'none' }}>
                {grid.map(article => (
                  <StoryCard
                    key={article.id}
                    article={article}
                    verticalLabels={verticalLabels}
                    verticalColors={verticalColors}
                    locale={locale}
                    size="sm"
                  />
                ))}
              </div>
            )}

            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 48 }}>
                <button onClick={() => setVisibleCount(prev => prev + LOAD_MORE_COUNT)} className="jf-more">
                  {t('loadMore')}
                </button>
              </div>
            )}
          </>
        )}

        {/* Article count — folio line */}
        <p style={{
          textAlign: 'center', marginTop: 28,
          fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: '0.08em',
          color: 'var(--color-muted)', fontVariantNumeric: 'oldstyle-nums',
        }}>
          {t('count', { count: filtered.length })}
          {isFiltering ? ` ${t('filteredSuffix')}` : ''}
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .jf-filters { border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border);
          padding: 14px 2px; margin-bottom: clamp(28px, 4vh, 44px); }
        .jf-filter-label { font-family: var(--font-body); font-size: 10px; font-weight: 700;
          letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-muted);
          margin-right: 6px; white-space: nowrap; }
        .jf-pill { font-family: var(--font-body); font-size: 11px; font-weight: 600; letter-spacing: 0.03em;
          padding: 4px 12px; border-radius: 999px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
        .jf-pill-sm { font-size: 10px; font-weight: 500; padding: 3px 10px; }
        .jf-clear { font-family: var(--font-body); font-size: 10px; color: var(--color-muted);
          background: none; border: none; cursor: pointer; text-decoration: underline; padding: 4px 6px; }
        .jf-more { font-family: var(--font-body); font-size: 12px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; padding: 12px 32px; border-radius: 999px;
          border: 1px solid var(--color-border); background: transparent; color: var(--color-ink);
          cursor: pointer; transition: border-color 0.15s; }
        .jf-more:hover { border-color: var(--color-ink); }

        /* Lead story — image beside a large type block, ruled off below */
        .jf-lead { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
          gap: clamp(20px, 3vw, 44px); align-items: center; text-decoration: none;
          padding-bottom: clamp(28px, 4vh, 44px); margin-bottom: clamp(28px, 4vh, 44px);
          border-bottom: 1px solid var(--color-border); }
        .jf-lead-title { font-family: var(--font-display); font-weight: 400;
          font-size: clamp(1.75rem, 2.8vw + 0.8rem, 3.1rem); line-height: 1.08; letter-spacing: -0.015em;
          color: var(--color-ink); margin: 12px 0 0; text-wrap: balance; }
        .jf-lead-excerpt { font-family: var(--font-display); font-style: italic; font-weight: 400;
          font-size: clamp(1.02rem, 0.4vw + 0.9rem, 1.18rem); line-height: 1.55;
          color: rgba(28, 26, 23, 0.7); margin: 14px 0 0; text-wrap: pretty;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        @media (max-width: 760px) { .jf-lead { grid-template-columns: 1fr; align-items: start; } }

        /* Secondary two-up — a single column rule between the pair */
        .jf-secondary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: clamp(22px, 2.4vw, 34px); row-gap: clamp(22px, 2.4vw, 34px);
          margin-bottom: clamp(28px, 4vh, 44px); }
        @media (min-width: 701px) {
          .jf-secondary > a:nth-child(2n) { border-left: 1px solid var(--color-border);
            padding-left: clamp(22px, 2.4vw, 34px); }
        }
        @media (max-width: 700px) { .jf-secondary { grid-template-columns: 1fr; } }

        /* Ruled grid — newspaper column rules between stories */
        .jf-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
          column-gap: clamp(22px, 2.4vw, 34px); row-gap: clamp(32px, 4vh, 46px);
          padding-top: clamp(28px, 4vh, 44px); }
        @media (min-width: 961px) {
          .jf-grid > a:not(:nth-child(3n+1)) { border-left: 1px solid var(--color-border);
            padding-left: clamp(22px, 2.4vw, 34px); }
        }
        @media (max-width: 960px) { .jf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 601px) and (max-width: 960px) {
          .jf-grid > a:nth-child(2n) { border-left: 1px solid var(--color-border);
            padding-left: clamp(22px, 2.4vw, 34px); }
        }
        @media (max-width: 600px) { .jf-grid { grid-template-columns: 1fr; } }

        /* Shared story anatomy */
        .jf-img { position: relative; aspect-ratio: 3/2; overflow: hidden; border-radius: 6px; }
        .jf-img img { width: 100%; height: 100%; object-fit: cover; display: block;
          transition: transform 0.45s ease; }
        a:hover .jf-img img { transform: scale(1.025); }
        .jf-img-fallback { position: absolute; inset: 0; display: flex; align-items: center;
          justify-content: center; }
        .jf-img-fallback span { font-family: var(--font-body); font-size: 10px; font-weight: 700;
          letter-spacing: 0.2em; text-transform: uppercase; color: rgba(250, 248, 244, 0.85); }
        .jf-kicker { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
          font-family: var(--font-body); font-size: 10px; font-weight: 700;
          letter-spacing: 0.16em; text-transform: uppercase; margin: 0; }
        .jf-kicker .jf-kicker-cat { color: var(--color-muted); font-weight: 500; }
        .jf-title { font-family: var(--font-display); font-weight: 400; color: var(--color-ink);
          margin: 10px 0 0; line-height: 1.22; letter-spacing: -0.005em; text-wrap: balance;
          transition: color 0.15s; }
        a:hover .jf-title { color: var(--color-accent); }
        .jf-excerpt { font-family: var(--font-body); font-weight: 300; font-size: 13px;
          color: var(--color-muted); line-height: 1.55; margin: 8px 0 0;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .jf-meta { font-family: var(--font-body); font-size: 11px; color: var(--color-muted);
          margin: 10px 0 0; font-variant-numeric: oldstyle-nums; }
      ` }} />
    </div>
  )
}

// ── Story imagery — photograph, or the vertical's dark typographic ground ──

function StoryImage({ article, verticalLabels }) {
  const token = VERTICAL_CARD_TOKENS[article.vertical] || VERTICAL_CARD_TOKENS.portal
  return (
    <div className="jf-img" style={{ background: token.bg }}>
      {article.hero_image_url ? (
        <img src={article.hero_image_url} alt="" loading="lazy" />
      ) : (
        <div className="jf-img-fallback">
          <span>{verticalLabels[article.vertical] || article.vertical}</span>
        </div>
      )}
    </div>
  )
}

function Kicker({ article, verticalLabels, verticalColors, featuredLabel }) {
  const color = verticalColors[article.vertical] || 'var(--color-gold)'
  const label = verticalLabels[article.vertical] || article.vertical
  return (
    <p className="jf-kicker">
      <span style={{ color }}>{label}</span>
      {featuredLabel && <span className="jf-kicker-cat">{featuredLabel}</span>}
      {!featuredLabel && article.category && <span className="jf-kicker-cat">{article.category}</span>}
    </p>
  )
}

function Meta({ article, locale }) {
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString(dateLocale(locale), {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null
  if (!date && !article.author) return null
  return (
    <p className="jf-meta">
      {[date, article.author].filter(Boolean).join(' · ')}
    </p>
  )
}

// ── Lead story — the front-page opener ─────────────────────

function LeadStory({ article, verticalLabels, verticalColors, locale, featuredLabel }) {
  return (
    <Link href={article.href} className="jf-lead">
      <StoryImage article={article} verticalLabels={verticalLabels} />
      <div>
        <Kicker article={article} verticalLabels={verticalLabels} verticalColors={verticalColors} featuredLabel={featuredLabel} />
        <h2 className="jf-lead-title">{article.title}</h2>
        {article.excerpt && <p className="jf-lead-excerpt">{article.excerpt}</p>}
        <Meta article={article} locale={locale} />
      </div>
    </Link>
  )
}

// ── Secondary and grid stories ─────────────────────────────

function StoryCard({ article, verticalLabels, verticalColors, locale, size }) {
  return (
    <Link href={article.href} style={{ display: 'block', textDecoration: 'none', minWidth: 0 }}>
      <StoryImage article={article} verticalLabels={verticalLabels} />
      <div style={{ paddingTop: 14 }}>
        <Kicker article={article} verticalLabels={verticalLabels} verticalColors={verticalColors} />
        <h3 className="jf-title" style={{ fontSize: size === 'lg' ? '1.45rem' : '1.15rem' }}>
          {article.title}
        </h3>
        {article.excerpt && size === 'lg' && <p className="jf-excerpt">{article.excerpt}</p>}
        <Meta article={article} locale={locale} />
      </div>
    </Link>
  )
}
