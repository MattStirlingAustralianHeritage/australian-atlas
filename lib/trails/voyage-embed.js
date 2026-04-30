/**
 * Embed a single text query (thesis + optional mood brief) using Voyage-3.
 * Returns a 1024-dim float array, or null on error.
 *
 * Mirrors the embedding pattern in lib/sync/syncEmbeddings.js but exposes a
 * single-text helper so the trail-pitch generator can embed a thesis once.
 */

const VOYAGE_MODEL = 'voyage-3'

export async function embedText(text) {
  if (!process.env.VOYAGE_API_KEY) {
    console.warn('[trails/embed] VOYAGE_API_KEY not configured — returning null')
    return null
  }
  if (!text || !text.trim()) return null

  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [text],
        model: VOYAGE_MODEL,
      }),
    })
    if (!res.ok) {
      console.warn('[trails/embed] voyage error', res.status, await res.text())
      return null
    }
    const data = await res.json()
    return data?.data?.[0]?.embedding ?? null
  } catch (e) {
    console.warn('[trails/embed] threw:', e.message)
    return null
  }
}
