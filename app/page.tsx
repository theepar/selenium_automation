'use client';

import { useState, useEffect, useRef } from 'react';
import { Globe, Play, Square, RotateCcw, Lock, Video, ChevronDown, ChevronUp } from 'lucide-react';
import LogPanel from '@/components/LogPanel';
import ResultsTable from '@/components/ResultsTable';
import ScreenshotGallery from '@/components/ScreenshotGallery';
import type { LogEvent, AutomationOutput } from '@/types';

type RunState = 'idle' | 'running' | 'done' | 'error';

export default function HomePage() {
  const [targetUrl, setTargetUrl]       = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [runState, setRunState]         = useState<RunState>('idle');
  const [logs, setLogs]                 = useState<LogEvent[]>([]);
  const [output, setOutput]             = useState<AutomationOutput | null>(null);
  const [screenshots, setScreenshots]   = useState<string[]>([]);
  const [recording, setRecording]       = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const streamReaderRef                 = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    const logContainer = document.getElementById('log-body');
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
  }, [logs]);

  async function handleRun() {
    if (!targetUrl.trim() || runState === 'running') return;
    setRunState('running');
    setLogs([]);
    setOutput(null);
    setScreenshots([]);
    setRecording(null);

    try {
      const response = await fetch('/api/run-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl.trim(),
          credentials: { email: email.trim(), password: password.trim() },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error ?? `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('No response stream received.');

      const reader = response.body.getReader();
      streamReaderRef.current = reader;
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
            if (event.type === 'screenshot' && event.file) setScreenshots((prev) => [...prev, event.file!]);
            if (event.type === 'done' && event.result) {
              setOutput(event.result);
              setScreenshots((prev) => [...prev, ...event.result!.screenshots.filter((s) => !prev.includes(s))]);
              if (event.result.recording) setRecording(event.result.recording);
              setRunState('done');
            } else if (event.type === 'error') {
              setRunState('error');
            }
            setLogs((prev) => [...prev, event]);
          } catch { /* non-JSON SSE chunk, skip */ }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLogs((prev) => [...prev, { type: 'error', message: errorMessage, timestamp: new Date().toISOString() }]);
      setRunState('error');
    }
  }

  function handleStop() {
    streamReaderRef.current?.cancel();
    setRunState('idle');
  }

  function handleReset() {
    setLogs([]);
    setOutput(null);
    setScreenshots([]);
    setRecording(null);
    setRunState('idle');
    setTargetUrl('');
    setEmail('');
    setPassword('');
  }

  const isRunning = runState === 'running';
  const isDone    = runState === 'done';
  const isError   = runState === 'error';
  const hasLogs   = logs.length > 0 || isRunning;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      <main className="pt-12 sm:pt-16 md:pt-24 pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">

          {/* Hero */}
          <section className="mb-10 sm:mb-12 text-center md:text-left animate-fade-in-up">
            <p className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-3">
              Scrutiny
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight text-slate-100">
              Automated Web QA{' '}
              <span className="bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                Testing
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-400 max-w-xl mx-auto md:mx-0">
              Enter a target URL. Scrutiny will crawl every page, fill all forms,
              and record the full browser session in real-time.
            </p>
          </section>

          {/* Input Card */}
          <div className="rounded-2xl border border-slate-700/40 bg-slate-900 p-3 sm:p-4 shadow-2xl">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              {/* URL input */}
              <div className="relative flex-1 flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-950 px-3 sm:px-4 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                <Globe className="h-4 w-4 text-slate-500 shrink-0" />
                <input
                  id="target-url"
                  type="url"
                  placeholder="https://example.com"
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleRun()}
                  disabled={isRunning}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full bg-transparent border-none py-3 sm:py-3.5 text-slate-100 placeholder:text-slate-600 focus:outline-none font-mono text-sm sm:text-base disabled:opacity-50"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 sm:shrink-0">
                {isRunning ? (
                  <button
                    onClick={handleStop}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-h-[48px] sm:min-h-[52px] rounded-xl border border-red-500/40 bg-red-500/10 px-5 sm:px-6 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                  >
                    <Square size={14} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={handleRun}
                    disabled={!targetUrl.trim()}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-h-[48px] sm:min-h-[52px] rounded-xl bg-linear-to-r from-indigo-600 to-indigo-500 px-5 sm:px-7 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    <Play size={14} /> Run Test
                  </button>
                )}

                {(isDone || isError || logs.length > 0) && !isRunning && (
                  <button
                    onClick={handleReset}
                    title="Reset"
                    className="flex items-center justify-center min-h-[48px] sm:min-h-[52px] w-[48px] sm:w-[52px] rounded-xl border border-slate-700 bg-transparent text-slate-500 transition hover:bg-slate-800 hover:text-slate-100 shrink-0"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Credentials */}
            {!isRunning && !hasLogs && (
              <div className="mt-3 border-t border-slate-800 pt-3">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-300 transition-colors py-1 px-1"
                >
                  <Lock size={12} />
                  Login Credentials (Optional)
                  {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showAdvanced && (
                  <div className="mt-3 grid gap-2 sm:gap-3 sm:grid-cols-2 p-3 sm:p-4 rounded-xl bg-slate-950/50 border border-slate-800">
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-lg border border-slate-700/50 bg-slate-900 px-3 sm:px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-lg border border-slate-700/50 bg-slate-900 px-3 sm:px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                    />
                    <p className="sm:col-span-2 text-[11px] text-slate-600">
                      Credentials are injected only into the local Selenium session and are never stored.
                      Automation pauses 30 seconds if an OAuth page is detected.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Status bar */}
            {runState !== 'idle' && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                <span className="relative flex h-2 w-2 shrink-0">
                  {isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    isRunning ? 'bg-cyan-400' : isDone ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                </span>
                <span className="text-xs sm:text-sm text-slate-400">
                  {isRunning && 'Automation running…'}
                  {isDone && `✅ Done — ${output?.summary.passed ?? 0} passed · ${output?.summary.failed ?? 0} failed · ${output?.summary.skipped ?? 0} skipped`}
                  {isError && '❌ An error occurred during automation.'}
                </span>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="mt-6 sm:mt-8 space-y-5 sm:space-y-6">
            {hasLogs && <LogPanel logs={logs} isRunning={isRunning} />}

            {output && <ResultsTable results={output.results} />}

            <ScreenshotGallery screenshots={screenshots} />

            {recording && (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900 overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-700/40 bg-slate-900/60 px-4 sm:px-6 py-3 sm:py-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
                    <Video size={15} className="text-indigo-400" />
                    Session Recording
                    <span className="font-normal text-slate-500 text-xs">(.mp4)</span>
                  </h3>
                  <a
                    href={`/recordings/${recording}`}
                    download
                    className="text-xs font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/20 transition-colors whitespace-nowrap"
                  >
                    ⬇ Download
                  </a>
                </div>
                <div className="p-3 sm:p-4">
                  <video
                    src={`/recordings/${recording}`}
                    controls
                    className="w-full rounded-lg border border-slate-700/40 bg-black"
                    style={{ maxHeight: '420px' }}
                  />
                </div>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
