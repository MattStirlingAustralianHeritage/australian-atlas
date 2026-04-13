'use client'

import { useState } from 'react'
import AuditActions from './AuditActions'

const SEVERITY_STYLES = {
  red: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  amber: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  grey: { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
}

const FILTER_LABELS = {
  all: 'All',
  website: 'Website Issues',
  independence: 'Independence Concerns',
  duplicates: 'Duplicates',
  geocoding: 'Geocoding',
  data_quality: 'Data Quality',
}

export default function AuditFilters({ items, filterCounts, vertNames, vertColors }) {
  const [activeFilter, setActiveFilter] = useState('all')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [vertFilter, setVertFilter] = useState('all')

  function toggleExpanded(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Filter by category
  const categoryFiltered = activeFilter === 'all'
    ? items
    : items.filter(item => item.reasons.some(r => r.category === activeFilter))

  // Filter by vertical
  const filtered = vertFilter === 'all'
    ? categoryFiltered
    : categoryFiltered.filter(item => item.vertical === vertFilter)

  // Unique verticals for secondary filter
  const verticals = [...new Set(items.map(i => i.vertical))].sort()

  return (
    <>
      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(FILTER_LABELS).map(([key, label]) => {
          const count = filterCounts[key] ?? 0
          const isActive = activeFilter === key
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              style={{
                padding: '6px 14px',
                borderRadius: 100,
                border: isActive ? '1px solid var(--color-ink, #222)' : '1px solid var(--color-border, #e5e5e5)',
                background: isActive ? 'var(--color-ink, #222)' : '#fff',
                color: isActive ? '#fff' : 'var(--color-ink, #222)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Vertical sub-filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setVertFilter('all')}
          style={{
            padding: '4px 10px',
            borderRadius: 100,
            border: vertFilter === 'all' ? '1px solid #8a7a5a' : '1px solid var(--color-border, #e5e5e5)',
            background: vertFilter === 'all' ? '#8a7a5a' : '#fff',
            color: vertFilter === 'all' ? '#fff' : 'var(--color-muted, #888)',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          All verticals
        </button>
        {verticals.map(v => {
          const isActive = vertFilter === v
          const color = vertColors[v] || '#888'
          return (
            <button
              key={v}
              onClick={() => setVertFilter(v)}
              style={{
                padding: '4px 10px',
                borderRadius: 100,
                border: `1px solid ${isActive ? color : 'var(--color-border, #e5e5e5)'}`,
                background: isActive ? color : '#fff',
                color: isActive ? '#fff' : color,
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {vertNames[v] || v}
            </button>
          )
        })}
      </div>

      {/* Result count */}
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        color: 'var(--color-muted)',
        margin: '0 0 12px',
      }}>
        Showing {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
        {activeFilter !== 'all' && ` with ${FILTER_LABELS[activeFilter].toLowerCase()}`}
        {vertFilter !== 'all' && ` in ${vertNames[vertFilter] || vertFilter}`}
      </p>

      {/* Listing cards */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 0',
          border: '1px dashed var(--color-border, #e5e5e5)',
          borderRadius: 8,
        }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
            No listings match this filter.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(item => {
            const reasons = item.reasons || []
            const isExpanded = expandedIds.has(item.id)
            const primaryReason = reasons[0]
            const extraCount = reasons.length - 1
            const vertColor = vertColors[item.vertical] || '#888'

            return (
              <div
                key={item.id}
                style={{
                  padding: '16px 20px',
                  borderRadius: 8,
                  border: `1px solid ${primaryReason ? (SEVERITY_STYLES[primaryReason.severity]?.border || '#e5e5e5') : '#e5e5e5'}`,
                  background: '#fff',
                }}
              >
                {/* Top row: vertical badge + name + region */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 100,
                    background: vertColor + '18',
                    color: vertColor,
                    border: `1px solid ${vertColor}30`,
                    whiteSpace: 'nowrap',
                  }}>
                    {vertNames[item.vertical] || item.vertical}
                  </span>
                  {item.sub_type && (
                    <span style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-body)',
                      color: 'var(--color-muted)',
                      textTransform: 'capitalize',
                    }}>
                      {item.sub_type.replace(/_/g, ' ')}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-body)',
                    color: 'var(--color-muted)',
                    marginLeft: 'auto',
                  }}>
                    {[item.region, item.state].filter(Boolean).join(', ')}
                  </span>
                </div>

                {/* Listing name */}
                <h3 style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: 16,
                  color: 'var(--color-ink)',
                  margin: '0 0 8px',
                }}>
                  {item.name}
                </h3>

                {/* Reason tags — between name and website */}
                <div style={{ marginBottom: 10 }}>
                  {/* Primary reason always shown */}
                  {primaryReason && (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap',
                    }}>
                      <ReasonTag reason={primaryReason} />

                      {/* +N more toggle */}
                      {extraCount > 0 && !isExpanded && (
                        <button
                          onClick={() => toggleExpanded(item.id)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 100,
                            border: '1px solid var(--color-border, #e5e5e5)',
                            background: '#fff',
                            color: 'var(--color-muted)',
                            fontFamily: 'var(--font-body)',
                            fontSize: 11,
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          +{extraCount} more
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expanded reasons */}
                  {isExpanded && extraCount > 0 && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginTop: 6,
                    }}>
                      {reasons.slice(1).map((r, i) => (
                        <ReasonTag key={i} reason={r} />
                      ))}
                      <button
                        onClick={() => toggleExpanded(item.id)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 100,
                          border: '1px solid var(--color-border, #e5e5e5)',
                          background: '#fff',
                          color: 'var(--color-muted)',
                          fontFamily: 'var(--font-body)',
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        show less
                      </button>
                    </div>
                  )}
                </div>

                {/* Website + address row */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {item.website && (
                      <a
                        href={item.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 12,
                          color: '#6b7280',
                          textDecoration: 'underline',
                          textUnderlineOffset: 2,
                          wordBreak: 'break-all',
                        }}
                      >
                        {item.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      </a>
                    )}
                    {item.address && (
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        color: 'var(--color-muted)',
                      }}>
                        {item.address}
                      </span>
                    )}
                  </div>

                  <AuditActions listingId={item.id} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}


function ReasonTag({ reason }) {
  const style = SEVERITY_STYLES[reason.severity] || SEVERITY_STYLES.grey
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 100,
      fontSize: 11,
      fontWeight: 500,
      fontFamily: 'var(--font-body)',
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.border}`,
      lineHeight: 1.4,
    }}>
      {reason.severity === 'red' && (
        <span style={{ marginRight: 4 }}>!</span>
      )}
      {reason.text}
    </span>
  )
}
