import { NextResponse } from 'next/server';
import { COOKIE, sessionToken } from '@/lib/auth';

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const token = await sessionToken();
  if (!token || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'That password is wrong.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}
