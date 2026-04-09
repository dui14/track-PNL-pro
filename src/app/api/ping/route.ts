import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    data: {
      status: 'ok',
      message: 'pong',
      timestamp: new Date().toISOString(),
    },
    error: null,
  })
}

export async function HEAD(): Promise<Response> {
  return new Response(null, { status: 200 })
}
