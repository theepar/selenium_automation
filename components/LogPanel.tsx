'use client';

import { ClipboardList, CheckCircle2, XCircle, AlertTriangle, Info, Minus, Camera, Star } from 'lucide-react';
import type { LogEvent } from '@/types';

interface LogPanelProps {
  logs: LogEvent[];
  isRunning: boolean;
}

const LOG_STYLE: Record<string, { icon: React.ReactNode; color: string }> = {
  info:       { icon: <Info      size={11} />, color: 'text-blue-400' },
  success:    { icon: <CheckCircle2 size={11} />, color: 'text-green-400' },
  warn:       { icon: <AlertTriangle size={11} />, color: 'text-yellow-400' },
  error:      { icon: <XCircle   size={11} />, color: 'text-red-400' },
  section:    { icon: <Minus     size={11} />, color: 'text-violet-400' },
  screenshot: { icon: <Camera    size={11} />, color: 'text-cyan-400' },
  done:       { icon: <Star      size={11} />, color: 'text-green-400' },
};

export default function LogPanel({ logs, isRunning }: LogPanelProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/40 bg-slate-950">

      {/* ── Terminal header ── */}
      <div className="flex items-center justify-between border-b border-slate-700/40 bg-slate-900/60 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/70" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
            <span className="h-3 w-3 rounded-full bg-green-500/70" />
          </div>
          <span className="font-mono text-xs text-slate-500">nexusauto — terminal</span>
          {isRunning && (
            <span className="flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse-dot" />
              RUNNING
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-600">{logs.length} events</span>
      </div>

      {/* ── Log body ── */}
      <div id="log-body" className="min-h-60 max-h-[480px] overflow-y-auto p-3 font-mono text-[12.5px]">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-600">
            <ClipboardList size={28} strokeWidth={1.5} />
            <p>Log akan muncul di sini setelah automation berjalan...</p>
          </div>
        ) : (
          logs.map((log, i) => {
            const style = LOG_STYLE[log.type] ?? { icon: <Minus size={11} />, color: 'text-slate-400' };
            return (
              <div
                key={i}
                className={`grid animate-fade-in-up grid-cols-[64px_16px_1fr] gap-2 rounded px-2 py-0.5 ${
                  log.type === 'section' ? 'mt-2 border-t border-slate-800 pt-2' : ''
                }`}
                style={{ animationDelay: `${Math.min(i * 15, 200)}ms`, opacity: 0 }}
              >
                <span className="self-start pt-px text-[10px] leading-5 text-slate-600">
                  {new Date(log.timestamp).toLocaleTimeString('id-ID', {
                    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })}
                </span>
                <span className={`self-start pt-1 ${style.color}`}>{style.icon}</span>
                <span className={`break-all leading-5 whitespace-pre-wrap ${style.color}`}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}

        {isRunning && (
          <div className="flex items-center gap-1 px-2 py-0.5">
            <span className="inline-block h-3.5 w-1.5 rounded-sm bg-cyan-400 animate-blink" />
          </div>
        )}
      </div>
    </div>
  );
}
