import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

function getAppOrigin(request: NextRequest): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      return new URL(appUrl).origin
    } catch {}
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0]?.trim()
    if (host) {
      const forwardedProto = request.headers.get('x-forwarded-proto')
      const protocol = forwardedProto?.split(',')[0]?.trim() || 'https'
      return `${protocol}://${host}`
    }
  }

  return new URL(request.url).origin
}

function getSafeNextPath(searchParams: URLSearchParams): string {
  const next = searchParams.get('next')
  if (!next || !next.startsWith('/')) {
    return '/dashboard'
  }
  return next
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const appOrigin = getAppOrigin(request)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const nextPath = getSafeNextPath(searchParams)

  if (!code && (!tokenHash || !type)) {
    return NextResponse.redirect(new URL('/login?error=missing_token', appOrigin))
  }

  const response = NextResponse.redirect(new URL(nextPath, appOrigin))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let error: Error | null = null

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code)
    error = result.error
  } else if (tokenHash && type) {
    const result = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    })
    error = result.error
  }

  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', appOrigin))
  }

  return response
}
