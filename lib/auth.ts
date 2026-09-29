export const COOKIE = 'tracker_session';

/** Deterministic session token derived from the password + secret (Web Crypto, works in middleware). */
export async function sessionToken(): Promise<string | null> {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return null;
  const data = new TextEncoder().encode(`${pw}:${process.env.SESSION_SECRET ?? ''}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
