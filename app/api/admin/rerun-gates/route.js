import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { rerunGates } from '@/lib/prospector/pipeline'

/**
 * POST /api/admin/rerun-gates
 *
 * Re-run all quality gates on currently queued unreviewed candidates.
 * Candidates that fail are moved to candidates_disqualified (or
 * candidates_wrong_vertical). Returns an audit summary.
 *
 * Auth: admin cookie
 */

export const maxDuration = 300 // 5 minutes

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const startTime = Date.now()

  // Fetch all pending/reviewing candidates
  const { data: candidates, error: fetchError } = await sb
    .from('listing_candidates')
    .select('*')
    .in('status', ['pending', 'reviewing'])
    .order('created_at', { ascending: true })

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 })
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No pending candidates to re-run',
      total: 0,
      passed: 0,
      removed: 0,
      removedByGate: {},
      details: [],
    })
  }

  const results = []
  let passed = 0
  let removed = 0
  const removedByGate = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }

  for (const candidate of candidates) {
    try {
      const result = await rerunGates(candidate, sb)

      if (result.passed) {
        passed++

        // Update gate_results and recalculated score on the candidate
        const { score, scoreBreakdown, gateResults } = result
        const gateResultsSummary = {
          score,
          breakdown: scoreBreakdown,
          gates: {},
          rerunAt: new Date().toISOString(),
        }

        for (const [key, gateResult] of Object.entries(gateResults)) {
          gateResultsSummary.gates[key] = {
            name: gateResult.name,
            pass: gateResult.pass,
            details: gateResult.details || {},
          }
          if (key === 'gate1' && gateResult.details?.urlChecked) {
            gateResultsSummary.gates[key].url = gateResult.details.urlChecked
          }
          if (key === 'gate2' && gateResult.details?.placeName) {
            gateResultsSummary.gates[key].placeName = gateResult.details.placeName
            gateResultsSummary.gates[key].geocodeConfidence = gateResult.details.geocodeConfidence
          }
          if (key === 'gate3') {
            gateResultsSummary.gates[key].signalCount = gateResult.details?.signalCount || 0
            gateResultsSummary.gates[key].signals = (gateResult.details?.signals || []).map(s => s.detail)
          }
          if (key === 'gate4') {
            gateResultsSummary.gates[key].confidence = gateResult.details?.confidence || null
            gateResultsSummary.gates[key].justification = gateResult.details?.justification || null
          }
        }

        await sb
          .from('listing_candidates')
          .update({
            confidence: score / 100,
            gate_results: gateResultsSummary,
          })
          .eq('id', candidate.id)

        results.push({
          id: candidate.id,
          name: candidate.name,
          vertical: candidate.vertical,
          outcome: 'passed',
          score,
        })
      } else {
        removed++
        removedByGate[result.failedGate] = (removedByGate[result.failedGate] || 0) + 1

        // Write to candidates_disqualified
        await sb.from('candidates_disqualified').insert({
          name: candidate.name,
          vertical: candidate.vertical || null,
          region: candidate.region || null,
          gate_failed: result.failedGate,
          reason: result.failReason,
          data_at_failure: {
            candidateId: candidate.id,
            rerunAt: new Date().toISOString(),
            ...(result.gateResults?.[`gate${result.failedGate}`]?.details || {}),
          },
        })

        // Write wrong-vertical if applicable
        if (result.wrongVertical) {
          await sb.from('candidates_wrong_vertical').insert(result.wrongVertical)
        }

        // Remove from the review queue
        await sb
          .from('listing_candidates')
          .update({
            status: 'rejected',
            reviewed_at: new Date().toISOString(),
            gate_results: {
              disqualified: true,
              gate_failed: result.failedGate,
              reason: result.failReason,
              rerunAt: new Date().toISOString(),
            },
          })
          .eq('id', candidate.id)

        results.push({
          id: candidate.id,
          name: candidate.name,
          vertical: candidate.vertical,
          outcome: 'removed',
          failedGate: result.failedGate,
          reason: result.failReason,
        })
      }
    } catch (err) {
      console.error(`[rerun-gates] Error processing "${candidate.name}":`, err.message)
      results.push({
        id: candidate.id,
        name: candidate.name,
        vertical: candidate.vertical,
        outcome: 'error',
        error: err.message,
      })
    }

    // Rate limit between candidates
    await new Promise(r => setTimeout(r, 1000))
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  const gateNames = ['Deduplication', 'Web Presence', 'Address/Region', 'Business Activity', 'Vertical Fit']
  const removedSummary = {}
  for (const [gate, count] of Object.entries(removedByGate)) {
    if (count > 0) {
      removedSummary[`Gate ${gate} (${gateNames[gate]})`] = count
    }
  }

  return NextResponse.json({
    success: true,
    duration_seconds: parseFloat(duration),
    total: candidates.length,
    passed,
    removed,
    removedByGate: removedSummary,
    details: results,
  })
}
