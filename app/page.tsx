'use client';

import { useState, useEffect, useRef } from 'react';
import { Globe, Play, Square, RotateCcw, Lock } from 'lucide-react';
import Header from '@/components/Header';
import LogPanel from '@/components/LogPanel';
import ResultsTable from '@/components/ResultsTable';
import ScreenshotGallery from '@/components/ScreenshotGallery';
import type { LogEvent, AutomationOutput } from '@/types';

type RunState = 'idle' | 'running' | 'done' | 'error';

export default function HomePage() {
  const [url, setUrl]           = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [runState, setRunState] = useState<RunState>('idle');
  const [logs, setLogs]         = useState<LogEvent[]>([]);
  const [output, setOutput]     = useState<AutomationOutput | null>(null);
  const [shots, setShots]       = useState<string[]>([]);
  const readerRef               = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    const el = document.getElementById('log-body');
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  async function handleRun() {
    if (!url.trim() || runState === 'running') return;
    setRunState('running');
    setLogs([]);
    setOutput(null);
    setShots([]);

    try {
      const res = await fetch('/api/run-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: url.trim(),
          credentials: { email: email.trim(), password: password.trim() }
        }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const raw = chunk.replace(/^data: /, '').trim();
          if (!raw) continue;
          try {
            const event: LogEvent = JSON.parse(raw);
            if (event.type === 'screenshot' && event.file) setShots((p) => [...p, event.file!]);
            if (event.type === 'done' && event.result) {
              setOutput(event.result);
              setShots((p) => [...p, ...event.result!.screenshots.filter((s) => !p.includes(s))]);
              setRunState('done');
            } else if (event.type === 'error') setRunState('error');
            setLogs((p) => [...p, event]);
          } catch { /* non-JSON SSE chunk */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLogs((p) => [...p, { type: 'error', message: `💥 ${msg}`, timestamp: new Date().toISOString() }]);
      setRunState('error');
    }
  }

  function handleStop()  { readerRef.current?.cancel(); setRunState('idle'); }
  function handleReset() { setLogs([]); setOutput(null); setShots([]); setRunState('idle'); setUrl(''); setEmail(''); setPassword(''); }

  const isRunning = runState === 'running';
  const isDone    = runState === 'done';
  const isError   = runState === 'error';
  const hasLogs   = logs.length > 0 || isRunning;

  return (
    <>
      <Header />

      <main className="min-h-screen pt-8">
        <div className="mx-auto max-w-5xl px-6 pb-20">

          {/* ── Hero ────────────────────────────────────────────────── */}
          <section className="animate-fade-in-up py-14 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-cyan-400">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
              QA Automation — Selenium WebDriver
            </div>
            <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-slate-100 sm:text-5xl">
              Automated Web{' '}
              <span className="bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                QA Testing
              </span>
            </h1>
            <p className="mx-auto max-w-lg text-base leading-relaxed text-slate-400">
              Masukkan URL target — NexusAuto akan mendeteksi dan mengisi semua
              form, mengklik tombol, serta menangkap screenshot secara real-time.
            </p>
          </section>

          {/* ── URL Input Card ───────────────────────────────────────── */}
          <div
            className="animate-fade-in-up rounded-2xl border border-slate-700/40 bg-slate-900 p-6 shadow-xl"
            style={{ animationDelay: '0.1s', opacity: 0 }}
          >
            <div className="flex flex-wrap gap-3">
              {/* URL input */}
              <div className="relative min-w-[240px] flex-1">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                  <Globe size={15} />
                </span>
                <input
                  id="target-url"
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRun()}
                  disabled={isRunning}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-slate-700/50 bg-slate-950 py-3.5 pl-11 pr-4 font-mono text-[14px] text-slate-100 outline-none placeholder:text-slate-600 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <button
                    id="stop-btn"
                    onClick={handleStop}
                    className="flex items-center gap-2 rounded-lg border border-slate-700 bg-transparent px-5 py-3.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                  >
                    <Square size={13} />
                    Stop
                  </button>
                ) : (
                  <button
                    id="run-btn"
                    onClick={handleRun}
                    disabled={!url.trim()}
                    className="flex items-center gap-2 rounded-lg bg-linear-to-r from-indigo-600 to-indigo-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    <Play size={14} />
                    Run Test
                  </button>
                )}

                {(isDone || isError || logs.length > 0) && !isRunning && (
                  <button
                    id="reset-btn"
                    onClick={handleReset}
                    className="flex items-center gap-2 rounded-lg border border-slate-700 bg-transparent px-4 py-3.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                  >
                    <RotateCcw size={13} />
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* ── Advanced Options: Custom Credentials ── */}
            {!isRunning && !hasLogs && (
              <div className="mt-5 animate-fade-in-up border-t border-slate-800 pt-5 text-left" style={{ animationDelay: '0.15s', opacity: 0 }}>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Lock size={14} className="text-indigo-400" />
                  Custom Login Credentials <span className="text-[10px] font-normal text-slate-500">(Opsional)</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="email"
                    placeholder="Email Login"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-700/50 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
                  />
                  <input
                    type="password"
                    placeholder="Password Login"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-700/50 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
                  />
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  * Kredensial ini hanya akan disuntikkan ke sesi browser Selenium lokal (tidak disimpan di server manapun). Gunakan untuk test yang butuh akses login otomatis. Jika web pakai OAuth (seperti Google Login), automation akan berhenti sesaat (30 detik) agar kamu bisa login manual.
                </p>
              </div>
            )}

            {/* Status bar */}
            {runState !== 'idle' && (
              <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-4">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    isRunning ? 'animate-pulse-dot bg-cyan-400'
                    : isDone  ? 'bg-green-400'
                    : 'bg-red-400'
                  }`}
                />
                <span className="text-sm text-slate-400">
                  {isRunning && 'Automation sedang berjalan…'}
                  {isDone && `✅ Selesai! ${output?.summary.passed ?? 0} passed · ${output?.summary.failed ?? 0} failed · ${output?.summary.skipped ?? 0} skipped`}
                  {isError && '❌ Terjadi error saat automation.'}
                </span>
              </div>
            )}
          </div>

          {/* ── Feature chips (idle only) ────────────────────────────── */}
          {!hasLogs && (
            <div
              className="animate-fade-in-up mt-6 flex flex-wrap justify-center gap-2"
              style={{ animationDelay: '0.2s', opacity: 0 }}
            >
              {[
                '📝 Auto-fill all forms',
                '🖱️ Click all buttons',
                '📸 Capture screenshots',
                '📊 Detailed reports',
                '⚡ Real-time SSE logs',
              ].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-slate-700/50 bg-slate-900/60 px-4 py-1.5 text-xs text-slate-500 transition hover:border-indigo-500/30 hover:text-slate-300"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* ── Sections ─────────────────────────────────────────────── */}
          {hasLogs  && <div className="mt-6"><LogPanel logs={logs} isRunning={isRunning} /></div>}
          {output   && <div className="mt-6"><ResultsTable results={output.results} /></div>}
          {shots.length > 0 && <div className="mt-6"><ScreenshotGallery screenshots={shots} /></div>}

        </div>
      </main>
    </>
  );
}
