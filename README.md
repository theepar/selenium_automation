# NexusAuto — QA Web Automation Platform

NexusAuto adalah platform otomasi QA (Quality Assurance) berbasis web yang dirancang untuk melakukan pengujian end-to-end secara otomatis. Dibangun menggunakan Next.js 15, Tailwind CSS v4, dan ditenagai oleh performa tangguh Selenium WebDriver.

## ✨ Fitur Utama

- **Auto-fill Pintar**: Otomatis mendeteksi tipe input (email, password, text, angka, date, dll) dan mengisinya dengan *dummy data* yang relevan.
- **Auto-klik Tombol**: Mendeteksi dan melakukan klik pada semua tombol aksi, tombol submit, dan navigasi yang aktif.
- **Deep Crawling**: Tidak hanya menguji satu halaman, NexusAuto akan mencari semua internal link (1 domain) dan menelusurinya hingga kedalaman maksimal 4 halaman.
- **Progressive Scrolling**: Melakukan scroll otomatis ke bawah halaman untuk memicu semua elemen lazy-load sebelum melakukan interaksi.
- **Screenshot Otomatis**: Mengambil gambar layar pada berbagai tahapan progres (saat halaman dimuat, sesudah form diisi penuh, dan di akhir tes).
- **Log Real-time**: Memanfaatkan Server-Sent Events (SSE) yang ringan untuk mendistribusikan log status ke antarmuka terminal bergaya hacker secara langsung.
- **UI Premium**: Desain antarmuka Dark Mode mengkilap, memanfaatkan desain kaca (glassmorphism), highlight warna neon, dan animasi cantik berbasis TailwindCSS & Lucide Icons.

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **Styling**: Tailwind CSS v4
- **Otomasi Web**: Selenium WebDriver (di NodeJS runtime) -> + built in Selenium Manager
- **Icon**: Lucide React
- **Bahasa**: TypeScript

## 🚀 Instalasi & Menjalankan (Development)

Pastikan kamu memiliki **Node.js** terinstal (minimal LTS/v20) serta browser Chrome. (Tidak perlu repot install ChromeDriver, Selenium Manager sudah mengatasinya).

1. Clone repositori ini atau masuk ke root direktori
2. Instal dependencies:
   ```bash
   npm install
   ```
3. Mulai server pengembangan memakai Turbopack:
   ```bash
   npm run dev
   ```
4. Buka di browser: `http://localhost:3000` (Port mungkin berganti ke `3001` apabila 3000 sedang terpakai).

## 💡 Cara Penggunaan

1. Ketik URL target pengujian pada kolom input bola dunia (misal: `https://example.com`). Pastikan url valid memakai `http` atau `https`.
2. Klik tombol **Run Test**.
3. Santai dan lihat Panel *Terminal NexusAuto* meludahkan log eksekusi langsung ke layarmu dengan indikator warnanya!
4. Di akhir, cek **Results Gallery** untuk melihat detail apa saja yang dicek, apa yang dilewati, serta lihat foto screenshot dari hasil aksi.

## 🗂️ Struktur Proyek

```text
web-automation/
├── app/                  # Next.js App Router (Halaman Utama Utama, Layout, UI)
│   ├── globals.css       # File konfigurasi Tailwind & Custom Font Setup
│   └── api/run-test/     # Endpoint Server (SSE Streaming Log Selenium)
├── components/           # UI Component Module (Header, Logs, Results, Screenshots)
├── lib/
│   └── automator.ts      # 🧠 Inti Logika Selenium (Pencarian Form, Algoritma Scroll, dll)
├── public/
│   └── screenshots/      # Folder tempat penyimpanan gambar test otomatis 
├── types/
│   └── index.ts          # Typings global
├── package.json          # Dependencies & Configs
└── README.md
```
