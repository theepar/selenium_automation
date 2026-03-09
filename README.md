# Scrutiny

A web QA automation platform built with **Next.js 15**, **TypeScript**, and **Selenium WebDriver**. Scrutiny crawls every page of a given URL, fills all forms with contextual test data, clicks every interactive element, captures screenshots at each stage, and records the full browser session as a video.

## Features

- **Deep Page Crawling** — BFS crawl across all internal pages and subdomains (up to 20 pages), including `/login`, `/register`, `/dashboard`, and any other routes.
- **Intelligent Form Filling** — Detects input type and context (label, placeholder, name) to fill fields with relevant dummy data. Supports custom login credentials for authenticated flows.
- **Button & Interaction Testing** — Clicks every visible, enabled button and submit input, then restores the original page if navigation occurs.
- **Progressive Scrolling** — Scrolls each page fully before interaction to trigger lazy-loaded elements.
- **Automatic Screenshots** — Captures page state before and after form fills. Old screenshots are cleaned up at the start of each test run.
- **Full Session Recording** — Records the entire browser session as an `.mp4` using `ffmpeg-static`. The video can be played or downloaded directly from the UI.
- **OAuth / Manual Login Support** — If a login or OAuth page is detected, automation pauses for 30 seconds to allow manual intervention.
- **Real-time Streaming Logs** — Uses Server-Sent Events (SSE) to stream progress logs to the UI as the automation runs.
- **Input Validation & Security** — The API validates all incoming URLs (protocol, private IP, localhost), sanitizes credentials, and rejects malformed requests before any automation starts.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Automation | Selenium WebDriver 4 with Selenium Manager |
| Screen Recording | ffmpeg-static (bundled binary) |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| Runtime | Node.js 20+ |

## Requirements

- **Node.js** v20 LTS or newer
- **Google Chrome** (latest stable) — ChromeDriver is managed automatically by Selenium Manager, no manual installation needed.
- **Windows** — The screen recorder uses `gdigrab` (Windows GDI capture). Linux/macOS support requires changing the ffmpeg input driver in `lib/recorder.ts`.

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Enter a target URL in the input field (must be a valid `http://` or `https://` address).
2. Optionally expand **Login Credentials** and enter an email and password if the site requires authentication.
3. Click **Run Test**.
4. Watch the log panel for live progress. If a Google OAuth or SSO page is detected, switch to the Chrome window and log in manually within 30 seconds.
5. When complete, review the **Results Table**, **Screenshots**, and **Session Recording** sections.
6. Click **Reset** to clear all state and run a new test.

## Project Structure

```
web-automation/
├── app/
│   ├── globals.css          # Tailwind v4 config & global styles
│   ├── layout.tsx           # Root layout & metadata
│   ├── page.tsx             # Main UI (client component)
│   └── api/run-test/
│       └── route.ts         # SSE stream endpoint — URL validation & automation trigger
├── components/
│   ├── Header.tsx
│   ├── LogPanel.tsx
│   ├── ResultsTable.tsx
│   └── ScreenshotGallery.tsx
├── lib/
│   ├── automator.ts         # Core Selenium logic — crawl, fill, click, screenshot
│   └── recorder.ts          # ffmpeg screen recorder (start/stop)
├── public/
│   ├── screenshots/         # Auto-generated per run (git-ignored)
│   └── recordings/          # Auto-generated per run (git-ignored)
├── types/
│   └── index.ts             # Shared TypeScript types
└── package.json
```

## Security

The API endpoint (`/api/run-test`) enforces the following before starting any automation:

- **Protocol check** — Only `http` and `https` are accepted.
- **Localhost/loopback block** — `localhost`, `127.0.0.1`, `0.0.0.0`, and `::1` are rejected.
- **Private IP block** — RFC-1918 ranges (`10.x`, `172.16–31.x`, `192.168.x`) and link-local addresses are rejected.
- **URL length limit** — URLs over 2048 characters are rejected.
- **Credential sanitization** — Credentials are trimmed and capped at 256 characters each.

## Maintenance Notes

- **Increasing the crawl limit** — Change `MAX_PAGES` in `lib/automator.ts`.
- **Adding new auto-fill values** — Extend `fieldValueMap` in the `getFillValue` function in `lib/automator.ts`.
- **Linux/macOS recording** — Replace `-f gdigrab -i desktop` with `-f x11grab -i :0` (Linux) or `-f avfoundation -i "1"` (macOS) in `lib/recorder.ts`.
- **OAuth pause duration** — The 30-second manual login window is controlled by `driver.sleep(30000)` in `testPage()` inside `lib/automator.ts`.
