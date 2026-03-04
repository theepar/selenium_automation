'use client';

import { ShieldCheck, Zap } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-indigo-500/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">

        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="url(#g)" />
              <path d="M7 14l5 5 9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
            NexusAuto
          </span>
          <span className="hidden rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-indigo-400 sm:inline">
            QA Platform
          </span>
        </div>

        {/* Meta chips */}
        <div className="hidden items-center gap-5 sm:flex">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck size={13} />
            Selenium WebDriver
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Zap size={13} />
            Real-time Logs
          </span>
        </div>

      </div>
    </header>
  );
}
