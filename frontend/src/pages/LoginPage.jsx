import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { api } from '../utils/api';

export default function LoginPage() {
  const { actions } = useApp();
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.login(password);
      try { localStorage.setItem('airnotes_token', res.token); } catch {}
      actions.setAuth(true, res.demo_mode ?? false);
    } catch (err) {
      setError(err.message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-12 bg-ink-950">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[480px] h-[480px]
                        rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle,#4a3c2e,transparent 70%)' }}
        />
      </div>

      <div className="relative w-full max-w-xs animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-xl"
            style={{ background: '#1c1610', border: '1px solid #332a22' }}>
            <span className="text-3xl" role="img" aria-label="Books">📚</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-paper-100 mb-1">AirNotes</h1>
          <p className="text-ink-500 text-sm">Your Telegram-powered digital library</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl px-6 py-7 shadow-2xl space-y-4">
          <div>
            <label className="block text-ink-300 text-sm font-medium mb-2" htmlFor="pwd">
              Access Password
            </label>
            <input
              id="pwd"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-xl px-4 py-3 text-sm text-ink-100
                         placeholder-ink-700 focus:outline-none transition-all"
              style={{
                background: 'rgba(28,22,16,0.8)',
                border: '1px solid #332a22',
              }}
              onFocus={e => e.target.style.borderColor = '#634f38'}
              onBlur={e => e.target.style.borderColor = '#332a22'}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm rounded-lg px-3 py-2"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full btn-primary py-3 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-paper-100/30 border-t-paper-100 rounded-full animate-spin"/>
                  Signing in…
                </span>
              : 'Enter Library'
            }
          </button>

          <p className="text-center text-ink-700 text-xs pt-1">
            Default: <code className="text-ink-500 bg-ink-900 px-1.5 py-0.5 rounded">Airflix@2003</code>
          </p>
        </form>
      </div>
    </div>
  );
}
