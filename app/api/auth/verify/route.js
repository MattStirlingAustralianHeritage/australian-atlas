import { NextResponse } from 'next/server'
import { verifySharedToken } from '@/lib/shared-auth'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: CORS_HEADERS })
}

export async function POST(request) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400, headers: CORS_HEADERS })
    }

    const result = await verifySharedToken(token)

    if (!result.valid) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: CORS_HEADERS })
    }

    return NextResponse.json({ user: result.user }, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
