'use client'

import { useState } from 'react'
import IntakeWizard from './IntakeWizard'
import BuildCanvas from './BuildCanvas'
import './engine.css'

/**
 * ItineraryEngine — the tent-pole planning surface. Two phases:
 *   intake  → gentle guided questions (where, how long, interests, pace)
 *   build   → the working canvas (discover · itinerary · map)
 *
 * This unifies what used to be scattered across the trail builder, the AI
 * itinerary generator, plan-a-stay, on-this-road and the day-trip builder.
 */
export default function ItineraryEngine({ regions, initial }) {
  const [phase, setPhase] = useState('intake')
  const [answers, setAnswers] = useState(null)

  return (
    <div className="ie-root">
      {phase === 'intake' ? (
        <IntakeWizard
          regions={regions}
          initial={initial}
          onComplete={(a) => {
            setAnswers(a)
            setPhase('build')
          }}
        />
      ) : (
        <BuildCanvas answers={answers} onEditTrip={() => setPhase('intake')} />
      )}
    </div>
  )
}
