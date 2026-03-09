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
    <div className="min-h-screen bg-[#f8faff] text-slate-800 font-sans relative selection:bg-blue-200">
      <div
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.4]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #dbeafe 1px, transparent 1px),
            linear-gradient(to bottom, #dbeafe 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <main className="relative z-10 pt-12 sm:pt-16 md:pt-24 pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">

          {/* Hero */}
          {!hasLogs && (
            <div className="mb-10 sm:mb-12 text-center md:text-left">
              <p className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight mb-4">
                Scrutiny
              </p>
              <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Automated Web QA <br className="hidden md:block" />
                <span className="bg-linear-to-r from-[#ff5e62] to-[#ff9966] bg-clip-text text-transparent">
                  Testing Made Simple
                </span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto md:mx-0">
                Enter a target URL. Scrutiny will crawl every page, fill all forms,
                and record the full browser session in real-time.
              </p>
            </div>
          )}

          {/* Input Card */}
          <div className="bg-white rounded-3xl sm:rounded-4xl border border-blue-50 p-2 sm:p-3 shadow-xl shadow-blue-900/5">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              {/* URL input */}
              <div className="relative flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex items-center px-3 sm:px-4 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <Globe className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 shrink-0" />
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
                  className="w-full bg-transparent border-none py-3 sm:py-4 px-2 sm:px-3 text-slate-900 placeholder:text-slate-400 focus:outline-none text-base sm:text-lg disabled:opacity-50"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 sm:shrink-0">
                {isRunning ? (
                  <button
                    onClick={handleStop}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-h-[52px] sm:min-h-[60px] rounded-2xl bg-slate-100 px-6 sm:px-8 text-sm sm:text-base font-bold text-slate-700 transition-colors hover:bg-slate-200"
                  >
                    <Square size={16} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={handleRun}
                    disabled={!targetUrl.trim()}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-h-[52px] sm:min-h-[60px] rounded-2xl bg-linear-to-r from-[#ff5e62] to-[#ff9966] px-6 sm:px-8 text-sm sm:text-base font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    <Play size={16} fill="currentColor" /> Run Test
                  </button>
                )}

                {(isDone || isError || logs.length > 0) && !isRunning && (
                  <button
                    onClick={handleReset}
                    title="Reset"
                    className="flex items-center justify-center min-h-[52px] sm:min-h-[60px] w-[52px] sm:w-[60px] rounded-2xl border-2 border-slate-100 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 shrink-0"
                  >
                    <RotateCcw size={18} />
                  </button>
                )}
              </div>
            </div>

            {/* Credentials */}
            {!isRunning && !hasLogs && (
              <div className="mt-2 sm:mt-3 px-1 sm:px-2 pb-1 sm:pb-2">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors py-2 px-1"
                >
                  <Lock size={13} />
                  Login Credentials (Optional)
                  {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {showAdvanced && (
                  <div className="mt-2 grid gap-2 sm:gap-3 sm:grid-cols-2 p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                    <p className="sm:col-span-2 text-xs text-slate-500">
                      Credentials are injected only into the local Selenium browser session and are never stored.
                      Automation pauses for 30 seconds if an OAuth page is detected.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status Indicator */}
          {runState !== 'idle' && (
            <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm w-fit max-w-full">
              <span className="relative flex h-3 w-3 shrink-0">
                {isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  isRunning ? 'bg-blue-500' : isDone ? 'bg-emerald-500' : 'bg-red-500'
                }`} />
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-700">
                {isRunning && 'Automation running…'}
                {isDone && `Done! ${output?.summary.passed ?? 0} passed · ${output?.summary.failed ?? 0} failed`}
                {isError && 'An error occurred during automation.'}
              </span>
            </div>
          )}

          {/* Results */}
          <div className="mt-8 sm:mt-10 space-y-6 sm:space-y-8">
            {hasLogs && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <LogPanel logs={logs} isRunning={isRunning} />
              </div>
            )}

            {output && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                <ResultsTable results={output.results} />
              </div>
            )}

            {screenshots.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                <ScreenshotGallery screenshots={screenshots} />
              </div>
            )}

            {recording && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 sm:px-6 py-3 sm:py-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <Video size={16} className="text-blue-500" />
                    Session Recording
                  </h3>
                  <a
                    href={`/recordings/${recording}`}
                    download
                    className="text-xs font-bold text-[#ff5e62] hover:text-[#ff9966] bg-[#ff5e62]/10 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full transition-colors whitespace-nowrap"
                  >
                    Download .mp4
                  </a>
                </div>
                <div className="p-3 sm:p-6 bg-slate-100/50">
                  <video
                    src={`/recordings/${recording}`}
                    controls
                    className="w-full rounded-xl border border-slate-200 shadow-sm bg-black"
                    style={{ maxHeight: '300px' }}
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
