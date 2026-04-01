import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import OpenAI from 'openai'

export const maxDuration = 60 // Allow up to 60s on Vercel

const BATCH_SIZE = 50 // Listings per run
const EMBEDDING_MODEL = 'text-embedding-3-small' // 1536 dimensions

function buildEmbeddingText(listing) {
  return [
    listing.name,
    listing.description,
    listing.region,
    listing.state,
    listing.address,
    listing.vertical,
  ].filter(Boolean).join(' ')
}

export async function GET(request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      error: 'OPENAI_API_KEY not configured. Add it to environment variables.',
    }, { status: 500 })
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const sb = getSupabaseAdmin()

  try {
    // Fetch listings without embeddings
    const { data: listings, error: fetchError } = await sb
      .from('listings')
      .select('id, name, description, region, state, address, vertical')
      .eq('status', 'active')
      .is('embedding', null)
      .limit(BATCH_SIZE)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json({
        message: 'All listings have embeddings',
        remaining: 0,
      })
    }

    // Generate embeddings in batch
    const texts = listings.map(buildEmbeddingText)
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    })

    // Update each listing with its embedding
    let success = 0
    let errors = 0

    for (let i = 0; i < listings.length; i++) {
      const embedding = embeddingResponse.data[i].embedding
      const { error: updateError } = await sb
        .from('listings')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', listings[i].id)

      if (updateError) {
        errors++
        if (errors <= 3) console.error(`Embedding update error for ${listings[i].name}:`, updateError.message)
      } else {
        success++
      }
    }

    // Check remaining
    const { count: remaining } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('embedding', null)

    return NextResponse.json({
      message: `Generated ${success} embeddings (${errors} errors)`,
      processed: success,
      errors,
      remaining: remaining || 0,
      total_tokens: embeddingResponse.usage?.total_tokens || 0,
    })
  } catch (err) {
    console.error('[embeddings] Fatal error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
