/**
 * Snapshot a trail (with stops) into a JSON object suitable for storing in
 * trail_revisions.snapshot. Used on every save / state transition so the
 * editorial audit history is preserved.
 */

export async function snapshotTrail(sb, trail_id) {
  const { data: trail } = await sb.from('trails').select('*').eq('id', trail_id).single()
  if (!trail) return null
  const { data: stops } = await sb.from('trail_stops').select('*').eq('trail_id', trail_id).order('position', { ascending: true })
  return { trail, stops: stops || [] }
}

export async function writeRevision(sb, { trail_id, revised_by, notes }) {
  const snapshot = await snapshotTrail(sb, trail_id)
  if (!snapshot) return { error: { message: 'trail not found for snapshot' } }
  const { error } = await sb.from('trail_revisions').insert({
    trail_id, revised_by: revised_by ?? null, snapshot, notes: notes ?? null,
  })
  return { error }
}
