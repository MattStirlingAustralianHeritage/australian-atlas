// Shared role-promotion core. Used by both the service-to-service route
// (app/api/auth/promote-role) and the claim-grant helper (lib/claims/grantClaim).
//
// Behaviour: resolve a profile by auth user id (UUID) or email, optionally
// find-or-create the profile row, then additively promote its role and merge
// vendor_verticals. Additive only — never downgrades admin or vendor.
//
// Returns { ok, status, userId, role, vertical, error } so callers can map to
// an HTTP response or an internal error without duplicating logic.

import { getSupabaseAdmin } from '@/lib/supabase/clients'

const VALID_ROLES = ['user', 'vendor', 'council', 'admin']

export async function promoteRole({
  userId,
  email,
  role,
  vertical,
  councilId,
  createIfMissing = false,
  sb = null,
}) {
  const supabase = sb || getSupabaseAdmin()

  if (!userId && !email) return { ok: false, status: 400, error: 'Missing userId or email' }
  if (!role) return { ok: false, status: 400, error: 'Missing role' }
  if (!VALID_ROLES.includes(role)) {
    return { ok: false, status: 400, error: `Invalid role. Must be: ${VALID_ROLES.join(', ')}` }
  }

  // userId may itself be an email (legacy callers); normalise.
  const userIdIsEmail = typeof userId === 'string' && userId.includes('@')
  const normEmail = (email || (userIdIsEmail ? userId : null))?.toLowerCase().trim() || null
  let resolvedUserId = userIdIsEmail ? null : userId

  // ── Resolve profile: by id first, then by email ──
  let profile = null
  if (resolvedUserId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, role, vendor_verticals')
      .eq('id', resolvedUserId)
      .maybeSingle()
    profile = data
  }
  if (!profile && normEmail) {
    const { data } = await supabase
      .from('profiles')
      .select('id, role, vendor_verticals')
      .eq('email', normEmail)
      .maybeSingle()
    if (data) { profile = data; resolvedUserId = data.id }
  }

  // ── Find-or-create ──
  if (!profile) {
    // Can only create a profile when we know the auth user id (profiles.id ==
    // auth.users.id). Without it (email-only, user not provisioned) we cannot.
    if (!createIfMissing || !resolvedUserId) {
      return { ok: false, status: 404, error: 'Profile not found' }
    }
    const insertRow = { id: resolvedUserId, role: 'user', ...(normEmail ? { email: normEmail } : {}) }
    const { data: created, error: createErr } = await supabase
      .from('profiles')
      .insert(insertRow)
      .select('id, role, vendor_verticals')
      .single()
    if (createErr) {
      // Likely a race with the signup trigger that auto-creates profiles — re-fetch.
      const { data: refetch } = await supabase
        .from('profiles')
        .select('id, role, vendor_verticals')
        .eq('id', resolvedUserId)
        .maybeSingle()
      if (!refetch) return { ok: false, status: 500, error: `Failed to create profile: ${createErr.message}` }
      profile = refetch
    } else {
      profile = created
    }
  }

  // ── Downgrade guards (additive only) ──
  if (profile.role === 'admin' && role !== 'admin') {
    return { ok: false, status: 403, error: 'Cannot downgrade admin role via this endpoint' }
  }
  if (profile.role === 'vendor' && role === 'user') {
    return { ok: false, status: 403, error: 'Cannot downgrade vendor to user. Use demote endpoint instead.' }
  }

  // ── Build + apply update ──
  const update = { role, updated_at: new Date().toISOString() }
  if (role === 'vendor' && vertical) {
    update.vendor_verticals = { ...(profile.vendor_verticals || {}), [vertical]: true }
  }
  if (role === 'council' && councilId) {
    update.council_id = councilId
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', resolvedUserId)

  if (updateError) {
    return { ok: false, status: 500, error: `Failed to update profile: ${updateError.message}` }
  }

  return { ok: true, status: 200, userId: resolvedUserId, role, vertical: vertical || null }
}
