'use client'

import { useState } from 'react'

const FAQS = [
  {
    q: 'How did my venue get listed?',
    a: 'Australian Atlas curates listings from public sources, government data, and community recommendations. Every venue is chosen on merit by editorial curation — a place in the Atlas can’t be bought, and neither can your position in it.',
  },
  {
    q: 'Does paying improve my search ranking?',
    a: 'No. Ranking is never for sale — not to you, not to your competitor. Atlas results are ranked by relevance and editorial curation only. Standard makes your page deeper, better maintained and better measured; it never changes where you or anyone else appears in results.',
  },
  {
    q: "What's included in the free listing?",
    a: 'Verified ownership and the tools to keep your facts current — opening hours, contact details, and a closure flag if you shut up shop. Your venue keeps its pin on the map and appears in search and trails. Free forever, no credit card required.',
  },
  {
    q: "What's included in Standard?",
    a: 'Standard ($295/year) unlocks full listing editing with AI polish on your description; a moderated photo gallery of up to 15 images; up to 3 live events; current offers and awards on your page; venue Q&A; “right now” highlights and a hiring flag; up to 15 search keywords; one suggested day-trip trail; your own picks; Listing Insights analytics with peer benchmarks; the AI Visibility Report; the weekly “Your Atlas Week” digest; a share kit with a printable QR card and an embeddable Atlas card; your story written by the Atlas from a guided interview; Atlas Trade opt-in for group and tour buyers; and a referral code that rewards you for bringing in fellow independents.',
  },
  {
    q: 'What is the AI Visibility Report?',
    a: 'Analytics you won’t find anywhere else. The Atlas logs when AI crawlers — GPTBot, ClaudeBot, Perplexity — fetch your page, and when your page is pulled live into AI conversations. Your report shows how visible your venue is to the AI tools travellers increasingly plan with.',
  },
  {
    q: 'Do search keywords buy me a better position?',
    a: 'No. Keywords help the Atlas understand what you offer, so genuinely relevant searches can find you. They never move you above another venue — ordering stays relevance-based and editorial for everyone.',
  },
  {
    q: 'How long does verification take?',
    a: "We review claims manually to ensure accuracy. Most claims are reviewed within 1-2 business days. You'll receive an email once your claim has been approved.",
  },
  {
    q: 'Can I update my listing immediately?',
    a: "Once your claim is approved, you'll have access to your venue dashboard where you can keep your facts current, manage your subscription, and — on Standard — use the full set of tools.",
  },
  {
    q: 'Which Atlas directory is my venue on?',
    a: 'The Australian Atlas Network has ten specialist directories covering craft beverages, culture, accommodation, food producers, independent retail, and more. Your venue is listed on the directory that best matches your category.',
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
