'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (res.ok) window.location.href = '/';
    else {
      setError((await res.json().catch(() => ({}))).error ?? 'Login failed');
      setBusy(false);
    }
  }

  return (
    <main className="page" style={{ minHeight: '100dvh', justifyContent: 'center', paddingBottom: 24 }}>
      <form onSubmit={submit} className="hero t-green">
        <h1 className="title">Daily</h1>
        <label htmlFor="pw" className="small ink2">Password</label>
        <input id="pw" type="password" className="textfield" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {error && <div className="error" role="alert">{error}</div>}
        <button type="submit" className="btn btn-dark" disabled={!pw || busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </main>
  );
}
