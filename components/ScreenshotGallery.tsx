'use client';

import { X, Images } from 'lucide-react';
import { useState } from 'react';

interface ScreenshotGalleryProps {
  screenshots: string[];
}

const LABEL_MAP: Record<string, string> = {
  '_00_initial': 'Initial',
  '_01_filled':  'After Fill',
  '_99_final':   'Final',
};

function getLabel(file: string): string {
  for (const [key, label] of Object.entries(LABEL_MAP)) {
    if (file.includes(key)) return label;
  }
  if (file.includes('_btn_')) {
    return `Btn: ${file.split('_btn_')[1]?.replace(/_/g, ' ').slice(0, 18) ?? ''}`;
  }
  return file;
}

export default function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const files = Array.from(new Set(screenshots));
  if (files.length === 0) return null;

  return (
    <>
      <div className="animate-fade-in-up rounded-xl border border-slate-700/40 bg-slate-900 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-700/40 bg-slate-900/60 px-4 sm:px-5 py-3">
        <Images size={14} className="text-cyan-400 shrink-0" />
        <h3 className="text-sm font-bold text-slate-100">Screenshots</h3>
        <span className="text-xs font-normal text-slate-500">({files.length})</span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((file) => (
            <button
              key={file}
              onClick={() => setSelected(file)}
              className="group overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/50 text-left transition-all hover:-translate-y-1 hover:border-indigo-500/50 hover:shadow-[0_8px_24px_rgba(99,102,241,0.2)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/screenshots/${file}`}
                alt={getLabel(file)}
                className="h-24 w-full bg-slate-900 object-cover"
                loading="lazy"
              />
              <p className="truncate border-t border-slate-700/40 px-2 py-1.5 font-mono text-[10px] text-slate-500">
                {getLabel(file)}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>

      {/* ── Lightbox ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-3"
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X size={14} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/screenshots/${selected}`}
              alt={getLabel(selected)}
              className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
            <p className="font-mono text-xs text-slate-400">{getLabel(selected)}</p>
          </div>
        </div>
      )}
    </>
  );
}
