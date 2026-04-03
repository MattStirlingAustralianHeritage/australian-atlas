import { NextResponse } from 'next/server'

export async function GET(request) {
  const response = NextResponse.redirect(new URL('/admin/login', request.url))
  response.cookies.delete('atlas_admin')
  response.cookies.delete('admin_auth') // clear legacy cookie too
  return response
}
