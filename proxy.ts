import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get('microbank_session')?.value;
  const { pathname } = request.nextUrl;

  const protectedRoutes = ['/dashboard', '/profile', '/savings', '/fixed-deposits'];
  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isProtected && !sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/profile/:path*', '/savings/:path*', '/fixed-deposits/:path*'],
};
