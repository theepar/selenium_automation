"use client";

import { useState, useEffect, useRef } from "react";
import {
  Globe,
  Play,
  Square,
  RotateCcw,
  Briefcase,
  UserPlus,
  Video,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import LogPanel from "@/components/LogPanel";
import ResultsTable from "@/components/ResultsTable";
import ScreenshotGallery from "@/components/ScreenshotGallery";
import type { LogEvent, AutomationOutput, FlowType } from "@/types";

// ─── Flow definitions ─────────────────────────────────────────────────────────

type RunState = "idle" | "running" | "done" | "error";

interface FlowOption {
  id: FlowType;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** Tailwind classes for the SELECTED state */
  selectedCard: string;
  /** Tailwind classes for the icon when selected */
  selectedIcon: string;
  /** Tailwind classes for the check-dot when selected */
  selectedDot: string;
  /** Tailwind classes for the border when hovering (unselected) */
  hoverBorder: string;
}

const FLOWS: FlowOption[] = [
  {
    id: "jobVacancy",
    label: "Job Vacancy Flow",
    description: "Mensimulasikan flow pencarian kerja: membuka lowongan pekerjaan, mencari posisi, dan melihat detail pekerjaan.",
    icon: <Briefcase size={20} />,
    selectedCard: "border-blue-500 bg-blue-500/10",
    selectedIcon: "text-blue-400",
    selectedDot: "bg-blue-500",
    hoverBorder: "hover:border-blue-500/40",
  },
  {
    id: "register",
    label: "Register Flow",
    description:
      "Daftar akun baru — email & username di-generate otomatis, unik setiap run.",
    icon: <UserPlus size={20} />,
    selectedCard: "border-emerald-500 bg-emerald-500/10",
    selectedIcon: "text-emerald-400",
    selectedDot: "bg-emerald-500",
    hoverBorder: "hover:border-emerald-500/40",
  },
  {
    id: "applyClass",
    label: "Apply Class Flow",
    description: "Membuka halaman Community, memilih kelas teratas, dan memproses pendaftaran otomatis.",
    icon: <UserPlus size={20} />,
    selectedCard: "border-purple-500 bg-purple-500/10",
    selectedIcon: "text-purple-400",
    selectedDot: "bg-purple-500",
    hoverBorder: "hover:border-purple-500/40",
  },
];

// ─── Page component ───────────────────────────────────────────────────────────

export default function HomePage() {
  const DEFAULT_BASE = "https://dev.socialvit.com";

  /** Only the pathname portion for each flow */
  const FLOW_PATHS: Record<FlowType, string> = {
    register: "/app/register",
    applyClass: "/app/learning/community",
    jobVacancy: "/app/growth/job-vacancy",
  };

  const [targetUrl, setTargetUrl] = useState(DEFAULT_BASE + "/");
  const [selectedFlow, setSelectedFlow] = useState<FlowType | null>(null);

  function handleFlowSelect(flow: FlowType) {
    setSelectedFlow(flow);
    // Preserve whatever origin the user typed; fall back to default
    let origin = DEFAULT_BASE;
    try {
      origin = new URL(targetUrl).origin;
    } catch {
      /* keep default */
    }
    setTargetUrl(`${origin}${FLOW_PATHS[flow]}`);
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [postContent, setPostContent] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [output, setOutput] = useState<AutomationOutput | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [recording, setRecording] = useState<string | null>(null);
  const streamReaderRef =
    useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Auto-scroll log panel
  useEffect(() => {
    const el = document.getElementById("log-body");
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isRunning = runState === "running";
  const isDone = runState === "done";
  const isError = runState === "error";
  const hasLogs = logs.length > 0 || isRunning;

  const needsCredentials = false;
  const needsPostContent = false; // changed from selectedFlow === "applyClass";

  const canRun =
    !!targetUrl.trim() &&
    !!selectedFlow &&
    !isRunning &&
    (!needsCredentials || (!!email.trim() && !!password.trim()));

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleRun() {
    if (!canRun) return;
    setRunState("running");
    setLogs([]);
    setOutput(null);
    setScreenshots([]);
    setRecording(null);

    try {
      const response = await fetch("/api/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl.trim(),
          flow: selectedFlow,
          postContent: postContent.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error ?? `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error("No response stream received.");

      const reader = response.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const raw = chunk.replace(/^data: /, "").trim();
          if (!raw) continue;
          try {
            const event: LogEvent = JSON.parse(raw);
            if (event.type === "screenshot" && event.file)
              setScreenshots((prev) => [...prev, event.file!]);
            if (event.type === "done" && event.result) {
              setOutput(event.result);
              setScreenshots((prev) => [
                ...prev,
                ...event.result!.screenshots.filter((s) => !prev.includes(s)),
              ]);
              if (event.result.recording) setRecording(event.result.recording);
              setRunState("done");
            } else if (event.type === "error") {
              setRunState("error");
            }
            setLogs((prev) => [...prev, event]);
          } catch {
            /* non-JSON SSE chunk */
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setLogs((prev) => [
        ...prev,
        { type: "error", message: msg, timestamp: new Date().toISOString() },
      ]);
      setRunState("error");
    }
  }

  function handleStop() {
    streamReaderRef.current?.cancel();
    setRunState("idle");
  }

  function handleReset() {
    setLogs([]);
    setOutput(null);
    setScreenshots([]);
    setRecording(null);
    setRunState("idle");
    setTargetUrl("");
    setSelectedFlow(null);
    setEmail("");
    setPassword("");
    setPostContent("");
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      <main className="pt-12 sm:pt-16 md:pt-24 pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <section className="mb-10 sm:mb-12 text-center md:text-left animate-fade-in-up">
            <p className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-3">
              Scrutiny
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight text-slate-100">
              Automated Web QA{" "}
              <span className="bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                Testing
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-400 max-w-xl mx-auto md:mx-0">
              Masukkan URL target, pilih alur otomasi, lalu jalankan. Scrutiny
              akan mengisi form, merekam sesi browser, dan melaporkan hasil
              secara real-time.
            </p>
          </section>

          {/* ── Main card ─────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-700/40 bg-slate-900 p-4 sm:p-5 shadow-2xl space-y-5">
            {/* URL input */}
            <div className="relative flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-950 px-3 sm:px-4 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <Globe className="h-4 w-4 text-slate-500 shrink-0" />
              <input
                id="target-url"
                type="url"
                placeholder="https://dev.socialvit.com/"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
                disabled={isRunning}
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent border-none py-3 sm:py-3.5 text-slate-100 placeholder:text-slate-600 focus:outline-none font-mono text-sm sm:text-base disabled:opacity-50"
              />
            </div>

            {/* ── Flow selector ─────────────────────────────────────────── */}
            {!hasLogs && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
                  Pilih Alur Otomasi
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {FLOWS.map((flow) => {
                    const isSelected = selectedFlow === flow.id;
                    return (
                      <button
                        key={flow.id}
                        onClick={() => handleFlowSelect(flow.id)}
                        disabled={isRunning}
                        className={[
                          "relative text-left rounded-xl border p-4 transition-all duration-200",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          isSelected
                            ? flow.selectedCard
                            : `border-slate-700/60 bg-slate-950/60 ${flow.hoverBorder}`,
                        ].join(" ")}
                      >
                        {/* Selected check dot */}
                        {isSelected && (
                          <span
                            className={`absolute top-3 right-3 h-2 w-2 rounded-full ${flow.selectedDot}`}
                          />
                        )}

                        {/* Icon */}
                        <div
                          className={[
                            "mb-3 transition-colors",
                            isSelected ? flow.selectedIcon : "text-slate-500",
                          ].join(" ")}
                        >
                          {flow.icon}
                        </div>

                        {/* Label */}
                        <p
                          className={[
                            "font-semibold text-sm mb-1",
                            isSelected ? "text-slate-100" : "text-slate-400",
                          ].join(" ")}
                        >
                          {flow.label}
                        </p>

                        {/* Description */}
                        <p className="text-[11px] leading-relaxed text-slate-500">
                          {flow.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Dynamic fields ─────────────────────────────────────────── */}
            {!hasLogs && selectedFlow && (selectedFlow === "register" || needsCredentials || needsPostContent) && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                {/* Register — info only, no manual input */}
                {selectedFlow === "register" && (
                  <div className="flex items-start gap-3">
                    <Sparkles
                      size={16}
                      className="text-emerald-400 mt-0.5 shrink-0"
                    />
                    <div>
                      <p className="text-sm font-semibold text-emerald-300 mb-1">
                        Data auto-generated setiap run
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Email dan username dibuat unik menggunakan timestamp +
                        random suffix sehingga tidak akan pernah duplikat.
                        Password:&nbsp;
                        <code className="text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">
                          TestPass123!
                        </code>
                      </p>
                      <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                        <li>
                          📛 Name →{" "}
                          <span className="text-slate-500">
                            Test User {"{timestamp}"}
                          </span>
                        </li>
                        <li>
                          📧 Email →{" "}
                          <span className="text-slate-500">
                            testuser_{"{timestamp}"}_{"{rand}"}@testmail.dev
                          </span>
                        </li>
                        <li>
                          📱 Phone →{" "}
                          <span className="text-slate-500">
                            +62 81234567890 (Indonesia)
                          </span>
                        </li>
                        <li>
                          👤 Username →{" "}
                          <span className="text-slate-500">
                            user{"{timestamp}"}
                            {"{rand}"}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Login & PostFeed — credential inputs */}
                {needsCredentials && (
                  <>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                      Kredensial Akun
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isRunning}
                        className="w-full rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isRunning}
                        className="w-full rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
                      />
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Kredensial hanya digunakan dalam sesi Selenium lokal dan
                      tidak pernah disimpan.
                    </p>
                  </>
                )}

                {/* PostFeed — post content */}
                {needsPostContent && (
                  <>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest pt-1">
                      Konten Postingan
                    </p>
                    <textarea
                      rows={3}
                      placeholder="Tulis isi post yang akan dipublikasikan…"
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      disabled={isRunning}
                      className="w-full rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all resize-none disabled:opacity-50"
                    />
                    <p className="text-[11px] text-slate-600">
                      Kosongkan untuk menggunakan teks default: &ldquo;Test post
                      from NexusAuto QA Platform 🤖&rdquo;
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── Action buttons ─────────────────────────────────────────── */}
            <div className="flex gap-2">
              {isRunning ? (
                <button
                  onClick={handleStop}
                  className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-red-500/40 bg-red-500/10 px-5 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                >
                  <Square size={14} /> Stop
                </button>
              ) : (
                <button
                  onClick={handleRun}
                  disabled={!canRun}
                  title={
                    !targetUrl.trim()
                      ? "Masukkan URL terlebih dahulu"
                      : !selectedFlow
                        ? "Pilih alur otomasi"
                        : needsCredentials &&
                            (!email.trim() || !password.trim())
                          ? "Isi email & password"
                          : undefined
                  }
                  className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-linear-to-r from-indigo-600 to-indigo-500 px-7 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  <Play size={14} />
                  {selectedFlow === "jobVacancy"
                    ? "Run Job Vacancy Test"
                    : selectedFlow === "register"
                      ? "Run Register Test"
                      : selectedFlow === "applyClass"
                        ? "Run Apply Class Test"
                        : "Run Test"}
                </button>
              )}

              {(isDone || isError || logs.length > 0) && !isRunning && (
                <button
                  onClick={handleReset}
                  title="Reset semua"
                  className="flex items-center justify-center min-h-[48px] w-[48px] rounded-xl border border-slate-700 bg-transparent text-slate-500 transition hover:bg-slate-800 hover:text-slate-100 shrink-0"
                >
                  <RotateCcw size={16} />
                </button>
              )}
            </div>

            {/* ── Status bar ────────────────────────────────────────────── */}
            {runState !== "idle" && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                <span className="relative flex h-2 w-2 shrink-0">
                  {isRunning && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isRunning
                        ? "bg-cyan-400"
                        : isDone
                          ? "bg-green-400"
                          : "bg-red-400"
                    }`}
                  />
                </span>
                <span className="text-xs sm:text-sm text-slate-400">
                  {isRunning && (
                    <>
                      Running&nbsp;
                      <span className="font-semibold text-slate-200">
                        {selectedFlow === "jobVacancy"
                          ? "Job Vacancy Flow"
                          : selectedFlow === "register"
                            ? "Register Flow"
                            : "Apply Class Flow"}
                      </span>
                      …
                    </>
                  )}
                  {isDone && (
                    <>
                      ✅ Done —{" "}
                      <span className="text-green-400 font-semibold">
                        {output?.summary.passed ?? 0} passed
                      </span>
                      {" · "}
                      <span className="text-red-400 font-semibold">
                        {output?.summary.failed ?? 0} failed
                      </span>
                      {output?.results.some(
                        (r) => r.type === "assertion" && r.status === "pass",
                      ) && (
                        <span className="ml-2 inline-flex items-center gap-1 text-emerald-400 font-semibold">
                          <CheckCircle2 size={12} /> Assertion passed
                        </span>
                      )}
                    </>
                  )}
                  {isError && "❌ An error occurred during automation."}
                </span>
              </div>
            )}
          </div>

          {/* ── Results section ───────────────────────────────────────────── */}
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
                    <span className="font-normal text-slate-500 text-xs">
                      (.mp4)
                    </span>
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
                    style={{ maxHeight: "420px" }}
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
