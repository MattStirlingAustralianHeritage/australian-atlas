'use client'

export default function InsightReport({ insight }) {
  if (!insight) return null

  const generatedDate = insight.created_at
    ? new Date(insight.created_at).toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  // Split insight text into paragraphs on double newlines
  const text = insight.insight_text || insight.text || insight.content || ''
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)

  return (
    <div style={styles.panel}>
      <h2 style={styles.title}>The Shape of Independent Australia</h2>
      {generatedDate && (
        <p style={styles.date}>Generated {generatedDate}</p>
      )}
      <div style={styles.body}>
        {paragraphs.length > 0 ? (
          paragraphs.map((para, i) => (
            <p key={i} style={styles.paragraph}>{para}</p>
          ))
        ) : (
          <p style={styles.empty}>No insight text available.</p>
        )}
      </div>
    </div>
  )
}

const styles = {
  panel: {
    background: '#FBF8F3',
    border: '1px solid #E8E3DA',
    borderRadius: 12,
    padding: '2rem 2.5rem',
  },
  title: {
    fontFamily: 'var(--font-display, Georgia)',
    fontSize: '1.4rem',
    fontWeight: 600,
    fontStyle: 'italic',
    color: 'var(--color-ink, #2D2A26)',
    margin: '0 0 4px',
  },
  date: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 12,
    color: 'var(--color-muted, #888)',
    margin: '0 0 1.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  body: {
    maxWidth: 720,
  },
  paragraph: {
    fontFamily: 'var(--font-display, Georgia)',
    fontSize: 15,
    lineHeight: 1.75,
    color: 'var(--color-ink, #2D2A26)',
    margin: '0 0 1rem',
  },
  empty: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 13,
    color: 'var(--color-muted, #888)',
    fontStyle: 'italic',
  },
}
