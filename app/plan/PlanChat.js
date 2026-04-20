'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'

const VERTICAL_COLORS = {
  sba: '#C49A3C',
  collection: '#7A6B8A',
  craft: '#8B6F4E',
  fine_grounds: '#8A7055',
  rest: '#5B7B6F',
  field: '#5A7247',
  corner: '#6B7280',
  found: '#9B6B4A',
  table: '#A0522D',
}

const SUGGESTIONS = [
  'Plan a long weekend in the Barossa Valley with wine, food and a nice place to stay',
  'Where should I get coffee in Melbourne?',
  'I want a coastal road trip from Sydney — craft breweries, galleries, and nature',
  'What are the best distilleries in Tasmania?',
  'Plan a family-friendly day trip from Brisbane to the hinterland',
]

function MessageBubble({ message }) {
  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{
          maxWidth: '80%', padding: '12px 16px', borderRadius: '16px 16px 4px 16px',
          background: 'var(--color-ink, #1c1a17)', color: '#fff',
          fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.6,
        }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
      <div style={{
        maxWidth: '85%', padding: '14px 18px', borderRadius: '16px 16px 16px 4px',
        background: 'var(--color-cream, #f5f0e8)',
        border: '1px solid var(--color-border, #e8e0d4)',
        fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.7,
        color: 'var(--color-ink, #1c1a17)',
      }}>
        <AssistantContent text={message.content} />
      </div>
    </div>
  )
}

function InlineMarkdown({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

function AssistantContent({ text }) {
  const parts = text.split('\n').filter(Boolean)
  return parts.map((line, i) => {
    if (line.startsWith('## ')) {
      return <h3 key={i} style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 17, margin: '12px 0 6px', lineHeight: 1.3 }}>{line.slice(3)}</h3>
    }
    if (line.startsWith('- ')) {
      return <p key={i} style={{ margin: '3px 0', paddingLeft: 12, position: 'relative' }}>
        <span style={{ position: 'absolute', left: 0 }}>&bull;</span>
        <InlineMarkdown text={line.slice(2)} />
      </p>
    }
    return <p key={i} style={{ margin: '6px 0' }}><InlineMarkdown text={line} /></p>
  })
}

function VenuePin({ venue }) {
  return (
    <Link
      href={`/place/${venue.slug}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 6,
        border: '1px solid var(--color-border)',
        background: 'var(--color-card-bg, #fff)',
        textDecoration: 'none', fontSize: 12,
        fontFamily: 'var(--font-body)',
        color: 'var(--color-ink)',
        transition: 'border-color 0.2s',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: VERTICAL_COLORS[venue.vertical] || '#999',
        flexShrink: 0,
      }} />
      <span style={{ fontWeight: 500 }}>{venue.name}</span>
      {venue.region && <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{venue.region}</span>}
    </Link>
  )
}

function VenueList({ venues }) {
  if (!venues || venues.length === 0) return null
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6,
      marginBottom: 16, paddingLeft: 4,
    }}>
      {venues.map(v => <VenuePin key={v.id} venue={v} />)}
    </div>
  )
}

function MapPreview({ venues }) {
  if (!venues || venues.length === 0) return null
  const withCoords = venues.filter(v => v.lat && v.lng)
  if (withCoords.length === 0) return null

  const lats = withCoords.map(v => v.lat)
  const lngs = withCoords.map(v => v.lng)
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2

  const pins = withCoords.map(v => {
    const color = (VERTICAL_COLORS[v.vertical] || '#C49A3C').replace('#', '')
    return `pin-s+${color}(${v.lng},${v.lat})`
  }).join(',')

  const zoom = withCoords.length === 1 ? 12 : 'auto'
  const center = zoom === 'auto' ? 'auto' : `${centerLng},${centerLat},${zoom}`
  const token = typeof window !== 'undefined' ? window.__MAPBOX_TOKEN : ''

  if (!token) return null

  const url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${pins}/${center}/600x300@2x?access_token=${token}&padding=40`

  return (
    <div style={{
      marginBottom: 16, borderRadius: 8, overflow: 'hidden',
      border: '1px solid var(--color-border)',
    }}>
      <img
        src={url}
        alt="Map showing recommended venues"
        style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
      />
    </div>
  )
}

export default function PlanChat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [saveState, setSaveState] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
      window.__MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return

    const userMessage = { role: 'user', content: text.trim() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: data.error, venues: [],
        }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant', content: data.response, venues: data.venues || [],
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I couldn't connect right now. Please try again in a moment.",
        venues: [],
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [messages, loading])

  const handleSubmit = (e) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleSave = useCallback(async () => {
    if (messages.length < 2 || saveState === 'saving') return
    setSaveState('saving')
    try {
      const res = await fetch('/api/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      const data = await res.json()
      if (data.url) {
        setSaveState(data.url)
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(window.location.origin + data.url)
        }
      } else {
        setSaveState('error')
      }
    } catch {
      setSaveState('error')
    }
  }, [messages, saveState])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)',
      maxWidth: 720, margin: '0 auto', padding: '0 16px',
    }}>
      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 32, paddingBottom: 16 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '15vh' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(24px, 4vw, 36px)', color: 'var(--color-ink)',
              marginBottom: 8,
            }}>
              Plan your trip
            </h1>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15,
              color: 'var(--color-muted)', maxWidth: 420, margin: '0 auto 32px',
              lineHeight: 1.6,
            }}>
              Tell me where you want to go, what you like, and how long you have. I'll build you an itinerary from thousands of verified independent venues.
            </p>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              maxWidth: 480, margin: '0 auto',
            }}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  style={{
                    background: 'var(--color-card-bg, #fff)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8, padding: '10px 14px',
                    fontFamily: 'var(--font-body)', fontSize: 13,
                    color: 'var(--color-ink)', cursor: 'pointer',
                    textAlign: 'left', lineHeight: 1.4,
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onMouseEnter={e => e.target.style.borderColor = 'var(--color-accent, #C49A3C)'}
                  onMouseLeave={e => e.target.style.borderColor = 'var(--color-border)'}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i}>
                <MessageBubble message={m} />
                {m.role === 'assistant' && m.venues && m.venues.length > 0 && (
                  <>
                    <MapPreview venues={m.venues} />
                    <VenueList venues={m.venues} />
                  </>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
                <div style={{
                  padding: '14px 18px', borderRadius: '16px 16px 16px 4px',
                  background: 'var(--color-cream, #f5f0e8)',
                  border: '1px solid var(--color-border)',
                  fontFamily: 'var(--font-body)', fontSize: 14,
                  color: 'var(--color-muted)',
                }}>
                  <span className="plan-thinking">Thinking</span>
                  <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes planDots { 0%,20% { content: '.'; } 40% { content: '..'; } 60%,100% { content: '...'; } }
                    .plan-thinking::after { content: '...'; animation: planDots 1.2s infinite; }
                  `}} />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Save/share bar */}
      {messages.length >= 2 && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', padding: '8px 0',
          borderTop: '1px solid var(--color-border)',
        }}>
          <button
            onClick={handleSave}
            disabled={saveState === 'saving'}
            style={{
              padding: '6px 14px', borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--color-border)',
              fontFamily: 'var(--font-body)', fontSize: 12,
              color: 'var(--color-muted)', cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
          >
            {saveState === 'saving' ? 'Saving...'
              : typeof saveState === 'string' && saveState.startsWith('/') ? 'Link copied!'
              : saveState === 'error' ? 'Could not save'
              : 'Save & share'}
          </button>
        </div>
      )}

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex', gap: 8, padding: '12px 0 24px',
          borderTop: messages.length >= 2 ? 'none' : '1px solid var(--color-border)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Where would you like to go?"
          disabled={loading}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 8,
            border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-body)', fontSize: 14,
            color: 'var(--color-ink)',
            background: 'var(--color-card-bg, #fff)',
            outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--color-accent, #C49A3C)'}
          onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: '12px 20px', borderRadius: 8,
            background: loading || !input.trim() ? 'var(--color-border)' : 'var(--color-ink, #1c1a17)',
            color: '#fff', border: 'none',
            fontFamily: 'var(--font-body)', fontSize: 13,
            fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
