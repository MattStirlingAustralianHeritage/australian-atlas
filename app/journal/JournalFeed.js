'use client'

import { useState, useMemo } from 'react'

const INITIAL_COUNT = 12
const LOAD_MORE_COUNT = 12

export default function JournalFeed({ articles, verticals, tags, verticalLabels, verticalColors }) {
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

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

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
    <div style={{ minHeight: '100vh', background: 'var(--color-cream, #F8F6F1)' }}>
      {/* Header */}
      <div className="px-4 sm:px-6 pt-20 pb-6 text-center max-w-3xl mx-auto">
        <p style={{
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'var(--color-sage, #7A8B6F)', marginBottom: 10,
          fontFamily: 'var(--font-body)', fontWeight: 600,
        }}>
          The Journal
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display, Georgia)', fontWeight: 400,
          fontSize: 'clamp(28px, 5vw, 42px)', color: 'var(--color-ink, #2D2A26)',
          margin: '0 0 8px', lineHeight: 1.15,
        }}>
          From the Network
        </h1>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontWeight: 300,
          fontSize: 15, color: 'var(--color-muted, #8B8578)',
          margin: 0, lineHeight: 1.5,
        }}>
          Stories, guides, and dispatches from across the Atlas.
        </p>
      </div>

      {/* Filter bar */}
      <div className="px-4 sm:px-6 max-w-7xl mx-auto">
        <div style={{
          background: '#fff', borderRadius: 12,
          border: '1px solid var(--color-border, #E5E0D8)',
          padding: '12px 16px', marginBottom: 24,
        }}>
          {/* Vertical toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--color-muted, #8B8578)', marginRight: 4, whiteSpace: 'nowrap',
            }}>
              Filter
            </span>
            {verticals.map(v => {
              const isActive = activeVerticals.has(v.key)
              return (
                <button
                  key={v.key}
                  onClick={() => toggleVertical(v.key)}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.03em',
                    padding: '4px 12px', borderRadius: 100,
                    border: isActive ? 'none' : '1px solid var(--color-border, #E5E0D8)',
                    background: isActive ? v.color : 'transparent',
                    color: isActive ? '#fff' : 'var(--color-muted, #8B8578)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {v.label}
                </button>
              )
            })}
            {activeVerticals.size > 0 && (
              <button
                onClick={() => { setActiveVerticals(new Set()); setVisibleCount(INITIAL_COUNT) }}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 10,
                  color: 'var(--color-muted)', background: 'none',
                  border: 'none', cursor: 'pointer', textDecoration: 'underline',
                  padding: '4px 6px',
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Tag filter (only show if tags exist) */}
          {tags.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
              marginTop: 10, paddingTop: 10,
              borderTop: '1px solid var(--color-border, #E5E0D8)',
            }}>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--color-muted, #8B8578)', marginRight: 4, whiteSpace: 'nowrap',
              }}>
                Tags
              </span>
              {tags.slice(0, 20).map(tag => (
                <button
                  key={tag}
                  onClick={() => selectTag(tag)}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
                    padding: '3px 10px', borderRadius: 100,
                    border: activeTag === tag ? 'none' : '1px solid var(--color-border, #E5E0D8)',
                    background: activeTag === tag ? 'var(--color-ink, #2D2A26)' : 'transparent',
                    color: activeTag === tag ? '#fff' : 'var(--color-muted, #8B8578)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Article grid */}
      <div className="px-4 sm:px-6 pb-20 max-w-7xl mx-auto">
        {visible.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            color: 'var(--color-muted, #8B8578)',
            fontFamily: 'var(--font-body)', fontSize: 14,
          }}>
            No articles match your filters.
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.5rem',
            }}>
              {visible.map(article => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  verticalLabels={verticalLabels}
                  verticalColors={verticalColors}
                />
              ))}
            </div>

            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 40 }}>
                <button
                  onClick={() => setVisibleCount(prev => prev + LOAD_MORE_COUNT)}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                    padding: '10px 28px', borderRadius: 8,
                    border: '1px solid var(--color-border, #E5E0D8)',
                    background: '#fff', color: 'var(--color-ink, #2D2A26)',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}

        {/* Article count */}
        <p style={{
          textAlign: 'center', marginTop: 24,
          fontFamily: 'var(--font-body)', fontSize: 11,
          color: 'var(--color-muted, #8B8578)',
        }}>
          {filtered.length} article{filtered.length !== 1 ? 's' : ''}
          {activeVerticals.size > 0 || activeTag ? ' (filtered)' : ''}
        </p>
      </div>
    </div>
  )
}

// ── Article Card ───────────────────────────────────────────

function ArticleCard({ article, verticalLabels, verticalColors }) {
  const color = verticalColors[article.vertical] || '#888'
  const label = verticalLabels[article.vertical] || article.vertical
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null

  return (
    <a
      href={article.canonical_url}
      className="group"
      style={{
        display: 'block', borderRadius: 12, overflow: 'hidden',
        background: '#fff', border: '1px solid var(--color-border, #E5E0D8)',
        textDecoration: 'none',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)'
        e.currentTarget.style.borderColor = color
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = 'var(--color-border, #E5E0D8)'
      }}
    >
      {/* Article card — hero image with gradient, or typographic fallback */}
      <div style={{
        position: 'relative', aspectRatio: '16/10', overflow: 'hidden',
        background: color, color: '#fff',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '1.25rem',
      }}>
        {article.hero_image_url ? (
          <>
            <img
              src={article.hero_image_url}
              alt=""
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
              }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
              pointerEvents: 'none',
            }} />
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '16px 16px', opacity: 0.08, pointerEvents: 'none' }} />
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 8,
            letterSpacing: '0.14em', textTransform: 'uppercase', opacity: article.hero_image_url ? 0.85 : 0.55,
          }}>
            {label}
          </span>
          <div style={{ width: 20, height: 1, background: '#fff', opacity: 0.35, margin: '8px 0' }} />
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400, margin: 0, lineHeight: 1.3 }}>
            {article.title}
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 18px 18px' }}>
        <h3 style={{
          fontFamily: 'var(--font-display, Georgia)', fontWeight: 400,
          fontSize: 17, lineHeight: 1.3, color: 'var(--color-ink, #2D2A26)',
          margin: '0 0 6px',
        }}>
          {article.title}
        </h3>

        {article.excerpt && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300,
            fontSize: 13, color: 'var(--color-muted, #8B8578)',
            lineHeight: 1.5, margin: '0 0 10px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {article.excerpt}
          </p>
        )}

        {/* Meta row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          {date && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 400,
              color: 'var(--color-muted, #8B8578)',
            }}>
              {date}
            </span>
          )}
          {article.author && date && (
            <span style={{ color: 'var(--color-border)', fontSize: 5 }}>&#9679;</span>
          )}
          {article.author && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 400,
              color: 'var(--color-muted, #8B8578)',
            }}>
              {article.author}
            </span>
          )}
        </div>
      </div>
    </a>
  )
}
