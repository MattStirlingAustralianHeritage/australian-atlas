import { createHash } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * Validate an API key and check rate limits.
 * Returns the key record if valid, null if invalid.
 * Sets rate_limited: true if quota exceeded.
 */
export async function validateApiKey(apiKey) {
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  const sb = getSupabaseAdmin()

  const { data: key } = await sb
    .from('api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .is('revoked_at', null)
    .single()

  if (!key) return null

  // Check if rate limit counter needs reset (daily)
  const resetAt = new Date(key.requests_reset_at)
  const now = new Date()
  if (now - resetAt > 24 * 60 * 60 * 1000) {
    // Reset counter
    await sb
      .from('api_keys')
      .update({ requests_today: 1, requests_reset_at: now.toISOString(), last_used_at: now.toISOString() })
      .eq('id', key.id)
    return { ...key, requests_today: 1, rate_limited: false }
  }

  // Check rate limit
  if (key.requests_today >= key.rate_limit) {
    return { ...key, rate_limited: true }
  }

  // Increment counter
  await sb
    .from('api_keys')
    .update({ requests_today: (key.requests_today || 0) + 1, last_used_at: now.toISOString() })
    .eq('id', key.id)

  return { ...key, requests_today: (key.requests_today || 0) + 1, rate_limited: false }
}

/**
 * Generate a new API key with prefix.
 * Returns { key, keyHash, keyPrefix }
 */
export function generateApiKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let random = ''
  for (let i = 0; i < 32; i++) {
    random += chars[Math.floor(Math.random() * chars.length)]
  }
  const key = `atlas_pk_${random}`
  const keyHash = createHash('sha256').update(key).digest('hex')
  const keyPrefix = key.substring(0, 16)
  return { key, keyHash, keyPrefix }
}

/**
 * Non-blocking API request log.
 */
export async function logApiRequest(apiKeyId, endpoint, method, statusCode, responseTimeMs) {
  try {
    const sb = getSupabaseAdmin()
    await sb.from('api_request_logs').insert({
      api_key_id: apiKeyId,
      endpoint,
      method,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
    })
  } catch {
    // Never fail the request due to logging
  }
}
