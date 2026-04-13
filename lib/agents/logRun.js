import { getSupabaseAdmin } from '../supabase/clients.js'

/**
 * Log an agent run to the agent_runs table.
 * Returns the created run ID.
 */
export async function startRun(agent) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('agent_runs')
    .insert({ agent, status: 'running' })
    .select('id')
    .single()
  return data?.id
}

export async function completeRun(runId, { status = 'success', summary = {}, error = null } = {}) {
  if (!runId) return
  const sb = getSupabaseAdmin()
  await sb
    .from('agent_runs')
    .update({ completed_at: new Date().toISOString(), status, summary, error })
    .eq('id', runId)
}
