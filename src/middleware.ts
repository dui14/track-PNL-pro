import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type MiddlewareAuthUser = { id: string }

type MiddlewareAuthResponse = {
  data: {
    user: MiddlewareAuthUser | null
  }
}

const PROTECTED_ROUTES = [
  '/dashboard',
  '/demo-trading',
  '/ai-assistant',
  '/exchange',
  '/profile',
  '/api/exchange',
  '/api/pnl',
  '/api/demo',
  '/api/ai',
  '/api/profile',
]

const PUBLIC_API_ROUTES = ['/api/exchange/debug/verify']

const AUTH_ROUTES = ['/login', '/register']
const DEFAULT_API_PROXY_TARGET_ORIGIN = 'https://api.duii.dev'

function normalizeHost(rawHost: string): string {
  const host = rawHost.trim().toLowerCase()

  if (host.endsWith(':80')) {
    return host.slice(0, -3)
  }

  if (host.endsWith(':443')) {
    return host.slice(0, -4)
  }

  return host
}

function resolveApiProxyTargetOrigin(): URL | null {
  const configuredTarget = process.env.API_PROXY_TARGET_ORIGIN?.trim()
  const fallbackTarget =
    process.env.VERCEL_ENV === 'production' ? DEFAULT_API_PROXY_TARGET_ORIGIN : ''
  const target = configuredTarget && configuredTarget.length > 0 ? configuredTarget : fallbackTarget

  if (!target) {
    return null
  }

  try {
    return new URL(target)
  } catch (error) {
    console.error('[middleware] invalid API_PROXY_TARGET_ORIGIN', error)
    return null
  }
}

function shouldProxyApiRequest(
  request: NextRequest,
  pathname: string,
  targetOrigin: URL
): boolean {
  if (!pathname.startsWith('/api/')) {
    return false
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = request.headers.get('host')
  const requestHost = normalizeHost(forwardedHost ?? host ?? '')

  if (!requestHost) {
    return false
  }

  const targetHost = normalizeHost(targetOrigin.host)

  return requestHost !== targetHost
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'))
}

async function getUserWithRetry(
  fetchUser: () => Promise<MiddlewareAuthResponse>,
  retries: number
): Promise<MiddlewareAuthUser | null> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await fetchUser()
      return result.data.user
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AUTH_FETCH_FAILED')
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const { pathname } = request.nextUrl
  const apiProxyTargetOrigin = resolveApiProxyTargetOrigin()

  if (apiProxyTargetOrigin && shouldProxyApiRequest(request, pathname, apiProxyTargetOrigin)) {
    const rewrittenUrl = request.nextUrl.clone()
    rewrittenUrl.protocol = apiProxyTargetOrigin.protocol
    rewrittenUrl.host = apiProxyTargetOrigin.host
    return NextResponse.rewrite(rewrittenUrl)
  }

  const isPublicApiRoute = PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route))
  const hasAuthCookie = hasSupabaseAuthCookie(request)

  const isApiRoute = pathname.startsWith('/api/')
  if (isApiRoute && request.method !== 'GET' && request.method !== 'HEAD') {
    const contentLength = request.headers.get('content-length')
    if (contentLength && Number(contentLength) > 1024 * 1024) {
      return NextResponse.json(
        { success: false, data: null, error: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      )
    }
  }

  if (isPublicApiRoute) {
    return response
  }

  if (!isProtected && !isAuthRoute) {
    return response
  }

  let user: { id: string } | null = null
  let authUnavailable = false

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    user = await getUserWithRetry(() => supabase.auth.getUser(), 1)
  } catch (error) {
    authUnavailable = true
    console.error('[middleware] auth check failed', error)
  }

  if (isProtected && !user && authUnavailable && hasAuthCookie) {
    return response
  }

  if (isProtected && !user && authUnavailable && isApiRoute) {
    return NextResponse.json(
      { success: false, data: null, error: 'AUTH_SERVICE_UNAVAILABLE' },
      { status: 503 }
    )
  }

  if (isProtected && !user && isApiRoute && !isPublicApiRoute) {
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  if (isProtected && !user && !isApiRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
