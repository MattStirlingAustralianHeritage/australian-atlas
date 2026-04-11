'use client'

import { useState } from 'react'

const FAQS = [
  {
    q: 'How did my venue get listed?',
    a: 'Australian Atlas curates listings from public sources, government data, and community recommendations. We build the most comprehensive directory of independent Australian venues so visitors can discover places like yours.',
  },
  {
    q: "What's included in the free listing?",
    a: "Your free listing includes your venue name, location, type, and a pin on the map. You can verify ownership and update basic details. It's free forever with no credit card required.",
  },
  {
    q: "What's included in Standard?",
    a: 'Standard ($99/year) unlocks unlimited photos, opening hours, booking links, events, awards, special offers, analytics, priority search placement, and featured placement in regional guides and discovery trails.',
  },
  {
    q: 'How long does verification take?',
    a: "We review claims manually to ensure accuracy. Most claims are reviewed within 1-2 business days. You'll receive an email once your claim has been approved.",
  },
  {
    q: 'Can I update my listing immediately?',
    a: "Once your claim is approved, you'll have access to your venue dashboard where you can update your details, add photos, and manage your subscription.",
  },
  {
    q: 'Which Atlas directory is my venue on?',
    a: 'The Australian Atlas Network has nine specialist directories covering craft beverages, culture, accommodation, food producers, independent retail, and more. Your venue is listed on the directory that best matches your category.',
  },
  {
    q: 'Can I cancel my Standard subscription?',
    a: 'Yes. Cancel anytime from your dashboard. Your listing reverts to the free tier at the end of your billing period. No lock-in contracts.',
  },
]

export default function FaqAccordion() {
  const [open, setOpen] = useState(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {FAQS.map((faq, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: '100%', padding: '20px 0', background: 'none', border: 'none',
              cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', textAlign: 'left', gap: 16,
            }}
          >
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'var(--color-ink)' }}>
              {faq.q}
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--color-muted)', flexShrink: 0, transition: 'transform 0.2s', transform: open === i ? 'rotate(45deg)' : 'none' }}>
              +
            </span>
          </button>
          {open === i && (
            <div style={{ paddingBottom: 20 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.7, margin: 0 }}>
                {faq.a}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
