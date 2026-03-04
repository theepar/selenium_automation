'use client';

import type { TestResult } from '@/types';

interface ResultsTableProps {
  results: TestResult[];
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pass:    { label: 'PASS', cls: 'bg-green-500/15 text-green-400' },
  error:   { label: 'FAIL', cls: 'bg-red-500/15 text-red-400' },
  skipped: { label: 'SKIP', cls: 'bg-slate-500/15 text-slate-400' },
};

export default function ResultsTable({ results }: ResultsTableProps) {
  if (results.length === 0) return null;

  const passed  = results.filter((r) => r.status === 'pass').length;
  const failed  = results.filter((r) => r.status === 'error').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const total   = results.length;

  return (
    <div className="animate-fade-in-up rounded-xl border border-slate-700/40 bg-slate-900 p-6">

      {/* ── Summary ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-100">Test Results</h3>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-green-500/15 px-3 py-0.5 text-[11px] font-semibold uppercase text-green-400">
            ✅ {passed} Passed
          </span>
          <span className="rounded-full bg-red-500/15 px-3 py-0.5 text-[11px] font-semibold uppercase text-red-400">
            ❌ {failed} Failed
          </span>
          <span className="rounded-full bg-slate-500/15 px-3 py-0.5 text-[11px] font-semibold uppercase text-slate-400">
            ⏭️ {skipped} Skipped
          </span>
          <span className="rounded-full bg-blue-500/15 px-3 py-0.5 text-[11px] font-semibold uppercase text-blue-400">
            {total} Total
          </span>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="mb-5 flex h-1.5 overflow-hidden rounded-full bg-slate-800">
        {passed  > 0 && <div className="bg-green-500 transition-all duration-700" style={{ width: `${(passed / total) * 100}%` }} />}
        {failed  > 0 && <div className="bg-red-500  transition-all duration-700" style={{ width: `${(failed / total) * 100}%` }} />}
        {skipped > 0 && <div className="bg-slate-500 transition-all duration-700" style={{ width: `${(skipped / total) * 100}%` }} />}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-lg border border-slate-700/40">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['#', 'Status', 'Type', 'Element', 'Action / Reason'].map((h) => (
                <th
                  key={h}
                  className="border-b border-slate-700/40 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const s = STATUS_MAP[r.status] ?? { label: r.status, cls: 'bg-blue-500/15 text-blue-400' };
              return (
                <tr key={i} className="border-b border-slate-800/50 last:border-none hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-slate-600">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${s.cls}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-cyan-400">{r.type}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-100">{r.element}</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-500">{r.action ?? r.reason ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
