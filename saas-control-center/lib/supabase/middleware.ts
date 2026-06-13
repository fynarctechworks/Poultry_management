import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register');
  // /auth/callback runs the recovery/OAuth code exchange before a session cookie
  // exists, so it must pass through unauthenticated. The reset/forgot/locked
  // pages must also be reachable without a full session.
  const isPublicRoute =
    pathname.startsWith('/traceability/') ||
    pathname.startsWith('/auth/') ||
    pathname === '/' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/account-locked';
  const isChangePassword = pathname.startsWith('/change-password');

  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Seeded operators (and anyone flagged) must rotate their password before
  // doing anything else. The flag lives in admin-only app_metadata, so it
  // can't be cleared from the client — only the change-password server action.
  const mustChangePassword = user?.app_metadata?.force_password_change === true;
  if (user && mustChangePassword && !isChangePassword) {
    const url = request.nextUrl.clone();
    url.pathname = '/change-password';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    return NextResponse.redirect(url);
  }

  return response;
}
