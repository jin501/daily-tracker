import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, sessionToken } from './lib/auth';

export async function middleware(req: NextRequest) {
  const token = await sessionToken();
  if (!token) {
    // No password configured: fine for local dev, locked in production.
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    return new NextResponse('Set APP_PASSWORD to use this app.', { status: 500 });
  }
  if (req.cookies.get(COOKIE)?.value === token) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Log in first' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api/login|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
};
