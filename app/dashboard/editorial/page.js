'use client'

import { useAuth } from '../layout'
import { useState, useEffect } from 'react'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'
import PitchAStory from './PitchAStory'

const VERTICAL_COLORS = VERTICAL_ACCENTS

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas',
  collection: 'Culture Atlas',
  craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas',
  rest: 'Rest Atlas',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
  way: 'Way Atlas',
}

const SECTION_HEADING = {
  fontFamily: 'var(--font-sans)',
  fontSize: '0.8rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-muted)',
  margin: '0 0 0.75rem',
}

function ArticleCard({ article }) {
  const color = VERTICAL_COLORS[article.vertical] || 'var(--color-muted)'
  const label = VERTICAL_LABELS[article.vertical] || article.vertical

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    }}>
      {/* Vertical badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.7rem',
          fontWeight: 500,
          color: color,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {label}
        </span>
        {article.region && (
          <span style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.7rem',
            color: 'var(--color-muted)',
          }}>
            / {article.region}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '1.05rem',
        fontWeight: 600,
        color: 'var(--color-ink)',
        margin: 0,
      }}>
        {article.title}
      </h3>

      {/* Excerpt */}
      {article.excerpt && (
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.825rem',
          color: 'var(--color-muted)',
          margin: 0,
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {article.excerpt}
        </p>
      )}

      {/* Date */}
      {article.published_at && (
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.75rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          {new Date(article.published_at).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      )}
    </div>
  )
}

export default function DashboardEditorial() {
  const { listings } = useAuth()
  const [articles, setArticles] = useState([])
  const [regions, setRegions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/editorial')
      .then((r) => r.json())
      .then((data) => {
        setArticles(data.articles || [])
        setRegions(data.regions || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.75rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: '0 0 0.25rem',
        }}>
          Editorial
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Pitch a story to the Atlas Journal, and see where your venue has been mentioned
        </p>
      </div>

      {/* Pitch a story — the new headline action */}
      <PitchAStory listings={listings} />

      {/* Regions */}
      {regions.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={SECTION_HEADING}>Your Regions</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {regions.map((r, i) => (
              <span key={i} style={{
                display: 'inline-block',
                padding: '0.3rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                background: '#f3f4f6',
                color: 'var(--color-ink)',
              }}>
                {r.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Articles */}
      <div>
        <h2 style={SECTION_HEADING}>Journal Mentions</h2>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{
                background: '#fff',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                padding: '1.5rem',
              }}>
                <div style={{ width: '30%', height: '10px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '0.75rem' }} />
                <div style={{ width: '70%', height: '14px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '0.5rem' }} />
                <div style={{ width: '90%', height: '10px', background: 'var(--color-border)', borderRadius: '4px' }} />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '2.5rem 2rem',
            textAlign: 'center',
          }}>
            <p style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1rem',
              color: 'var(--color-ink)',
              margin: '0 0 0.375rem',
            }}>
              No editorial mentions yet
            </p>
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.825rem',
              color: 'var(--color-muted)',
              margin: 0,
            }}>
              When your venue is mentioned in Atlas journal articles or regional guides, those mentions will appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {articles.map((article, i) => (
              <ArticleCard key={article.id || i} article={article} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
