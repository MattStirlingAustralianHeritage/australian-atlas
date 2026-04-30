/**
 * Recompute and persist a trail's denormalised totals based on its stops:
 *   total_distance_km, total_duration_minutes, day_count, vertical_mix.
 *
 * Called on stop add / update / delete / reorder, and after promote-from-pitch.
 */

export async function recomputeTotals(sb, trail_id) {
  const { data: stops } = await sb.from('trail_stops')
    .select('id, day_number, vertical, distance_from_previous_km, duration_from_previous_minutes')
    .eq('trail_id', trail_id)
    .order('position', { ascending: true })

  const totalKm = (stops || []).reduce((s, x) => s + (Number(x.distance_from_previous_km) || 0), 0)
  const totalMin = (stops || []).reduce((s, x) => s + (Number(x.duration_from_previous_minutes) || 0), 0)
  const dayCount = (stops || []).reduce((m, x) => Math.max(m, x.day_number || 0), 0) || null
  const verticalMix = [...new Set((stops || []).map(s => s.vertical).filter(Boolean))]

  await sb.from('trails').update({
    total_distance_km: Math.round(totalKm * 100) / 100,
    total_duration_minutes: Math.round(totalMin),
    day_count: dayCount,
    vertical_mix: verticalMix,
    last_edited_at: new Date().toISOString(),
  }).eq('id', trail_id)
}
